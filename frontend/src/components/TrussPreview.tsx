import { useMemo } from "react";
import { GlassCard } from "./ui/GlassCard";
import type { SupportType, TrussPreviewData } from "../types/structure";
import { buildTrussLoadMarkers, buildTrussMemberLengthDimensions, buildTrussMemberLengthLegendRows } from "./truss-preview-utils";
import { formatEngineeringValue, formatLimitRatio, formatUtilizationPercent } from "../lib/engineering-format";
import { modelObjectMemberTerm, modelObjectVocabulary } from "../lib/model-object-vocabulary";
import { useCanvasDrag } from "../hooks/useModelCanvasZoom";
import { RESULT_PREVIEW_BASE_SIZE, resultPreviewCanvasSize, resultPreviewSvgStyle, type ResultPreviewCanvasSize } from "../lib/result-preview-sizing";
import { STRUCTURE_NODE_RADII, STRUCTURE_VISUAL_STROKES } from "../lib/structure-visual-tokens";

interface TrussPreviewProps {
  truss: TrussPreviewData | null;
  compact?: boolean;
}

const PADDING = 72;
const svgTextFont = "Inter, Microsoft YaHei, system-ui, sans-serif";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nodeLabelPlacement(point: { x: number; y: number }, centerX: number) {
  const isLeft = point.x < centerX;
  return {
    x: point.x + (isLeft ? -16 : 16),
    y: point.y - 10,
    anchor: isLeft ? ("end" as const) : ("start" as const),
  };
}

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

function memberLabelPlacement(start: { x: number; y: number }, end: { x: number; y: number }, canvasSize: ResultPreviewCanvasSize) {
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const centerX = canvasSize.width / 2;
  const centerY = canvasSize.height / 2;
  const outward = (midX - centerX) * normalX + (midY - centerY) * normalY >= 0 ? 1 : -1;
  let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  if (angle > 90 || angle < -90) angle += 180;

  return {
    x: midX + normalX * outward * 14,
    y: midY + normalY * outward * 14,
    angle,
  };
}

