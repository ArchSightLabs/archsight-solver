import { useMemo, useState } from "react";
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
import { resultPreviewCanvasSize, resultPreviewSvgStyle, type ResultPreviewCanvasSize } from "../lib/result-preview-sizing";
import { clamp, svgAreaPath, svgPathFromPoints } from "../lib/result-diagram-geometry";
import { summaryMetricLabel } from "../lib/result-metrics";
import { STRUCTURE_VISUAL_STROKES } from "../lib/structure-visual-tokens";
import { ResultDiagramCard, ResultDiagramEmptyState, ResultDiagramMetricBadge, ResultDiagramMetricGallery } from "./ResultDiagramLayout";
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

function buildNodeLayout(frame: FramePreviewData, padding: number, canvasSize: ResultPreviewCanvasSize) {
  const xs = frame.nodes.map((node) => node.x);
  const ys = frame.nodes.map((node) => node.y);
  const minX = Math.min(...xs, 0);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, 0);
  const maxY = Math.max(...ys, 1);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const scale = Math.min((canvasSize.width - padding * 2) / width, (canvasSize.height - padding * 2) / height);
  const map = (point: { x: number; y: number }) => ({
    x: padding + (point.x - minX) * scale,
    y: canvasSize.height - padding - (point.y - minY) * scale,
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
  const canvasSize = useMemo(() => resultPreviewCanvasSize(frame.nodes, frame.members.length), [frame]);
  const layout = useMemo(() => buildNodeLayout(frame, padding, canvasSize), [frame, padding, canvasSize]);
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
        resultPath: svgPathFromPoints(resultPoints),
        areaPath: svgAreaPath(basePoints, resultPoints),
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
    const bounds = { left: 10, top: 16, right: canvasSize.width - 10, bottom: canvasSize.height - 16 };
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
        candidates: legendLabelCandidates(canvasSize.width - (compact ? 36 : 48), canvasSize.height - 36),
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
  }, [canvasSize, compact, dimensionLegendRows, extreme, extremePoint, frame.members, frame.nodes, frameCenter, layout.nodeMap, metric.unit, renderedMembers]);

  return (
    <div className="structure-preview-surface overflow-auto rounded-lg border border-slate-200/80 bg-white/90 dark:border-slate-700/80 dark:bg-slate-900/45">
      <svg viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} className="block" style={resultPreviewSvgStyle(canvasSize)}>
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
          <line key={ratio} x1="42" y1={canvasSize.height * ratio} x2={canvasSize.width - 42} y2={canvasSize.height * ratio} stroke="var(--frame-diagram-grid)" strokeDasharray="6 8" />
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
              strokeWidth={STRUCTURE_VISUAL_STROKES.resultOverlayBase}
              strokeLinecap="round"
            />
          );
        })}

        {renderedMembers.map((member) => (
          <g key={`${member.id}-${metric.key}`}>
            {metric.diagramType === "area" && member.areaPath ? (
              <path d={member.areaPath} fill={metric.fillColor} stroke="none" />
            ) : null}
            <path d={member.resultPath} fill="none" stroke={metric.color} strokeWidth={metric.diagramType === "line" ? "3.5" : STRUCTURE_VISUAL_STROKES.resultFrameDiagram} strokeLinecap="round" strokeLinejoin="round" />
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
    return <ResultDiagramEmptyState compact={compact} label="暂无框架工程图数据" />;
  }

  if (showMetricTabs) {
    return (
      <ResultDiagramMetricGallery
        ariaLabel="框架工程图类型"
        compact={compact}
        gridClassName={compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-5"}
        metrics={FRAME_DIAGRAM_METRICS}
        selectedKey={selectedMetricKey}
        selectedMetric={selectedMetric}
        onSelect={(key) => setSelectedMetricState(key)}
        renderMetric={(metric) => (
          <FrameMemberDiagrams key={metric.key} frame={frame} diagrams={diagrams} compact={compact} metricKey={metric.key} showMetricTabs={false} heading={metric.title} />
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
            {frameDiagramPeakLabel(selectedMetric)}：{extreme.memberId} / {valueText(extreme.value, selectedMetric.unit)} / x={extreme.stationM.toFixed(2)} m
          </ResultDiagramMetricBadge>
        ) : null
      }
    >
      <FrameStructureDiagram frame={frame} diagrams={diagrams} metric={selectedMetric} compact={compact} />
    </ResultDiagramCard>
  );
}
