import type { Material } from "../types/material.ts";
import type { WorkbenchSelection } from "../types/workbench-selection.ts";
import {
  createConnectedFrameMemberByNodeId,
  createConnectedFrameMember,
  distanceBetweenFrameNodes,
  frameMemberExists,
  inferFrameNodeDraft,
} from "./frame-editor-model.ts";
import {
  arrayFrameCollections,
  copyFrameCollections,
  mirrorFrameCollections,
  removeFrameLoadCollections,
  removeFrameMemberCollections,
  removeFrameNodeCollections,
  type FrameEditorCollections,
} from "./frame-model-edits.ts";
import {
  momentOfInertiaForMaterial,
  sectionAreaForMaterial,
  youngModulusForMaterial,
} from "./material-presets.ts";
import {
  frameCollections,
  frameWorkspaceWithCollections,
  geometryEditSpacing,
  loadIndexFromSelection,
  selectedNodeIdsForMode,
  type GeometryEditTarget,
} from "./model-workflow-actions-shared.ts";
import type {
  ApplyModelGeometryActionResult,
  ModelGeometryAction,
} from "./model-workflow-actions-types.ts";
import type { WorkspaceState } from "./workspace-state.ts";

function frameGeometryEditTargetFromSelectionSet(
  collections: FrameEditorCollections,
  selections: WorkbenchSelection[] | null | undefined,
): GeometryEditTarget | null {
  const scoped = selections ?? [];
  if (scoped.length === 0) return null;
  const nodeIds = new Set<string>();
  const memberIds = new Set<string>();
  let preferredNodeId: string | undefined;
  let preferredMemberId: string | undefined;

  for (const selection of scoped) {
    if (selection.type === "node" && collections.nodes.some((node) => node.id === selection.id)) {
      nodeIds.add(selection.id);
      preferredNodeId = selection.id;
      continue;
    }
    if (selection.type === "member" && collections.members.some((member) => member.id === selection.id)) {
      const member = collections.members.find((item) => item.id === selection.id);
      memberIds.add(selection.id);
      preferredNodeId = member?.end ?? preferredNodeId;
      preferredMemberId = selection.id;
      continue;
    }
    if (selection.type === "load") {
      const loadIndex = loadIndexFromSelection(selection);
      const load = loadIndex === null ? undefined : collections.loads.at(loadIndex);
      if (load?.type === "nodal") {
        nodeIds.add(load.node);
        preferredNodeId = load.node;
      } else if (load) {
        const member = collections.members.find((item) => item.id === load.member);
        memberIds.add(load.member);
        preferredNodeId = member?.end ?? preferredNodeId;
        preferredMemberId = load.member;
      }
    }
  }

  if (nodeIds.size === 0 && memberIds.size === 0) return null;
  return {
    nodeIds: [...nodeIds],
    memberIds: [...memberIds],
    preferredNodeId,
    preferredMemberId,
    label: scoped.length === 1 ? "当前对象" : `已选 ${scoped.length} 个对象`,
  };
}

export function frameGeometryEditTarget(
  collections: FrameEditorCollections,
  memberTerm: string,
  selection?: WorkbenchSelection | null,
  selectionSet?: WorkbenchSelection[],
): GeometryEditTarget {
  const setTarget = frameGeometryEditTargetFromSelectionSet(collections, selectionSet);
  if (setTarget) return setTarget;
  if (selection?.mode === "frame" && selection.type === "node" && collections.nodes.some((node) => node.id === selection.id)) {
    return {
      nodeIds: [selection.id],
      memberIds: [],
      preferredNodeId: selection.id,
      label: "当前节点",
    };
  }
  if (selection?.mode === "frame" && selection.type === "member" && collections.members.some((member) => member.id === selection.id)) {
    const member = collections.members.find((item) => item.id === selection.id);
    return {
      nodeIds: [],
      memberIds: [selection.id],
      preferredNodeId: member?.end,
      preferredMemberId: selection.id,
      label: `当前${memberTerm}`,
    };
  }
  if (selection?.mode === "frame" && selection.type === "load") {
    const load = collections.loads.at(Number(selection.id.replace("load-", "")));
    if (load?.type === "nodal") {
      return {
        nodeIds: [load.node],
        memberIds: [],
        preferredNodeId: load.node,
        label: "荷载作用节点",
      };
    }
    if (load) {
      const member = collections.members.find((item) => item.id === load.member);
      return {
        nodeIds: [],
        memberIds: [load.member],
        preferredNodeId: member?.end,
        preferredMemberId: load.member,
        label: `荷载作用${memberTerm}`,
      };
    }
  }
  return {
    nodeIds: collections.nodes.map((node) => node.id),
    memberIds: collections.members.map((member) => member.id),
    preferredNodeId: collections.nodes[0]?.id,
    preferredMemberId: collections.members[0]?.id,
    label: "全模型",
  };
}

