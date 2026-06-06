import type { ModelCanvasSize } from "./model-canvas-sizing.ts";
import { createPortalFrameModelFromState, type WorkspaceState } from "./workspace-state.ts";

interface CanvasPadding {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface GraphNode {
  id: string;
  x: number;
  y: number;
}

export interface CanvasPoint {
  x: number;
  y: number;
}

export interface ModelCanvasNodeDragPreview {
  mode: "frame" | "truss";
  nodeId: string;
  x: number;
  y: number;
}

export const FRAME_SKETCH_PADDING: CanvasPadding = { left: 165, right: 165, top: 90, bottom: 75 };
export const TRUSS_SKETCH_PADDING: CanvasPadding = { left: 110, right: 110, top: 90, bottom: 80 };

function finiteCoordinateBounds(nodes: GraphNode[]) {
  const xs = nodes.map((node) => node.x).filter(Number.isFinite);
  const ys = nodes.map((node) => node.y).filter(Number.isFinite);
  return {
    minX: Math.min(...xs, 0),
    maxX: Math.max(...xs, 1),
    minY: Math.min(...ys, 0),
    maxY: Math.max(...ys, 1),
  };
}

function applyNodePreview<T extends GraphNode>(nodes: T[], preview: ModelCanvasNodeDragPreview | null | undefined, mode: "frame" | "truss"): T[] {
  if (!preview || preview.mode !== mode) return nodes;
  return nodes.map((node) => (node.id === preview.nodeId ? { ...node, x: preview.x, y: preview.y } : node));
}

export function createGraphCanvasProjector(nodes: GraphNode[], canvasSize: ModelCanvasSize, padding: CanvasPadding) {
  const bounds = finiteCoordinateBounds(nodes);
  const drawableWidth = Math.max(240, canvasSize.width - padding.left - padding.right);
  const drawableHeight = Math.max(150, canvasSize.height - padding.top - padding.bottom);
  const modelWidth = Math.max(1, bounds.maxX - bounds.minX);
  const modelHeight = Math.max(1, bounds.maxY - bounds.minY);

  const toCanvas = (point: Pick<GraphNode, "x" | "y">): CanvasPoint => ({
    x: padding.left + ((point.x - bounds.minX) / modelWidth) * drawableWidth,
    y: canvasSize.height - padding.bottom - ((point.y - bounds.minY) / modelHeight) * drawableHeight,
  });

  const toModel = (point: CanvasPoint): CanvasPoint => ({
    x: bounds.minX + ((point.x - padding.left) / drawableWidth) * modelWidth,
    y: bounds.minY + ((canvasSize.height - padding.bottom - point.y) / drawableHeight) * modelHeight,
  });

  return {
    ...bounds,
    drawableWidth,
    drawableHeight,
    toCanvas,
    toModel,
  };
}

export function frameCanvasModel(workspace: WorkspaceState, preview?: ModelCanvasNodeDragPreview | null) {
  const model =
    workspace.frame.frameMode === "custom"
      ? {
          nodes: workspace.frame.customNodes,
          members: workspace.frame.customMembers,
          loads: workspace.frame.customLoads,
        }
      : createPortalFrameModelFromState(workspace.frame);

  return {
    ...model,
    nodes: applyNodePreview(model.nodes, preview, "frame"),
  };
}

export function trussCanvasModel(workspace: WorkspaceState, preview?: ModelCanvasNodeDragPreview | null) {
  return {
    nodes: applyNodePreview(workspace.truss.customNodes, preview, "truss"),
    members: workspace.truss.customMembers,
    loads: workspace.truss.customLoads,
  };
}

export function frameCanvasPointToModel(workspace: WorkspaceState, canvasSize: ModelCanvasSize, point: CanvasPoint): CanvasPoint {
  const model =
    workspace.frame.frameMode === "custom"
      ? {
          nodes: workspace.frame.customNodes,
        }
      : createPortalFrameModelFromState(workspace.frame);
  return createGraphCanvasProjector(model.nodes, canvasSize, FRAME_SKETCH_PADDING).toModel(point);
}

export function trussCanvasPointToModel(workspace: WorkspaceState, canvasSize: ModelCanvasSize, point: CanvasPoint): CanvasPoint {
  return createGraphCanvasProjector(workspace.truss.customNodes, canvasSize, TRUSS_SKETCH_PADDING).toModel(point);
}
