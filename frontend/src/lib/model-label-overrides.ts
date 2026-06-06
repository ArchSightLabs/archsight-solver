import type { AnalysisMode, ModelLabelOffset, ModelLabelOffsets } from "../types/structure.ts";
import type { WorkspaceState } from "./workspace-state.ts";

export type { ModelLabelOffset, ModelLabelOffsets } from "../types/structure.ts";

export interface ModelCanvasLabelDragPreview {
  mode: AnalysisMode;
  labelId: string;
  offset: ModelLabelOffset;
}

const OFFSET_EPSILON = 0.01;

export function normalizeModelLabelOffset(value: unknown): ModelLabelOffset | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ModelLabelOffset>;
  const dx = Number(candidate.dx);
  const dy = Number(candidate.dy);
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  return {
    dx: Number(dx.toFixed(2)),
    dy: Number(dy.toFixed(2)),
  };
}

export function normalizeModelLabelOffsets(value: unknown): ModelLabelOffsets | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const offsets: ModelLabelOffsets = {};
  for (const [labelId, rawOffset] of Object.entries(value)) {
    const id = labelId.trim();
    const offset = normalizeModelLabelOffset(rawOffset);
    if (!id || !offset || isZeroModelLabelOffset(offset)) continue;
    offsets[id] = offset;
  }
  return Object.keys(offsets).length ? offsets : undefined;
}

export function cloneModelLabelOffsets(offsets: ModelLabelOffsets | undefined): ModelLabelOffsets | undefined {
  if (!offsets) return undefined;
  const next = normalizeModelLabelOffsets(offsets);
  return next ? { ...next } : undefined;
}

export function isZeroModelLabelOffset(offset: ModelLabelOffset | null | undefined): boolean {
  return !offset || (Math.abs(offset.dx) < OFFSET_EPSILON && Math.abs(offset.dy) < OFFSET_EPSILON);
}

export function modelLabelOffsetsForMode(workspace: WorkspaceState, mode: AnalysisMode): ModelLabelOffsets | undefined {
  if (mode === "beam") return workspace.beam.modelLabelOffsets;
  if (mode === "frame") return workspace.frame.modelLabelOffsets;
  return workspace.truss.modelLabelOffsets;
}

export function modelLabelOffsetForMode(workspace: WorkspaceState, mode: AnalysisMode, labelId: string): ModelLabelOffset {
  return modelLabelOffsetsForMode(workspace, mode)?.[labelId] ?? { dx: 0, dy: 0 };
}

export function previewOrStoredModelLabelOffset(
  offsets: ModelLabelOffsets | undefined,
  preview: ModelCanvasLabelDragPreview | null | undefined,
  mode: AnalysisMode,
  labelId: string,
): ModelLabelOffset {
  if (preview?.mode === mode && preview.labelId === labelId) return preview.offset;
  return offsets?.[labelId] ?? { dx: 0, dy: 0 };
}

export function modelLabelTransform(offset: ModelLabelOffset): string | undefined {
  return isZeroModelLabelOffset(offset) ? undefined : `translate(${offset.dx} ${offset.dy})`;
}

export function modelLabelOffsetCount(offsets: ModelLabelOffsets | undefined): number {
  return offsets ? Object.keys(offsets).length : 0;
}
