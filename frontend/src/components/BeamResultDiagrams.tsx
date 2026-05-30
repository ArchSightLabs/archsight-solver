import { useMemo, useState } from "react";
import type { BeamCalculationResults, BeamPreviewData, BeamSupportType } from "../types/beam";
import { findBeamDiagramKeyPoints, type BeamDiagramKeyPointKind, type BeamDiagramMetricKey } from "../lib/beam-diagram-key-points";
import { buildBeamSpanDimensionLegendRows, buildBeamSpanDimensionSegments, formatBeamDimensionLength, type BeamSpanDimension } from "../lib/beam-span-dimensions";
import {
  estimateDiagramTextWidth,
  placeDiagramLabel,
  samplePointBlockers,
  type DiagramLabelBlocker,
  type DiagramPlacedLabel,
} from "../lib/diagram-label-layout";
import { formatEngineeringValue } from "../lib/engineering-format";
import { clamp, svgAreaPath, svgPathFromPoints } from "../lib/result-diagram-geometry";
import { sensitivityResponseMetricLabel } from "../lib/result-metrics";
import { ResultDiagramCard, ResultDiagramEmptyState, ResultDiagramMetricBadge, ResultDiagramMetricGallery } from "./ResultDiagramLayout";

interface BeamDiagramMetric {
  key: BeamDiagramMetricKey;
  title: string;
  unit: string;
  color: string;
  fillColor: string;
  diagramType: "area" | "line";
}

interface BeamResultDiagramsProps {
  results: BeamCalculationResults | null;
  compact?: boolean;
  metricKey?: BeamDiagramMetricKey;
  showMetricTabs?: boolean;
  heading?: string;
}

type SvgPoint = { x: number; y: number };
type BeamResultSvgPoint = SvgPoint & { value: number; stationM: number };
type BeamAnnotationPoint = BeamResultSvgPoint & {
  key: string;
  kind: BeamDiagramKeyPointKind;
  priority: number;
};
type BeamDiagramSelectionKey = BeamDiagramMetricKey | "all";
type LabelLayout = DiagramPlacedLabel;
type KeyPointAnnotation = {
  point: BeamAnnotationPoint;
  valueLabel: string;
  stationLabel: string;
  layout: LabelLayout;
};

const SVG_W = 1000;
const SVG_H = 360;
const BEAM_LEFT = 80;
const BEAM_RIGHT = 920;
const BEAM_Y = 180;
const BEAM_LEN = BEAM_RIGHT - BEAM_LEFT;
const DEFAULT_BEAM_DIAGRAM_METRIC_KEY: BeamDiagramMetricKey = "momentKnM";
const GRID_STROKE_WIDTH = 0.8;
const BEAM_STROKE_WIDTH = 3;
const RESULT_AREA_STROKE_WIDTH = 1.7;
const RESULT_LINE_STROKE_WIDTH = 2;
const SUPPORT_BASE_STROKE_WIDTH = 1.25;
const NODE_RADIUS = 3;
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

const BEAM_DIAGRAM_METRICS: BeamDiagramMetric[] = [
  { key: "momentKnM", title: "弯矩图", unit: "kN·m", color: "#ef4444", fillColor: "rgba(239, 68, 68, 0.1)", diagramType: "area" },
  { key: "shearKn", title: "剪力图", unit: "kN", color: "#3b82f6", fillColor: "rgba(59, 130, 246, 0.09)", diagramType: "area" },
  { key: "deflectionMm", title: "挠度图", unit: "mm", color: "#8b5cf6", fillColor: "rgba(139, 92, 246, 0.08)", diagramType: "line" },
];
const BEAM_DIAGRAM_RESPONSE_METRICS: Record<BeamDiagramMetricKey, string> = {
  momentKnM: "max_moment",
  shearKn: "max_shear",
  deflectionMm: "max_deflection",
};

function supportMarker(type: BeamSupportType, x: number) {
  if (type === "fixed") {
    return <rect x={x - 14} y={BEAM_Y - 5} width="28" height="44" rx="3" fill="var(--structure-preview-support-fill)" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />;
  }
  if (type === "free") {
    return <circle cx={x} cy={BEAM_Y} r="7" fill="none" stroke="var(--structure-preview-support-stroke)" strokeDasharray="3 3" />;
  }
  return (
    <>
      <polygon points={`${x - 16},${BEAM_Y + 26} ${x + 16},${BEAM_Y + 26} ${x},${BEAM_Y + 2}`} fill="var(--structure-preview-support-fill)" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />
      <line x1={x - 18} y1={BEAM_Y + 30} x2={x + 18} y2={BEAM_Y + 30} stroke="var(--structure-preview-support-line)" strokeWidth={SUPPORT_BASE_STROKE_WIDTH} />
      {type === "roller" ? (
        <>
          <circle cx={x - 9} cy={BEAM_Y + 36} r="3" fill="none" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />
          <circle cx={x + 9} cy={BEAM_Y + 36} r="3" fill="none" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />
        </>
      ) : null}
    </>
  );
}

