import type { BeamCalculationResults, BeamPreviewData, BeamSupportType } from "../types/beam.ts";
import type { ModelLabelOffsets, ResultViewSettings } from "../types/structure.ts";
import { findBeamDiagramKeyPoints, type BeamDiagramKeyPointKind, type BeamDiagramMetricKey } from "./beam-diagram-key-points.ts";
import { buildBeamSpanDimensionLegendRows, buildBeamSpanDimensionSegments, formatBeamDimensionLength, type BeamSpanDimension } from "./beam-span-dimensions.ts";
import {
  estimateDiagramTextWidth,
  placeDiagramLabel,
  samplePointBlockers,
  type DiagramLabelBlocker,
  type DiagramPlacedLabel,
} from "./diagram-label-layout.ts";
import { formatEngineeringValue } from "./engineering-format.ts";
import { modelLabelTransformFromOffsets } from "./model-label-overrides.ts";
import { STRUCTURE_NODE_RADII, STRUCTURE_OBJECT_COLORS, STRUCTURE_RESULT_COLORS, STRUCTURE_VISUAL_STROKES } from "./structure-visual-tokens.ts";

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
type LabelLayout = DiagramPlacedLabel;

export const BEAM_RESULT_DIAGRAM_SVG_WIDTH = 1000;
export const BEAM_RESULT_DIAGRAM_SVG_HEIGHT = 360;

const BEAM_LEFT = 80;
const BEAM_RIGHT = 920;
const BEAM_Y = 180;
const BEAM_LEN = BEAM_RIGHT - BEAM_LEFT;
const GRID_STROKE_WIDTH = 0.8;
const BEAM_STROKE_WIDTH = STRUCTURE_VISUAL_STROKES.resultBeamBase;
const RESULT_AREA_STROKE_WIDTH = 1.7;
const RESULT_LINE_STROKE_WIDTH = 2;
const SUPPORT_BASE_STROKE_WIDTH = 1.25;
const NODE_RADIUS = STRUCTURE_NODE_RADII.resultBeam;
const EXTREME_RADIUS = 4;
const SPAN_MEMBER_LABEL_Y = BEAM_Y + 18;
const NODE_BADGE_OFFSET_X = 10;
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
  base: STRUCTURE_OBJECT_COLORS.member,
  supportFill: STRUCTURE_OBJECT_COLORS.supportFill,
  supportStroke: STRUCTURE_OBJECT_COLORS.supportStroke,
  supportLine: STRUCTURE_OBJECT_COLORS.supportLine,
  label: STRUCTURE_OBJECT_COLORS.label,
  node: STRUCTURE_OBJECT_COLORS.node,
  guide: "#94a3b8",
  badgeFill: STRUCTURE_OBJECT_COLORS.badgeFill,
  badgeStroke: STRUCTURE_OBJECT_COLORS.badgeStroke,
  badgeText: STRUCTURE_OBJECT_COLORS.badgeText,
  textHalo: "#ffffff",
};

