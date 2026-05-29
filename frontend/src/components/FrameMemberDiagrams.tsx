import { useMemo, useState } from "react";
import { GlassCard } from "./ui/GlassCard";
import type { FrameMemberDiagram, FramePreviewData, SupportType } from "../types/structure";
import {
  DEFAULT_FRAME_DIAGRAM_METRIC_KEY,
  findFrameDiagramExtreme,
  FRAME_DIAGRAM_METRICS,
  getFrameDiagramMetric,
  type FrameDiagramMetric,
  type FrameDiagramMetricKey,
} from "../lib/frame-member-diagrams";
import {
  labelCandidatesAroundPoint,
  legendLabelCandidates,
  lineBlocker,
  outwardLabelCandidates,
  placeDiagramLabels,
  pointBlocker,
  samplePointBlockers,
  type DiagramLabelBlocker,
  type DiagramLabelSpec,
  type DiagramPlacedLabel,
} from "../lib/diagram-label-layout";
import { formatEngineeringValue } from "../lib/engineering-format";
import { summaryMetricLabel } from "../lib/result-metrics";
import { buildFrameDimensionLegendRows, buildFrameGeometryDimensions, frameMemberLabelPlacement } from "./frame-preview-utils";

interface FrameMemberDiagramsProps {
  frame: FramePreviewData | null;
  diagrams: FrameMemberDiagram[];
  compact?: boolean;
  metricKey?: FrameDiagramMetricKey;
  showMetricTabs?: boolean;
  heading?: string;
}

type SvgPoint = { x: number; y: number };
type FrameDiagramSelectionKey = FrameDiagramMetricKey | "all";

const SVG_W = 1000;
const SVG_H = 540;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pathFromPoints(points: SvgPoint[]) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function areaPath(basePoints: SvgPoint[], resultPoints: SvgPoint[]) {
  if (basePoints.length < 2 || resultPoints.length < 2) return "";
  return `${pathFromPoints(resultPoints)} L ${basePoints
    .slice()
    .reverse()
    .map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" L ")} Z`;
}

function supportMarker(type: SupportType, x: number, y: number, angleDeg?: number) {
  if (type === "fixed") {
    return (
      <g>
        <rect x={x - 16} y={y + 7} width="32" height="8" rx="2" fill="var(--structure-preview-support-fill)" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />
        {[-12, -4, 4, 12].map((offset) => (
          <line key={offset} x1={x + offset - 5} y1={y + 24} x2={x + offset + 5} y2={y + 14} stroke="var(--structure-preview-support-line)" strokeWidth="1.6" />
        ))}
      </g>
    );
  }
  if (type === "roller") {
    return (
      <g transform={angleDeg === undefined ? undefined : `rotate(${90 - angleDeg} ${x} ${y})`}>
        <polygon points={`${x - 16},${y + 24} ${x + 16},${y + 24} ${x},${y + 2}`} fill="var(--structure-preview-support-fill)" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />
        <line x1={x - 18} y1={y + 28} x2={x + 18} y2={y + 28} stroke="var(--structure-preview-support-line)" strokeWidth="2" />
        <circle cx={x - 8} cy={y + 33} r="3" fill="var(--structure-preview-support-line)" />
        <circle cx={x + 8} cy={y + 33} r="3" fill="var(--structure-preview-support-line)" />
      </g>
    );
  }
  if (type === "pinned") {
    return (
      <>
        <polygon points={`${x - 16},${y + 24} ${x + 16},${y + 24} ${x},${y + 2}`} fill="var(--structure-preview-support-fill)" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />
        <line x1={x - 18} y1={y + 28} x2={x + 18} y2={y + 28} stroke="var(--structure-preview-support-line)" strokeWidth="2" />
      </>
    );
  }
  return null;
}