export function selectGeneratedFrameGeometry(
  previous: FrameEditorCollections,
  next: FrameEditorCollections,
  target: GeometryEditTarget,
): WorkbenchSelection | undefined {
  const previousNodeIds = new Set(previous.nodes.map((node) => node.id));
  const previousMemberIds = new Set(previous.members.map((member) => member.id));
  if (target.preferredMemberId) {
    const generatedMember = next.members.find((member) => !previousMemberIds.has(member.id) && member.id.startsWith(`${target.preferredMemberId}_C`));
    if (generatedMember) return { mode: "frame", type: "member", id: generatedMember.id };
  }
  if (target.preferredNodeId) {
    const generatedNode = next.nodes.find((node) => !previousNodeIds.has(node.id) && node.id.startsWith(`${target.preferredNodeId}_C`));
    if (generatedNode) return { mode: "frame", type: "node", id: generatedNode.id };
  }
  const generatedNode = next.nodes.find((node) => !previousNodeIds.has(node.id));
  if (generatedNode) return { mode: "frame", type: "node", id: generatedNode.id };
  return undefined;
}

export function applyFrameTransformAction(
  workspace: WorkspaceState,
  selection: WorkbenchSelection | null | undefined,
  selectionSet: WorkbenchSelection[] | undefined,
  action: ModelGeometryAction,
): ApplyModelGeometryActionResult | null {
  const collections = frameCollections(workspace);
  const target = frameGeometryEditTarget(collections, "构件", selection, selectionSet);
  const spacing = geometryEditSpacing(collections.nodes);
  const options = { nodeIds: target.nodeIds, memberIds: target.memberIds };
  const next =
    action === "copy"
      ? copyFrameCollections(collections, { ...options, offsetX: spacing.x, offsetY: 0 })
      : action === "mirror-x"
        ? mirrorFrameCollections(collections, { ...options, axis: "x", origin: 0 })
        : action === "mirror-y"
          ? mirrorFrameCollections(collections, { ...options, axis: "y", origin: 0 })
          : action === "array-x"
            ? arrayFrameCollections(collections, { ...options, count: 2, deltaX: spacing.x, deltaY: 0 })
            : action === "array-y"
              ? arrayFrameCollections(collections, { ...options, count: 2, deltaX: 0, deltaY: spacing.y })
              : null;

  if (!next) return null;
  return {
    workspace: frameWorkspaceWithCollections(workspace, next),
    selection: selectGeneratedFrameGeometry(collections, next, target),
  };
}

export function applyFrameConnectedNode(
  workspace: WorkspaceState,
  selection: WorkbenchSelection | null | undefined,
  selectionSet: WorkbenchSelection[] | undefined,
  materialLibrary: Material[],
): ApplyModelGeometryActionResult {
  const collections = frameCollections(workspace);
  const target = frameGeometryEditTarget(collections, "构件", selection, selectionSet);
  const preferredConnectionNode = target.preferredNodeId
    ? collections.nodes.find((node) => node.id === target.preferredNodeId) ?? null
    : null;
  const nextNode = inferFrameNodeDraft(collections.nodes, collections.nodes.map((node) => node.id), preferredConnectionNode?.id);
  const nearest = collections.nodes.reduce<(typeof collections.nodes)[number] | null>((candidate, node) => {
    if (!candidate) return node;
    return distanceBetweenFrameNodes(node, nextNode) < distanceBetweenFrameNodes(candidate, nextNode) ? node : candidate;
  }, null);
  const connectionNode = preferredConnectionNode ?? nearest;
  const materialId = workspace.frame.materialId;
  const nextMembers = connectionNode && !frameMemberExists(collections.members, connectionNode.id, nextNode.id)
    ? [
        ...collections.members,
        createConnectedFrameMember(
          connectionNode,
          nextNode,
          collections.members,
          collections.members.map((member) => member.id),
          youngModulusForMaterial(materialId, 210, materialLibrary),
          materialId,
          {
            sectionAreaCm2: sectionAreaForMaterial(materialId, 120, materialLibrary),
            momentOfInertiaCm4: momentOfInertiaForMaterial(materialId, 8000, materialLibrary),
          },
        ),
      ]
    : collections.members;
  const nextCollections = {
    ...collections,
    nodes: [...collections.nodes, nextNode],
    members: nextMembers,
  };

  return {
    workspace: frameWorkspaceWithCollections(workspace, nextCollections),
    selection: { mode: "frame", type: "node", id: nextNode.id },
  };
}

