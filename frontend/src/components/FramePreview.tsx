import { useMemo, useState } from "react";
import { GlassCard } from "./ui/GlassCard";
import type { FramePreviewData, SupportType } from "../types/structure";
import { buildFrameDimensionLegendRows, buildFrameGeometryDimensions, buildFrameLoadLabelMap, buildFrameLoadMarkers, frameMemberLabelPlacement, type FrameLoadMarker } from "./frame-preview-utils";
import { formatEngineeringValue } from "../lib/engineering-format";
import { modelObjectMemberTerm, modelObjectVocabulary } from "../lib/model-object-vocabulary";
import { useCanvasDrag } from "../hooks/useModelCanvasZoom";
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
const FRAME_PREVIEW_AUTO_DEFORMATION_SCALE_CAP = 60;
const FRAME_PREVIEW_MANUAL_DEFORMATION_SCALE_CAP = 180;

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

function extremeLabelPlacement(point: { x: number; y: number }, center: { x: number; y: number }, compact: boolean) {
  const dx = point.x < center.x ? -1 : 1;
  const dy = point.y < center.y ? -1 : 1;
  const gapX = compact ? 24 : 34;
  const gapY = compact ? 26 : 36;
  return {
    x: point.x + dx * gapX,
    y: point.y + dy * gapY,
    anchor: dx < 0 ? ("end" as const) : ("start" as const),
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
  const [manualDeformationScale, setManualDeformationScale] = useState<number | null>(null);
  const [showLoads, setShowLoads] = useState(true);
  const [showBaseShape, setShowBaseShape] = useState(true);
  const [showExtremeLabel, setShowExtremeLabel] = useState(false);
  const objectVocabulary = modelObjectVocabulary("frame");
  const memberTerm = modelObjectMemberTerm("frame");
  const { canvasScrollRef, isCanvasDragging, handleCanvasPointerDown, handleCanvasPointerMove, finishCanvasDrag, handleCanvasClickCapture } = useCanvasDrag();
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

  const hasDeformation = Boolean(frame && frame.summary.maxDisplacementMm > 1e-9 && frame.nodeResults.length);
  const autoDeformationDisplayScale = frame && hasDeformation ? Math.max(1, Math.round(Math.min(frame.deformationScale, FRAME_PREVIEW_AUTO_DEFORMATION_SCALE_CAP))) : 0;
  const deformationDisplayScaleMax = frame && hasDeformation
    ? Math.max(10, Math.ceil(Math.min(Math.max(frame.deformationScale, FRAME_PREVIEW_AUTO_DEFORMATION_SCALE_CAP), FRAME_PREVIEW_MANUAL_DEFORMATION_SCALE_CAP)))
    : 10;
  const deformationDisplayScale = hasDeformation
    ? clamp(manualDeformationScale ?? autoDeformationDisplayScale, 1, deformationDisplayScaleMax)
    : 0;
  const renderedDeformedMap = useMemo(() => {
    if (!frame || !layout) return new Map<string, { x: number; y: number }>();
    const originalById = new Map(frame.nodes.map((node) => [node.id, node]));
    const next = new Map<string, { x: number; y: number }>();
    for (const node of frame.nodeResults) {
      const original = originalById.get(node.nodeId);
      const start = layout.nodeMap.get(node.nodeId);
      if (!original || !start) continue;
      next.set(node.nodeId, {
        x: start.x + (node.uxMm / 1000.0) * deformationDisplayScale * layout.scale,
        y: start.y - (node.uyMm / 1000.0) * deformationDisplayScale * layout.scale,
      });
    }
    return next;
  }, [frame, layout, deformationDisplayScale]);
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
          <p className="text-sm font-medium opacity-50">运行计算后将显示框架受力变形</p>
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
  const maxNodeResult = frame.nodeResults.find((item) => item.nodeId === maxNodeLabel) ?? null;
  const maxNodePoint = maxNodeLabel ? (renderedDeformedMap.get(maxNodeLabel) ?? layout.nodeMap.get(maxNodeLabel) ?? null) : null;
  const maxNodeLabelPlacement = maxNodePoint ? extremeLabelPlacement(maxNodePoint, layout.center, compact) : null;
  const showOriginalAnchors = showBaseShape || showLoads;

  return (
    <GlassCard className="overflow-hidden">
      <div className={`flex gap-3 border-b border-white/5 px-4 py-4 sm:px-5 ${compact ? "flex-col items-start" : "flex-wrap items-start justify-between"}`}>
        <div className="min-w-0">
          <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>受力变形</h3>
          {hasDeformation ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
              <span>位移显示倍率</span>
              <span className="font-mono text-sky-600 dark:text-sky-300">{deformationDisplayScale}×</span>
              <input
                type="range"
                name="frame-deformation-display-scale"
                min={1}
                max={deformationDisplayScaleMax}
                step={1}
                value={deformationDisplayScale}
                onChange={(event) => setManualDeformationScale(Number(event.currentTarget.value))}
                className="h-2 w-32 accent-sky-500 sm:w-44"
                aria-label="框架节点位移显示放大倍率"
              />
              <button
                type="button"
                onClick={() => setManualDeformationScale(null)}
                className={`h-7 rounded-lg border px-2 text-[11px] font-bold transition-colors ${
                  manualDeformationScale === null
                    ? "border-sky-400/45 bg-sky-400/15 text-sky-700 dark:text-sky-200"
                    : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-sky-400/50 dark:hover:text-sky-200"
                }`}
              >
                自动
              </button>
            </div>
          ) : null}
        </div>
        <div className={`flex min-w-0 flex-col gap-2 ${compact ? "w-full" : "items-end"}`}>
          <div className={`flex flex-wrap gap-2 ${compact ? "w-full" : "justify-end"}`}>
            {[
              { key: "loads", label: "荷载", active: showLoads, onClick: () => setShowLoads((value) => !value) },
              { key: "base", label: "未变形", active: showBaseShape, onClick: () => setShowBaseShape((value) => !value) },
              { key: "extreme", label: "极值", active: showExtremeLabel, onClick: () => setShowExtremeLabel((value) => !value), disabled: !hasDeformation },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={item.active}
                disabled={item.disabled}
                onClick={item.onClick}
                className={`h-8 rounded-lg border px-2.5 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  item.active
                    ? "border-sky-400/55 bg-sky-400/15 text-sky-700 dark:text-sky-200"
                    : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:border-sky-400/50 dark:hover:text-sky-200"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className={`flex flex-wrap gap-2 ${compact ? "w-full" : "justify-end"}`}>
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
      </div>

      <div
        ref={canvasScrollRef}
        className={`structure-preview-surface frame-structure-preview-surface relative overflow-auto ${isCanvasDragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={finishCanvasDrag}
        onPointerCancel={finishCanvasDrag}
        onClickCapture={handleCanvasClickCapture}
      >
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

          {showBaseShape && dimensionLegendRows.length ? (
            <g fontFamily="Fira Code" fill="var(--structure-preview-label)" stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke">
              {dimensionLegendRows.map((row, index) => (
                <text key={`frame-preview-dimension-${index}`} x={layout.dimensionLegendX} y={28 + index * 16} fontSize={compact ? "10" : "12"} fontWeight="700">
                  {row}
                </text>
              ))}
            </g>
          ) : null}

          {showBaseShape && frame.members.map((member) => {
            const start = layout.nodeMap.get(member.start);
            const end = layout.nodeMap.get(member.end);
            if (!start || !end) return null;
            const label = frameMemberLabelPlacement(start, end, layout.center, compact ? 14 : 18);
            return (
              <g key={member.id}>
                <line
                  x1={start.x}
                  y1={start.y}
                  x2={end.x}
                  y2={end.y}
                  stroke="var(--structure-preview-guide)"
                  strokeWidth={hasDeformation ? 2 : STRUCTURE_VISUAL_STROKES.previewMember}
                  strokeDasharray={hasDeformation ? "8 6" : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <text x={label.x} y={label.y} fill="var(--structure-preview-label)" textAnchor={label.textAnchor} dominantBaseline="middle" fontSize={compact ? "9" : "11"} fontFamily="Fira Code" fontWeight="700">
                  {member.id}
                </text>
                {member.endReleases?.start?.includes("rz") ? hingeMarker(start.x, start.y, `${member.id}-start-release`) : null}
                {member.endReleases?.end?.includes("rz") ? hingeMarker(end.x, end.y, `${member.id}-end-release`) : null}
              </g>
            );
          })}

          {hasDeformation && frame.members.map((member) => {
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
                strokeWidth={STRUCTURE_VISUAL_STROKES.previewMember}
                strokeOpacity="0.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          })}

          {showOriginalAnchors && frame.nodes.map((node) => {
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

          {hasDeformation && frame.nodeResults.map((node) => {
            const point = renderedDeformedMap.get(node.nodeId);
            if (!point) return null;
            return <circle key={node.nodeId} cx={point.x} cy={point.y} r="3.5" fill="var(--structure-preview-deformed-node)" stroke="var(--structure-preview-deformed-node-stroke)" strokeWidth="1" />;
          })}

          {showExtremeLabel && maxNodeResult && maxNodePoint && maxNodeLabelPlacement ? (
            <g>
              <circle cx={maxNodePoint.x} cy={maxNodePoint.y} r="5" fill={STRUCTURE_STATE_COLORS.peakDot} stroke={STRUCTURE_STATE_COLORS.peakDotStroke} strokeWidth="2" />
              <line x1={maxNodePoint.x} y1={maxNodePoint.y} x2={maxNodeLabelPlacement.x} y2={maxNodeLabelPlacement.y - 6} stroke={STRUCTURE_STATE_COLORS.peakDot} strokeWidth="1.5" strokeDasharray="4 4" />
              <text
                x={maxNodeLabelPlacement.x}
                y={maxNodeLabelPlacement.y - 8}
                fill={STRUCTURE_STATE_COLORS.peakLabel}
                stroke="var(--structure-preview-text-halo)"
                strokeWidth="5"
                paintOrder="stroke"
                textAnchor={maxNodeLabelPlacement.anchor}
                fontSize={compact ? "11" : "13"}
                fontFamily="Fira Code"
                fontWeight="700"
              >
                {formatEngineeringValue(maxNodeResult.resultantMm, "mm")}
              </text>
              <text
                x={maxNodeLabelPlacement.x}
                y={maxNodeLabelPlacement.y + 8}
                fill="var(--structure-preview-label)"
                stroke="var(--structure-preview-text-halo)"
                strokeWidth="4"
                paintOrder="stroke"
                textAnchor={maxNodeLabelPlacement.anchor}
                fontSize={compact ? "9" : "11"}
                fontFamily="Fira Code"
              >
                节点 {maxNodeResult.nodeId} / {deformationDisplayScale}×
              </text>
            </g>
          ) : null}

          {showLoads && loadMarkers.map((load, index) => (
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
