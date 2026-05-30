import type { TrussLoad, TrussMember, TrussNode } from "../types/structure.ts";
import { canonicalEditorId, type RenameEditResult } from "./model-edit-utils.ts";

export interface TrussEditorCollections {
  nodes: TrussNode[];
  members: TrussMember[];
  loads: TrussLoad[];
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
      return { ...load, member: nextId } as TrussLoad;
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

export function updateTrussLoadCollections(collections: TrussEditorCollections, index: number, patch: Partial<TrussLoad>): TrussEditorCollections | null {
  if (!collections.loads[index]) return null;
  return {
    ...collections,
    loads: collections.loads.map((load, loadIndex) => (loadIndex === index ? { ...load, ...patch } as TrussLoad : load)),
  };
}

export function removeTrussLoadCollections(collections: TrussEditorCollections, index: number): TrussEditorCollections {
  return {
    ...collections,
    loads: collections.loads.filter((_, loadIndex) => loadIndex !== index),
  };
}