function getMetric(key: BeamDiagramMetricKey) {
  return BEAM_DIAGRAM_METRICS.find((metric) => metric.key === key) ?? BEAM_DIAGRAM_METRICS[0];
}

function peakMetricLabel(key: BeamDiagramMetricKey): string {
  const responseMetric = BEAM_DIAGRAM_RESPONSE_METRICS[key];
  return sensitivityResponseMetricLabel("beam", responseMetric, "峰值");
}

function metricValues(results: BeamCalculationResults, metricKey: BeamDiagramMetricKey) {
  if (metricKey === "momentKnM") return results.moment_data ?? [];
  if (metricKey === "shearKn") return results.shear_data ?? [];
  return (results.v_data ?? []).map((value) => value * 1000.0);
}

function valueText(value: number, unit: string) {
  return formatEngineeringValue(value, unit);
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
    bounds: { left: margin, top: margin, right: SVG_W - margin, bottom: SVG_H - margin },
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

export function BeamResultDiagrams({ results, compact = false, metricKey, showMetricTabs = true, heading = "工程图" }: BeamResultDiagramsProps) {
  const [selectedMetricState, setSelectedMetricState] = useState<BeamDiagramSelectionKey>("all");
  const selectedMetricKey = metricKey ?? selectedMetricState;
  const selectedMetric = getMetric(selectedMetricKey === "all" ? DEFAULT_BEAM_DIAGRAM_METRIC_KEY : selectedMetricKey);
  const beam = results?.beam ?? null;

  const diagram = useMemo(() => {
    if (!results || !beam) return null;
    const totalLength = Math.max(beam.totalLength || 0, 1e-9);
    const xData = beamXData(results, beam);
    const values = metricValues(results, selectedMetric.key);
    const samples = xData
      .map((x, index) => ({ x, value: values[index] ?? 0 }))
      .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.value))
      .sort((a, b) => a.x - b.x);
    const maxAbs = Math.max(...samples.map((point) => Math.abs(point.value)), 0);
    const offsetScale = maxAbs > 1e-9 ? (compact ? 64 : 82) / maxAbs : 0;
    const valueToSvgOffset = selectedMetric.key === "momentKnM" ? 1 : -1;
    const mapX = (x: number) => BEAM_LEFT + (clamp(x, 0, totalLength) / totalLength) * BEAM_LEN;
    const basePoints = samples.map((point) => ({ x: mapX(point.x), y: BEAM_Y }));
    const resultPoints: BeamResultSvgPoint[] = samples.map((point) => ({ x: mapX(point.x), y: BEAM_Y + valueToSvgOffset * point.value * offsetScale, value: point.value, stationM: point.x }));
    const spanDimensions = buildBeamSpanDimensionSegments(beam.spans, totalLength, BEAM_LEFT, BEAM_RIGHT, {
      memberIds: beam.spanIds,
      nodeIds: beam.nodes?.map((node, nodeIndex) => node.id ?? `${nodeIndex + 1}`),
    });
    const spanDimensionLegendRows = buildBeamSpanDimensionLegendRows(spanDimensions, compact ? 310 : 420, compact ? 10 : 11);
    const extreme = resultPoints.reduce<{ x: number; y: number; value: number; stationM: number } | null>((current, point) => {
      if (!current || Math.abs(point.value) > Math.abs(current.value)) return point;
      return current;
    }, null);
    const keyPoints: BeamAnnotationPoint[] = findBeamDiagramKeyPoints(samples, selectedMetric.key)
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
    return {
      totalLength,
      mapX,
      resultPath: svgPathFromPoints(resultPoints),
      areaPath: svgAreaPath(basePoints, resultPoints),
      resultPoints,
      spanDimensions,
      spanDimensionLegendRows,
      extreme,
      keyPoints,
    };
  }, [beam, compact, results, selectedMetric]);

  const keyPointAnnotations = useMemo<KeyPointAnnotation[]>(() => {
    if (!diagram || !beam) return [];
    const occupied: DiagramLabelBlocker[] = [
      ...spanDimensionBlockers(diagram.spanDimensions, compact),
      ...spanDimensionLegendBlockers(diagram.spanDimensionLegendRows, compact),
      ...nodeBadgeBlockers(beam, diagram.mapX, compact),
    ];
    return diagram.keyPoints
      .slice()
      .sort((a, b) => b.priority - a.priority || Math.abs(b.value) - Math.abs(a.value))
      .map((point) => {
        const valueLabel = valueText(point.value, selectedMetric.unit);
        const stationLabel = `x = ${point.stationM.toFixed(2)} m`;
        const layout = buildLabelLayout({
          extreme: point,
          valueLabel,
          stationLabel,
          compact,
          beam,
          resultPoints: diagram.resultPoints,
          mapX: diagram.mapX,
          extraBlockers: occupied,
        });
        occupied.push({ ...layout.rect, weight: point.kind === "global-extreme" ? 14 : 11 });
        return { point, valueLabel, stationLabel, layout };
      })
      .sort((a, b) => a.point.x - b.point.x || a.point.y - b.point.y);
  }, [beam, compact, diagram, selectedMetric.unit]);

  if (!results || !beam || !diagram) {
    return <ResultDiagramEmptyState compact={compact} label="暂无梁系工程图数据" />;
  }

  const extreme = diagram.extreme;

  if (showMetricTabs) {
    return (
      <ResultDiagramMetricGallery
        ariaLabel="梁系工程图类型"
        compact={compact}
        gridClassName={compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}
        metrics={BEAM_DIAGRAM_METRICS}
        selectedKey={selectedMetricKey}
        selectedMetric={selectedMetric}
        onSelect={(key) => setSelectedMetricState(key)}
        renderMetric={(metric) => (
          <BeamResultDiagrams key={metric.key} results={results} compact={compact} metricKey={metric.key} showMetricTabs={false} heading={metric.title} />
        )}
      />
    );
  }

  return (
    <ResultDiagramCard
      compact={compact}
      heading={heading}
      badges={
        extreme ? (
          <ResultDiagramMetricBadge>
            {peakMetricLabel(selectedMetric.key)}：{valueText(extreme.value, selectedMetric.unit)} / x={extreme.stationM.toFixed(2)} m
          </ResultDiagramMetricBadge>
        ) : null
      }
    >
      <div className="structure-preview-surface overflow-hidden rounded-lg border border-slate-200/80 bg-white/90 dark:border-slate-700/80 dark:bg-slate-900/45">
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className={compact ? "block h-[230px] w-full sm:h-[300px]" : "block h-[320px] w-full"}>
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line key={ratio} x1="42" y1={SVG_H * ratio} x2={SVG_W - 42} y2={SVG_H * ratio} stroke="var(--frame-diagram-grid)" strokeWidth={GRID_STROKE_WIDTH} strokeDasharray="6 8" />
          ))}
          <text x="32" y="30" fill="var(--structure-preview-label)" fontSize={compact ? "10" : "12"} fontFamily={DIAGRAM_LABEL_FONT} fontWeight={DIAGRAM_LABEL_WEIGHT}>
            梁长={formatBeamDimensionLength(diagram.totalLength)}
          </text>
          <g fill="var(--structure-preview-label)" stroke="var(--structure-preview-text-halo)" strokeWidth={STATION_TEXT_HALO_WIDTH} paintOrder="stroke" fontFamily={DIAGRAM_LABEL_FONT}>
            {diagram.spanDimensionLegendRows.map((row, index) => (
              <text key={`span-dimension-legend-${index}`} x={SPAN_DIMENSION_LEGEND_X} y={SPAN_DIMENSION_LEGEND_Y + index * SPAN_DIMENSION_LEGEND_GAP} fontSize={compact ? "10" : "12"} fontWeight={DIAGRAM_LABEL_WEIGHT}>
                {row}
              </text>
            ))}
          </g>
          <line x1={BEAM_LEFT} y1={BEAM_Y} x2={BEAM_RIGHT} y2={BEAM_Y} stroke="var(--structure-preview-base-start)" strokeOpacity="0.82" strokeWidth={BEAM_STROKE_WIDTH} strokeLinecap="butt" />

          {selectedMetric.diagramType === "area" && diagram.areaPath ? <path d={diagram.areaPath} fill={selectedMetric.fillColor} stroke="none" /> : null}
          <path
            d={diagram.resultPath}
            fill="none"
            stroke={selectedMetric.color}
            strokeOpacity="0.92"
            strokeWidth={selectedMetric.diagramType === "line" ? RESULT_LINE_STROKE_WIDTH : RESULT_AREA_STROKE_WIDTH}
            strokeLinecap="butt"
            strokeLinejoin="round"
          />

          {beam.supports.map((support, index) => {
            const x = diagram.mapX(support.x);
            return (
              <g key={`support-${index}`}>
                {supportMarker(support.type, x)}
              </g>
            );
          })}

          {beam.nodes.map((node) => {
            const x = diagram.mapX(node.x);
            const badgeX = x + NODE_BADGE_OFFSET_X;
            const badgeY = BEAM_Y + NODE_BADGE_OFFSET_Y;
            return (
              <g key={node.index}>
                <circle cx={x} cy={BEAM_Y} r={NODE_RADIUS} fill={node.support ? "var(--structure-preview-node)" : "var(--structure-preview-guide)"} />
                <circle cx={badgeX} cy={badgeY} r={compact ? "6.5" : "7.5"} fill="var(--structure-preview-badge-fill)" stroke="var(--structure-preview-badge-stroke)" strokeWidth="1.2" />
                <text x={badgeX} y={badgeY} fill="var(--structure-preview-badge-text)" textAnchor="middle" dominantBaseline="middle" fontSize={compact ? "7.5" : "8.5"} fontFamily={DIAGRAM_LABEL_FONT} fontWeight={DIAGRAM_LABEL_WEIGHT}>
                  {node.id ?? `${node.index + 1}`}
                </text>
              </g>
            );
          })}

          <g fill="var(--structure-preview-label)" fontFamily={DIAGRAM_LABEL_FONT}>
            {diagram.spanDimensions.map((dimension) => {
              const midX = (dimension.start + dimension.end) / 2;
              if (!dimension.label) return null;
              return (
                <g key={`span-member-label-${dimension.index}`}>
                  <title>{dimension.title}</title>
                  <text
                    x={midX}
                    y={SPAN_MEMBER_LABEL_Y}
                    textAnchor="middle"
                    fontSize={compact ? "10" : "12"}
                    fontWeight={DIAGRAM_LABEL_WEIGHT}
                    stroke="var(--structure-preview-text-halo)"
                    strokeWidth={STATION_TEXT_HALO_WIDTH}
                    paintOrder="stroke"
                  >
                    {dimension.label}
                  </text>
                </g>
              );
            })}
          </g>

          {keyPointAnnotations.map(({ point, valueLabel, stationLabel, layout }) => {
            const isGlobalExtreme = point.kind === "global-extreme";
            return (
              <g key={point.key}>
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={isGlobalExtreme ? EXTREME_RADIUS : EXTREME_RADIUS - 0.75}
                  fill={selectedMetric.color}
                  fillOpacity={isGlobalExtreme ? 1 : 0.88}
                  stroke="var(--structure-preview-text-halo)"
                  strokeWidth={isGlobalExtreme ? "1.25" : "1"}
                />
                <line
                  x1={point.x}
                  y1={point.y}
                  x2={layout.connectorX}
                  y2={layout.connectorY}
                  stroke={selectedMetric.color}
                  strokeOpacity={isGlobalExtreme ? 0.9 : 0.68}
                  strokeWidth={CALLOUT_STROKE_WIDTH}
                  strokeDasharray="4 4"
                />
                <text
                  x={layout.textX}
                  y={layout.valueY}
                  fill={selectedMetric.color}
                  stroke="var(--structure-preview-text-halo)"
                  strokeWidth={VALUE_TEXT_HALO_WIDTH}
                  paintOrder="stroke"
                  fontSize={compact ? "11" : "13"}
                  fontFamily={DIAGRAM_NUMERIC_FONT}
                  fontWeight={isGlobalExtreme ? "700" : "650"}
                >
                  {valueLabel}
                </text>
                <text
                  x={layout.textX}
                  y={layout.stationY}
                  fill="var(--structure-preview-label)"
                  stroke="var(--structure-preview-text-halo)"
                  strokeWidth={STATION_TEXT_HALO_WIDTH}
                  paintOrder="stroke"
                  fontSize={compact ? "9" : "11"}
                  fontFamily={DIAGRAM_NUMERIC_FONT}
                >
                  {stationLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </ResultDiagramCard>
  );
}
