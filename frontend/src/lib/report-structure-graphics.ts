import { frameMemberLabelPlacement } from "../components/frame-preview-utils.ts";
import {
  MUTED_TEXT,
  REPORT_BG,
  TEXT,
  clamp,
} from "./report-rendering.ts";
import { STRUCTURE_NODE_RADII, STRUCTURE_REPORT_COLORS } from "./structure-visual-tokens.ts";

export { REPORT_BG };

export type ReportCanvasSize = { width: number; height: number };

export const REPORT_IMAGE_W = 900;
export const REPORT_IMAGE_H = 520;
export const REPORT_IMAGE_BASE_SIZE: ReportCanvasSize = { width: REPORT_IMAGE_W, height: REPORT_IMAGE_H };
export const BASE_MEMBER_STROKE = STRUCTURE_REPORT_COLORS.baseMember;
export const BASE_MEMBER_LIGHT_STROKE = STRUCTURE_REPORT_COLORS.baseMemberLight;
export const LOAD_STROKE = STRUCTURE_REPORT_COLORS.load;

const REPORT_PADDING_X = 86;
const REPORT_PADDING_TOP = 132;
const REPORT_PADDING_BOTTOM = 72;
const NODE_FILL = STRUCTURE_REPORT_COLORS.node;
const LABEL_HALO = STRUCTURE_REPORT_COLORS.labelHalo;
const DIMENSION_TEXT = STRUCTURE_REPORT_COLORS.dimensionText;
const LOAD_LABEL = STRUCTURE_REPORT_COLORS.loadLabel;

export type ReportNode = { id: string; x: number; y: number; supportType?: string; supportAngleDeg?: number };
export type ReportMember = { id?: string; start: string; end: string };
export type ReportGraphic = Record<string, unknown>;
export type ReportPoint = { x: number; y: number };
export type ReportLabelOffset = { dx?: number; dy?: number };

export interface ReportStructureLayout {
  map: (point: { x: number; y: number }) => ReportPoint;
  scale: number;
  bounds: { left: number; right: number; top: number; bottom: number };
  center: ReportPoint;
}

export function buildReportStructureLayout(
  nodes: Array<{ id?: string; x: number; y: number }>,
  extra: Array<{ x: number; y: number }> = [],
  width = REPORT_IMAGE_W,
  height = REPORT_IMAGE_H,
): ReportStructureLayout {
  const all = [...nodes, ...extra];
  const xs = all.map((node) => node.x);
  const ys = all.map((node) => node.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const modelWidth = Math.max(1, maxX - minX);
  const modelHeight = Math.max(1, maxY - minY);
  const availableWidth = width - REPORT_PADDING_X * 2;
  const availableHeight = height - REPORT_PADDING_TOP - REPORT_PADDING_BOTTOM;
  const scale = Math.min(availableWidth / modelWidth, availableHeight / modelHeight);
  const offsetX = (width - modelWidth * scale) / 2;
  const offsetY = REPORT_PADDING_TOP + Math.max(0, (availableHeight - modelHeight * scale) / 2);
  const map = (point: { x: number; y: number }) => ({
    x: offsetX + (point.x - minX) * scale,
    y: offsetY + (maxY - point.y) * scale,
  });
  const mappedNodes = nodes.map((node) => map(node));
  const mappedXs = mappedNodes.map((point) => point.x);
  const mappedYs = mappedNodes.map((point) => point.y);
  const bounds = {
    left: Math.min(...mappedXs),
    right: Math.max(...mappedXs),
    top: Math.min(...mappedYs),
    bottom: Math.max(...mappedYs),
  };
  return {
    map,
    scale,
    bounds,
    center: {
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2,
    },
  };
}

export function addImageBackground(graphics: ReportGraphic[], canvasSize: ReportCanvasSize = REPORT_IMAGE_BASE_SIZE) {
  graphics.push({ type: "rect", shape: { x: 0, y: 0, width: canvasSize.width, height: canvasSize.height }, style: { fill: REPORT_BG } });
}

export function addReportHeader(graphics: ReportGraphic[], title: string, subtitle?: string) {
  graphics.push({ type: "text", left: 28, top: 22, style: { text: title, fill: TEXT, fontSize: 18, fontWeight: 700 } });
  if (subtitle) {
    graphics.push({ type: "text", left: 28, top: 50, style: { text: subtitle, fill: MUTED_TEXT, fontSize: 12 } });
  }
}

export function addDimensionLegend(graphics: ReportGraphic[], rows: string[], top = 74, offset?: ReportLabelOffset) {
  rows.forEach((row, index) => {
    graphics.push({
      type: "text",
      left: 28 + (offset?.dx ?? 0),
      top: top + index * 17 + (offset?.dy ?? 0),
      style: {
        text: row,
        fill: DIMENSION_TEXT,
        fontSize: 12,
        fontWeight: 700,
        fontFamily: "Fira Code, Consolas, monospace",
        stroke: LABEL_HALO,
        lineWidth: 4,
      },
    });
  });
}

export function addNode(graphics: ReportGraphic[], id: string, point: ReportPoint, center: ReportPoint, labelOffset?: ReportLabelOffset) {
  const side = point.x < center.x ? -1 : 1;
  graphics.push(
    { type: "circle", shape: { cx: point.x, cy: point.y, r: STRUCTURE_NODE_RADII.report }, style: { fill: NODE_FILL } },
    {
      type: "text",
      left: point.x + side * 14 + (labelOffset?.dx ?? 0),
      top: point.y - 24 + (labelOffset?.dy ?? 0),
      style: {
        text: id,
        fill: STRUCTURE_REPORT_COLORS.label,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: "Fira Code, Consolas, monospace",
        align: side < 0 ? "right" : "left",
        stroke: LABEL_HALO,
        lineWidth: 4,
      },
    },
  );
}

export function addMemberLabel(graphics: ReportGraphic[], id: string | undefined, start: ReportPoint, end: ReportPoint, center: ReportPoint, labelOffset?: ReportLabelOffset) {
  if (!id) return;
  const label = frameMemberLabelPlacement(start, end, center, 28);
  graphics.push({
    type: "text",
    left: label.x + (labelOffset?.dx ?? 0),
    top: label.y - 7 + (labelOffset?.dy ?? 0),
    style: {
      text: id,
      fill: STRUCTURE_REPORT_COLORS.label,
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "Fira Code, Consolas, monospace",
      align: label.textAnchor === "middle" ? "center" : label.textAnchor === "end" ? "right" : "left",
      stroke: LABEL_HALO,
      lineWidth: 4,
    },
  });
}

export function rotateReportPoint(point: ReportPoint, origin: ReportPoint, angleDeg: number): ReportPoint {
  if (!Number.isFinite(angleDeg) || Math.abs(angleDeg) < 1e-9) return point;
  const angleRad = (angleDeg * Math.PI) / 180;
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * Math.cos(angleRad) - dy * Math.sin(angleRad),
    y: origin.y + dx * Math.sin(angleRad) + dy * Math.cos(angleRad),
  };
}

