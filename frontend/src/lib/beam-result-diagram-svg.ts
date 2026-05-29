import type { BeamCalculationResults, BeamPreviewData, BeamSupportType } from "../types/beam.ts";
import { findBeamDiagramKeyPoints, type BeamDiagramKeyPointKind, type BeamDiagramMetricKey } from "./beam-diagram-key-points.ts";
import { buildBeamSpanDimensionLegendRows, buildBeamSpanDimensionSegments, formatBeamDimensionLength, type BeamSpanDimension } from "./beam-span-dimensions.ts";
import { formatEngineeringValue } from "./engineering-format.ts";

interface BeamDiagramMetric {
  key: BeamDiagramMetricKey;
  title: string;
  unit: string;
  color: string;
  fillColor: string;
  diagramType: "area" | "line";
}

type SvgPoint = { x: number; y: number };
type BeamResultSvgPoint = SvgPoint & { value: number; stationM: number };
type BeamAnnotationPoint = BeamResultSvgPoint & {
  key: string;
  kind: BeamDiagramKeyPointKind;
  priority: number;
};
type LabelRect = { left: number; top: number; right: number; bottom: number };
type WeightedLabelBlocker = LabelRect & { weight: number };
type LabelLayout = {
  textX: number;
  valueY: number;
  stationY: number;
  connectorX: number;
  connectorY: number;
  rect: LabelRect;
};

export const BEAM_RESULT_DIAGRAM_SVG_WIDTH = 1000;
export const BEAM_RESULT_DIAGRAM_SVG_HEIGHT = 360;

const BEAM_LEFT = 80;
const BEAM_RIGHT = 920;
const BEAM_Y = 180;
const BEAM_LEN = BEAM_RIGHT - BEAM_LEFT;
const GRID_STROKE_WIDTH = 0.8;
const BEAM_STROKE_WIDTH = 3;
const RESULT_AREA_STROKE_WIDTH = 1.7;
const RESULT_LINE_STROKE_WIDTH = 2;
const SUPPORT_BASE_STROKE_WIDTH = 1.25;
const NODE_RADIUS = 3;
const EXTREME_RADIUS = 4;
const SPAN_MEMBER_LABEL_Y = BEAM_Y + 18;
const NODE_BADGE_OFFSET_X = 18;
const NODE_BADGE_OFFSET_Y = -16;
const SPAN_DIMENSION_LEGEND_X = 32;
const SPAN_DIMENSION_LEGEND_Y = 50;
const SPAN_DIMENSION_LEGEND_GAP = 15;
const CALLOUT_STROKE_WIDTH = 1;
const VALUE_TEXT_HALO_WIDTH = 3.25;
const STATION_TEXT_HALO_WIDTH = 2.5;
const DIAGRAM_LABEL_FONT = "Inter, Microsoft YaHei, system-ui, sans-serif";
const DIAGRAM_NUMERIC_FONT = "Fira Code, ui-monospace, SFMono-Regular, Consolas, monospace";
const DIAGRAM_LABEL_WEIGHT = 600;

const COLORS = {
  background: "#ffffff",
  grid: "#cbd5e1",
  base: "#2f5f8f",
  supportFill: "#d6dee8",
  supportStroke: "#718096",
  supportLine: "#64748b",
  label: "#475569",
  node: "#2f5f8f",
  guide: "#94a3b8",
  badgeFill: "#fff7ed",
  badgeStroke: "#f97316",
  badgeText: "#7c2d12",
  textHalo: "#ffffff",
};

