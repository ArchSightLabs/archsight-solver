import type { CSSProperties } from "react";

export interface ResultPreviewCanvasSize {
  width: number;
  height: number;
}

export interface ResultPreviewNodeLike {
  x: number;
  y: number;
}

export interface ResultPreviewInsets {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ResultPreviewPointLayout {
  map: (point: ResultPreviewNodeLike) => ResultPreviewNodeLike;
  scale: number;
  bounds: { left: number; right: number; top: number; bottom: number };
  center: ResultPreviewNodeLike;
}

export const RESULT_PREVIEW_BASE_SIZE: ResultPreviewCanvasSize = { width: 1000, height: 540 };

const RESULT_PREVIEW_MAX_WIDTH = 4200;
const RESULT_PREVIEW_MAX_HEIGHT = 2200;
const COORDINATE_EPSILON = 1e-9;

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

export function fitResultPreviewPoints(
  points: ResultPreviewNodeLike[],
  canvasSize: ResultPreviewCanvasSize,
  insets: ResultPreviewInsets,
): ResultPreviewPointLayout {
  const finitePoints = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const sourcePoints = finitePoints.length ? finitePoints : [{ x: 0, y: 0 }];
  const xs = sourcePoints.map((point) => point.x);
  const ys = sourcePoints.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const availableWidth = Math.max(1, canvasSize.width - insets.left - insets.right);
  const availableHeight = Math.max(1, canvasSize.height - insets.top - insets.bottom);
  const scaleCandidates = [
    spanX > COORDINATE_EPSILON ? availableWidth / spanX : Number.POSITIVE_INFINITY,
    spanY > COORDINATE_EPSILON ? availableHeight / spanY : Number.POSITIVE_INFINITY,
  ].filter(Number.isFinite);
  const scale = scaleCandidates.length ? Math.min(...scaleCandidates) : 1;
  const renderedWidth = spanX * scale;
  const renderedHeight = spanY * scale;
  const offsetX = insets.left + (availableWidth - renderedWidth) / 2;
  const offsetY = insets.top + (availableHeight - renderedHeight) / 2;
  const map = (point: ResultPreviewNodeLike) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (maxY - point.y) * scale,
  });

  return {
    map,
    scale,
    bounds: {
      left: offsetX,
      right: offsetX + renderedWidth,
      top: offsetY,
      bottom: offsetY + renderedHeight,
    },
    center: {
      x: offsetX + renderedWidth / 2,
      y: offsetY + renderedHeight / 2,
    },
  };
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
    width: "100%",
    height: "auto",
    maxWidth: `${size.width}px`,
    margin: "0 auto",
  };
}
