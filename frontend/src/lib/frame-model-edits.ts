import type {
  FrameLoad,
  FrameLoadCase,
  FrameLoadCombination,
  StructureMember,
  StructureNode,
} from "../types/structure.ts";
import { canonicalEditorId, type RenameEditResult } from "./model-edit-utils.ts";

export interface FrameEditorCollections {
  nodes: StructureNode[];
  members: StructureMember[];
  loads: FrameLoad[];
  loadCases: FrameLoadCase[];
  loadCombinations: FrameLoadCombination[];
}

export interface FrameCopyOptions {
  nodeIds?: string[];
  memberIds?: string[];
  offsetX?: number;
  offsetY?: number;
  copyIndex?: number;
}

export interface FrameMirrorOptions extends Omit<FrameCopyOptions, "offsetX" | "offsetY"> {
  axis: "x" | "y";
  origin: number;
}

export interface FrameArrayOptions extends Omit<FrameCopyOptions, "copyIndex"> {
  count: number;
  deltaX: number;
  deltaY: number;
}

function memberLoadTargets(load: FrameLoad): load is Extract<FrameLoad, { member: string }> {
  return load.type === "distributed" || load.type === "member_point";
}

function uniqueId(baseId: string, usedIds: Set<string>, copyIndex: number): string {
  const suffix = `_C${copyIndex}`;
  let candidate = `${baseId}${suffix}`;
  let serial = 2;
  while (usedIds.has(candidate)) {
    candidate = `${baseId}${suffix}_${serial}`;
    serial += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function selectedFrameNodeIds(collections: FrameEditorCollections, options: FrameCopyOptions): Set<string> {
  const selected = new Set((options.nodeIds ?? []).filter(Boolean));
  const memberIds = new Set((options.memberIds ?? []).filter(Boolean));
  collections.members.forEach((member) => {
    if (memberIds.has(member.id)) {
      selected.add(member.start);
      selected.add(member.end);
    }
  });
  if (selected.size === 0 && memberIds.size === 0) {
    collections.nodes.forEach((node) => selected.add(node.id));
  }
  return selected;
}

function selectedFrameMemberIds(collections: FrameEditorCollections, selectedNodes: Set<string>, options: FrameCopyOptions): Set<string> {
  const explicit = new Set((options.memberIds ?? []).filter(Boolean));
  if (explicit.size > 0) return explicit;
  return new Set(collections.members.filter((member) => selectedNodes.has(member.start) && selectedNodes.has(member.end)).map((member) => member.id));
}

function mirrorAngleDeg(value: number | undefined, axis: "x" | "y"): number | undefined {
  if (value === undefined) return undefined;
  const mirrored = axis === "x" ? -value : 180 - value;
  return ((mirrored % 360) + 360) % 360;
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function transformFrameNode(node: StructureNode, options: FrameCopyOptions & Partial<FrameMirrorOptions>): StructureNode {
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;
  let x = node.x + offsetX;
  let y = node.y + offsetY;
  const axis = options.axis;
  if (axis === "x") y = 2 * (options.origin ?? 0) - node.y;
  if (axis === "y") x = 2 * (options.origin ?? 0) - node.x;
  return withoutUndefined({
    ...node,
    x,
    y,
    supportAngleDeg: axis ? mirrorAngleDeg(node.supportAngleDeg, axis) : node.supportAngleDeg,
  });
}

function transformFrameLoad(load: FrameLoad, options: Partial<FrameMirrorOptions>): FrameLoad {
  const axis = options.axis;
  if (!axis) return { ...load };
  if (load.type === "nodal") {
    return withoutUndefined({
      ...load,
      fxKn: axis === "y" && load.fxKn !== undefined ? -load.fxKn : load.fxKn,
      fyKn: axis === "x" && load.fyKn !== undefined ? -load.fyKn : load.fyKn,
      mzKnM: load.mzKnM !== undefined ? -load.mzKnM : load.mzKnM,
    });
  }
  if (load.type === "distributed" && (load.direction ?? "local_y") === "global_y" && axis === "x") {
    return withoutUndefined({
      ...load,
      wyKnPerM: load.wyKnPerM !== undefined ? -load.wyKnPerM : load.wyKnPerM,
      qStartKnPerM: load.qStartKnPerM !== undefined ? -load.qStartKnPerM : load.qStartKnPerM,
      qEndKnPerM: load.qEndKnPerM !== undefined ? -load.qEndKnPerM : load.qEndKnPerM,
    });
  }
  if (load.type === "member_point" && (load.direction ?? "local_y") === "global_y" && axis === "x") {
    return withoutUndefined({ ...load, forceKn: load.forceKn !== undefined ? -load.forceKn : load.forceKn });
  }
  return { ...load };
}

function copyFrameOnce(collections: FrameEditorCollections, options: FrameCopyOptions & Partial<FrameMirrorOptions>): FrameEditorCollections {
  const copyIndex = Math.max(1, Math.trunc(options.copyIndex ?? 1));
  const selectedNodes = selectedFrameNodeIds(collections, options);
  const selectedMembers = selectedFrameMemberIds(collections, selectedNodes, options);
  const usedNodeIds = new Set(collections.nodes.map((node) => node.id));
  const usedMemberIds = new Set(collections.members.map((member) => member.id));
  const nodeIdMap = new Map<string, string>();
  const memberIdMap = new Map<string, string>();

  const copiedNodes = collections.nodes
    .filter((node) => selectedNodes.has(node.id))
    .map((node) => {
      const nextId = uniqueId(node.id, usedNodeIds, copyIndex);
      nodeIdMap.set(node.id, nextId);
      return { ...transformFrameNode(node, options), id: nextId };
    });
  const copiedMembers = collections.members
    .filter((member) => selectedMembers.has(member.id) && nodeIdMap.has(member.start) && nodeIdMap.has(member.end))
    .map((member) => {
      const nextId = uniqueId(member.id, usedMemberIds, copyIndex);
      memberIdMap.set(member.id, nextId);
      return { ...member, id: nextId, start: nodeIdMap.get(member.start) ?? member.start, end: nodeIdMap.get(member.end) ?? member.end };
    });
  const rewriteLoad = (load: FrameLoad): FrameLoad | null => {
    if (load.type === "nodal") {
      const nextNode = nodeIdMap.get(load.node);
      return nextNode ? { ...transformFrameLoad(load, options), node: nextNode } : null;
    }
    const nextMember = memberIdMap.get(load.member);
    return nextMember ? { ...transformFrameLoad(load, options), member: nextMember } as FrameLoad : null;
  };
  const copiedLoads = collections.loads.map(rewriteLoad).filter((load): load is FrameLoad => Boolean(load));
  return {
    ...collections,
    nodes: [...collections.nodes, ...copiedNodes],
    members: [...collections.members, ...copiedMembers],
    loads: [...collections.loads, ...copiedLoads],
    loadCases: collections.loadCases.map((loadCase) => ({
      ...loadCase,
      loads: [...loadCase.loads, ...loadCase.loads.map(rewriteLoad).filter((load): load is FrameLoad => Boolean(load))],
    })),
  };
}

export function copyFrameCollections(collections: FrameEditorCollections, options: FrameCopyOptions = {}): FrameEditorCollections {
  return copyFrameOnce(collections, options);
}

export function mirrorFrameCollections(collections: FrameEditorCollections, options: FrameMirrorOptions): FrameEditorCollections {
  return copyFrameOnce(collections, options);
}

export function arrayFrameCollections(collections: FrameEditorCollections, options: FrameArrayOptions): FrameEditorCollections {
  const count = Math.max(0, Math.trunc(options.count));
  const baseNodeIds = options.nodeIds ?? collections.nodes.map((node) => node.id);
  const baseMemberIds = options.memberIds ?? collections.members.map((member) => member.id);
  return Array.from({ length: count }, (_, index) => index + 1).reduce(
    (nextCollections, copyIndex) => copyFrameOnce(nextCollections, {
      ...options,
      nodeIds: baseNodeIds,
      memberIds: baseMemberIds,
      copyIndex,
      offsetX: options.deltaX * copyIndex,
      offsetY: options.deltaY * copyIndex,
    }),
    collections,
  );
}

function removeFrameLoadsForTargets(loads: FrameLoad[], nodeIds: Set<string>, memberIds: Set<string>): FrameLoad[] {
  return loads.filter((load) => {
    if (load.type === "nodal") return !nodeIds.has(load.node);
    return !memberIds.has(load.member);
  });
}

export function updateFrameNodeCollections(
  collections: FrameEditorCollections,
  index: number,
  patch: Partial<StructureNode>,
): RenameEditResult<FrameEditorCollections> | null {
  const current = collections.nodes[index];
  if (!current) return null;
  const nextId = patch.id !== undefined ? canonicalEditorId(patch.id, current.id) : current.id;
  const nextPatch = patch.id !== undefined ? { ...patch, id: nextId } : patch;
  const renamed = nextId !== current.id;
  const nextNodes = collections.nodes.map((node, nodeIndex) => (nodeIndex === index ? { ...node, ...nextPatch } : node));
  const nextMembers = collections.members.map((member) => {
    if (renamed && current.id === member.start) return { ...member, start: nextId };
    if (renamed && current.id === member.end) return { ...member, end: nextId };
    return member;
  });
  const rewriteLoad = (load: FrameLoad): FrameLoad => {
    if (renamed && load.type === "nodal" && load.node === current.id) {
      return { ...load, node: nextId };
    }
    return load;
  };
  return {
    next: {
      ...collections,
      nodes: nextNodes,
      members: nextMembers,
      loads: collections.loads.map(rewriteLoad),
      loadCases: collections.loadCases.map((loadCase) => ({
        ...loadCase,
        loads: loadCase.loads.map(rewriteLoad),
      })),
    },
    previousId: current.id,
    nextId,
    renamed,
  };
}

export function removeFrameNodeCollections(collections: FrameEditorCollections, index: number): FrameEditorCollections | null {
  const removed = collections.nodes[index];
  if (!removed) return null;
  const removedMemberIds = new Set(
    collections.members
      .filter((member) => member.start === removed.id || member.end === removed.id)
      .map((member) => member.id),
  );
  const removedNodeIds = new Set([removed.id]);
  return {
    ...collections,
    nodes: collections.nodes.filter((_, nodeIndex) => nodeIndex !== index),
    members: collections.members.filter((member) => !removedMemberIds.has(member.id)),
    loads: removeFrameLoadsForTargets(collections.loads, removedNodeIds, removedMemberIds),
    loadCases: collections.loadCases.map((loadCase) => ({
      ...loadCase,
      loads: removeFrameLoadsForTargets(loadCase.loads, removedNodeIds, removedMemberIds),
    })),
  };
}

export function updateFrameMemberCollections(
  collections: FrameEditorCollections,
  index: number,
  patch: Partial<StructureMember>,
): RenameEditResult<FrameEditorCollections> | null {
  const current = collections.members[index];
  if (!current) return null;
  const nextId = patch.id !== undefined ? canonicalEditorId(patch.id, current.id) : current.id;
  const nextPatch = patch.id !== undefined ? { ...patch, id: nextId } : patch;
  const renamed = nextId !== current.id;
  const nextMembers = collections.members.map((member, memberIndex) => (memberIndex === index ? { ...member, ...nextPatch } : member));
  const rewriteLoad = (load: FrameLoad): FrameLoad => {
    if (renamed && memberLoadTargets(load) && load.member === current.id) {
      return { ...load, member: nextId };
    }
    return load;
  };
  return {
    next: {
      ...collections,
      members: nextMembers,
      loads: collections.loads.map(rewriteLoad),
      loadCases: collections.loadCases.map((loadCase) => ({
        ...loadCase,
        loads: loadCase.loads.map(rewriteLoad),
      })),
    },
    previousId: current.id,
    nextId,
    renamed,
  };
}

export function removeFrameMemberCollections(collections: FrameEditorCollections, index: number): FrameEditorCollections | null {
  const removed = collections.members[index];
  if (!removed) return null;
  const removedMemberIds = new Set([removed.id]);
  return {
    ...collections,
    members: collections.members.filter((_, memberIndex) => memberIndex !== index),
    loads: removeFrameLoadsForTargets(collections.loads, new Set(), removedMemberIds),
    loadCases: collections.loadCases.map((loadCase) => ({
      ...loadCase,
      loads: removeFrameLoadsForTargets(loadCase.loads, new Set(), removedMemberIds),
    })),
  };
}

export function updateFrameLoadCollections(collections: FrameEditorCollections, index: number, patch: Partial<FrameLoad>): FrameEditorCollections | null {
  if (!collections.loads[index]) return null;
  return {
    ...collections,
    loads: collections.loads.map((load, loadIndex) => (loadIndex === index ? { ...load, ...patch } as FrameLoad : load)),
  };
}

export function removeFrameLoadCollections(collections: FrameEditorCollections, index: number): FrameEditorCollections {
  return {
    ...collections,
    loads: collections.loads.filter((_, loadIndex) => loadIndex !== index),
  };
}

export function updateFrameLoadCaseCollections(
  collections: FrameEditorCollections,
  index: number,
  patch: Partial<FrameLoadCase>,
): RenameEditResult<FrameEditorCollections> | null {
  const current = collections.loadCases[index];
  if (!current) return null;
  const nextId = patch.id !== undefined ? canonicalEditorId(patch.id, current.id) : current.id;
  const nextPatch = patch.id !== undefined ? { ...patch, id: nextId } : patch;
  const renamed = nextId !== current.id;
  const nextLoadCases = collections.loadCases.map((loadCase, loadCaseIndex) => (loadCaseIndex === index ? { ...loadCase, ...nextPatch } : loadCase));
  const nextLoadCombinations =
    renamed
      ? collections.loadCombinations.map((combination) => {
          if (!(current.id in combination.factors)) return combination;
          const { [current.id]: factor, ...rest } = combination.factors;
          return { ...combination, factors: { ...rest, [nextId]: factor } };
        })
      : collections.loadCombinations;
  return {
    next: {
      ...collections,
      loadCases: nextLoadCases,
      loadCombinations: nextLoadCombinations,
    },
    previousId: current.id,
    nextId,
    renamed,
  };
}

export function removeFrameLoadCaseCollections(collections: FrameEditorCollections, index: number): FrameEditorCollections | null {
  const removed = collections.loadCases[index];
  if (!removed) return null;
  return {
    ...collections,
    loadCases: collections.loadCases.filter((_, loadCaseIndex) => loadCaseIndex !== index),
    loadCombinations: collections.loadCombinations
      .map((combination) => {
        const factors = { ...combination.factors };
        delete factors[removed.id];
        return { ...combination, factors };
      })
      .filter((combination) => Object.keys(combination.factors).length > 0),
  };
}

export function updateFrameLoadCombinationCollections(
  collections: FrameEditorCollections,
  index: number,
  patch: Partial<FrameLoadCombination>,
): FrameEditorCollections | null {
  const combination = collections.loadCombinations[index];
  if (!combination) return null;
  const nextPatch = patch.id !== undefined ? { ...patch, id: canonicalEditorId(patch.id, combination.id) } : patch;
  return {
    ...collections,
    loadCombinations: collections.loadCombinations.map((item, itemIndex) => (itemIndex === index ? { ...item, ...nextPatch } : item)),
  };
}

export function removeFrameLoadCombinationCollections(collections: FrameEditorCollections, index: number): FrameEditorCollections {
  return {
    ...collections,
    loadCombinations: collections.loadCombinations.filter((_, combinationIndex) => combinationIndex !== index),
  };
}