const BEAM_DIAGRAM_METRICS: Record<BeamDiagramMetricKey, BeamDiagramMetric> = {
  momentKnM: { key: "momentKnM", title: "弯矩图", unit: "kN·m", color: "#ef4444", fillColor: "rgba(239, 68, 68, 0.1)", diagramType: "area" },
  shearKn: { key: "shearKn", title: "剪力图", unit: "kN", color: "#3b82f6", fillColor: "rgba(59, 130, 246, 0.09)", diagramType: "area" },
  deflectionMm: { key: "deflectionMm", title: "挠度图", unit: "mm", color: "#8b5cf6", fillColor: "rgba(139, 92, 246, 0.08)", diagramType: "line" },
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function escapeSvg(value: string | number) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function n(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function pathFromPoints(points: SvgPoint[]) {
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${n(point.x)} ${n(point.y)}`).join(" ");
}

function areaPath(basePoints: SvgPoint[], resultPoints: SvgPoint[]) {
  if (basePoints.length < 2 || resultPoints.length < 2) return "";
  return `${pathFromPoints(resultPoints)} L ${basePoints
    .slice()
    .reverse()
    .map((point) => `${n(point.x)} ${n(point.y)}`)
    .join(" L ")} Z`;
}

function metricValues(results: BeamCalculationResults, metricKey: BeamDiagramMetricKey) {
  if (metricKey === "momentKnM") return results.moment_data ?? [];
  if (metricKey === "shearKn") return results.shear_data ?? [];
  return (results.v_data ?? []).map((value) => value * 1000.0);
}

function estimateTextWidth(text: string, fontSize: number) {
  return text.length * fontSize * 0.66;
}

function overlapArea(a: LabelRect, b: LabelRect) {
  const x = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const y = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return x * y;
}

function rectCenter(rect: LabelRect) {
  return {
    x: (rect.left + rect.right) / 2,
    y: (rect.top + rect.bottom) / 2,
  };
}

function supportBlockers(beam: BeamPreviewData, mapX: (x: number) => number): WeightedLabelBlocker[] {
  return beam.supports.map((support) => {
    const x = mapX(support.x);
    const supportHalfWidth = support.type === "fixed" ? 22 : 30;
    return {
      left: x - supportHalfWidth,
      right: x + supportHalfWidth,
      top: BEAM_Y - 12,
      bottom: BEAM_Y + 70,
      weight: 9,
    };
  });
}

function resultPointBlockers(points: SvgPoint[]): WeightedLabelBlocker[] {
  const stride = Math.max(1, Math.floor(points.length / 80));
  return points
    .filter((_, index) => index % stride === 0)
    .map((point) => ({
      left: point.x - 4,
      right: point.x + 4,
      top: point.y - 4,
      bottom: point.y + 4,
      weight: 2.5,
    }));
}

function spanDimensionBlockers(dimensions: BeamSpanDimension[], compact: boolean): WeightedLabelBlocker[] {
  const fontSize = compact ? 9 : 11;
  return dimensions.flatMap((dimension) => {
    if (!dimension.label) return [];

    const midX = (dimension.start + dimension.end) / 2;
    const labelWidth = estimateTextWidth(dimension.label, fontSize) + 10;
    return [{
      left: midX - labelWidth / 2,
      right: midX + labelWidth / 2,
      top: SPAN_MEMBER_LABEL_Y - fontSize - 4,
      bottom: SPAN_MEMBER_LABEL_Y + 4,
      weight: 10,
    }];
  });
}

function spanDimensionLegendBlockers(rows: string[], compact: boolean): WeightedLabelBlocker[] {
  const fontSize = compact ? 10 : 11;
  return rows.map((row, index) => {
    const top = SPAN_DIMENSION_LEGEND_Y + index * SPAN_DIMENSION_LEGEND_GAP - fontSize - 4;
    return {
      left: SPAN_DIMENSION_LEGEND_X,
      right: SPAN_DIMENSION_LEGEND_X + estimateTextWidth(row, fontSize) + 8,
      top,
      bottom: top + fontSize + 8,
      weight: 9,
    };
  });
}

function buildLabelLayout(params: {
  extreme: SvgPoint;
  valueLabel: string;
  stationLabel: string;
  compact: boolean;
  beam: BeamPreviewData;
  resultPoints: SvgPoint[];
  mapX: (x: number) => number;
  extraBlockers?: WeightedLabelBlocker[];
}): LabelLayout {
  const valueFontSize = params.compact ? 11 : 13;
  const stationFontSize = params.compact ? 9 : 11;
  const lineGap = params.compact ? 14 : 16;
  const labelWidth = Math.max(estimateTextWidth(params.valueLabel, valueFontSize), estimateTextWidth(params.stationLabel, stationFontSize));
  const labelHeight = valueFontSize + lineGap + 5;
  const margin = 20;
  const gap = params.compact ? 14 : 18;
  const blockers: WeightedLabelBlocker[] = [
    { left: BEAM_LEFT - 8, right: BEAM_RIGHT + 8, top: BEAM_Y - 8, bottom: BEAM_Y + 8, weight: 7 },
    ...supportBlockers(params.beam, params.mapX),
    ...resultPointBlockers(params.resultPoints),
    ...(params.extraBlockers ?? []),
  ];
  const candidateAnchors = [
    { dx: gap, dy: -gap },
    { dx: gap, dy: gap + valueFontSize },
    { dx: -labelWidth - gap, dy: -gap },
    { dx: -labelWidth - gap, dy: gap + valueFontSize },
    { dx: gap * 2, dy: -gap - 18 },
    { dx: gap * 2, dy: gap + valueFontSize + 18 },
    { dx: -labelWidth - gap * 2, dy: -gap - 18 },
    { dx: -labelWidth - gap * 2, dy: gap + valueFontSize + 18 },
  ];

  const candidates = candidateAnchors.map(({ dx, dy }) => {
    const valueY = clamp(params.extreme.y + dy, margin + valueFontSize, BEAM_RESULT_DIAGRAM_SVG_HEIGHT - margin - lineGap);
    const left = clamp(params.extreme.x + dx, margin, BEAM_RESULT_DIAGRAM_SVG_WIDTH - margin - labelWidth);
    const rect = {
      left,
      right: left + labelWidth,
      top: valueY - valueFontSize - 3,
      bottom: valueY - valueFontSize - 3 + labelHeight,
    };
    const center = rectCenter(rect);
    const overlapPenalty = blockers.reduce((score, blocker) => score + overlapArea(rect, blocker) * blocker.weight, 0);
    const distancePenalty = Math.hypot(center.x - params.extreme.x, center.y - params.extreme.y) * 0.35;
    const beamSidePenalty = Math.abs(center.y - BEAM_Y) < 30 ? 180 : 0;
    return {
      rect,
      valueY,
      score: overlapPenalty + distancePenalty + beamSidePenalty,
    };
  });

  const best = candidates.reduce((current, candidate) => (candidate.score < current.score ? candidate : current), candidates[0]);
  const connectorX = best.rect.left > params.extreme.x ? best.rect.left - 4 : best.rect.right + 4;
  return {
    textX: best.rect.left,
    valueY: best.valueY,
    stationY: best.valueY + lineGap,
    connectorX,
    connectorY: (best.rect.top + best.rect.bottom) / 2,
    rect: best.rect,
  };
}

function beamXData(results: BeamCalculationResults, beam: BeamPreviewData) {
  if (results.x_data?.length) return results.x_data;
  if (beam.curve.length) return beam.curve.map((point) => point.x);
  return [0, beam.totalLength || 1];
}

function supportMarkerSvg(type: BeamSupportType, x: number) {
  if (type === "fixed") {
    return `<rect x="${n(x - 14)}" y="${n(BEAM_Y - 5)}" width="28" height="44" rx="3" fill="${COLORS.supportFill}" stroke="${COLORS.supportStroke}" stroke-width="1" />`;
  }
  if (type === "free") {
    return `<circle cx="${n(x)}" cy="${n(BEAM_Y)}" r="7" fill="none" stroke="${COLORS.supportStroke}" stroke-dasharray="3 3" />`;
  }
  const rollers =
    type === "roller"
      ? `
        <circle cx="${n(x - 9)}" cy="${n(BEAM_Y + 36)}" r="3" fill="none" stroke="${COLORS.supportStroke}" stroke-width="1" />
        <circle cx="${n(x + 9)}" cy="${n(BEAM_Y + 36)}" r="3" fill="none" stroke="${COLORS.supportStroke}" stroke-width="1" />`
      : "";
  return `
    <polygon points="${n(x - 16)},${n(BEAM_Y + 26)} ${n(x + 16)},${n(BEAM_Y + 26)} ${n(x)},${n(BEAM_Y + 2)}" fill="${COLORS.supportFill}" stroke="${COLORS.supportStroke}" stroke-width="1" />
    <line x1="${n(x - 18)}" y1="${n(BEAM_Y + 30)}" x2="${n(x + 18)}" y2="${n(BEAM_Y + 30)}" stroke="${COLORS.supportLine}" stroke-width="${SUPPORT_BASE_STROKE_WIDTH}" />
    ${rollers}`;
}

function keyPointAnnotations(params: {
  keyPoints: BeamAnnotationPoint[];
  spanDimensions: BeamSpanDimension[];
  spanDimensionLegendRows: string[];
  compact: boolean;
  beam: BeamPreviewData;
  resultPoints: SvgPoint[];
  mapX: (x: number) => number;
  unit: string;
}) {
  const occupied: WeightedLabelBlocker[] = [
    ...spanDimensionBlockers(params.spanDimensions, params.compact),
    ...spanDimensionLegendBlockers(params.spanDimensionLegendRows, params.compact),
  ];
  return params.keyPoints
    .slice()
    .sort((a, b) => b.priority - a.priority || Math.abs(b.value) - Math.abs(a.value))
    .map((point) => {
      const valueLabel = formatEngineeringValue(point.value, params.unit);
      const stationLabel = `x = ${point.stationM.toFixed(2)} m`;
      const layout = buildLabelLayout({
        extreme: point,
        valueLabel,
        stationLabel,
        compact: params.compact,
        beam: params.beam,
        resultPoints: params.resultPoints,
        mapX: params.mapX,
        extraBlockers: occupied,
      });
      occupied.push({ ...layout.rect, weight: point.kind === "global-extreme" ? 14 : 11 });
      return { point, valueLabel, stationLabel, layout };
    })
    .sort((a, b) => a.point.x - b.point.x || a.point.y - b.point.y);
}

export function beamReportMetricToDiagramMetric(metric: "moment" | "shear" | "deflection"): BeamDiagramMetricKey {
  if (metric === "moment") return "momentKnM";
  if (metric === "shear") return "shearKn";
  return "deflectionMm";
}

export function buildBeamResultDiagramSvg(results: BeamCalculationResults, metricKey: BeamDiagramMetricKey, compact = false) {
  const beam = results.beam;
  if (!beam) return "";

  const metric = BEAM_DIAGRAM_METRICS[metricKey];
  const totalLength = Math.max(beam.totalLength || 0, 1e-9);
  const xData = beamXData(results, beam);
  const values = metricValues(results, metric.key);
  const samples = xData
    .map((x, index) => ({ x, value: values[index] ?? 0 }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.value))
    .sort((a, b) => a.x - b.x);
  const maxAbs = Math.max(...samples.map((point) => Math.abs(point.value)), 0);
  const offsetScale = maxAbs > 1e-9 ? (compact ? 64 : 82) / maxAbs : 0;
  const valueToSvgOffset = metric.key === "momentKnM" ? 1 : -1;
  const mapX = (x: number) => BEAM_LEFT + (clamp(x, 0, totalLength) / totalLength) * BEAM_LEN;
  const basePoints = samples.map((point) => ({ x: mapX(point.x), y: BEAM_Y }));
  const resultPoints: BeamResultSvgPoint[] = samples.map((point) => ({
    x: mapX(point.x),
    y: BEAM_Y + valueToSvgOffset * point.value * offsetScale,
    value: point.value,
    stationM: point.x,
  }));
  const spanDimensions = buildBeamSpanDimensionSegments(beam.spans, totalLength, BEAM_LEFT, BEAM_RIGHT, {
    memberIds: beam.spanIds,
    nodeIds: beam.nodes?.map((node, index) => node.id ?? `${index + 1}`),
  });
  const spanDimensionLegendRows = buildBeamSpanDimensionLegendRows(spanDimensions, compact ? 310 : 420, compact ? 10 : 11);
  const resultPath = pathFromPoints(resultPoints);
  const resultAreaPath = areaPath(basePoints, resultPoints);
  const keyPoints: BeamAnnotationPoint[] = findBeamDiagramKeyPoints(samples, metric.key)
    .map((point) => {
      const svgPoint = resultPoints[point.index];
      if (!svgPoint) return null;
      return {
        ...svgPoint,
        key: `${point.kind}-${point.index}-${point.x.toFixed(4)}`,
        kind: point.kind,
        priority: point.priority,
      };
    })
    .filter((point): point is BeamAnnotationPoint => Boolean(point));
  const annotations = keyPointAnnotations({
    keyPoints,
    spanDimensions,
    spanDimensionLegendRows,
    compact,
    beam,
    resultPoints,
    mapX,
    unit: metric.unit,
  });

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BEAM_RESULT_DIAGRAM_SVG_WIDTH} ${BEAM_RESULT_DIAGRAM_SVG_HEIGHT}" width="${BEAM_RESULT_DIAGRAM_SVG_WIDTH}" height="${BEAM_RESULT_DIAGRAM_SVG_HEIGHT}">
  <rect x="0" y="0" width="${BEAM_RESULT_DIAGRAM_SVG_WIDTH}" height="${BEAM_RESULT_DIAGRAM_SVG_HEIGHT}" fill="${COLORS.background}" />
  ${[0.25, 0.5, 0.75]
    .map(
      (ratio) =>
        `<line x1="42" y1="${n(BEAM_RESULT_DIAGRAM_SVG_HEIGHT * ratio)}" x2="${BEAM_RESULT_DIAGRAM_SVG_WIDTH - 42}" y2="${n(BEAM_RESULT_DIAGRAM_SVG_HEIGHT * ratio)}" stroke="${COLORS.grid}" stroke-opacity="0.78" stroke-width="${GRID_STROKE_WIDTH}" stroke-dasharray="6 8" />`,
    )
    .join("")}
  <text x="32" y="30" fill="${COLORS.label}" font-size="${compact ? 10 : 12}" font-family="${DIAGRAM_LABEL_FONT}" font-weight="${DIAGRAM_LABEL_WEIGHT}">梁长=${escapeSvg(formatBeamDimensionLength(totalLength))}</text>
  <g fill="${COLORS.label}" stroke="${COLORS.textHalo}" stroke-width="${STATION_TEXT_HALO_WIDTH}" paint-order="stroke" font-family="${DIAGRAM_LABEL_FONT}">
    ${spanDimensionLegendRows
      .map(
        (row, index) =>
          `<text x="${SPAN_DIMENSION_LEGEND_X}" y="${SPAN_DIMENSION_LEGEND_Y + index * SPAN_DIMENSION_LEGEND_GAP}" font-size="${compact ? 10 : 12}" font-weight="${DIAGRAM_LABEL_WEIGHT}">${escapeSvg(row)}</text>`,
      )
      .join("")}
  </g>
  <line x1="${BEAM_LEFT}" y1="${BEAM_Y}" x2="${BEAM_RIGHT}" y2="${BEAM_Y}" stroke="${COLORS.base}" stroke-opacity="0.82" stroke-width="${BEAM_STROKE_WIDTH}" stroke-linecap="butt" />
  ${metric.diagramType === "area" && resultAreaPath ? `<path d="${resultAreaPath}" fill="${metric.fillColor}" stroke="none" />` : ""}
  ${resultPath ? `<path d="${resultPath}" fill="none" stroke="${metric.color}" stroke-opacity="0.92" stroke-width="${metric.diagramType === "line" ? RESULT_LINE_STROKE_WIDTH : RESULT_AREA_STROKE_WIDTH}" stroke-linecap="butt" stroke-linejoin="round" />` : ""}
  ${(beam.supports ?? [])
    .map((support) => {
      const x = mapX(support.x);
      return `
      <g>
        ${supportMarkerSvg(support.type, x)}
      </g>`;
    })
    .join("")}
  ${(beam.nodes ?? [])
    .map((node, index) => {
      const x = mapX(node.x);
      const badgeX = x + NODE_BADGE_OFFSET_X;
      const badgeY = BEAM_Y + NODE_BADGE_OFFSET_Y;
      return `<g><circle cx="${n(x)}" cy="${BEAM_Y}" r="${NODE_RADIUS}" fill="${node.support ? COLORS.node : COLORS.guide}" /><circle cx="${n(badgeX)}" cy="${n(badgeY)}" r="7.5" fill="${COLORS.badgeFill}" stroke="${COLORS.badgeStroke}" stroke-width="1.2" /><text x="${n(badgeX)}" y="${n(badgeY)}" fill="${COLORS.badgeText}" text-anchor="middle" dominant-baseline="middle" font-size="8.5" font-family="${DIAGRAM_LABEL_FONT}" font-weight="${DIAGRAM_LABEL_WEIGHT}">${escapeSvg(node.id ?? `${index + 1}`)}</text></g>`;
    })
    .join("")}
  <g fill="${COLORS.label}" font-family="${DIAGRAM_LABEL_FONT}">
    ${spanDimensions
      .map((dimension) => {
        const midX = (dimension.start + dimension.end) / 2;
        if (!dimension.label) return "";
        return `
        <g>
          <title>${escapeSvg(dimension.title)}</title>
          <text x="${n(midX)}" y="${SPAN_MEMBER_LABEL_Y}" text-anchor="middle" font-size="${compact ? 10 : 12}" font-weight="${DIAGRAM_LABEL_WEIGHT}" stroke="${COLORS.textHalo}" stroke-width="${STATION_TEXT_HALO_WIDTH}" paint-order="stroke">${escapeSvg(dimension.label)}</text>
        </g>`;
      })
      .join("")}
  </g>
  ${annotations
    .map(({ point, valueLabel, stationLabel, layout }) => {
      const isGlobalExtreme = point.kind === "global-extreme";
      return `
      <g>
        <circle cx="${n(point.x)}" cy="${n(point.y)}" r="${isGlobalExtreme ? EXTREME_RADIUS : EXTREME_RADIUS - 0.75}" fill="${metric.color}" fill-opacity="${isGlobalExtreme ? 1 : 0.88}" stroke="${COLORS.textHalo}" stroke-width="${isGlobalExtreme ? 1.25 : 1}" />
        <line x1="${n(point.x)}" y1="${n(point.y)}" x2="${n(layout.connectorX)}" y2="${n(layout.connectorY)}" stroke="${metric.color}" stroke-opacity="${isGlobalExtreme ? 0.9 : 0.68}" stroke-width="${CALLOUT_STROKE_WIDTH}" stroke-dasharray="4 4" />
        <text x="${n(layout.textX)}" y="${n(layout.valueY)}" fill="${metric.color}" stroke="${COLORS.textHalo}" stroke-width="${VALUE_TEXT_HALO_WIDTH}" paint-order="stroke" font-size="${compact ? 11 : 13}" font-family="${DIAGRAM_NUMERIC_FONT}" font-weight="${isGlobalExtreme ? 700 : 650}">${escapeSvg(valueLabel)}</text>
        <text x="${n(layout.textX)}" y="${n(layout.stationY)}" fill="${COLORS.label}" stroke="${COLORS.textHalo}" stroke-width="${STATION_TEXT_HALO_WIDTH}" paint-order="stroke" font-size="${compact ? 9 : 11}" font-family="${DIAGRAM_NUMERIC_FONT}">${escapeSvg(stationLabel)}</text>
      </g>`;
    })
    .join("")}
</svg>`.trim();
}