export function TrussPreview({ truss, compact = false }: TrussPreviewProps) {
  const objectVocabulary = modelObjectVocabulary("truss");
  const memberTerm = modelObjectMemberTerm("truss");
  const { canvasScrollRef, isCanvasDragging, handleCanvasPointerDown, handleCanvasPointerMove, finishCanvasDrag, handleCanvasClickCapture } = useCanvasDrag();
  const padding = compact ? 54 : PADDING;
  const canvasSize = useMemo(
    () => truss ? resultPreviewCanvasSize(truss.nodes, truss.members.length) : RESULT_PREVIEW_BASE_SIZE,
    [truss],
  );
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
    const scale = Math.min((canvasSize.width - padding * 2) / width, (canvasSize.height - padding * 2) / height);

    const map = (point: { x: number; y: number }) => ({
      x: padding + (point.x - minX) * scale,
      y: canvasSize.height - padding - (point.y - minY) * scale,
    });

    const mappedNodes = truss.nodes.map((node) => map(node));
    const mappedXs = mappedNodes.map((point) => point.x);
    const mappedYs = mappedNodes.map((point) => point.y);
    const bounds = {
      left: Math.min(...mappedXs),
      right: Math.max(...mappedXs),
      top: Math.min(...mappedYs),
      bottom: Math.max(...mappedYs),
    };
    const nodeMap = new Map(truss.nodes.map((node, index) => [node.id, mappedNodes[index]]));
    const dimensionLegendX = clamp(bounds.left - (compact ? 112 : 126), 28, canvasSize.width - 260);
    return { map, nodeMap, scale, bounds, dimensionLegendX };
  }, [truss, padding, compact, canvasSize]);

  const deformationDrawScale = truss ? Math.min(truss.deformationScale, 64) : 0;
  const deformationScaleRatio = truss && truss.deformationScale > 1e-9 ? deformationDrawScale / truss.deformationScale : 0;
  const renderedDeformedMap = useMemo(() => {
    if (!truss || !layout) return new Map<string, { x: number; y: number }>();
    const originalById = new Map(truss.nodes.map((node) => [node.id, node]));
    const next = new Map<string, { x: number; y: number }>();
    for (const node of truss.deformedNodes) {
      const original = originalById.get(node.id);
      const start = layout.nodeMap.get(node.id);
      if (!original || !start) continue;
      next.set(node.id, {
        x: start.x + ((node.x - original.x) * layout.scale * deformationScaleRatio),
        y: start.y - ((node.y - original.y) * layout.scale * deformationScaleRatio),
      });
    }
    return next;
  }, [truss, layout, deformationScaleRatio]);

  const supportTypeById = useMemo(() => {
    const map = new Map<string, SupportType>();
    truss?.nodeResults.forEach((node) => map.set(node.nodeId, node.supportType));
    return map;
  }, [truss]);
  const dimensionLegendRows = useMemo(
    () => truss ? buildTrussMemberLengthLegendRows(buildTrussMemberLengthDimensions(truss.nodes, truss.members), compact ? 200 : 240, compact ? 10 : 12) : [],
    [truss, compact],
  );

  if (!truss || !layout) {
    return (
      <GlassCard className={`flex items-center justify-center border-dashed border-primary/10 ${compact ? "h-48 sm:h-60" : "h-56 sm:h-72"}`}>
        <div className="text-center">
          <p className="text-sm font-medium opacity-50">运行计算后将显示桁架预览</p>
        </div>
      </GlassCard>
    );
  }

  const statusToneClass =
    truss.summary.statusCode === "PASS"
      ? "border-teal-200 bg-teal-50 text-teal-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300"
      : "border-orange-200 bg-orange-50 text-orange-700 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300";

  const loadMarkers = truss.loads.filter((load) => load.type === "nodal").flatMap((load, index) => {
    const node = layout.nodeMap.get(load.node);
    if (!node) return [];
    return buildTrussLoadMarkers(node, load, index);
  });

  return (
    <GlassCard className="overflow-hidden">
      <div className={`flex gap-3 border-b border-white/5 px-4 py-4 sm:px-5 ${compact ? "flex-col items-start" : "flex-wrap items-center justify-between"}`}>
        <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>结构预览</h3>
        <div className={`flex flex-wrap gap-2 ${compact ? "w-full" : ""}`}>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            {truss.structureTypeLabel}
          </span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-300">
            节点 {truss.nodes.length}
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:border-cyan-400/20 dark:bg-cyan-500/10 dark:text-cyan-300">
            {memberTerm} {truss.members.length}
          </span>
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            允许位移 {formatEngineeringValue(truss.summary.allowableMm, "mm")}
          </span>
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold ${statusToneClass}`}>
            校核 {truss.summary.status}
          </span>
        </div>
      </div>

      <div
        ref={canvasScrollRef}
        className={`structure-preview-surface relative overflow-auto ${isCanvasDragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={finishCanvasDrag}
        onPointerCancel={finishCanvasDrag}
        onClickCapture={handleCanvasClickCapture}
      >
        <svg viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} className="block" style={resultPreviewSvgStyle(canvasSize)}>
          <defs>
            <linearGradient id="trussBaseGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={canvasSize.width} y2="0">
              <stop offset="0%" stopColor="var(--structure-preview-base-start)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--structure-preview-base-end)" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="trussDeformedGrad" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2={canvasSize.width} y2="0">
              <stop offset="0%" stopColor="var(--structure-preview-deformed-start)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--structure-preview-deformed-end)" stopOpacity="0.95" />
            </linearGradient>
            <marker id="trussLoadArrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--structure-preview-load)" />
            </marker>
          </defs>

          {dimensionLegendRows.length ? (
            <g fontFamily={svgTextFont} fill="var(--structure-preview-label)" stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke">
              {dimensionLegendRows.map((row, index) => (
                <text key={`truss-preview-dimension-${index}`} x={layout.dimensionLegendX} y={28 + index * 16} fontSize={compact ? "10" : "12"} fontWeight="700">
                  {row}
                </text>
              ))}
            </g>
          ) : null}

          {truss.members.map((member) => {
            const start = layout.nodeMap.get(member.start);
            const end = layout.nodeMap.get(member.end);
            if (!start || !end) return null;
            const label = memberLabelPlacement(start, end, canvasSize);
            return (
              <g key={member.id}>
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="url(#trussBaseGrad)" strokeWidth={STRUCTURE_VISUAL_STROKES.previewTrussMember} strokeLinecap="round" strokeLinejoin="round" />
                <text
                  x={label.x}
                  y={label.y}
                  transform={`rotate(${label.angle} ${label.x} ${label.y})`}
                  fill="var(--structure-preview-label)"
                  stroke="var(--structure-preview-text-halo)"
                  strokeWidth="4"
                  paintOrder="stroke"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={compact ? "9" : "11"}
                  fontWeight="500"
                  fontFamily={svgTextFont}
                >
                  {member.id}
                </text>
              </g>
            );
          })}

          {truss.deformedNodes.length === truss.nodes.length &&
            truss.members.map((member) => {
              const start = renderedDeformedMap.get(member.start);
              const end = renderedDeformedMap.get(member.end);
              if (!start || !end) return null;
              return (
                <line
                  key={`d-${member.id}`}
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="url(#trussDeformedGrad)"
                  strokeWidth={STRUCTURE_VISUAL_STROKES.previewTrussDeformedMember}
                  strokeOpacity="0.7"
                  strokeDasharray="8 6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              );
            })}

          {truss.nodes.map((node) => {
            const point = layout.nodeMap.get(node.id);
            if (!point) return null;
            const supportType = supportTypeById.get(node.id) ?? "free";
            const label = nodeLabelPlacement(point, (layout.bounds.left + layout.bounds.right) / 2);
            return (
              <g key={node.id}>
                <circle cx={point.x} cy={point.y} r={STRUCTURE_NODE_RADII.preview} fill="var(--structure-preview-node)" />
                <text x={label.x} y={label.y} textAnchor={label.anchor} fill="var(--structure-preview-node-label)" fontSize={compact ? "9" : "11"} fontFamily={svgTextFont}>
                  {node.id}
                </text>
                {supportMarker(supportType, point.x, point.y)}
              </g>
            );
          })}

          {truss.deformedNodes.map((node) => {
            const point = renderedDeformedMap.get(node.id);
            if (!point) return null;
            return <circle key={node.id} cx={point.x} cy={point.y} r="3.5" fill="var(--structure-preview-deformed-node)" stroke="var(--structure-preview-deformed-node-stroke)" strokeWidth="1" />;
          })}

          {loadMarkers.map((load) => (
            <g key={load.key}>
              <line x1={load.x1} y1={load.y1} x2={load.x2} y2={load.y2} stroke="var(--structure-preview-load)" strokeWidth="2" markerEnd="url(#trussLoadArrow)" />
              <text
                x={load.labelX}
                y={load.labelY}
                fill="var(--structure-preview-label)"
                stroke="var(--structure-preview-text-halo)"
                strokeWidth="4"
                paintOrder="stroke"
                fontSize={compact ? "9" : "11"}
                fontWeight="500"
                fontFamily={svgTextFont}
              >
                {load.label}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-1 gap-px border-t border-white/5 bg-white/5 md:grid-cols-3">
        {[
          {
            label: "模型摘要",
            main: `${truss.nodes.length} ${objectVocabulary.nodeGroupLabel} · ${truss.members.length} ${memberTerm}`,
            sub: truss.structureTypeLabel,
          },
          {
            label: "位移控制",
            main: formatEngineeringValue(truss.summary.maxDisplacementMm, "mm"),
            sub: `节点 ${truss.summary.maxDisplacementNodeId ?? "—"} · 利用率 ${formatUtilizationPercent(truss.summary.maxDisplacementMm, truss.summary.allowableMm)} · ${formatLimitRatio(truss.summary.allowableRatio)}`,
          },
          {
            label: "轴力控制",
            main: formatEngineeringValue(truss.summary.maxAxialForceKn, "kN"),
            sub: `${memberTerm} ${truss.summary.maxAxialForceMemberId ?? "—"} · 状态：${truss.summary.status}`,
            highlight: true,
          },
        ].map((item, index) => (
          <div key={index} className={`structure-preview-summary-cell ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
            <div className="eyebrow mb-2">{item.label}</div>
            <div className={`font-mono font-bold ${compact ? "text-[12px]" : "text-sm"} ${item.highlight ? "text-emerald-700 dark:text-emerald-400" : "text-foreground"}`}>
              {item.main}
            </div>
            <div className={`mt-1 text-[11px] opacity-40 ${compact ? "leading-relaxed" : ""}`}>{item.sub}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
