import { useMemo, useState } from "react";
import type { FrameMemberDiagram, FramePreviewData, ResultViewSettings, SupportType } from "../types/structure";
import {
  DEFAULT_FRAME_DIAGRAM_METRIC_KEY,
  findFrameDiagramExtreme,
  findFrameDiagramKeyPoints,
  FRAME_DIAGRAM_METRICS,
  getFrameDiagramMetric,
  type FrameDiagramKeyPointKind,
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
import { fitResultPreviewPoints, resultPreviewCanvasSize, resultPreviewSvgStyle, type ResultPreviewCanvasSize } from "../lib/result-preview-sizing";
import { clamp, svgAreaPath, svgPathFromPoints } from "../lib/result-diagram-geometry";
import { modelObjectMemberTerm } from "../lib/model-object-vocabulary";
import { summaryMetricLabel } from "../lib/result-metrics";
import { STRUCTURE_VISUAL_STROKES } from "../lib/structure-visual-tokens";
import { useCanvasDrag } from "../hooks/useModelCanvasZoom";
import { ResultDiagramCard, ResultDiagramEmptyState, ResultDiagramKeyPointTypeToggle, ResultDiagramMetricBadge, ResultDiagramMetricGallery } from "./ResultDiagramLayout";
import { buildFrameDimensionLegendRows, buildFrameGeometryDimensions, frameMemberLabelPlacement } from "./frame-preview-utils";
import { modelLabelTransformFromOffsets, type ModelLabelOffsets } from "../lib/model-label-overrides";

interface FrameMemberDiagramsProps {
  frame: FramePreviewData | null;
  diagrams: FrameMemberDiagram[];
  compact?: boolean;
  metricKey?: FrameDiagramMetricKey;
  showMetricTabs?: boolean;
  heading?: string;
  modelLabelOffsets?: ModelLabelOffsets;
  viewSettings?: ResultViewSettings;
  onChangeViewSettings?: (settings: ResultViewSettings) => void;
}

type SvgPoint = { x: number; y: number };
type FrameDiagramSelectionKey = FrameDiagramMetricKey | "all";
type FrameDiagramSvgPoint = SvgPoint & {
  value: number;
  stationRatio: number;
  stationM: number;
  key: string;
  kind: FrameDiagramKeyPointKind;
  priority: number;
};

type RenderedFrameMemberDiagram = {
  id: string;
  basePoints: SvgPoint[];
  resultPoints: SvgPoint[];
  resultPath: string;
  areaPath: string;
  keyPoints: FrameDiagramSvgPoint[];
};

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
  const fitted = fitResultPreviewPoints(frame.nodes, canvasSize, { left: padding, right: padding, top: padding, bottom: padding });
  const { map, scale, bounds } = fitted;
  const mappedNodes = frame.nodes.map((node) => map(node));
  return {
    nodeMap: new Map(frame.nodes.map((node, index) => [node.id, mappedNodes[index]])),
    scale,
    bounds,
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
  const memberTerm = modelObjectMemberTerm("frame");
  if (metric.key === "momentKnM") return summaryMetricLabel("frame", "max_member_moment", `最大${memberTerm}弯矩`);
  if (metric.key === "shearKn") return `最大${memberTerm}剪力`;
  if (metric.key === "axialKn") return `最大${memberTerm}轴力`;
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

function frameKeyPointPriority(kind: FrameDiagramKeyPointKind) {
  if (kind === "global-extreme") return 1000;
  if (kind === "jump-left" || kind === "jump-right") return 920;
  if (kind === "zero-crossing") return 900;
  if (kind === "endpoint") return 760;
  return 700;
}

function frameKeyPointKindLabel(kind: FrameDiagramKeyPointKind, metricKey: FrameDiagramMetricKey) {
  if (kind === "zero-crossing") return metricKey === "momentKnM" ? "反弯" : "零点";
  if (kind === "jump-left") return "跳变左";
  if (kind === "jump-right") return "跳变右";
  if (kind === "global-extreme") return "全局极值";
  if (kind === "local-extreme") return "局部极值";
  return "端点";
}

function FrameStructureDiagram({
  frame,
  diagrams,
  metric,
  compact,
  modelLabelOffsets,
  showKeyPointTypes,
}: {
  frame: FramePreviewData;
  diagrams: FrameMemberDiagram[];
  metric: FrameDiagramMetric;
  compact: boolean;
  modelLabelOffsets?: ModelLabelOffsets;
  showKeyPointTypes: boolean;
}) {
  const padding = compact ? 68 : 88;
  const { canvasScrollRef, isCanvasDragging, handleCanvasPointerDown, handleCanvasPointerMove, finishCanvasDrag, handleCanvasClickCapture } = useCanvasDrag();
  const labelTransform = (id: string) => modelLabelTransformFromOffsets(modelLabelOffsets, id);
  const canvasSize = useMemo(() => resultPreviewCanvasSize(frame.nodes, frame.members.length), [frame]);
  const layout = useMemo(() => buildNodeLayout(frame, padding, canvasSize), [frame, padding, canvasSize]);
  const diagramsByMember = useMemo(() => new Map(diagrams.map((diagram) => [diagram.memberId, diagram])), [diagrams]);
  const rawMaxAbs = useMemo(() => {
    const values = diagrams.flatMap((diagram) => metricValues(diagram, metric).map((value) => Math.abs(value)));
    return values.length ? Math.max(...values) : 0;
  }, [diagrams, metric]);
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

  const renderedMembers = useMemo<RenderedFrameMemberDiagram[]>(() => {
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
      const keyPoints = findFrameDiagramKeyPoints(diagram, metric).map((keyPoint) => {
        const stationRatioValue = clamp(keyPoint.stationRatio, 0, 1);
        const baseX = start.x + dx * stationRatioValue;
        const baseY = start.y + dy * stationRatioValue;
        const svgPoint = {
          x: baseX + nx * keyPoint.value * offsetScale,
          y: baseY + ny * keyPoint.value * offsetScale,
          value: keyPoint.value,
          stationRatio: stationRatioValue,
          stationM: keyPoint.stationM,
        };
        return {
          ...svgPoint,
          key: `${keyPoint.kind}-${member.id}-${keyPoint.stationM.toFixed(4)}-${keyPoint.value.toFixed(4)}`,
          kind: keyPoint.kind,
          priority: keyPoint.priority,
        };
      });

      return [{
        id: member.id,
        basePoints,
        resultPoints,
        resultPath: svgPathFromPoints(resultPoints),
        areaPath: svgAreaPath(basePoints, resultPoints),
        keyPoints,
      }];
    });
  }, [diagramsByMember, frame.members, layout.nodeMap, metric, offsetScale]);

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
    renderedMembers.forEach((member) => {
      member.keyPoints.forEach((point) => {
        const kindLabel = frameKeyPointKindLabel(point.kind, metric.key);
        labels.push({
          id: `keypoint-${member.id}-${point.key}`,
          anchor: point,
          lines: [
            ...(showKeyPointTypes ? [{ text: kindLabel, fontSize: compact ? 9 : 11 }] : []),
            { text: valueText(point.value, metric.unit), fontSize: compact ? 11 : 13 },
            { text: `x = ${point.stationM.toFixed(2)} m`, fontSize: compact ? 9 : 11 },
          ],
          candidates: labelCandidatesAroundPoint(compact ? 14 : 18, compact ? 30 : 38),
          priority: frameKeyPointPriority(point.kind),
          occupiedWeight: point.kind === "global-extreme" ? 13 : 11,
          paddingX: 0,
          paddingY: 0,
          lineGap: 5,
        });
      });
    });
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
  }, [canvasSize, compact, dimensionLegendRows, frame.members, frame.nodes, frameCenter, layout.nodeMap, metric.key, metric.unit, renderedMembers, showKeyPointTypes]);

  return (
    <div
      ref={canvasScrollRef}
      className={`structure-preview-surface overflow-auto rounded-lg border border-slate-200/80 bg-white/90 dark:border-slate-700/80 dark:bg-slate-900/45 ${isCanvasDragging ? "cursor-grabbing" : "cursor-grab"}`}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handleCanvasPointerMove}
      onPointerUp={finishCanvasDrag}
      onPointerCancel={finishCanvasDrag}
      onClickCapture={handleCanvasClickCapture}
    >
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
          <g
            fontFamily="Fira Code"
            fill="var(--structure-preview-label)"
            stroke="var(--structure-preview-text-halo)"
            strokeWidth="4"
            paintOrder="stroke"
            transform={labelTransform("dimension-legend")}
            data-result-mode="frame"
            data-result-surface="diagram"
            data-result-label-id="dimension-legend"
          >
            {labelLayouts.get("dimension-legend")?.lines.map((line, index) => (
              <text key={`frame-diagram-dimension-${index}`} x={line.x} y={line.y} textAnchor={labelLayouts.get("dimension-legend")?.textAnchor} fontSize={line.fontSize} fontWeight="600">
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
              strokeWidth={STRUCTURE_VISUAL_STROKES.resultFrameDiagram}
              strokeLinecap="round"
            />
          );
        })}

        {renderedMembers.map((member) => (
          <g key={`${member.id}-${metric.key}`}>
            {metric.diagramType === "area" && member.areaPath ? (
              <path d={member.areaPath} fill={metric.fillColor} stroke="none" />
            ) : null}
            <path d={member.resultPath} fill="none" stroke={metric.color} strokeWidth={metric.diagramType === "line" ? "2.5" : STRUCTURE_VISUAL_STROKES.resultFrameDiagram} strokeLinecap="round" strokeLinejoin="round" />
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
              transform={labelTransform(`member:${member.id}`)}
              data-result-mode="frame"
              data-result-surface="diagram"
              data-result-label-id={`member:${member.id}`}
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
                  transform={labelTransform(`node:${node.id}`)}
                  data-result-mode="frame"
                  data-result-surface="diagram"
                  data-result-label-id={`node:${node.id}`}
                >
                  {line.text}
                </text>
              ) : null}
            </g>
          );
        })}

        {renderedMembers.flatMap((member) =>
          member.keyPoints.map((point) => {
            const label = labelLayouts.get(`keypoint-${member.id}-${point.key}`);
            const kindLine = showKeyPointTypes ? label?.lines[0] : undefined;
            const valueLine = label?.lines[showKeyPointTypes ? 1 : 0];
            const stationLine = label?.lines[showKeyPointTypes ? 2 : 1];
            if (!label || !valueLine || !stationLine) return null;
            const isGlobalExtreme = point.kind === "global-extreme";
            const kindLabel = frameKeyPointKindLabel(point.kind, metric.key);
            return (
              <g key={`keypoint-${member.id}-${point.key}`} data-keypoint-kind={point.kind} aria-label={`${kindLabel} ${member.id} ${stationLine.text} ${valueLine.text}`}>
                <title>{kindLabel}</title>
                {kindLine ? (
                  <text x={kindLine.x} y={kindLine.y} textAnchor={label.textAnchor} fill="var(--structure-preview-label)" stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke" fontSize={kindLine.fontSize} fontFamily="Fira Code" fontWeight="600">
                    {kindLine.text}
                  </text>
                ) : null}
                <circle cx={point.x} cy={point.y} r={isGlobalExtreme ? 5 : 4.2} fill={metric.color} fillOpacity={isGlobalExtreme ? 1 : 0.88} stroke="var(--structure-preview-text-halo)" strokeWidth={isGlobalExtreme ? "1.4" : "1.1"} />
                <line x1={point.x} y1={point.y} x2={label.connectorX} y2={label.connectorY} stroke={metric.color} strokeWidth="1.4" strokeDasharray="4 4" />
                <text x={valueLine.x} y={valueLine.y} textAnchor={label.textAnchor} fill={metric.color} stroke="var(--structure-preview-text-halo)" strokeWidth="5" paintOrder="stroke" fontSize={valueLine.fontSize} fontFamily="Fira Code" fontWeight={isGlobalExtreme ? "700" : "650"}>
                  {valueLine.text}
                </text>
                <text x={stationLine.x} y={stationLine.y} textAnchor={label.textAnchor} fill="var(--structure-preview-label)" stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke" fontSize={stationLine.fontSize} fontFamily="Fira Code">
                  {stationLine.text}
                </text>
              </g>
            );
          }),
        )}
      </svg>
    </div>
  );
}