export function addArrow(graphics: ReportGraphic[], x1: number, y1: number, x2: number, y2: number, color = LOAD_STROKE, width = 2.2) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const arrowLength = 11;
  const arrowAngle = Math.PI * 0.78;
  graphics.push(
    { type: "line", shape: { x1, y1, x2, y2 }, style: { stroke: color, lineWidth: width } },
    {
      type: "line",
      shape: {
        x1: x2,
        y1: y2,
        x2: x2 + Math.cos(angle + arrowAngle) * arrowLength,
        y2: y2 + Math.sin(angle + arrowAngle) * arrowLength,
      },
      style: { stroke: color, lineWidth: width },
    },
    {
      type: "line",
      shape: {
        x1: x2,
        y1: y2,
        x2: x2 + Math.cos(angle - arrowAngle) * arrowLength,
        y2: y2 + Math.sin(angle - arrowAngle) * arrowLength,
      },
      style: { stroke: color, lineWidth: width },
    },
  );
}

export function addLoadLabel(graphics: ReportGraphic[], text: string | undefined, x: number, y: number, align: "start" | "middle" | "end" = "start", labelOffset?: ReportLabelOffset) {
  if (!text) return;
  graphics.push({
    type: "text",
    left: x + (labelOffset?.dx ?? 0),
    top: y - 8 + (labelOffset?.dy ?? 0),
    style: {
      text,
      fill: LOAD_LABEL,
      fontSize: 11,
      fontWeight: 700,
      fontFamily: "Fira Code, Consolas, monospace",
      align: align === "middle" ? "center" : align === "end" ? "right" : "left",
      stroke: LABEL_HALO,
      lineWidth: 4,
    },
  });
}

export function addControlCallout(
  graphics: ReportGraphic[],
  {
    point,
    text,
    color,
    offsetX = 16,
    offsetY = -38,
    clampX = [30, 715],
    clampY = [74, 455],
  }: {
    point: ReportPoint;
    text: string;
    color: string;
    offsetX?: number;
    offsetY?: number;
    clampX?: [number, number];
    clampY?: [number, number];
  },
) {
  const labelX = clamp(point.x + offsetX, clampX[0], clampX[1]);
  const labelY = clamp(point.y + offsetY, clampY[0], clampY[1]);
  graphics.push(
    { type: "line", shape: { x1: point.x, y1: point.y, x2: labelX - 6, y2: labelY + 12 }, style: { stroke: color, lineWidth: 1.5, lineDash: [4, 4] } },
    { type: "circle", shape: { cx: point.x, cy: point.y, r: 5.5 }, style: { fill: color, stroke: LABEL_HALO, lineWidth: 2 } },
    {
      type: "text",
      left: labelX,
      top: labelY,
      style: {
        text,
        fill: color,
        fontSize: 13,
        fontWeight: 700,
        lineHeight: 17,
        stroke: LABEL_HALO,
        lineWidth: 4,
      },
    },
  );
}
