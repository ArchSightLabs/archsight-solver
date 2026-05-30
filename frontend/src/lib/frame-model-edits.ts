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

function memberLoadTargets(load: FrameLoad): load is Extract<FrameLoad, { member: string }> {
  return load.type === "distributed" || load.type === "member_point";
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
