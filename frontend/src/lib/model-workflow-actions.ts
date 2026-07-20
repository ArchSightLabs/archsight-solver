import type { WorkbenchSelection } from "../types/workbench-selection.ts";
import { modelObjectMemberTerm } from "./model-object-vocabulary.ts";
import {
  frameCollections,
  frameWorkspaceWithCollections,
  loadIndexFromSelection,
  trussCollections,
  trussWorkspaceWithCollections,
} from "./model-workflow-actions-shared.ts";
import {
  frameGeometryEditTarget,
  frameSelectedNodeConnectionState,
  applyFrameConnectedNode,
  applyFrameSelectedNodeConnection,
  applyFrameTransformAction,
  deleteFrameSelections,
} from "./model-workflow-actions-frame.ts";
import {
  applyBeamGeometryAction,
  beamGeometryToolbarState,
  canDeleteBeamSelections,
  deleteBeamSelections,
  moveBeamCanvasNode,
} from "./model-workflow-actions-beam.ts";
import type {
  ApplyModelGeometryActionOptions,
  ApplyModelGeometryActionResult,
  ApplyModelSelectionDeleteOptions,
  ModelGeometryToolbarState,
  MoveModelCanvasNodeOptions,
} from "./model-workflow-actions-types.ts";
import {
  applyTrussConnectedNode,
  applyTrussSelectedNodeConnection,
  applyTrussTransformAction,
  deleteTrussSelections,
  trussGeometryEditTarget,
  trussSelectedNodeConnectionState,
} from "./model-workflow-actions-truss.ts";
import type { WorkspaceState } from "./workspace-state.ts";

export type {
  ApplyModelGeometryActionOptions,
  ApplyModelGeometryActionResult,
  ApplyModelSelectionDeleteOptions,
  ModelGeometryToolbarState,
  MoveModelCanvasNodeOptions,
} from "./model-workflow-actions-types.ts";
export type { ModelGeometryAction } from "./model-workflow-actions-types.ts";

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
  if (mode === "beam") {
    return moveBeamCanvasNode({ workspace, mode, nodeId, point });
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
  if (workspace.analysisMode === "beam") {
    return deleteBeamSelections({ workspace, selections });
  }
  return null;
}

export function canDeleteModelSelections(workspace: WorkspaceState, selections: WorkbenchSelection[]): boolean {
  if (workspace.analysisMode === "frame") {
    const scoped = selections.filter((selection) => selection.mode === "frame");
    return scoped.some(
      (selection) =>
        ((selection.type === "node" && workspace.frame.customNodes.some((node) => node.id === selection.id)) ||
          (selection.type === "member" && workspace.frame.customMembers.some((member) => member.id === selection.id)) ||
          (selection.type === "load" && loadIndexFromSelection(selection) !== null && workspace.frame.customLoads.at(loadIndexFromSelection(selection) ?? -1))),
    );
  }
  if (workspace.analysisMode === "truss") {
    const scoped = selections.filter((selection) => selection.mode === "truss");
    return scoped.some(
      (selection) =>
        ((selection.type === "node" && workspace.truss.customNodes.some((node) => node.id === selection.id)) ||
          (selection.type === "member" && workspace.truss.customMembers.some((member) => member.id === selection.id)) ||
          (selection.type === "load" && loadIndexFromSelection(selection) !== null && workspace.truss.customLoads.at(loadIndexFromSelection(selection) ?? -1))),
    );
  }
  if (workspace.analysisMode === "beam") {
    return canDeleteBeamSelections(workspace, selections);
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
    const memberTerm = modelObjectMemberTerm("frame");
    const target = frameGeometryEditTarget(collections, memberTerm, selection, selectionSet);
    const connection = frameSelectedNodeConnectionState(collections, selectionSet);
    return {
      mode: "frame",
      targetLabel: connection.connectsSelectedNodes ? "已选 2 个节点" : target.label,
      memberTerm,
      canTransform: collections.nodes.length > 0 || collections.members.length > 0,
      canAddConnectedNode: connection.connectsSelectedNodes ? connection.canConnect : true,
      connectsSelectedNodes: connection.connectsSelectedNodes,
      addConnectedNodeLabel: connection.connectsSelectedNodes ? "连接所选节点" : "新增节点并连接",
    };
  }
  if (workspace.analysisMode === "truss") {
    const collections = trussCollections(workspace);
    const memberTerm = modelObjectMemberTerm("truss");
    const target = trussGeometryEditTarget(collections, memberTerm, selection, selectionSet);
    const connection = trussSelectedNodeConnectionState(collections, selectionSet);
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
  if (workspace.analysisMode === "beam") {
    return beamGeometryToolbarState(workspace, selection);
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
      return applyFrameSelectedNodeConnection(workspace, selectionSet, materialLibrary) ?? applyFrameConnectedNode(workspace, selection, selectionSet, materialLibrary);
    }
    return applyFrameTransformAction(workspace, selection, selectionSet, action);
  }
  if (workspace.analysisMode === "truss") {
    if (action === "add-connected-node") {
      return applyTrussSelectedNodeConnection(workspace, selectionSet, materialLibrary) ?? applyTrussConnectedNode(workspace, selection, selectionSet, materialLibrary);
    }
    return applyTrussTransformAction(workspace, selection, selectionSet, action);
  }
  if (workspace.analysisMode === "beam") {
    return applyBeamGeometryAction(workspace, action);
  }
  return null;
}
