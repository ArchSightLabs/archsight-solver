import type { PointerEvent as ReactPointerEvent } from "react";
import type { WorkbenchSelection } from "../types/workbench-selection.ts";
import type { CanvasPoint } from "../lib/model-canvas-projection.ts";
import type { ModelLabelBounds, ModelLabelOffset } from "../lib/model-label-overrides.ts";

export interface MarqueeSelectionState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
  additive: boolean;
  active: boolean;
}

export type ClientRectLike = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export function clientPointToSvgPoint(pointLike: Pick<ReactPointerEvent<HTMLElement>, "clientX" | "clientY">, svg: globalThis.SVGSVGElement): CanvasPoint | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = pointLike.clientX;
  point.y = pointLike.clientY;
  const next = point.matrixTransform(matrix.inverse());
  return { x: next.x, y: next.y };
}

export function clientRectFromMarquee(marquee: MarqueeSelectionState): ClientRectLike {
  const left = Math.min(marquee.startClientX, marquee.currentClientX);
  const top = Math.min(marquee.startClientY, marquee.currentClientY);
  const right = Math.max(marquee.startClientX, marquee.currentClientX);
  const bottom = Math.max(marquee.startClientY, marquee.currentClientY);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

export function intersectClientRects(left: globalThis.DOMRect, right: globalThis.DOMRect): ClientRectLike {
  const rectLeft = Math.max(left.left, right.left);
  const rectTop = Math.max(left.top, right.top);
  const rectRight = Math.min(left.right, right.right);
  const rectBottom = Math.min(left.bottom, right.bottom);
  return {
    left: rectLeft,
    top: rectTop,
    right: Math.max(rectLeft, rectRight),
    bottom: Math.max(rectTop, rectBottom),
    width: Math.max(0, rectRight - rectLeft),
    height: Math.max(0, rectBottom - rectTop),
  };
}

export function clampClientRect(rect: ClientRectLike, boundary: ClientRectLike): ClientRectLike {
  const left = Math.max(rect.left, boundary.left);
  const top = Math.max(rect.top, boundary.top);
  const right = Math.min(rect.right, boundary.right);
  const bottom = Math.min(rect.bottom, boundary.bottom);
  return {
    left,
    top,
    right: Math.max(left, right),
    bottom: Math.max(top, bottom),
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function rectsIntersect(left: globalThis.DOMRect, right: ClientRectLike): boolean {
  return left.right >= right.left && left.left <= right.right && left.bottom >= right.top && left.top <= right.bottom;
}

export function isSelectionModifier(event: ReactPointerEvent<HTMLElement>) {
  return event.shiftKey || event.ctrlKey || event.metaKey;
}

export function nodeDragIdForSelection(selection: WorkbenchSelection): string | null {
  return selection.id;
}

export function isCanvasControlTarget(target: globalThis.EventTarget | null): boolean {
  return target instanceof globalThis.Element && Boolean(target.closest("button,input,textarea,select,[role='toolbar']"));
}

export function svgRectFromClientRect(rect: globalThis.DOMRect, svg: globalThis.SVGSVGElement): ModelLabelBounds | null {
  const points = [
    clientPointToSvgPoint({ clientX: rect.left, clientY: rect.top }, svg),
    clientPointToSvgPoint({ clientX: rect.right, clientY: rect.top }, svg),
    clientPointToSvgPoint({ clientX: rect.right, clientY: rect.bottom }, svg),
    clientPointToSvgPoint({ clientX: rect.left, clientY: rect.bottom }, svg),
  ].filter((point): point is CanvasPoint => Boolean(point));
  if (points.length === 0) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs);
  const top = Math.min(...ys);
  const right = Math.max(...xs);
  const bottom = Math.max(...ys);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

export function labelBaseBounds(target: globalThis.SVGGraphicsElement, svg: globalThis.SVGSVGElement, offset: ModelLabelOffset): ModelLabelBounds | null {
  const rect = target.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const currentBounds = svgRectFromClientRect(rect, svg);
  return currentBounds
    ? {
        ...currentBounds,
        x: currentBounds.x - offset.dx,
        y: currentBounds.y - offset.dy,
      }
    : null;
}
