import type { Material } from "../types/material.ts";
import type { AnalysisMode } from "../types/structure.ts";
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
import { modelObjectMemberTerm } from "./model-object-vocabulary.ts";
import {
  createConnectedTrussMemberByNodeId,
  createConnectedTrussMember,
  createTrussNodeDraft,
  trussMemberExists,
} from "./truss-editor-model.ts";
import {
  arrayTrussCollections,
  copyTrussCollections,
  mirrorTrussCollections,
  removeTrussLoadCollections,
  removeTrussMemberCollections,
  removeTrussNodeCollections,
  type TrussEditorCollections,
} from "./truss-model-edits.ts";
import type { WorkspaceState } from "./workspace-state.ts";
import { filterSelectionSetForMode, uniqueWorkbenchSelections } from "./workbench-selection-utils.ts";

export type ModelGeometryAction =
  | "copy"
  | "mirror-x"
  | "mirror-y"
  | "array-x"
  | "array-y"
  | "add-connected-node";

export interface ModelGeometryToolbarState {
  mode: Extract<AnalysisMode, "frame" | "truss">;
  targetLabel: string;
  memberTerm: string;
  canTransform: boolean;
  canAddConnectedNode: boolean;
  connectsSelectedNodes: boolean;
  addConnectedNodeLabel: string;
}

interface GeometryEditTarget {
  nodeIds?: string[];
  memberIds?: string[];
  preferredNodeId?: string;
  preferredMemberId?: string;
  label: string;
}

interface ApplyModelGeometryActionOptions {
  workspace: WorkspaceState;
  selection?: WorkbenchSelection | null;
  selectionSet?: WorkbenchSelection[];
  action: ModelGeometryAction;
  materialLibrary: Material[];
}

interface ApplyModelGeometryActionResult {
  workspace: WorkspaceState;
  selection?: WorkbenchSelection;
}

interface MoveModelCanvasNodeOptions {
  workspace: WorkspaceState;
  mode: Extract<AnalysisMode, "frame" | "truss">;
  nodeId: string;
  point: { x: number; y: number };
}

interface ApplyModelSelectionDeleteOptions {
  workspace: WorkspaceState;
  selections: WorkbenchSelection[];
}

function frameCollections(workspace: WorkspaceState): FrameEditorCollections {
  return {
    nodes: workspace.frame.customNodes,
    members: workspace.frame.customMembers,
    loads: workspace.frame.customLoads,
    loadCases: workspace.frame.customLoadCases,
    loadCombinations: workspace.frame.customLoadCombinations,
  };
}

function trussCollections(workspace: WorkspaceState): TrussEditorCollections {
  return {
    nodes: workspace.truss.customNodes,
    members: workspace.truss.customMembers,
    loads: workspace.truss.customLoads,
  };
}

function frameWorkspaceWithCollections(workspace: WorkspaceState, collections: FrameEditorCollections): WorkspaceState {
  return {
    ...workspace,
    frame: {
      ...workspace.frame,
      frameMode: "custom",
      customNodes: collections.nodes,
      customMembers: collections.members,
      customLoads: collections.loads,
      customLoadCases: collections.loadCases,
      customLoadCombinations: collections.loadCombinations,
    },
  };
}

function trussWorkspaceWithCollections(workspace: WorkspaceState, collections: TrussEditorCollections): WorkspaceState {
  return {
    ...workspace,
    truss: {
      ...workspace.truss,
      customNodes: collections.nodes,
      customMembers: collections.members,
      customLoads: collections.loads,
    },
  };
}

function loadIndexFromSelection(selection: WorkbenchSelection): number | null {
  if (selection.type !== "load") return null;
  const index = Number(selection.id.replace("load-", ""));
  return Number.isInteger(index) && index >= 0 ? index : null;
}