const BEAM_DIAGRAM_METRICS: Record<BeamDiagramMetricKey, BeamDiagramMetric> = {
  momentKnM: { key: "momentKnM", title: "弯矩图", unit: "kN·m", color: STRUCTURE_RESULT_COLORS.beamMoment, fillColor: STRUCTURE_RESULT_COLORS.beamMomentFill, diagramType: "area" },
  shearKn: { key: "shearKn", title: "剪力图", unit: "kN", color: STRUCTURE_RESULT_COLORS.beamShear, fillColor: STRUCTURE_RESULT_COLORS.beamShearFill, diagramType: "area" },
  deflectionMm: { key: "deflectionMm", title: "挠度图", unit: "mm", color: STRUCTURE_RESULT_COLORS.beamDeflection, fillColor: STRUCTURE_RESULT_COLORS.beamDeflectionFill, diagramType: "line" },
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

function labelTransformAttr(modelLabelOffsets: ModelLabelOffsets | null | undefined, labelId: string) {
  const transform = modelLabelTransformFromOffsets(modelLabelOffsets, labelId);
  return transform ? ` transform="${escapeSvg(transform)}"` : "";
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

function supportBlockers(beam: BeamPreviewData, mapX: (x: number) => number): DiagramLabelBlocker[] {
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

function resultPointBlockers(points: SvgPoint[]): DiagramLabelBlocker[] {
  return samplePointBlockers(points, 4, 2.5);
}

function spanDimensionBlockers(dimensions: BeamSpanDimension[], compact: boolean): DiagramLabelBlocker[] {
  const fontSize = compact ? 9 : 11;
  return dimensions.flatMap((dimension) => {
    if (!dimension.label) return [];

    const midX = (dimension.start + dimension.end) / 2;
    const labelWidth = estimateDiagramTextWidth(dimension.label, fontSize) + 10;
    return [{
      left: midX - labelWidth / 2,
      right: midX + labelWidth / 2,
      top: SPAN_MEMBER_LABEL_Y - fontSize - 4,
      bottom: SPAN_MEMBER_LABEL_Y + 4,
      weight: 10,
    }];
  });
}

function spanDimensionLegendBlockers(rows: string[], compact: boolean): DiagramLabelBlocker[] {
  const fontSize = compact ? 10 : 11;
  return rows.map((row, index) => {
    const top = SPAN_DIMENSION_LEGEND_Y + index * SPAN_DIMENSION_LEGEND_GAP - fontSize - 4;
    return {
      left: SPAN_DIMENSION_LEGEND_X,
      right: SPAN_DIMENSION_LEGEND_X + estimateDiagramTextWidth(row, fontSize) + 8,
      top,
      bottom: top + fontSize + 8,
      weight: 9,
    };
  });
}

function nodeBadgeBlockers(beam: BeamPreviewData, mapX: (x: number) => number, compact: boolean): DiagramLabelBlocker[] {
  const radius = compact ? 8 : 10;
  return beam.nodes.map((node) => {
    const x = mapX(node.x) + NODE_BADGE_OFFSET_X;
    const y = BEAM_Y + NODE_BADGE_OFFSET_Y;
    return {
      left: x - radius,
      right: x + radius,
      top: y - radius,
      bottom: y + radius,
      weight: 8,
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
  extraBlockers?: DiagramLabelBlocker[];
}): LabelLayout {
  const valueFontSize = params.compact ? 11 : 13;
  const stationFontSize = params.compact ? 9 : 11;
  const lineGap = params.compact ? 14 : 16;
  const margin = 20;
  const gap = params.compact ? 14 : 18;
  const blockers: DiagramLabelBlocker[] = [
    { left: BEAM_LEFT - 8, right: BEAM_RIGHT + 8, top: BEAM_Y - 8, bottom: BEAM_Y + 8, weight: 7 },
    ...supportBlockers(params.beam, params.mapX),
    ...resultPointBlockers(params.resultPoints),
    ...(params.extraBlockers ?? []),
  ];
  return placeDiagramLabel({
    anchor: params.extreme,
    lines: [
      { text: params.valueLabel, fontSize: valueFontSize },
      { text: params.stationLabel, fontSize: stationFontSize },
    ],
    candidates: [
      { dx: gap, dy: -gap - valueFontSize - 3, textAnchor: "start", verticalAnchor: "top", penalty: 0 },
      { dx: gap, dy: gap - 3, textAnchor: "start", verticalAnchor: "top", penalty: 8 },
      { dx: -gap, dy: -gap - valueFontSize - 3, textAnchor: "end", verticalAnchor: "top", penalty: 12 },
      { dx: -gap, dy: gap - 3, textAnchor: "end", verticalAnchor: "top", penalty: 16 },
      { dx: gap * 2, dy: -gap - valueFontSize - 21, textAnchor: "start", verticalAnchor: "top", penalty: 22 },
      { dx: gap * 2, dy: gap + 15, textAnchor: "start", verticalAnchor: "top", penalty: 26 },
      { dx: -gap * 2, dy: -gap - valueFontSize - 21, textAnchor: "end", verticalAnchor: "top", penalty: 30 },
      { dx: -gap * 2, dy: gap + 15, textAnchor: "end", verticalAnchor: "top", penalty: 34 },
    ],
    blockers,
    bounds: { left: margin, top: margin, right: BEAM_RESULT_DIAGRAM_SVG_WIDTH - margin, bottom: BEAM_RESULT_DIAGRAM_SVG_HEIGHT - margin },
    paddingX: 0,
    paddingY: 0,
    lineGap: Math.max(2, lineGap - stationFontSize),
    extraScore: (rect) => (Math.abs((rect.top + rect.bottom) / 2 - BEAM_Y) < 30 ? 180 : 0),
  });
}

function beamXData(results: BeamCalculationResults, beam: BeamPreviewData) {
  if (results.x_data?.length) return results.x_data;
  if (beam.curve.length) return beam.curve.map((point) => point.x);
  return [0, beam.totalLength || 1];
}

function supportMarkerSvg(type: BeamSupportType, x: number) {
  if (type === "fixed") {
    return String.raw`<rect x="${n(x - 14)}" y="${n(BEAM_Y - 5)}" width="28" height="44" rx="3" fill="${COLORS.supportFill}" stroke="${COLORS.supportStroke}" stroke-width="1" />`;
  }
  if (type === "free") {
    return String.raw`<circle cx="${n(x)}" cy="${n(BEAM_Y)}" r="7" fill="none" stroke="${COLORS.supportStroke}" stroke-dasharray="3 3" />`;
  }
  const rollers =
    type === "roller"
      ? String.raw`
        <circle cx="${n(x - 9)}" cy="${n(BEAM_Y + 36)}" r="3" fill="none" stroke="${COLORS.supportStroke}" stroke-width="1" />
        <circle cx="${n(x + 9)}" cy="${n(BEAM_Y + 36)}" r="3" fill="none" stroke="${COLORS.supportStroke}" stroke-width="1" />`
      : "";
  return String.raw`
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
  const occupied: DiagramLabelBlocker[] = [
    ...spanDimensionBlockers(params.spanDimensions, params.compact),
    ...spanDimensionLegendBlockers(params.spanDimensionLegendRows, params.compact),
    ...nodeBadgeBlockers(params.beam, params.mapX, params.compact),
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

export function buildBeamResultDiagramSvg(results: BeamCalculationResults, metricKey: BeamDiagramMetricKey, compact = false, viewSettings?: ResultViewSettings | null, modelLabelOffsets?: ModelLabelOffsets | null) {
  const beam = results.beam;
  if (!beam) return "";

  const metric = Reflect.get(BEAM_DIAGRAM_METRICS, metricKey as keyof typeof BEAM_DIAGRAM_METRICS) || BEAM_DIAGRAM_METRICS.deflectionMm;
  const totalLength = Math.max(beam.totalLength || 0, 1e-9);
  const xData = beamXData(results, beam);
  const values = metricValues(results, metric.key);
  const samples = xData
    .map((x, index) => ({ x, value: values.at(index) ?? 0 }))
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
      const svgPoint = resultPoints.at(point.index);
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

  return String.raw`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BEAM_RESULT_DIAGRAM_SVG_WIDTH} ${BEAM_RESULT_DIAGRAM_SVG_HEIGHT}" width="${BEAM_RESULT_DIAGRAM_SVG_WIDTH}" height="${BEAM_RESULT_DIAGRAM_SVG_HEIGHT}">
  <rect x="0" y="0" width="${BEAM_RESULT_DIAGRAM_SVG_WIDTH}" height="${BEAM_RESULT_DIAGRAM_SVG_HEIGHT}" fill="${COLORS.background}" />
  ${[0.25, 0.5, 0.75]
    .map(
      (ratio) =>
        String.raw`<line x1="42" y1="${n(BEAM_RESULT_DIAGRAM_SVG_HEIGHT * ratio)}" x2="${BEAM_RESULT_DIAGRAM_SVG_WIDTH - 42}" y2="${n(BEAM_RESULT_DIAGRAM_SVG_HEIGHT * ratio)}" stroke="${COLORS.grid}" stroke-opacity="0.78" stroke-width="${GRID_STROKE_WIDTH}" stroke-dasharray="6 8" />`,
    )
    .join("")}
  <text x="32" y="30" fill="${COLORS.label}" font-size="${compact ? 10 : 12}" font-family="${DIAGRAM_LABEL_FONT}" font-weight="${DIAGRAM_LABEL_WEIGHT}">梁长=${escapeSvg(formatBeamDimensionLength(totalLength))}</text>
  <g fill="${COLORS.label}" stroke="${COLORS.textHalo}" stroke-width="${STATION_TEXT_HALO_WIDTH}" paint-order="stroke" font-family="${DIAGRAM_LABEL_FONT}"${labelTransformAttr(modelLabelOffsets, "dimension-legend")}>
    ${spanDimensionLegendRows
      .map(
        (row, index) =>
          String.raw`<text x="${SPAN_DIMENSION_LEGEND_X}" y="${SPAN_DIMENSION_LEGEND_Y + index * SPAN_DIMENSION_LEGEND_GAP}" font-size="${compact ? 10 : 12}" font-weight="${DIAGRAM_LABEL_WEIGHT}">${escapeSvg(row)}</text>`,
      )
      .join("")}
  </g>
  <line x1="${BEAM_LEFT}" y1="${BEAM_Y}" x2="${BEAM_RIGHT}" y2="${BEAM_Y}" stroke="${COLORS.base}" stroke-opacity="0.82" stroke-width="${BEAM_STROKE_WIDTH}" stroke-linecap="butt" />
  ${metric.diagramType === "area" && resultAreaPath ? String.raw`<path d="${resultAreaPath}" fill="${metric.fillColor}" stroke="none" />` : ""}
  ${resultPath ? String.raw`<path d="${resultPath}" fill="none" stroke="${metric.color}" stroke-opacity="0.92" stroke-width="${metric.diagramType === "line" ? RESULT_LINE_STROKE_WIDTH : RESULT_AREA_STROKE_WIDTH}" stroke-linecap="butt" stroke-linejoin="round" />` : ""}
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
      const nodeId = node.id ?? `${index + 1}`;
      return String.raw`<g><circle cx="${n(x)}" cy="${BEAM_Y}" r="${NODE_RADIUS}" fill="${node.support ? COLORS.node : COLORS.guide}" /><g${labelTransformAttr(modelLabelOffsets, `node:${nodeId}`)}><circle cx="${n(badgeX)}" cy="${n(badgeY)}" r="7.5" fill="${COLORS.badgeFill}" stroke="${COLORS.badgeStroke}" stroke-width="1.2" /><text x="${n(badgeX)}" y="${n(badgeY)}" fill="${COLORS.badgeText}" text-anchor="middle" dominant-baseline="middle" font-size="8.5" font-family="${DIAGRAM_LABEL_FONT}" font-weight="${DIAGRAM_LABEL_WEIGHT}">${escapeSvg(nodeId)}</text></g></g>`;
    })
    .join("")}
  <g fill="${COLORS.label}" font-family="${DIAGRAM_LABEL_FONT}">
    ${spanDimensions
      .map((dimension) => {
        const midX = (dimension.start + dimension.end) / 2;
        if (!dimension.label) return "";
        return String.raw`
        <g${labelTransformAttr(modelLabelOffsets, `member:${dimension.memberId}`)}>
          <title>${escapeSvg(dimension.title)}</title>
          <text x="${n(midX)}" y="${SPAN_MEMBER_LABEL_Y}" text-anchor="middle" font-size="${compact ? 10 : 12}" font-weight="${DIAGRAM_LABEL_WEIGHT}" stroke="${COLORS.textHalo}" stroke-width="${STATION_TEXT_HALO_WIDTH}" paint-order="stroke">${escapeSvg(dimension.label)}</text>
        </g>`;
      })
      .join("")}
  </g>
  ${
    viewSettings?.showExtremeLabel !== false
      ? annotations
          .map(({ point, valueLabel, stationLabel, layout }) => {
            const isGlobalExtreme = point.kind === "global-extreme";
            return String.raw`
      <g>
        <circle cx="${n(point.x)}" cy="${n(point.y)}" r="${isGlobalExtreme ? EXTREME_RADIUS : EXTREME_RADIUS - 0.75}" fill="${metric.color}" fill-opacity="${isGlobalExtreme ? 1 : 0.88}" stroke="${COLORS.textHalo}" stroke-width="${isGlobalExtreme ? 1.25 : 1}" />
        <line x1="${n(point.x)}" y1="${n(point.y)}" x2="${n(layout.connectorX)}" y2="${n(layout.connectorY)}" stroke="${metric.color}" stroke-opacity="${isGlobalExtreme ? 0.9 : 0.68}" stroke-width="${CALLOUT_STROKE_WIDTH}" stroke-dasharray="4 4" />
        <text x="${n(layout.textX)}" y="${n(layout.valueY)}" fill="${metric.color}" stroke="${COLORS.textHalo}" stroke-width="${VALUE_TEXT_HALO_WIDTH}" paint-order="stroke" font-size="${compact ? 11 : 13}" font-family="${DIAGRAM_NUMERIC_FONT}" font-weight="${isGlobalExtreme ? 700 : 650}">${escapeSvg(valueLabel)}</text>
        <text x="${n(layout.textX)}" y="${n(layout.stationY)}" fill="${COLORS.label}" stroke="${COLORS.textHalo}" stroke-width="${STATION_TEXT_HALO_WIDTH}" paint-order="stroke" font-size="${compact ? 9 : 11}" font-family="${DIAGRAM_NUMERIC_FONT}">${escapeSvg(stationLabel)}</text>
      </g>`;
          })
          .join("")
      : ""
  }
</svg>`.trim();
}
