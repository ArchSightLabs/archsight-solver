import type { TrussLoad, TrussLoadPatch, TrussMember, TrussMemberLoad, TrussNodalLoad, TrussNode, TrussTemperatureLoad } from "../types/structure.ts";
import { canonicalEditorId, type RenameEditResult } from "./model-edit-utils.ts";

export interface TrussEditorCollections {
  nodes: TrussNode[];
  members: TrussMember[];
  loads: TrussLoad[];
}

export interface TrussCopyOptions {
  nodeIds?: string[];
  memberIds?: string[];
  offsetX?: number;
  offsetY?: number;
  copyIndex?: number;
}

export interface TrussMirrorOptions extends Omit<TrussCopyOptions, "offsetX" | "offsetY"> {
  axis: "x" | "y";
  origin: number;
}

export interface TrussArrayOptions extends Omit<TrussCopyOptions, "copyIndex"> {
  count: number;
  deltaX: number;
  deltaY: number;
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

function selectedTrussNodeIds(collections: TrussEditorCollections, options: TrussCopyOptions): Set<string> {
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

function selectedTrussMemberIds(collections: TrussEditorCollections, selectedNodes: Set<string>, options: TrussCopyOptions): Set<string> {
  const explicit = new Set((options.memberIds ?? []).filter(Boolean));
  if (explicit.size > 0) return explicit;
  return new Set(collections.members.filter((member) => selectedNodes.has(member.start) && selectedNodes.has(member.end)).map((member) => member.id));
}

function transformTrussNode(node: TrussNode, options: TrussCopyOptions & Partial<TrussMirrorOptions>): TrussNode {
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;
  let x = node.x + offsetX;
  let y = node.y + offsetY;
  if (options.axis === "x") y = 2 * (options.origin ?? 0) - node.y;
  if (options.axis === "y") x = 2 * (options.origin ?? 0) - node.x;
  return { ...node, x, y };
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function transformTrussLoad(load: TrussLoad, options: Partial<TrussMirrorOptions>): TrussLoad {
  if (!options.axis) return { ...load };
  if (load.type === "nodal") {
    return withoutUndefined({
      ...load,
      fxKn: options.axis === "y" && load.fxKn !== undefined ? -load.fxKn : load.fxKn,
      fyKn: options.axis === "x" && load.fyKn !== undefined ? -load.fyKn : load.fyKn,
    });
  }
  if (load.type === "temperature") {
    return { ...load };
  }
  if (load.direction === "global_x" && options.axis === "y") {
    return withoutUndefined({
      ...load,
      wyKnPerM: load.wyKnPerM !== undefined ? -load.wyKnPerM : load.wyKnPerM,
      qStartKnPerM: load.qStartKnPerM !== undefined ? -load.qStartKnPerM : load.qStartKnPerM,
      qEndKnPerM: load.qEndKnPerM !== undefined ? -load.qEndKnPerM : load.qEndKnPerM,
      selfWeightKnPerM: load.selfWeightKnPerM !== undefined ? -load.selfWeightKnPerM : load.selfWeightKnPerM,
    });
  }
  if ((load.direction ?? "global_y") === "global_y" && options.axis === "x") {
    return withoutUndefined({
      ...load,
      wyKnPerM: load.wyKnPerM !== undefined ? -load.wyKnPerM : load.wyKnPerM,
      qStartKnPerM: load.qStartKnPerM !== undefined ? -load.qStartKnPerM : load.qStartKnPerM,
      qEndKnPerM: load.qEndKnPerM !== undefined ? -load.qEndKnPerM : load.qEndKnPerM,
      selfWeightKnPerM: load.selfWeightKnPerM !== undefined ? -load.selfWeightKnPerM : load.selfWeightKnPerM,
    });
  }
  return { ...load };
}

function copyTrussOnce(collections: TrussEditorCollections, options: TrussCopyOptions & Partial<TrussMirrorOptions>): TrussEditorCollections {
  const copyIndex = Math.max(1, Math.trunc(options.copyIndex ?? 1));
  const selectedNodes = selectedTrussNodeIds(collections, options);
  const selectedMembers = selectedTrussMemberIds(collections, selectedNodes, options);
  const usedNodeIds = new Set(collections.nodes.map((node) => node.id));
  const usedMemberIds = new Set(collections.members.map((member) => member.id));
  const nodeIdMap = new Map<string, string>();
  const memberIdMap = new Map<string, string>();
  const copiedNodes = collections.nodes
    .filter((node) => selectedNodes.has(node.id))
    .map((node) => {
      const nextId = uniqueId(node.id, usedNodeIds, copyIndex);
      nodeIdMap.set(node.id, nextId);
      return { ...transformTrussNode(node, options), id: nextId };
    });
  const copiedMembers = collections.members
    .filter((member) => selectedMembers.has(member.id) && nodeIdMap.has(member.start) && nodeIdMap.has(member.end))
    .map((member) => {
      const nextId = uniqueId(member.id, usedMemberIds, copyIndex);
      memberIdMap.set(member.id, nextId);
      return { ...member, id: nextId, start: nodeIdMap.get(member.start) ?? member.start, end: nodeIdMap.get(member.end) ?? member.end };
    });
  const copiedLoads = collections.loads
    .map((load): TrussLoad | null => {
      if (load.type === "nodal") {
        const nextNode = nodeIdMap.get(load.node);
        const transformedLoad = transformTrussLoad(load, options) as Extract<TrussLoad, { type: "nodal" }>;
        return nextNode ? { ...transformedLoad, node: nextNode } : null;
      }
      const nextMember = memberIdMap.get(load.member);
      return nextMember ? { ...transformTrussLoad(load, options), member: nextMember } as TrussLoad : null;
    })
    .filter((load): load is TrussLoad => Boolean(load));
  return {
    ...collections,
    nodes: [...collections.nodes, ...copiedNodes],
    members: [...collections.members, ...copiedMembers],
    loads: [...collections.loads, ...copiedLoads],
  };
}

export function copyTrussCollections(collections: TrussEditorCollections, options: TrussCopyOptions = {}): TrussEditorCollections {
  return copyTrussOnce(collections, options);
}

export function mirrorTrussCollections(collections: TrussEditorCollections, options: TrussMirrorOptions): TrussEditorCollections {
  return copyTrussOnce(collections, options);
}

export function arrayTrussCollections(collections: TrussEditorCollections, options: TrussArrayOptions): TrussEditorCollections {
  const count = Math.max(0, Math.trunc(options.count));
  const baseNodeIds = options.nodeIds ?? collections.nodes.map((node) => node.id);
  const baseMemberIds = options.memberIds ?? collections.members.map((member) => member.id);
  return Array.from({ length: count }, (_, index) => index + 1).reduce(
    (nextCollections, copyIndex) => copyTrussOnce(nextCollections, {
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

function removeTrussLoadsForTargets(loads: TrussLoad[], nodeIds: Set<string>, memberIds: Set<string>): TrussLoad[] {
  return loads.filter((load) => {
    if (load.type === "nodal") return !nodeIds.has(load.node);
    return !memberIds.has(load.member);
  });
}

export function updateTrussNodeCollections(
  collections: TrussEditorCollections,
  index: number,
  patch: Partial<TrussNode>,
): RenameEditResult<TrussEditorCollections> | null {
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
  const nextLoads = collections.loads.map((load) => (renamed && load.type === "nodal" && load.node === current.id ? { ...load, node: nextId } : load));
  return {
    next: {
      ...collections,
      nodes: nextNodes,
      members: nextMembers,
      loads: nextLoads,
    },
    previousId: current.id,
    nextId,
    renamed,
  };
}

export function removeTrussNodeCollections(collections: TrussEditorCollections, index: number): TrussEditorCollections | null {
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
    loads: removeTrussLoadsForTargets(collections.loads, removedNodeIds, removedMemberIds),
  };
}

export function updateTrussMemberCollections(
  collections: TrussEditorCollections,
  index: number,
  patch: Partial<TrussMember>,
): RenameEditResult<TrussEditorCollections> | null {
  const current = collections.members[index];
  if (!current) return null;
  const nextId = patch.id !== undefined ? canonicalEditorId(patch.id, current.id) : current.id;
  const nextPatch = patch.id !== undefined ? { ...patch, id: nextId } : patch;
  const renamed = nextId !== current.id;
  const nextMembers = collections.members.map((member, memberIndex) => (memberIndex === index ? { ...member, ...nextPatch } : member));
  const nextLoads = collections.loads.map((load) => {
    if (renamed && load.type !== "nodal" && load.member === current.id) {
      return { ...load, member: nextId };
    }
    return load;
  });
  return {
    next: {
      ...collections,
      members: nextMembers,
      loads: nextLoads,
    },
    previousId: current.id,
    nextId,
    renamed,
  };
}

export function removeTrussMemberCollections(collections: TrussEditorCollections, index: number): TrussEditorCollections | null {
  const removed = collections.members[index];
  if (!removed) return null;
  return {
    ...collections,
    members: collections.members.filter((_, memberIndex) => memberIndex !== index),
    loads: removeTrussLoadsForTargets(collections.loads, new Set(), new Set([removed.id])),
  };
}

function isCompleteTrussLoad(value: TrussLoadPatch | TrussLoad): value is TrussLoad {
  return "type" in value;
}

function isNodalLoadPatch(value: TrussLoadPatch): value is Partial<Omit<TrussNodalLoad, "type">> {
  return "node" in value || "fxKn" in value || "fyKn" in value;
}

function isMemberLoadPatch(value: TrussLoadPatch): value is Partial<Omit<TrussMemberLoad, "type">> {
  return "member" in value || "direction" in value || "wyKnPerM" in value || "qStartKnPerM" in value || "qEndKnPerM" in value || "selfWeightKnPerM" in value;
}

function isTemperatureLoadPatch(value: TrussLoadPatch): value is Partial<Omit<TrussTemperatureLoad, "type">> {
  return "member" in value || "deltaTempC" in value || "alphaPerC" in value;
}

function mergeTrussLoadPatch(load: TrussLoad, patch: TrussLoadPatch | TrussLoad): TrussLoad {
  if (isCompleteTrussLoad(patch)) {
    return patch;
  }
  if (load.type === "nodal") {
    return isNodalLoadPatch(patch) ? { ...load, ...patch } : load;
  }
  if (load.type === "temperature") {
    return isTemperatureLoadPatch(patch) ? { ...load, ...patch } : load;
  }
  return isMemberLoadPatch(patch) ? { ...load, ...patch } : load;
}

export function updateTrussLoadCollections(collections: TrussEditorCollections, index: number, patch: TrussLoadPatch | TrussLoad): TrussEditorCollections | null {
  if (!collections.loads[index]) return null;
  return {
    ...collections,
    loads: collections.loads.map((load, loadIndex) => (loadIndex === index ? mergeTrussLoadPatch(load, patch) : load)),
  };
}

export function removeTrussLoadCollections(collections: TrussEditorCollections, index: number): TrussEditorCollections {
  return {
    ...collections,
    loads: collections.loads.filter((_, loadIndex) => loadIndex !== index),
  };
}