function buildNodeLayout(frame: FramePreviewData, padding: number) {
  const xs = frame.nodes.map((node) => node.x);
  const ys = frame.nodes.map((node) => node.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const scale = Math.min((SVG_W - padding * 2) / width, (SVG_H - padding * 2) / height);
  const map = (point: { x: number; y: number }) => ({
    x: padding + (point.x - minX) * scale,
    y: SVG_H - padding - (point.y - minY) * scale,
  });
  const mappedNodes = frame.nodes.map((node) => map(node));
  const mappedXs = mappedNodes.map((point) => point.x);
  const mappedYs = mappedNodes.map((point) => point.y);
  return {
    nodeMap: new Map(frame.nodes.map((node, index) => [node.id, mappedNodes[index]])),
    scale,
    bounds: {
      left: Math.min(...mappedXs),
      right: Math.max(...mappedXs),
      top: Math.min(...mappedYs),
      bottom: Math.max(...mappedYs),
    },
  };
}

function stationRatio(diagram: FrameMemberDiagram, index: number, memberLengthM: number) {
  const normalized = diagram.stations[index];
  if (Number.isFinite(normalized)) return clamp(normalized, 0, 1);
  const stationM = diagram.stationsM[index] ?? 0;
  return memberLengthM > 1e-9 ? clamp(stationM / memberLengthM, 0, 1) : 0;
}

function metricValues(diagram: FrameMemberDiagram, metric: FrameDiagramMetric) {
  return diagram[metric.key];
}

function valueText(value: number, unit: string) {
  return formatEngineeringValue(value, unit);
}

function frameDiagramPeakLabel(metric: FrameDiagramMetric): string {
  if (metric.key === "momentKnM") return summaryMetricLabel("frame", "max_member_moment", "最大构件弯矩");
  if (metric.key === "shearKn") return "最大构件剪力";
  if (metric.key === "axialKn") return "最大构件轴力";
  return "最大局部 y 向挠度";
}

function supportBlocker(type: SupportType, point: SvgPoint): DiagramLabelBlocker {
  const supportBottom = type === "free" ? 8 : 38;
  return {
    left: point.x - 24,
    right: point.x + 24,
    top: point.y - 12,
    bottom: point.y + supportBottom,
    weight: 8,
  };
}

function placedById(labels: DiagramPlacedLabel[]) {
  return new Map(labels.map((label) => [label.id, label]));
}

function FrameStructureDiagram({
  frame,
  diagrams,
  metric,
  compact,
}: {
  frame: FramePreviewData;
  diagrams: FrameMemberDiagram[];
  metric: FrameDiagramMetric;
  compact: boolean;
}) {
  const padding = compact ? 68 : 88;
  const layout = useMemo(() => buildNodeLayout(frame, padding), [frame, padding]);
  const diagramsByMember = useMemo(() => new Map(diagrams.map((diagram) => [diagram.memberId, diagram])), [diagrams]);
  const rawMaxAbs = useMemo(() => {
    const values = diagrams.flatMap((diagram) => metricValues(diagram, metric).map((value) => Math.abs(value)));
    return values.length ? Math.max(...values) : 0;
  }, [diagrams, metric]);
  const extreme = useMemo(() => findFrameDiagramExtreme(diagrams, metric), [diagrams, metric]);
  const offsetScale = rawMaxAbs > 1e-9 ? (compact ? 42 : 58) / rawMaxAbs : 0;
  const frameCenter = useMemo(() => {
    return {
      x: (layout.bounds.left + layout.bounds.right) / 2,
      y: (layout.bounds.top + layout.bounds.bottom) / 2,
    };
  }, [layout.bounds]);
  const dimensionLegendRows = useMemo(
    () => buildFrameDimensionLegendRows(buildFrameGeometryDimensions(frame.nodes, frame.members), compact ? 200 : 240, compact ? 10 : 12),
    [frame, compact],
  );

  const renderedMembers = useMemo(() => {
    return frame.members.flatMap((member) => {
      const diagram = diagramsByMember.get(member.id);
      const start = layout.nodeMap.get(member.start);
      const end = layout.nodeMap.get(member.end);
      if (!diagram || !start || !end) return [];

      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const lengthPx = Math.hypot(dx, dy);
      if (lengthPx < 1e-9) return [];

      const nx = -dy / lengthPx;
      const ny = dx / lengthPx;
      const values = metricValues(diagram, metric);
      const pairs = values
        .map((value, index) => ({ value, ratio: stationRatio(diagram, index, diagram.stationsM.at(-1) ?? 0), index }))
        .sort((a, b) => a.ratio - b.ratio);
      const basePoints = pairs.map((pair) => ({
        x: start.x + dx * pair.ratio,
        y: start.y + dy * pair.ratio,
      }));
      const resultPoints = pairs.map((pair, index) => ({
        x: basePoints[index].x + nx * pair.value * offsetScale,
        y: basePoints[index].y + ny * pair.value * offsetScale,
        value: pair.value,
        stationRatio: pair.ratio,
      }));

      return [{
        id: member.id,
        basePoints,
        resultPoints,
        resultPath: pathFromPoints(resultPoints),
        areaPath: areaPath(basePoints, resultPoints),
      }];
    });
  }, [diagramsByMember, frame.members, layout.nodeMap, metric, offsetScale]);

  const extremePoint = useMemo(() => {
    if (!extreme) return null;
    const member = renderedMembers.find((item) => item.id === extreme.memberId);
    if (!member) return null;
    return member.resultPoints.reduce<{ x: number; y: number; value: number; stationRatio: number } | null>((current, point) => {
      const distance = Math.abs(point.stationRatio - extreme.stationRatio);
      if (!current || distance < Math.abs(current.stationRatio - extreme.stationRatio)) return point;
      return current;
    }, null);
  }, [extreme, renderedMembers]);

  const labelLayouts = useMemo(() => {
    const bounds = { left: 10, top: 16, right: SVG_W - 10, bottom: SVG_H - 16 };
    const baseBlockers: DiagramLabelBlocker[] = [
      ...frame.members.flatMap((member) => {
        const start = layout.nodeMap.get(member.start);
        const end = layout.nodeMap.get(member.end);
        if (!start || !end) return [];
        return [lineBlocker(start, end, 8, 5)];
      }),
      ...frame.nodes.flatMap((node) => {
        const point = layout.nodeMap.get(node.id);
        if (!point) return [];
        const supportType = (node.supportType ?? "free") as SupportType;
        return [pointBlocker(point, 9, 10), supportBlocker(supportType, point)];
      }),
      ...renderedMembers.flatMap((member) => samplePointBlockers(member.resultPoints, 4, 4, 70)),
    ];
    const labels: DiagramLabelSpec[] = [];
    if (dimensionLegendRows.length) {
      labels.push({
        id: "dimension-legend",
        anchor: { x: compact ? 18 : 24, y: 18 },
        lines: dimensionLegendRows.map((row) => ({ text: row, fontSize: compact ? 10 : 12 })),
        candidates: legendLabelCandidates(SVG_W - (compact ? 36 : 48), SVG_H - 36),
        priority: 100,
        occupiedWeight: 12,
        paddingX: 0,
        paddingY: 0,
        lineGap: compact ? 7 : 8,
        distanceWeight: 0.04,
      });
    }
    frame.nodes.forEach((node) => {
      const point = layout.nodeMap.get(node.id);
      if (!point) return;
      labels.push({
        id: `node-${node.id}`,
        anchor: point,
        lines: [{ text: node.id, fontSize: compact ? 9 : 11 }],
        candidates: outwardLabelCandidates(point, frameCenter, compact ? 12 : 14),
        priority: 90,
        occupiedWeight: 11,
        paddingX: 1,
        paddingY: 1,
        lineGap: 0,
      });
    });
    if (extreme && extremePoint) {
      labels.push({
        id: "extreme-label",
        anchor: extremePoint,
        lines: [
          { text: valueText(extreme.value, metric.unit), fontSize: compact ? 11 : 13 },
          { text: `${extreme.memberId} / ${extreme.stationM.toFixed(2)} m`, fontSize: compact ? 9 : 11 },
        ],
        candidates: labelCandidatesAroundPoint(compact ? 14 : 18, compact ? 30 : 38),
        priority: 70,
        occupiedWeight: 13,
        paddingX: 0,
        paddingY: 0,
        lineGap: 5,
      });
    }
    frame.members.forEach((member) => {
      const start = layout.nodeMap.get(member.start);
      const end = layout.nodeMap.get(member.end);
      if (!start || !end) return;
      const preferred = frameMemberLabelPlacement(start, end, frameCenter, compact ? 14 : 18);
      labels.push({
        id: `member-${member.id}`,
        anchor: { x: preferred.x, y: preferred.y },
        lines: [{ text: member.id, fontSize: compact ? 9 : 11 }],
        candidates: [
          { dx: 0, dy: 0, textAnchor: preferred.textAnchor, verticalAnchor: "middle" as const, penalty: 0 },
          ...outwardLabelCandidates({ x: preferred.x, y: preferred.y }, frameCenter, compact ? 10 : 12, compact ? 22 : 28).map((candidate) => ({
            ...candidate,
            penalty: (candidate.penalty ?? 0) + 24,
          })),
        ],
        priority: 60,
        occupiedWeight: 8,
        paddingX: 1,
        paddingY: 1,
        lineGap: 0,
        distanceWeight: 0.2,
      });
    });
    return placedById(placeDiagramLabels(labels, { baseBlockers, bounds }));
  }, [compact, dimensionLegendRows, extreme, extremePoint, frame.members, frame.nodes, frameCenter, layout.nodeMap, metric.unit, renderedMembers]);

  return (
    <div className="structure-preview-surface overflow-hidden rounded-lg border border-slate-200/80 bg-white/90 dark:border-slate-700/80 dark:bg-slate-900/45">
      <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className={compact ? "block h-[250px] w-full sm:h-[330px]" : "block h-[360px] w-full"}>
        <defs>
          <filter id="frameDiagramTextHalo" x="-20%" y="-20%" width="140%" height="140%">
            <feFlood floodColor="var(--structure-preview-text-halo)" floodOpacity="1" result="bg" />
            <feMerge>
              <feMergeNode in="bg" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[0.25, 0.5, 0.75].map((ratio) => (
          <line key={ratio} x1="42" y1={SVG_H * ratio} x2={SVG_W - 42} y2={SVG_H * ratio} stroke="var(--frame-diagram-grid)" strokeDasharray="6 8" />
        ))}
        {dimensionLegendRows.length ? (
          <g fontFamily="Fira Code" fill="var(--structure-preview-label)" stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke">
            {labelLayouts.get("dimension-legend")?.lines.map((line, index) => (
              <text key={`frame-diagram-dimension-${index}`} x={line.x} y={line.y} textAnchor={labelLayouts.get("dimension-legend")?.textAnchor} fontSize={line.fontSize} fontWeight="700">
                {line.text}
              </text>
            ))}
          </g>
        ) : null}
        {frame.members.map((member) => {
          const start = layout.nodeMap.get(member.start);
          const end = layout.nodeMap.get(member.end);
          if (!start || !end) return null;
          return (
            <line
              key={member.id}
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="var(--structure-preview-base-start)"
              strokeOpacity="0.7"
              strokeWidth="7"
              strokeLinecap="round"
            />
          );
        })}

        {renderedMembers.map((member) => (
          <g key={`${member.id}-${metric.key}`}>
            {metric.diagramType === "area" && member.areaPath ? (
              <path d={member.areaPath} fill={metric.fillColor} stroke="none" />
            ) : null}
            <path d={member.resultPath} fill="none" stroke={metric.color} strokeWidth={metric.diagramType === "line" ? "3.5" : "3"} strokeLinecap="round" strokeLinejoin="round" />
          </g>
        ))}

        {frame.members.map((member) => {
          const start = layout.nodeMap.get(member.start);
          const end = layout.nodeMap.get(member.end);
          if (!start || !end) return null;
          const label = labelLayouts.get(`member-${member.id}`);
          const line = label?.lines[0];
          if (!label || !line) return null;
          return (
            <text
              key={`${member.id}-label`}
              x={line.x}
              y={line.y}
              fill="var(--structure-preview-label)"
              stroke="var(--structure-preview-text-halo)"
              strokeWidth="4"
              paintOrder="stroke"
              textAnchor={label.textAnchor}
              fontSize={compact ? "9" : "11"}
              fontFamily="Fira Code"
              fontWeight="700"
            >
              {member.id}
            </text>
          );
        })}

        {frame.nodes.map((node) => {
          const point = layout.nodeMap.get(node.id);
          if (!point) return null;
          const label = labelLayouts.get(`node-${node.id}`);
          const line = label?.lines[0];
          return (
            <g key={node.id}>
              {supportMarker((node.supportType ?? "free") as SupportType, point.x, point.y, node.supportAngleDeg)}
              <circle cx={point.x} cy={point.y} r="4.5" fill="var(--structure-preview-node)" />
              {label && line ? (
                <text
                  x={line.x}
                  y={line.y}
                  fill="var(--structure-preview-node-label)"
                  stroke="var(--structure-preview-text-halo)"
                  strokeWidth="4"
                  paintOrder="stroke"
                  textAnchor={label.textAnchor}
                  fontSize={line.fontSize}
                  fontFamily="Fira Code"
                  fontWeight="700"
                >
                  {line.text}
                </text>
              ) : null}
            </g>
          );
        })}

        {extreme && extremePoint && labelLayouts.get("extreme-label") ? (
          <g>
            {(() => {
              const label = labelLayouts.get("extreme-label");
              const valueLine = label?.lines[0];
              const stationLine = label?.lines[1];
              if (!label || !valueLine || !stationLine) return null;
              return (
                <>
                  <circle cx={extremePoint.x} cy={extremePoint.y} r="5" fill={metric.color} stroke="var(--structure-preview-text-halo)" strokeWidth="2" />
                  <line x1={extremePoint.x} y1={extremePoint.y} x2={label.connectorX} y2={label.connectorY} stroke={metric.color} strokeWidth="1.5" strokeDasharray="4 4" />
                  <text x={valueLine.x} y={valueLine.y} textAnchor={label.textAnchor} fill={metric.color} stroke="var(--structure-preview-text-halo)" strokeWidth="5" paintOrder="stroke" fontSize={valueLine.fontSize} fontFamily="Fira Code" fontWeight="700">
                    {valueLine.text}
                  </text>
                  <text x={stationLine.x} y={stationLine.y} textAnchor={label.textAnchor} fill="var(--structure-preview-label)" stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke" fontSize={stationLine.fontSize} fontFamily="Fira Code">
                    {stationLine.text}
                  </text>
                </>
              );
            })()}
          </g>
        ) : null}
      </svg>
    </div>
  );
}

