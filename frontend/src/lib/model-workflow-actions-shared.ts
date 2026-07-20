import type { AnalysisMode } from "../types/structure.ts";
import type { WorkbenchSelection } from "../types/workbench-selection.ts";
import { filterSelectionSetForMode, uniqueWorkbenchSelections } from "./workbench-selection-utils.ts";
import type { WorkspaceState } from "./workspace-state.ts";
import type { FrameEditorCollections } from "./frame-model-edits.ts";
import type { TrussEditorCollections } from "./truss-model-edits.ts";

export interface GeometryEditTarget {
  nodeIds?: string[];
  memberIds?: string[];
  preferredNodeId?: string;
  preferredMemberId?: string;
  label: string;
}

export function frameCollections(workspace: WorkspaceState): FrameEditorCollections {
  return {
    nodes: workspace.frame.customNodes,
    members: workspace.frame.customMembers,
    loads: workspace.frame.customLoads,
    loadCases: workspace.frame.customLoadCases,
    loadCombinations: workspace.frame.customLoadCombinations,
  };
}

export function trussCollections(workspace: WorkspaceState): TrussEditorCollections {
  return {
    nodes: workspace.truss.customNodes,
    members: workspace.truss.customMembers,
    loads: workspace.truss.customLoads,
    loadCases: workspace.truss.customLoadCases,
    loadCombinations: workspace.truss.customLoadCombinations,
  };
}

export function frameWorkspaceWithCollections(workspace: WorkspaceState, collections: FrameEditorCollections): WorkspaceState {
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

export function trussWorkspaceWithCollections(workspace: WorkspaceState, collections: TrussEditorCollections): WorkspaceState {
  return {
    ...workspace,
    truss: {
      ...workspace.truss,
      customNodes: collections.nodes,
      customMembers: collections.members,
      customLoads: collections.loads,
      customLoadCases: collections.loadCases,
      customLoadCombinations: collections.loadCombinations,
    },
  };
}

export function loadIndexFromSelection(selection: WorkbenchSelection): number | null {
  if (selection.type !== "load") return null;
  const index = Number(selection.id.replace("load-", ""));
  return Number.isInteger(index) && index >= 0 ? index : null;
}

export function geometryEditSpacing(nodes: Array<{ x: number; y: number }>) {
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

export function selectedNodeIdsForMode(selections: WorkbenchSelection[] | null | undefined, mode: Extract<AnalysisMode, "frame" | "truss">) {
  return uniqueWorkbenchSelections(filterSelectionSetForMode(selections ?? [], mode))
    .filter((selection) => selection.type === "node")
    .map((selection) => selection.id);
}
