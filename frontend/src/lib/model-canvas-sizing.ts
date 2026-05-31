import type { CSSProperties } from "react";
import { MODEL_CANVAS_DEFAULT_ZOOM_PERCENT } from "../hooks/useModelCanvasZoom.ts";
import type { AnalysisMode } from "../types/structure.ts";
import { createPortalFrameModelFromState, type WorkspaceState } from "./workspace-state.ts";

export interface ModelCanvasSize {
  width: number;
  height: number;
}

export const BEAM_MODEL_CANVAS_BASE_SIZE: ModelCanvasSize = { width: 900, height: 300 };
export const FRAME_MODEL_CANVAS_BASE_SIZE: ModelCanvasSize = { width: 900, height: 360 };
export const TRUSS_MODEL_CANVAS_BASE_SIZE: ModelCanvasSize = { width: 900, height: 360 };

const MODEL_CANVAS_MAX_WIDTH = 24000;
const MODEL_CANVAS_MAX_HEIGHT = 18000;
const MODEL_CANVAS_RESPONSIVE_MAX_WIDTH = 900;
const MODEL_CANVAS_RESPONSIVE_MAX_HEIGHT = 360;

interface NodeLike {
  x: number;
  y: number;
}

function finiteValues(values: number[]) {
  return values.filter((value) => Number.isFinite(value));
}

function coordinateRange(values: number[]) {
  const finite = finiteValues(values);
  if (!finite.length) return 0;
  return Math.max(...finite) - Math.min(...finite);
}

function distinctCoordinateCount(values: number[]) {
  return new Set(finiteValues(values).map((value) => Math.round(value * 1000) / 1000)).size;
}

function clampCanvasDimension(value: number, min: number, max: number) {
  return Math.round(Math.min(max, Math.max(min, value)));
}

function graphCanvasSize(nodes: NodeLike[], memberCount: number, baseSize: ModelCanvasSize): ModelCanvasSize {
  const xRange = coordinateRange(nodes.map((node) => node.x));
  const yRange = coordinateRange(nodes.map((node) => node.y));
  const uniqueX = distinctCoordinateCount(nodes.map((node) => node.x));
  const uniqueY = distinctCoordinateCount(nodes.map((node) => node.y));

  const width = Math.max(
    baseSize.width,
    260 + xRange * 82,
    280 + Math.max(1, uniqueX - 1) * 130,
    baseSize.width + Math.max(0, nodes.length - 8) * 34 + Math.max(0, memberCount - 10) * 14,
  );
  const height = Math.max(
    baseSize.height,
    160 + yRange * 48,
    160 + Math.max(1, uniqueY - 1) * 112,
    baseSize.height + Math.max(0, nodes.length - 14) * 14 + Math.max(0, memberCount - 18) * 6,
  );

  return {
    width: clampCanvasDimension(width, baseSize.width, MODEL_CANVAS_MAX_WIDTH),
    height: clampCanvasDimension(height, baseSize.height, MODEL_CANVAS_MAX_HEIGHT),
  };
}

function beamCanvasSize(workspace: WorkspaceState): ModelCanvasSize {
  const beam = workspace.beam;
  const spanCount = Math.max(1, beam.spans.length);
  const supportCount = beam.supports.length;
  const totalLength = Math.max(0, beam.spans.reduce((sum, span) => sum + span.length, 0));
  const linearLoadCount = beam.linearLoadEnabled ? Math.max(1, beam.linearLoads.length) : 0;
  const pointLoadCount = beam.pointLoads.length;

  const width = Math.max(
    BEAM_MODEL_CANVAS_BASE_SIZE.width,
    280 + totalLength * 75,
    360 + spanCount * 140,
    360 + supportCount * 110,
    780 + Math.max(0, linearLoadCount + pointLoadCount - 4) * 72,
  );
  const height = Math.max(
    BEAM_MODEL_CANVAS_BASE_SIZE.height,
    BEAM_MODEL_CANVAS_BASE_SIZE.height + Math.max(0, linearLoadCount - 3) * 24 + Math.max(0, pointLoadCount - 6) * 8,
  );

  return {
    width: clampCanvasDimension(width, BEAM_MODEL_CANVAS_BASE_SIZE.width, MODEL_CANVAS_MAX_WIDTH),
    height: clampCanvasDimension(height, BEAM_MODEL_CANVAS_BASE_SIZE.height, MODEL_CANVAS_MAX_HEIGHT),
  };
}

function frameCanvasSize(workspace: WorkspaceState): ModelCanvasSize {
  const model =
    workspace.frame.frameMode === "custom"
      ? {
          nodes: workspace.frame.customNodes,
          members: workspace.frame.customMembers,
        }
      : createPortalFrameModelFromState(workspace.frame);

  return graphCanvasSize(model.nodes, model.members.length, FRAME_MODEL_CANVAS_BASE_SIZE);
}

function trussCanvasSize(workspace: WorkspaceState): ModelCanvasSize {
  return graphCanvasSize(workspace.truss.customNodes, workspace.truss.customMembers.length, TRUSS_MODEL_CANVAS_BASE_SIZE);
}

export function workbenchModelCanvasSize(workspace: WorkspaceState, mode: AnalysisMode): ModelCanvasSize {
  if (mode === "beam") return beamCanvasSize(workspace);
  if (mode === "frame") return frameCanvasSize(workspace);
  return trussCanvasSize(workspace);
}

export function modelCanvasBoardStyle(canvasSize: ModelCanvasSize, zoomPercent: number): CSSProperties {
  const scale = zoomPercent / MODEL_CANVAS_DEFAULT_ZOOM_PERCENT;
  const width = Math.round(canvasSize.width * scale);
  const height = Math.round(canvasSize.height * scale);
  const shouldFitDefaultCanvas =
    zoomPercent === MODEL_CANVAS_DEFAULT_ZOOM_PERCENT &&
    canvasSize.width <= MODEL_CANVAS_RESPONSIVE_MAX_WIDTH &&
    canvasSize.height <= MODEL_CANVAS_RESPONSIVE_MAX_HEIGHT;

  if (shouldFitDefaultCanvas) {
    return {
      width: "100%",
      maxWidth: `${width}px`,
      height: "auto",
      aspectRatio: `${canvasSize.width} / ${canvasSize.height}`,
      margin: "0 auto",
    };
  }

  return {
    width: `${width}px`,
    height: `${height}px`,
    minWidth: zoomPercent >= MODEL_CANVAS_DEFAULT_ZOOM_PERCENT ? "100%" : undefined,
    minHeight: zoomPercent >= MODEL_CANVAS_DEFAULT_ZOOM_PERCENT ? "100%" : undefined,
  };
}