export function FrameMemberDiagrams({ frame, diagrams, compact = false, metricKey, showMetricTabs = true, heading = "工程图" }: FrameMemberDiagramsProps) {
  const [selectedMetricState, setSelectedMetricState] = useState<FrameDiagramSelectionKey>("all");
  const selectedMetricKey = metricKey ?? selectedMetricState;
  const selectedMetric = getFrameDiagramMetric(selectedMetricKey === "all" ? DEFAULT_FRAME_DIAGRAM_METRIC_KEY : selectedMetricKey);
  const extreme = useMemo(() => findFrameDiagramExtreme(diagrams, selectedMetric), [diagrams, selectedMetric]);

  if (!frame || !diagrams.length) {
    return (
      <GlassCard className={`flex items-center justify-center border-dashed border-primary/10 ${compact ? "min-h-[220px]" : "min-h-[320px]"}`}>
        <div className="text-center text-sm text-muted-foreground">暂无框架工程图数据</div>
      </GlassCard>
    );
  }

  if (showMetricTabs) {
    const visibleMetrics = selectedMetricKey === "all" ? FRAME_DIAGRAM_METRICS : [selectedMetric];
    return (
      <div className="space-y-3">
        <GlassCard className={compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}>
          <div className="flex justify-end">
              <div className={`grid w-full gap-2 sm:w-auto ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-5"}`} role="tablist" aria-label="框架工程图类型">
                <button
                  type="button"
                  role="tab"
                  aria-selected={selectedMetricKey === "all"}
                  onClick={() => setSelectedMetricState("all")}
                  className={`min-w-0 rounded-lg border px-3 py-2 text-left text-[12px] font-bold transition-colors ${
                    selectedMetricKey === "all"
                      ? "border-slate-300 bg-slate-100 text-slate-950 dark:border-sky-400/40 dark:bg-sky-400/[0.14] dark:text-sky-50"
                      : "border-slate-200/80 bg-white/45 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900/45 dark:text-slate-300 dark:hover:border-sky-400/35 dark:hover:bg-sky-400/10"
                  }`}
                >
                  <span className="block truncate">全部</span>
                </button>
                {FRAME_DIAGRAM_METRICS.map((metric) => {
                  const active = metric.key === selectedMetricKey;
                  return (
                    <button
                      key={metric.key}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => setSelectedMetricState(metric.key)}
                      className={`min-w-0 rounded-lg border px-3 py-2 text-left text-[12px] font-bold transition-colors ${
                        active
                          ? "border-slate-300 bg-slate-100 text-slate-950 dark:border-sky-400/40 dark:bg-sky-400/[0.14] dark:text-sky-50"
                          : "border-slate-200/80 bg-white/45 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900/45 dark:text-slate-300 dark:hover:border-sky-400/35 dark:hover:bg-sky-400/10"
                      }`}
                    >
                      <span className="block truncate">{metric.title}</span>
                    </button>
                  );
                })}
              </div>
          </div>
        </GlassCard>
        {visibleMetrics.map((metric) => (
          <FrameMemberDiagrams key={metric.key} frame={frame} diagrams={diagrams} compact={compact} metricKey={metric.key} showMetricTabs={false} heading={metric.title} />
        ))}
      </div>
    );
  }

  return (
    <GlassCard className={compact ? "space-y-3 p-3 sm:p-4" : "space-y-4 p-4 sm:p-5"}>
      <div className={`flex gap-3 ${compact ? "flex-col" : "flex-col xl:flex-row xl:items-start xl:justify-between"}`}>
        <div className="min-w-0">
          <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>{heading}</h3>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold text-slate-600 dark:text-slate-300">
            {extreme ? (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900/70">
                {frameDiagramPeakLabel(selectedMetric)}：{extreme.memberId} / {valueText(extreme.value, selectedMetric.unit)} / x={extreme.stationM.toFixed(2)} m
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <FrameStructureDiagram frame={frame} diagrams={diagrams} metric={selectedMetric} compact={compact} />
    </GlassCard>
  );
}