function frameGeometryEditTargetFromSelectionSet(
  collections: FrameEditorCollections,
  selections: WorkbenchSelection[] | null | undefined,
): GeometryEditTarget | null {
  const scoped = uniqueWorkbenchSelections((selections ?? []).filter((selection) => selection.mode === "frame"));
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

function trussGeometryEditTargetFromSelectionSet(
  collections: TrussEditorCollections,
  selections: WorkbenchSelection[] | null | undefined,
): GeometryEditTarget | null {
  const scoped = uniqueWorkbenchSelections((selections ?? []).filter((selection) => selection.mode === "truss"));
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

function frameGeometryEditTarget(collections: FrameEditorCollections, selection?: WorkbenchSelection | null, selectionSet?: WorkbenchSelection[]): GeometryEditTarget {
  const setTarget = frameGeometryEditTargetFromSelectionSet(collections, selectionSet);
  if (setTarget) return setTarget;
  const memberTerm = modelObjectMemberTerm("frame");
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

function trussGeometryEditTarget(collections: TrussEditorCollections, selection?: WorkbenchSelection | null, selectionSet?: WorkbenchSelection[]): GeometryEditTarget {
  const setTarget = trussGeometryEditTargetFromSelectionSet(collections, selectionSet);
  if (setTarget) return setTarget;
  const memberTerm = modelObjectMemberTerm("truss");
  if (selection?.mode === "truss" && selection.type === "node" && collections.nodes.some((node) => node.id === selection.id)) {
    return {
      nodeIds: [selection.id],
      memberIds: [],
      preferredNodeId: selection.id,
      label: "当前节点",
    };
  }
  if (selection?.mode === "truss" && selection.type === "member" && collections.members.some((member) => member.id === selection.id)) {
    const member = collections.members.find((item) => item.id === selection.id);
    return {
      nodeIds: [],
      memberIds: [selection.id],
      preferredNodeId: member?.end,
      preferredMemberId: selection.id,
      label: `当前${memberTerm}`,
    };
  }
  if (selection?.mode === "truss" && selection.type === "load") {
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

function geometryEditSpacing(nodes: Array<{ x: number; y: number }>) {
  if (nodes.length === 0) return { x: 3, y: 3 };
  const xs = nodes.map((node) => node.x);
  const ys = nodes.map((node) => node.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return {
    x: Number(Math.max(1, width + 1).toFixed(3)),
    y: Number(Math.max(1, height + 1).toFixed(3)),
  };
}

function selectGeneratedFrameGeometry(previous: FrameEditorCollections, next: FrameEditorCollections, target: GeometryEditTarget): WorkbenchSelection | undefined {
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

function selectGeneratedTrussGeometry(previous: TrussEditorCollections, next: TrussEditorCollections, target: GeometryEditTarget): WorkbenchSelection | undefined {
  const previousNodeIds = new Set(previous.nodes.map((node) => node.id));
  const previousMemberIds = new Set(previous.members.map((member) => member.id));
  if (target.preferredMemberId) {
    const generatedMember = next.members.find((member) => !previousMemberIds.has(member.id) && member.id.startsWith(`${target.preferredMemberId}_C`));
    if (generatedMember) return { mode: "truss", type: "member", id: generatedMember.id };
  }
  if (target.preferredNodeId) {
    const generatedNode = next.nodes.find((node) => !previousNodeIds.has(node.id) && node.id.startsWith(`${target.preferredNodeId}_C`));
    if (generatedNode) return { mode: "truss", type: "node", id: generatedNode.id };
  }
  const generatedNode = next.nodes.find((node) => !previousNodeIds.has(node.id));
  if (generatedNode) return { mode: "truss", type: "node", id: generatedNode.id };
  return undefined;
}

function applyFrameTransformAction(
  workspace: WorkspaceState,
  selection: WorkbenchSelection | null | undefined,
  selectionSet: WorkbenchSelection[] | undefined,
  action: ModelGeometryAction,
): ApplyModelGeometryActionResult | null {
  const collections = frameCollections(workspace);
  const target = frameGeometryEditTarget(collections, selection, selectionSet);
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

function applyTrussTransformAction(
  workspace: WorkspaceState,
  selection: WorkbenchSelection | null | undefined,
  selectionSet: WorkbenchSelection[] | undefined,
  action: ModelGeometryAction,
): ApplyModelGeometryActionResult | null {
  const collections = trussCollections(workspace);
  const target = trussGeometryEditTarget(collections, selection, selectionSet);
  const spacing = geometryEditSpacing(collections.nodes);
  const options = { nodeIds: target.nodeIds, memberIds: target.memberIds };
  const next =
    action === "copy"
      ? copyTrussCollections(collections, { ...options, offsetX: spacing.x, offsetY: 0 })
      : action === "mirror-x"
        ? mirrorTrussCollections(collections, { ...options, axis: "x", origin: 0 })
        : action === "mirror-y"
          ? mirrorTrussCollections(collections, { ...options, axis: "y", origin: 0 })
          : action === "array-x"
            ? arrayTrussCollections(collections, { ...options, count: 2, deltaX: spacing.x, deltaY: 0 })
            : action === "array-y"
              ? arrayTrussCollections(collections, { ...options, count: 2, deltaX: 0, deltaY: spacing.y })
              : null;

  if (!next) return null;
  return {
    workspace: trussWorkspaceWithCollections(workspace, next),
    selection: selectGeneratedTrussGeometry(collections, next, target),
  };
}

function applyFrameConnectedNode(
  workspace: WorkspaceState,
  selection: WorkbenchSelection | null | undefined,
  selectionSet: WorkbenchSelection[] | undefined,
  materialLibrary: Material[],
): ApplyModelGeometryActionResult {
  const collections = frameCollections(workspace);
  const target = frameGeometryEditTarget(collections, selection, selectionSet);
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

function applyTrussConnectedNode(
  workspace: WorkspaceState,
  selection: WorkbenchSelection | null | undefined,
  selectionSet: WorkbenchSelection[] | undefined,
  materialLibrary: Material[],
): ApplyModelGeometryActionResult {
  const collections = trussCollections(workspace);
  const target = trussGeometryEditTarget(collections, selection, selectionSet);
  const preferredConnectionNode = target.preferredNodeId
    ? collections.nodes.find((node) => node.id === target.preferredNodeId) ?? null
    : null;
  const nextNode = createTrussNodeDraft(collections.nodes.length, collections.nodes.map((node) => node.id));
  const nearest = collections.nodes.reduce<(typeof collections.nodes)[number] | null>((candidate, node) => {
    if (!candidate) return node;
    const candidateDistance = Math.hypot(candidate.x - nextNode.x, candidate.y - nextNode.y);
    const nodeDistance = Math.hypot(node.x - nextNode.x, node.y - nextNode.y);
    return nodeDistance < candidateDistance ? node : candidate;
  }, null);
  const connectionNode = preferredConnectionNode ?? nearest;
  const materialId = workspace.truss.materialId;
  const nextMembers = connectionNode && !trussMemberExists(collections.members, connectionNode.id, nextNode.id)
    ? [
        ...collections.members,
        createConnectedTrussMember(
          connectionNode,
          nextNode,
          collections.members,
          collections.members.map((member) => member.id),
          youngModulusForMaterial(materialId, 210, materialLibrary),
          materialId,
          {
            sectionAreaCm2: sectionAreaForMaterial(materialId, 24, materialLibrary),
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
    workspace: trussWorkspaceWithCollections(workspace, nextCollections),
    selection: { mode: "truss", type: "node", id: nextNode.id },
  };
}

function selectedNodeIdsForMode(selections: WorkbenchSelection[] | null | undefined, mode: Extract<AnalysisMode, "frame" | "truss">): string[] {
  return uniqueWorkbenchSelections(filterSelectionSetForMode(selections ?? [], mode))
    .filter((selection) => selection.type === "node")
    .map((selection) => selection.id);
}

function frameSelectedNodeConnectionState(collections: FrameEditorCollections, selections: WorkbenchSelection[] | undefined) {
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

function trussSelectedNodeConnectionState(collections: TrussEditorCollections, selections: WorkbenchSelection[] | undefined) {
  const nodeIds = selectedNodeIdsForMode(selections, "truss").filter((nodeId) => collections.nodes.some((node) => node.id === nodeId));
  if (nodeIds.length !== 2) {
    return { nodeIds, canConnect: false, connectsSelectedNodes: false };
  }
  return {
    nodeIds,
    canConnect: !trussMemberExists(collections.members, nodeIds[0], nodeIds[1]),
    connectsSelectedNodes: true,
  };
}

function applyFrameSelectedNodeConnection(
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

function applyTrussSelectedNodeConnection(
  workspace: WorkspaceState,
  selections: WorkbenchSelection[] | undefined,
  materialLibrary: Material[],
): ApplyModelGeometryActionResult | null {
  const collections = trussCollections(workspace);
  const { nodeIds, canConnect } = trussSelectedNodeConnectionState(collections, selections);
  if (!canConnect || nodeIds.length !== 2) return null;
  const materialId = workspace.truss.materialId;
  const member = createConnectedTrussMemberByNodeId(
    nodeIds[0],
    nodeIds[1],
    collections.nodes,
    collections.members,
    youngModulusForMaterial(materialId, 210, materialLibrary),
    materialId,
    {
      sectionAreaCm2: sectionAreaForMaterial(materialId, 24, materialLibrary),
    },
  );
  if (!member) return null;
  return {
    workspace: trussWorkspaceWithCollections(workspace, {
      ...collections,
      members: [...collections.members, member],
    }),
    selection: { mode: "truss", type: "member", id: member.id },
  };
}

function deleteFrameSelections(workspace: WorkspaceState, selections: WorkbenchSelection[]): ApplyModelGeometryActionResult | null {
  let collections = frameCollections(workspace);
  const scoped = uniqueWorkbenchSelections(selections.filter((selection) => selection.mode === "frame"));
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

function deleteTrussSelections(workspace: WorkspaceState, selections: WorkbenchSelection[]): ApplyModelGeometryActionResult | null {
  let collections = trussCollections(workspace);
  const scoped = uniqueWorkbenchSelections(selections.filter((selection) => selection.mode === "truss"));
  if (scoped.length === 0) return null;
  const selectedNodeIds = new Set(scoped.filter((selection) => selection.type === "node").map((selection) => selection.id));
  const selectedMemberIds = new Set(scoped.filter((selection) => selection.type === "member").map((selection) => selection.id));
  const selectedLoadRefs = new Set(
    scoped
      .filter((selection) => selection.type === "load")
      .map(loadIndexFromSelection)
      .filter((index): index is number => index !== null)
      .map((index) => collections.loads.at(index))
      .filter((load): load is TrussEditorCollections["loads"][number] => Boolean(load)),
  );

  let changed = false;
  const nodeIndexes = collections.nodes
    .map((node, index) => selectedNodeIds.has(node.id) ? index : -1)
    .filter((index) => index >= 0)
    .sort((left, right) => right - left);
  for (const index of nodeIndexes) {
    const next = removeTrussNodeCollections(collections, index);
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
    const next = removeTrussMemberCollections(collections, index);
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
      collections = removeTrussLoadCollections(collections, index);
      changed = true;
    }
  }

  return changed ? { workspace: trussWorkspaceWithCollections(workspace, collections) } : null;
}

export function moveModelCanvasNode({ workspace, mode, nodeId, point }: MoveModelCanvasNodeOptions): ApplyModelGeometryActionResult | null {
  const nextPoint = {
    x: Number(point.x.toFixed(3)),
    y: Number(point.y.toFixed(3)),
  };
  if (mode === "frame") {
    const collections = frameCollections(workspace);
    if (!collections.nodes.some((node) => node.id === nodeId)) return null;
    return {
      workspace: frameWorkspaceWithCollections(workspace, {
        ...collections,
        nodes: collections.nodes.map((node) => (node.id === nodeId ? { ...node, ...nextPoint } : node)),
      }),
      selection: { mode: "frame", type: "node", id: nodeId },
    };
  }
  const collections = trussCollections(workspace);
  if (!collections.nodes.some((node) => node.id === nodeId)) return null;
  return {
    workspace: trussWorkspaceWithCollections(workspace, {
      ...collections,
      nodes: collections.nodes.map((node) => (node.id === nodeId ? { ...node, ...nextPoint } : node)),
    }),
    selection: { mode: "truss", type: "node", id: nodeId },
  };
}

export function deleteModelSelections({ workspace, selections }: ApplyModelSelectionDeleteOptions): ApplyModelGeometryActionResult | null {
  if (workspace.analysisMode === "frame") {
    return deleteFrameSelections(workspace, selections);
  }
  if (workspace.analysisMode === "truss") {
    return deleteTrussSelections(workspace, selections);
  }
  return null;
}

export function canDeleteModelSelections(workspace: WorkspaceState, selections: WorkbenchSelection[]): boolean {
  if (workspace.analysisMode === "frame") {
    const collections = frameCollections(workspace);
    return selections.some((selection) => (
      selection.mode === "frame" &&
      ((selection.type === "node" && collections.nodes.some((node) => node.id === selection.id)) ||
        (selection.type === "member" && collections.members.some((member) => member.id === selection.id)) ||
        (selection.type === "load" && loadIndexFromSelection(selection) !== null && collections.loads.at(loadIndexFromSelection(selection) ?? -1)))
    ));
  }
  if (workspace.analysisMode === "truss") {
    const collections = trussCollections(workspace);
    return selections.some((selection) => (
      selection.mode === "truss" &&
      ((selection.type === "node" && collections.nodes.some((node) => node.id === selection.id)) ||
        (selection.type === "member" && collections.members.some((member) => member.id === selection.id)) ||
        (selection.type === "load" && loadIndexFromSelection(selection) !== null && collections.loads.at(loadIndexFromSelection(selection) ?? -1)))
    ));
  }
  return false;
}

export function modelGeometryToolbarState(
  workspace: WorkspaceState,
  selection?: WorkbenchSelection | null,
  selectionSet?: WorkbenchSelection[],
): ModelGeometryToolbarState | null {
  if (workspace.analysisMode === "frame") {
    const collections = frameCollections(workspace);
    const target = frameGeometryEditTarget(collections, selection, selectionSet);
    const connection = frameSelectedNodeConnectionState(collections, selectionSet);
    return {
      mode: "frame",
      targetLabel: connection.connectsSelectedNodes ? "已选 2 个节点" : target.label,
      memberTerm: modelObjectMemberTerm("frame"),
      canTransform: collections.nodes.length > 0 || collections.members.length > 0,
      canAddConnectedNode: connection.connectsSelectedNodes ? connection.canConnect : true,
      connectsSelectedNodes: connection.connectsSelectedNodes,
      addConnectedNodeLabel: connection.connectsSelectedNodes ? "连接所选节点" : "新增节点并连接",
    };
  }
  if (workspace.analysisMode === "truss") {
    const collections = trussCollections(workspace);
    const target = trussGeometryEditTarget(collections, selection, selectionSet);
    const connection = trussSelectedNodeConnectionState(collections, selectionSet);
    const memberTerm = modelObjectMemberTerm("truss");
    return {
      mode: "truss",
      targetLabel: connection.connectsSelectedNodes ? "已选 2 个节点" : target.label,
      memberTerm,
      canTransform: collections.nodes.length > 0 || collections.members.length > 0,
      canAddConnectedNode: connection.connectsSelectedNodes ? connection.canConnect : true,
      connectsSelectedNodes: connection.connectsSelectedNodes,
      addConnectedNodeLabel: connection.connectsSelectedNodes ? `连接所选${memberTerm}` : `新增节点并连接${memberTerm}`,
    };
  }
  return null;
}

export function applyModelGeometryAction({
  workspace,
  selection,
  selectionSet,
  action,
  materialLibrary,
}: ApplyModelGeometryActionOptions): ApplyModelGeometryActionResult | null {
  if (workspace.analysisMode === "frame") {
    if (action === "add-connected-node") {
      return applyFrameSelectedNodeConnection(workspace, selectionSet, materialLibrary)
        ?? applyFrameConnectedNode(workspace, selection, selectionSet, materialLibrary);
    }
    return applyFrameTransformAction(workspace, selection, selectionSet, action);
  }
  if (workspace.analysisMode === "truss") {
    if (action === "add-connected-node") {
      return applyTrussSelectedNodeConnection(workspace, selectionSet, materialLibrary)
        ?? applyTrussConnectedNode(workspace, selection, selectionSet, materialLibrary);
    }
    return applyTrussTransformAction(workspace, selection, selectionSet, action);
  }
  return null;
}
