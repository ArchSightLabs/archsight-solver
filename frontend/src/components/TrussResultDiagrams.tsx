import { useMemo, useState } from "react";
import type { SupportType, TrussMemberResult, TrussNodeResult, TrussPreviewData } from "../types/structure";
import {
  legendLabelCandidates,
  lineBlocker,
  outwardLabelCandidates,
  placeDiagramLabels,
  pointBlocker,
  type DiagramLabelBlocker,
  type DiagramLabelSpec,
  type DiagramPlacedLabel,
} from "../lib/diagram-label-layout";
import { formatEngineeringValue } from "../lib/engineering-format";
import { clamp } from "../lib/result-diagram-geometry";
import { summaryMetricLabel } from "../lib/result-metrics";
import { ResultDiagramCard, ResultDiagramEmptyState, ResultDiagramMetricBadge, ResultDiagramMetricGallery } from "./ResultDiagramLayout";
import {
  buildTrussMemberLengthDimensions,
  buildTrussMemberLengthLegendRows,
  buildTrussNodeLabelCandidates,
  scoreTrussSupportedNodeLabelClearance,
} from "./truss-preview-utils";

type TrussDiagramMetricKey = "axialForceKn" | "displacementMm";
type TrussDiagramSelectionKey = TrussDiagramMetricKey | "all";

interface TrussResultDiagramsProps {
  truss: TrussPreviewData | null;
  compact?: boolean;
  metricKey?: TrussDiagramMetricKey;
  showMetricTabs?: boolean;
  heading?: string;
}

interface TrussDiagramMetric {
  key: TrussDiagramMetricKey;
  title: string;
  unit: string;
}

const SVG_W = 1000;
const SVG_H = 540;
const PADDING = 72;
const svgTextFont = "Inter, Microsoft YaHei, system-ui, sans-serif";
const TRUSS_DIAGRAM_METRICS: TrussDiagramMetric[] = [
  { key: "axialForceKn", title: "杆件轴力图", unit: "kN" },
  { key: "displacementMm", title: "节点位移图", unit: "mm" },
];

function supportMarker(type: SupportType, x: number, y: number) {
  if (type === "pinned") {
    return (
      <>
        <polygon points={`${x - 16},${y + 24} ${x + 16},${y + 24} ${x},${y + 2}`} fill="var(--structure-preview-support-fill)" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />
        <line x1={x - 18} y1={y + 28} x2={x + 18} y2={y + 28} stroke="var(--structure-preview-support-line)" strokeWidth="2" />
      </>
    );
  }
  if (type === "roller") {
    return (
      <>
        <polygon points={`${x - 16},${y + 24} ${x + 16},${y + 24} ${x},${y + 2}`} fill="var(--structure-preview-support-fill)" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />
        <line x1={x - 18} y1={y + 28} x2={x + 18} y2={y + 28} stroke="var(--structure-preview-support-line)" strokeWidth="2" />
        <circle cx={x - 8} cy={y + 33} r="3" fill="var(--structure-preview-support-line)" />
        <circle cx={x + 8} cy={y + 33} r="3" fill="var(--structure-preview-support-line)" />
      </>
    );
  }
  return null;
}

function valueText(value: number, unit: string) {
  return formatEngineeringValue(value, unit);
}

function trussDiagramControlLabel(key: TrussDiagramSelectionKey): string {
  if (key === "displacementMm") return summaryMetricLabel("truss", "max_node_displacement", "最大节点位移");
  if (key === "axialForceKn") return summaryMetricLabel("truss", "max_member_axial", "最大杆件轴力");
  return "控制值";
}

function memberLabelPlacement(start: { x: number; y: number }, end: { x: number; y: number }, offset: number) {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const centerX = SVG_W / 2;
  const centerY = SVG_H / 2;
  const outward = (midX - centerX) * normalX + (midY - centerY) * normalY >= 0 ? 1 : -1;
  return {
    x: midX + normalX * outward * offset,
    y: midY + normalY * outward * offset,
  };
}