export function FrameMemberDiagrams({ frame, diagrams, compact = false, metricKey, showMetricTabs = true, heading = "工程图", modelLabelOffsets, viewSettings, onChangeViewSettings }: FrameMemberDiagramsProps) {
  const [selectedMetricState, setSelectedMetricState] = useState<FrameDiagramSelectionKey>("all");
  const selectedMetricKey = metricKey ?? selectedMetricState;
  const selectedMetric = getFrameDiagramMetric(selectedMetricKey === "all" ? DEFAULT_FRAME_DIAGRAM_METRIC_KEY : selectedMetricKey);
  const extreme = useMemo(() => findFrameDiagramExtreme(diagrams, selectedMetric), [diagrams, selectedMetric]);
  const showKeyPointTypes = viewSettings?.showKeyPointTypes ?? false;

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
          <FrameMemberDiagrams key={metric.key} frame={frame} diagrams={diagrams} compact={compact} metricKey={metric.key} showMetricTabs={false} heading={metric.title} modelLabelOffsets={modelLabelOffsets} viewSettings={viewSettings} onChangeViewSettings={onChangeViewSettings} />
        )}
      />
    );
  }

  return (
    <ResultDiagramCard
      compact={compact}
      heading={heading}
      actions={viewSettings && onChangeViewSettings ? (
        <ResultDiagramKeyPointTypeToggle
          visible={showKeyPointTypes}
          onChange={(visible) => onChangeViewSettings({ ...viewSettings, showKeyPointTypes: visible })}
        />
      ) : null}
      badges={
        extreme ? (
          <ResultDiagramMetricBadge>
            {frameDiagramPeakLabel(selectedMetric)}：{extreme.memberId} / {valueText(extreme.value, selectedMetric.unit)} / x={extreme.stationM.toFixed(2)} m
          </ResultDiagramMetricBadge>
        ) : null
      }
    >
      <FrameStructureDiagram frame={frame} diagrams={diagrams} metric={selectedMetric} compact={compact} modelLabelOffsets={modelLabelOffsets} showKeyPointTypes={showKeyPointTypes} />
    </ResultDiagramCard>
  );
}
