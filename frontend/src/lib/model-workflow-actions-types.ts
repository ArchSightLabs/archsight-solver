import type { AnalysisMode } from "../types/structure.ts";
import type { Material } from "../types/material.ts";
import type { WorkbenchSelection } from "../types/workbench-selection.ts";
import type { WorkspaceState } from "./workspace-state.ts";

export type ModelGeometryAction = "copy" | "mirror-x" | "mirror-y" | "array-x" | "array-y" | "add-connected-node";

export interface ModelGeometryToolbarState {
  mode: AnalysisMode;
  targetLabel: string;
  memberTerm: string;
  canTransform: boolean;
  canAddConnectedNode: boolean;
  connectsSelectedNodes: boolean;
  addConnectedNodeLabel: string;
}

export interface ApplyModelGeometryActionOptions {
  workspace: WorkspaceState;
  selection?: WorkbenchSelection | null;
  selectionSet?: WorkbenchSelection[];
  action: ModelGeometryAction;
  materialLibrary: Material[];
}

export interface ApplyModelGeometryActionResult {
  workspace: WorkspaceState;
  selection?: WorkbenchSelection;
}

export interface MoveModelCanvasNodeOptions {
  workspace: WorkspaceState;
  mode: AnalysisMode;
  nodeId: string;
  point: { x: number; y: number };
}

export interface ApplyModelSelectionDeleteOptions {
  workspace: WorkspaceState;
  selections: WorkbenchSelection[];
}