function supportBlocker(type: SupportType, point: { x: number; y: number }): DiagramLabelBlocker {
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

export function TrussResultDiagrams({ truss, compact = false, metricKey, showMetricTabs = true, heading = "工程图" }: TrussResultDiagramsProps) {
  const [selectedMetricState, setSelectedMetricState] = useState<TrussDiagramSelectionKey>("all");
  const [manualDisplacementScale, setManualDisplacementScale] = useState<number | null>(null);
  const selectedMetricKey = metricKey ?? selectedMetricState;
  const selectedMetric = TRUSS_DIAGRAM_METRICS.find((metric) => metric.key === selectedMetricKey) ?? TRUSS_DIAGRAM_METRICS[0];
  const padding = compact ? 54 : PADDING;

  const layout = useMemo(() => {
    if (!truss) return null;
    const xs = truss.nodes.map((node) => node.x);
    const ys = truss.nodes.map((node) => node.y);
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
    const mappedNodes = truss.nodes.map((node) => map(node));
    const mappedXs = mappedNodes.map((point) => point.x);
    const mappedYs = mappedNodes.map((point) => point.y);
    return {
      nodeMap: new Map(truss.nodes.map((node, index) => [node.id, mappedNodes[index]])),
      scale,
      bounds: {
        left: Math.min(...mappedXs),
        right: Math.max(...mappedXs),
        top: Math.min(...mappedYs),
        bottom: Math.max(...mappedYs),
      },
    };
  }, [padding, truss]);

  const supportTypeById = useMemo(() => {
    const map = new Map<string, SupportType>();
    truss?.nodeResults.forEach((node) => map.set(node.nodeId, node.supportType));
    return map;
  }, [truss]);

  const memberResultsById = useMemo(() => new Map((truss?.memberResults ?? []).map((result) => [result.memberId, result])), [truss]);
  const maxAbsAxial = useMemo(() => Math.max(...(truss?.memberResults ?? []).map((result) => Math.abs(result.axialForceKn)), 0), [truss]);
  const maxDisplacementNode = useMemo(() => {
    return (truss?.nodeResults ?? []).reduce<TrussNodeResult | null>((current, node) => {
      if (!current || node.displacementMm > current.displacementMm) return node;
      return current;
    }, null);
  }, [truss]);
  const controlAxial = useMemo(() => {
    return (truss?.memberResults ?? []).reduce<TrussMemberResult | null>((current, member) => {
      if (!current || Math.abs(member.axialForceKn) > Math.abs(current.axialForceKn)) return member;
      return current;
    }, null);
  }, [truss]);
  const dimensionLegendRows = useMemo(
    () => truss ? buildTrussMemberLengthLegendRows(buildTrussMemberLengthDimensions(truss.nodes, truss.members), compact ? 200 : 240, compact ? 10 : 12) : [],
    [truss, compact],
  );

  const autoDisplacementDisplayScale = useMemo(() => {
    if (!truss || !layout || !maxDisplacementNode || maxDisplacementNode.displacementMm <= 1e-9) return 0;
    const targetPx = compact ? 90 : 130;
    const maxDisplacementM = maxDisplacementNode.displacementMm / 1000.0;
    return clamp(targetPx / Math.max(maxDisplacementM * layout.scale, 1e-9), 1, 100000);
  }, [compact, layout, maxDisplacementNode, truss]);
  const displacementDisplayScale = manualDisplacementScale ?? autoDisplacementDisplayScale;
  const displacementScaleMax = Math.max(200, Math.ceil((autoDisplacementDisplayScale * 2) / 10) * 10);
  const displayScaleValue = Math.round(clamp(displacementDisplayScale, 1, displacementScaleMax));
  const renderedDeformedMap = useMemo(() => {
    if (!truss || !layout) return new Map<string, { x: number; y: number }>();
    const resultById = new Map(truss.nodeResults.map((node) => [node.nodeId, node]));
    const next = new Map<string, { x: number; y: number }>();
    for (const node of truss.nodes) {
      const result = resultById.get(node.id);
      const start = layout.nodeMap.get(node.id);
      if (!result || !start) continue;
      next.set(node.id, {
        x: start.x + (result.uxMm / 1000.0) * displacementDisplayScale * layout.scale,
        y: start.y - (result.uyMm / 1000.0) * displacementDisplayScale * layout.scale,
      });
    }
    return next;
  }, [displacementDisplayScale, layout, truss]);

  const labelLayouts = useMemo(() => {
    if (!truss || !layout) return new Map<string | undefined, DiagramPlacedLabel>();
    const center = {
      x: (layout.bounds.left + layout.bounds.right) / 2,
      y: (layout.bounds.top + layout.bounds.bottom) / 2,
    };
    const bounds = { left: 10, top: 16, right: SVG_W - 10, bottom: SVG_H - 16 };
    const baseBlockers: DiagramLabelBlocker[] = [
      ...truss.members.flatMap((member) => {
        const start = layout.nodeMap.get(member.start);
        const end = layout.nodeMap.get(member.end);
        if (!start || !end) return [];
        return [lineBlocker(start, end, 8, 5)];
      }),
      ...truss.nodes.flatMap((node) => {
        const point = layout.nodeMap.get(node.id);
        if (!point) return [];
        const supportType = supportTypeById.get(node.id) ?? "free";
        return [pointBlocker(point, 9, 10), supportBlocker(supportType, point)];
      }),
      ...(selectedMetricKey === "displacementMm"
        ? truss.members.flatMap((member) => {
            const start = renderedDeformedMap.get(member.start);
            const end = renderedDeformedMap.get(member.end);
            if (!start || !end) return [];
            return [lineBlocker(start, end, 5, 4)];
          })
        : []),
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
    truss.nodes.forEach((node) => {
      const point = layout.nodeMap.get(node.id);
      if (!point) return;
      const supportType = supportTypeById.get(node.id) ?? "free";
      const isSupportedNode = supportType === "pinned" || supportType === "roller";
      labels.push({
        id: `node-${node.id}`,
        anchor: point,
        lines: [{ text: node.id, fontSize: compact ? 9 : 11 }],
        candidates: buildTrussNodeLabelCandidates(point, center, supportType, compact ? 12 : 14),
        priority: 90,
        occupiedWeight: 11,
        paddingX: 1,
        paddingY: 1,
        lineGap: 0,
        extraScore: isSupportedNode ? (rect) => scoreTrussSupportedNodeLabelClearance(rect, point.y, compact ? 6 : 8) : undefined,
      });
    });
    truss.members.forEach((member) => {
      const start = layout.nodeMap.get(member.start);
      const end = layout.nodeMap.get(member.end);
      if (!start || !end) return;
      const result = memberResultsById.get(member.id);
      const value = result?.axialForceKn ?? 0;
      const preferred = memberLabelPlacement(start, end, selectedMetricKey === "axialForceKn" ? 22 : 14);
      labels.push({
        id: `member-${member.id}`,
        anchor: preferred,
        lines: [{ text: selectedMetricKey === "axialForceKn" ? `${member.id} ${valueText(value, "kN")}` : member.id, fontSize: compact ? 9 : 11 }],
        candidates: [
          { dx: 0, dy: 0, textAnchor: "middle", verticalAnchor: "middle", penalty: 0 },
          ...outwardLabelCandidates(preferred, center, compact ? 10 : 12, compact ? 22 : 28).map((candidate) => ({
            ...candidate,
            penalty: (candidate.penalty ?? 0) + 24,
          })),
        ],
        priority: selectedMetricKey === "axialForceKn" ? 66 : 60,
        occupiedWeight: 9,
        paddingX: 1,
        paddingY: 1,
        lineGap: 0,
        distanceWeight: 0.2,
      });
    });
    if (selectedMetricKey === "displacementMm" && maxDisplacementNode) {
      const deformed = renderedDeformedMap.get(maxDisplacementNode.nodeId);
      if (deformed) {
        labels.push({
          id: "max-displacement",
          anchor: deformed,
          lines: [{ text: valueText(maxDisplacementNode.displacementMm, "mm"), fontSize: compact ? 11 : 13 }],
          candidates: outwardLabelCandidates(deformed, center, compact ? 12 : 16, compact ? 30 : 38),
          priority: 70,
          occupiedWeight: 13,
          paddingX: 0,
          paddingY: 0,
          lineGap: 0,
        });
      }
    }
    return placedById(placeDiagramLabels(labels, { baseBlockers, bounds }));
  }, [
    compact,
    dimensionLegendRows,
    layout,
    maxDisplacementNode,
    memberResultsById,
    renderedDeformedMap,
    selectedMetricKey,
    supportTypeById,
    truss,
  ]);

  if (!truss || !layout) {
    return <ResultDiagramEmptyState compact={compact} label="暂无桁架工程图数据" />;
  }

  const controlValue = selectedMetricKey === "axialForceKn" ? controlAxial?.axialForceKn : maxDisplacementNode?.displacementMm;
  const controlId = selectedMetricKey === "axialForceKn" ? controlAxial?.memberId : maxDisplacementNode?.nodeId;

  if (showMetricTabs) {
    return (
      <ResultDiagramMetricGallery
        ariaLabel="桁架工程图类型"
        compact={compact}
        gridClassName={compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3"}
        metrics={TRUSS_DIAGRAM_METRICS}
        selectedKey={selectedMetricKey}
        selectedMetric={selectedMetric}
        onSelect={(key) => setSelectedMetricState(key)}
        renderMetric={(metric) => (
          <TrussResultDiagrams key={metric.key} truss={truss} compact={compact} metricKey={metric.key} showMetricTabs={false} heading={metric.title} />
        )}
      />
    );
  }

  return (
    <ResultDiagramCard
      compact={compact}
      heading={heading}
      badges={
        <>
          {controlValue !== undefined ? (
            <ResultDiagramMetricBadge>
              {trussDiagramControlLabel(selectedMetricKey)}：{controlId ?? "—"} / {valueText(controlValue, selectedMetric.unit)}
            </ResultDiagramMetricBadge>
          ) : null}
          {selectedMetricKey === "displacementMm" && displacementDisplayScale > 0 ? (
            <ResultDiagramMetricBadge>
              显示放大：{displayScaleValue}×{manualDisplacementScale === null ? " 自动" : " 手动"}
            </ResultDiagramMetricBadge>
          ) : null}
        </>
      }
    >
      {selectedMetricKey === "displacementMm" && autoDisplacementDisplayScale > 0 ? (
        <div className="flex flex-col gap-2 rounded-lg border border-slate-200/80 bg-slate-50/80 p-3 text-xs dark:border-slate-700/80 dark:bg-slate-900/45 sm:flex-row sm:items-center">
          <div className="flex shrink-0 items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
            <span>位移显示倍率</span>
            <span className="font-mono text-sky-600 dark:text-sky-300">{displayScaleValue}×</span>
          </div>
          <input
            type="range"
            name="truss-displacement-display-scale"
            min={1}
            max={displacementScaleMax}
            step={1}
            value={displayScaleValue}
            onChange={(event) => setManualDisplacementScale(Number(event.currentTarget.value))}
            className="h-2 min-w-0 flex-1 accent-sky-500"
            aria-label="节点位移显示放大倍率"
          />
          <input
            type="number"
            name="truss-displacement-display-scale-value"
            min={1}
            max={displacementScaleMax}
            step={1}
            value={displayScaleValue}
            onChange={(event) => setManualDisplacementScale(clamp(Number(event.currentTarget.value) || 1, 1, displacementScaleMax))}
            className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-right font-mono text-xs font-bold text-slate-800 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            aria-label="输入节点位移显示放大倍率"
          />
          <button
            type="button"
            onClick={() => setManualDisplacementScale(null)}
            className={`h-9 rounded-lg border px-3 text-xs font-bold transition-colors ${
              manualDisplacementScale === null
                ? "border-sky-400/45 bg-sky-400/15 text-sky-700 dark:text-sky-200"
                : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-sky-400/50 dark:hover:text-sky-200"
            }`}
          >
            自动
          </button>
        </div>
      ) : null}

      <div className="structure-preview-surface overflow-hidden rounded-lg border border-slate-200/80 bg-white/90 dark:border-slate-700/80 dark:bg-slate-900/45">
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className={compact ? "block h-[250px] w-full sm:h-[330px]" : "block h-[360px] w-full"}>
          {[0.25, 0.5, 0.75].map((ratio) => (
            <line key={ratio} x1="42" y1={SVG_H * ratio} x2={SVG_W - 42} y2={SVG_H * ratio} stroke="var(--frame-diagram-grid)" strokeDasharray="6 8" />
          ))}
          {dimensionLegendRows.length ? (
            <g fontFamily={svgTextFont} fill="var(--structure-preview-label)" stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke">
              {labelLayouts.get("dimension-legend")?.lines.map((line, index) => (
                <text key={`truss-diagram-dimension-${index}`} x={line.x} y={line.y} textAnchor={labelLayouts.get("dimension-legend")?.textAnchor} fontSize={line.fontSize} fontWeight="700">
                  {line.text}
                </text>
              ))}
            </g>
          ) : null}

          {truss.members.map((member) => {
            const start = layout.nodeMap.get(member.start);
            const end = layout.nodeMap.get(member.end);
            if (!start || !end) return null;
            const result = memberResultsById.get(member.id);
            const value = result?.axialForceKn ?? 0;
            const isTension = value >= 0;
            const strokeWidth = selectedMetricKey === "axialForceKn" ? 3 + (maxAbsAxial > 1e-9 ? (Math.abs(value) / maxAbsAxial) * 6 : 0) : 7;
            const label = labelLayouts.get(`member-${member.id}`);
            const line = label?.lines[0];
            return (
              <g key={member.id}>
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="var(--structure-preview-base-start)" strokeOpacity="0.55" strokeWidth="7" strokeLinecap="round" />
                {selectedMetricKey === "axialForceKn" ? (
                  <>
                    <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke={isTension ? "#dc2626" : "#2563eb"} strokeOpacity="0.82" strokeWidth={strokeWidth} strokeLinecap="round" />
                    {label && line ? (
                      <text x={line.x} y={line.y} fill={isTension ? "#dc2626" : "#2563eb"} stroke="var(--structure-preview-text-halo)" strokeWidth="5" paintOrder="stroke" textAnchor={label.textAnchor} fontSize={line.fontSize} fontFamily="Fira Code" fontWeight="700">
                        {line.text}
                      </text>
                    ) : null}
                  </>
                ) : (
                  label && line ? (
                    <text x={line.x} y={line.y} fill="var(--structure-preview-label)" stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke" textAnchor={label.textAnchor} fontSize={line.fontSize} fontFamily={svgTextFont} fontWeight="700">
                      {line.text}
                    </text>
                  ) : null
                )}
              </g>
            );
          })}

          {selectedMetricKey === "displacementMm" &&
            truss.members.map((member) => {
              const start = renderedDeformedMap.get(member.start);
              const end = renderedDeformedMap.get(member.end);
              if (!start || !end) return null;
              return <line key={`d-${member.id}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="var(--structure-preview-deformed-start)" strokeWidth="3" strokeOpacity="0.82" strokeDasharray="8 6" strokeLinecap="round" />;
            })}

          {truss.nodes.map((node) => {
            const point = layout.nodeMap.get(node.id);
            if (!point) return null;
            const supportType = supportTypeById.get(node.id) ?? "free";
            const deformed = renderedDeformedMap.get(node.id);
            const nodeResult = truss.nodeResults.find((result) => result.nodeId === node.id);
            const showDisplacementLabel = selectedMetricKey === "displacementMm" && nodeResult?.nodeId === maxDisplacementNode?.nodeId && deformed;
            const label = labelLayouts.get(`node-${node.id}`);
            const line = label?.lines[0];
            const displacementLabel = showDisplacementLabel ? labelLayouts.get("max-displacement") : null;
            const displacementLine = displacementLabel?.lines[0];
            return (
              <g key={node.id}>
                <circle cx={point.x} cy={point.y} r="4.5" fill="var(--structure-preview-node)" />
                {label && line ? (
                  <text x={line.x} y={line.y} textAnchor={label.textAnchor} fill="var(--structure-preview-node-label)" stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke" fontSize={line.fontSize} fontFamily="Fira Code">
                    {line.text}
                  </text>
                ) : null}
                {supportMarker(supportType, point.x, point.y)}
                {selectedMetricKey === "displacementMm" && deformed ? <circle cx={deformed.x} cy={deformed.y} r="4" fill="var(--structure-preview-deformed-node)" stroke="var(--structure-preview-deformed-node-stroke)" strokeWidth="1" /> : null}
                {showDisplacementLabel && nodeResult && displacementLabel && displacementLine && deformed ? (
                  <text x={displacementLine.x} y={displacementLine.y} textAnchor={displacementLabel.textAnchor} fill="var(--structure-preview-deformed-start)" stroke="var(--structure-preview-text-halo)" strokeWidth="5" paintOrder="stroke" fontSize={displacementLine.fontSize} fontFamily="Fira Code" fontWeight="700">
                    {displacementLine.text}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </ResultDiagramCard>
  );
}