export function frameSelectedNodeConnectionState(collections: FrameEditorCollections, selections: WorkbenchSelection[] | undefined) {
  const nodeIds = selectedNodeIdsForMode(selections, "frame").filter((nodeId) => collections.nodes.some((node) => node.id === nodeId));
  if (nodeIds.length !== 2) {
    return { nodeIds, canConnect: false, connectsSelectedNodes: false };
  }
  return {
    nodeIds,
    canConnect: !frameMemberExists(collections.members, nodeIds[0], nodeIds[1]),
    connectsSelectedNodes: true,
  };
}

export function applyFrameSelectedNodeConnection(
  workspace: WorkspaceState,
  selections: WorkbenchSelection[] | undefined,
  materialLibrary: Material[],
): ApplyModelGeometryActionResult | null {
  const collections = frameCollections(workspace);
  const { nodeIds, canConnect } = frameSelectedNodeConnectionState(collections, selections);
  if (!canConnect || nodeIds.length !== 2) return null;
  const materialId = workspace.frame.materialId;
  const member = createConnectedFrameMemberByNodeId(
    nodeIds[0],
    nodeIds[1],
    collections.nodes,
    collections.members,
    youngModulusForMaterial(materialId, 210, materialLibrary),
    materialId,
    {
      sectionAreaCm2: sectionAreaForMaterial(materialId, 120, materialLibrary),
      momentOfInertiaCm4: momentOfInertiaForMaterial(materialId, 8000, materialLibrary),
    },
  );
  if (!member) return null;
  return {
    workspace: frameWorkspaceWithCollections(workspace, {
      ...collections,
      members: [...collections.members, member],
    }),
    selection: { mode: "frame", type: "member", id: member.id },
  };
}

export function deleteFrameSelections(workspace: WorkspaceState, selections: WorkbenchSelection[]): ApplyModelGeometryActionResult | null {
  let collections = frameCollections(workspace);
  const scoped = selections.filter((selection) => selection.mode === "frame");
  if (scoped.length === 0) return null;
  const selectedNodeIds = new Set(scoped.filter((selection) => selection.type === "node").map((selection) => selection.id));
  const selectedMemberIds = new Set(scoped.filter((selection) => selection.type === "member").map((selection) => selection.id));
  const selectedLoadRefs = new Set(
    scoped
      .filter((selection) => selection.type === "load")
      .map(loadIndexFromSelection)
      .filter((index): index is number => index !== null)
      .map((index) => collections.loads.at(index))
      .filter((load): load is FrameEditorCollections["loads"][number] => Boolean(load)),
  );

  let changed = false;
  const nodeIndexes = collections.nodes
    .map((node, index) => selectedNodeIds.has(node.id) ? index : -1)
    .filter((index) => index >= 0)
    .sort((left, right) => right - left);
  for (const index of nodeIndexes) {
    const next = removeFrameNodeCollections(collections, index);
    if (next) {
      collections = next;
      changed = true;
    }
  }

  const memberIndexes = collections.members
    .map((member, index) => selectedMemberIds.has(member.id) ? index : -1)
    .filter((index) => index >= 0)
    .sort((left, right) => right - left);
  for (const index of memberIndexes) {
    const next = removeFrameMemberCollections(collections, index);
    if (next) {
      collections = next;
      changed = true;
    }
  }

  if (selectedLoadRefs.size > 0) {
    const loadIndexes = collections.loads
      .map((load, index) => selectedLoadRefs.has(load) ? index : -1)
      .filter((index) => index >= 0)
      .sort((left, right) => right - left);
    for (const index of loadIndexes) {
      collections = removeFrameLoadCollections(collections, index);
      changed = true;
    }
  }

  return changed ? { workspace: frameWorkspaceWithCollections(workspace, collections) } : null;
}
