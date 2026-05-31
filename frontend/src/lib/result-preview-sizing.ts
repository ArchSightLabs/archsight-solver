import type { CSSProperties } from "react";

export interface ResultPreviewCanvasSize {
  width: number;
  height: number;
}

export interface ResultPreviewNodeLike {
  x: number;
  y: number;
}

export const RESULT_PREVIEW_BASE_SIZE: ResultPreviewCanvasSize = { width: 1000, height: 540 };

const RESULT_PREVIEW_MAX_WIDTH = 4200;
const RESULT_PREVIEW_MAX_HEIGHT = 2200;

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

export function resultPreviewCanvasSize(nodes: ResultPreviewNodeLike[], memberCount: number): ResultPreviewCanvasSize {
  const xRange = coordinateRange(nodes.map((node) => node.x));
  const yRange = coordinateRange(nodes.map((node) => node.y));
  const uniqueX = distinctCoordinateCount(nodes.map((node) => node.x));
  const uniqueY = distinctCoordinateCount(nodes.map((node) => node.y));

  const width = Math.max(
    RESULT_PREVIEW_BASE_SIZE.width,
    280 + xRange * 88,
    320 + Math.max(1, uniqueX - 1) * 150,
    RESULT_PREVIEW_BASE_SIZE.width + Math.max(0, nodes.length - 10) * 44 + Math.max(0, memberCount - 12) * 18,
  );
  const height = Math.max(
    RESULT_PREVIEW_BASE_SIZE.height,
    220 + yRange * 62,
    240 + Math.max(1, uniqueY - 1) * 132,
    RESULT_PREVIEW_BASE_SIZE.height + Math.max(0, nodes.length - 18) * 12 + Math.max(0, memberCount - 24) * 6,
  );

  return {
    width: clampCanvasDimension(width, RESULT_PREVIEW_BASE_SIZE.width, RESULT_PREVIEW_MAX_WIDTH),
    height: clampCanvasDimension(height, RESULT_PREVIEW_BASE_SIZE.height, RESULT_PREVIEW_MAX_HEIGHT),
  };
}

export function resultPreviewSvgStyle(size: ResultPreviewCanvasSize): CSSProperties {
  return {
    width: `${size.width}px`,
    height: `${size.height}px`,
    maxWidth: "none",
  };
}
