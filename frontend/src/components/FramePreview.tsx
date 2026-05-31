import { useMemo } from "react";
import { GlassCard } from "./ui/GlassCard";
import type { FramePreviewData, SupportType } from "../types/structure";
import { buildFrameDimensionLegendRows, buildFrameGeometryDimensions, buildFrameLoadLabelMap, buildFrameLoadMarkers, frameMemberLabelPlacement, type FrameLoadMarker } from "./frame-preview-utils";
import { formatEngineeringValue } from "../lib/engineering-format";
import { modelObjectMemberTerm, modelObjectVocabulary } from "../lib/model-object-vocabulary";
import { RESULT_PREVIEW_BASE_SIZE, resultPreviewCanvasSize, resultPreviewSvgStyle } from "../lib/result-preview-sizing";
import { summaryMetricLabel } from "../lib/result-metrics";
import { STRUCTURE_NODE_RADII, STRUCTURE_STATE_COLORS, STRUCTURE_VISUAL_STROKES } from "../lib/structure-visual-tokens";

interface FramePreviewProps {
  frame: FramePreviewData | null;
  compact?: boolean;
}

const PADDING = 70;
const FRAME_PREVIEW_LOAD_STROKE_WIDTH = 1.55;
const FRAME_PREVIEW_LOAD_GUIDE_STROKE_WIDTH = 1.2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function nodeLabelPlacement(point: { x: number; y: number }, centerX: number) {
  const isLeft = point.x < centerX;
  return {
    x: point.x + (isLeft ? -24 : 24),
    y: point.y - 12,
    anchor: isLeft ? ("end" as const) : ("start" as const),
  };
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

function springMarkers(node: FramePreviewData["nodes"][number], x: number, y: number) {
  return (node.springs ?? []).map((spring, index) => {
    const offset = index * 12;
    if (spring.dof === "rz") {
      return (
        <g key={`${node.id}-spring-rz-${index}`} transform={`translate(${offset}, ${-offset})`}>
          <path d={`M ${x + 18} ${y - 18} A 14 14 0 1 1 ${x + 18} ${y + 10}`} fill="none" stroke={STRUCTURE_STATE_COLORS.spring} strokeWidth="2" strokeDasharray="3 2" />
          <text x={x + 34} y={y - 14} fill={STRUCTURE_STATE_COLORS.spring} fontSize="9" fontFamily="Fira Code">kθ</text>
        </g>
      );
    }
    const vertical = spring.dof === "uy";
    const points = vertical
      ? `${x - 28},${y - 14 - offset} ${x - 22},${y - 8 - offset} ${x - 34},${y - 2 - offset} ${x - 22},${y + 4 - offset} ${x - 28},${y + 10 - offset}`
      : `${x + 18 + offset},${y + 20} ${x + 24 + offset},${y + 14} ${x + 30 + offset},${y + 26} ${x + 36 + offset},${y + 14} ${x + 42 + offset},${y + 20}`;
    return (
      <g key={`${node.id}-spring-${spring.dof}-${index}`}>
        <polyline points={points} fill="none" stroke={STRUCTURE_STATE_COLORS.spring} strokeWidth="2" />
        <text x={vertical ? x - 46 : x + 22 + offset} y={vertical ? y - 18 - offset : y + 36} fill={STRUCTURE_STATE_COLORS.spring} fontSize="9" fontFamily="Fira Code">
          k{spring.dof}
        </text>
      </g>
    );
  });
}

function hingeMarker(x: number, y: number, key: string) {
  return (
    <g key={key}>
      <circle cx={x} cy={y} r="9" fill="var(--structure-preview-hinge-fill)" stroke={STRUCTURE_STATE_COLORS.hinge} strokeWidth="2" />
      <circle cx={x} cy={y} r="3" fill={STRUCTURE_STATE_COLORS.hinge} />
    </g>
  );
}

export function FramePreview({ frame, compact = false }: FramePreviewProps) {
  const objectVocabulary = modelObjectVocabulary("frame");
  const memberTerm = modelObjectMemberTerm("frame");
  const padding = compact ? 52 : PADDING;
  const canvasSize = useMemo(
    () => frame ? resultPreviewCanvasSize(frame.nodes, frame.members.length) : RESULT_PREVIEW_BASE_SIZE,
    [frame],
  );
  const layout = useMemo(() => {
    if (!frame) return null;

    const allPoints = frame.nodes;
    const xs = allPoints.map((item) => item.x);
    const ys = allPoints.map((item) => item.y);
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
    const bounds = {
      left: Math.min(...mappedXs),
      right: Math.max(...mappedXs),
      top: Math.min(...mappedYs),
      bottom: Math.max(...mappedYs),
    };
    const center = {
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2,
    };
    const nodeMap = new Map(frame.nodes.map((node, index) => [node.id, mappedNodes[index]]));
    const dimensionLegendX = clamp(bounds.left - (compact ? 148 : 170), 8, canvasSize.width - 260);
    return { map, nodeMap, scale, center, bounds, dimensionLegendX };
  }, [frame, padding, compact, canvasSize]);

  const deformationDrawScale = frame ? Math.min(frame.deformationScale, 60) : 0;
  const deformationScaleRatio = frame && frame.deformationScale > 1e-9 ? deformationDrawScale / frame.deformationScale : 0;
  const renderedDeformedMap = useMemo(() => {
    if (!frame || !layout) return new Map<string, { x: number; y: number }>();
    const originalById = new Map(frame.nodes.map((node) => [node.id, node]));
    const next = new Map<string, { x: number; y: number }>();
    for (const node of frame.deformedNodes) {
      const original = originalById.get(node.nodeId);
      const start = layout.nodeMap.get(node.nodeId);
      if (!original || !start) continue;
      next.set(node.nodeId, {
        x: start.x + ((node.x - original.x) * layout.scale * deformationScaleRatio),
        y: start.y - ((node.y - original.y) * layout.scale * deformationScaleRatio),
      });
    }
    return next;
  }, [frame, layout, deformationScaleRatio]);
  const memberMap = useMemo(() => new Map((frame?.members ?? []).map((member) => [member.id, member])), [frame?.members]);
  const loadLabelMap = useMemo(() => buildFrameLoadLabelMap(frame?.loads ?? []), [frame?.loads]);
  const reservedLoadPoints = useMemo(() => {
    if (!frame || !layout) return [];
    return frame.loads.flatMap((load) => {
      if (load.type === "nodal") {
        const hasForce = Math.abs(load.fxKn ?? 0) > 1e-9 || Math.abs(load.fyKn ?? 0) > 1e-9;
        const point = layout.nodeMap.get(load.node);
        return hasForce && point ? [point] : [];
      }
      if (load.type !== "member_point") return [];
      const forceKn = load.forceKn ?? 0;
      const member = memberMap.get(load.member);
      const start = member ? layout.nodeMap.get(member.start) : null;
      const end = member ? layout.nodeMap.get(member.end) : null;
      if (Math.abs(forceKn) <= 1e-9 || !start || !end) return [];
      const ratio = Math.min(1, Math.max(0, load.positionRatio ?? 0.5));
      return [{ x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio }];
    });
  }, [frame, layout, memberMap]);
  const dimensionLegendRows = useMemo(
    () => frame ? buildFrameDimensionLegendRows(buildFrameGeometryDimensions(frame.nodes, frame.members), compact ? 200 : 240, compact ? 10 : 12) : [],
    [frame, compact],
  );
  const loadMarkers: FrameLoadMarker[] = frame && layout
    ? frame.loads.flatMap((load, index) => buildFrameLoadMarkers(load, index, { nodeMap: layout.nodeMap, memberMap, loadLabel: loadLabelMap.get(index), reservedLoadPoints }))
    : [];

  if (!frame || !layout) {
    return (
      <GlassCard className={`flex items-center justify-center border-dashed border-primary/10 ${compact ? "h-48 sm:h-60" : "h-56 sm:h-72"}`}>
        <div className="text-center">
          <p className="text-sm font-medium opacity-50">运行计算后将显示框架预览</p>
        </div>
      </GlassCard>
    );
  }

  const peakBadge = frame.summary;
  const maxMomentKnM = frame.memberResults.length
    ? Math.max(
        ...frame.memberResults.map((item) =>
          item.maxAbsMomentKnM ?? Math.max(Math.abs(item.momentStartKnM), Math.abs(item.momentEndKnM)),
        ),
      )
    : 0;
  const maxNodeLabel = peakBadge.maxDisplacementNodeId ?? frame.nodeResults.reduce((prev, curr) => {
    if (!prev) return curr.nodeId;
    return Math.abs(curr.resultantMm) > Math.abs(frame.nodeResults.find((item) => item.nodeId === prev)?.resultantMm ?? 0)
      ? curr.nodeId
      : prev;
  }, "");
  const maxNodeDisplacementLabel = summaryMetricLabel("frame", "max_node_displacement", "最大节点位移");
  const maxMemberMomentLabel = summaryMetricLabel("frame", "max_member_moment", `最大${memberTerm}弯矩`);

  return (
    <GlassCard className="overflow-hidden">
      <div className={`flex gap-3 border-b border-white/5 px-4 py-4 sm:px-5 ${compact ? "flex-col items-start" : "flex-wrap items-center justify-between"}`}>
        <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>结构预览</h3>
        <div className={`flex flex-wrap gap-2 ${compact ? "w-full" : ""}`}>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            {frame.structureTypeLabel}
          </span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-300">
            节点 {frame.nodes.length}
          </span>
          <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-700 dark:border-emerald-400/30 dark:bg-emerald-500/10 dark:text-emerald-300">
            {maxNodeDisplacementLabel} = {formatEngineeringValue(peakBadge.maxDisplacementMm, "mm")}
          </span>
        </div>
      </div>

      <div className="structure-preview-surface frame-structure-preview-surface relative overflow-auto">
        <svg viewBox={`0 0 ${canvasSize.width} ${canvasSize.height}`} className="block" style={resultPreviewSvgStyle(canvasSize)}>
          <defs>
            <linearGradient id="frameBaseGrad" x1="0%" x2="100%">
              <stop offset="0%" stopColor="var(--structure-preview-base-start)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--structure-preview-base-end)" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="frameDeformedGrad" x1="0%" x2="100%">
              <stop offset="0%" stopColor="var(--structure-preview-deformed-start)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--structure-preview-deformed-end)" stopOpacity="0.95" />
            </linearGradient>
            <marker id="frameLoadArrow" viewBox="0 0 8 8" markerWidth="7" markerHeight="7" refX="7" refY="4" orient="auto" markerUnits="userSpaceOnUse">
              <path d="M0,0 L8,4 L0,8 z" fill="var(--structure-preview-load)" />
            </marker>
          </defs>

          {dimensionLegendRows.length ? (
            <g fontFamily="Fira Code" fill="var(--structure-preview-label)" stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke">
              {dimensionLegendRows.map((row, index) => (
                <text key={`frame-preview-dimension-${index}`} x={layout.dimensionLegendX} y={28 + index * 16} fontSize={compact ? "10" : "12"} fontWeight="700">
                  {row}
                </text>
              ))}
            </g>
          ) : null}

          {frame.members.map((member) => {
            const start = layout.nodeMap.get(member.start);
            const end = layout.nodeMap.get(member.end);
            if (!start || !end) return null;
            const label = frameMemberLabelPlacement(start, end, layout.center, compact ? 14 : 18);
            return (
              <g key={member.id}>
                <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="url(#frameBaseGrad)" strokeWidth={STRUCTURE_VISUAL_STROKES.previewMember} strokeLinecap="round" strokeLinejoin="round" />
                <text x={label.x} y={label.y} fill="var(--structure-preview-label)" textAnchor={label.textAnchor} dominantBaseline="middle" fontSize={compact ? "9" : "11"} fontFamily="Fira Code" fontWeight="700">
                  {member.id}
                </text>
                {member.endReleases?.start?.includes("rz") ? hingeMarker(start.x, start.y, `${member.id}-start-release`) : null}
                {member.endReleases?.end?.includes("rz") ? hingeMarker(end.x, end.y, `${member.id}-end-release`) : null}
              </g>
            );
          })}

          {frame.deformedNodes.length === frame.nodes.length && frame.members.map((member) => {
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
                stroke="url(#frameDeformedGrad)"
                strokeWidth={STRUCTURE_VISUAL_STROKES.previewFrameDeformedMember}
                strokeOpacity="0.55"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {frame.nodes.map((node) => {
            const point = layout.nodeMap.get(node.id);
            if (!point) return null;
            const label = nodeLabelPlacement(point, layout.center.x);
            return (
              <g key={node.id}>
                {supportMarker((node.supportType ?? "free") as SupportType, point.x, point.y, node.supportAngleDeg)}
                <circle cx={point.x} cy={point.y} r={STRUCTURE_NODE_RADII.preview} fill="var(--structure-preview-node)" />
                <text x={label.x} y={label.y} textAnchor={label.anchor} fill="var(--structure-preview-node-label)" fontSize={compact ? "9" : "11"} fontFamily="Fira Code">
                  {node.id}
                </text>
                {springMarkers(node, point.x, point.y)}
                {node.condensedDofs?.includes("rz") ? hingeMarker(point.x, point.y, `${node.id}-condensed-rz`) : null}
              </g>
            );
          })}

          {frame.deformedNodes.map((node) => {
            const point = renderedDeformedMap.get(node.nodeId);
            if (!point) return null;
            return <circle key={node.nodeId} cx={point.x} cy={point.y} r="3.5" fill="var(--structure-preview-deformed-node)" stroke="var(--structure-preview-deformed-node-stroke)" strokeWidth="1" />;
          })}

          {loadMarkers.map((load, index) => (
            <g key={load.key ?? `${load.type}-${index}`}>
              {load.type === "moment" ? (
                <path
                  d={
                    load.clockwise
                      ? `M ${load.cx - load.radius} ${load.cy} A ${load.radius} ${load.radius} 0 1 0 ${load.cx + load.radius} ${load.cy}`
                      : `M ${load.cx + load.radius} ${load.cy} A ${load.radius} ${load.radius} 0 1 1 ${load.cx - load.radius} ${load.cy}`
                  }
                  fill="none"
                  stroke="var(--structure-preview-load)"
                  strokeWidth={FRAME_PREVIEW_LOAD_STROKE_WIDTH}
                  markerEnd="url(#frameLoadArrow)"
                />
              ) : load.type === "distributed-guide" ? (
                <line
                  x1={load.x1}
                  y1={load.y1}
                  x2={load.x2}
                  y2={load.y2}
                  stroke="var(--structure-preview-guide)"
                  strokeWidth={FRAME_PREVIEW_LOAD_GUIDE_STROKE_WIDTH}
                  strokeOpacity="0.68"
                  strokeDasharray="6 5"
                />
              ) : (
                <line
                  x1={load.x1}
                  y1={load.y1}
                  x2={load.x2}
                  y2={load.y2}
                  stroke="var(--structure-preview-load)"
                  strokeWidth={FRAME_PREVIEW_LOAD_STROKE_WIDTH}
                  markerEnd="url(#frameLoadArrow)"
                />
              )}
              {load.label ? (
                <text x={load.labelX} y={load.labelY} fill="var(--structure-preview-label)" textAnchor={load.textAnchor ?? "start"} fontSize={compact ? "9" : "11"} fontFamily="Fira Code">
                  {load.label}
                </text>
              ) : null}
            </g>
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-1 gap-px border-t border-white/5 bg-white/5 md:grid-cols-3">
        {[
          {
            label: "模型摘要",
            main: `${frame.nodes.length} ${objectVocabulary.nodeGroupLabel} · ${frame.members.length} ${memberTerm}`,
            sub: frame.structureTypeLabel,
          },
          {
            label: maxNodeDisplacementLabel,
            main: formatEngineeringValue(peakBadge.maxDisplacementMm, "mm"),
            sub: `节点 ${maxNodeLabel || "—"}`,
          },
          {
            label: maxMemberMomentLabel,
            main: formatEngineeringValue(maxMomentKnM, "kN·m"),
            sub: `状态：${peakBadge.status}`,
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
