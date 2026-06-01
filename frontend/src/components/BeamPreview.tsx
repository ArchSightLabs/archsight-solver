import { useCallback, useMemo, type ReactNode } from "react";
import { GlassCard } from "./ui/GlassCard";
import type { BeamLoadMarker, BeamPreviewData, BeamSupport } from "../types/beam";
import type { ResultViewSettings } from "../types/structure";
import { buildBeamSpanDimensionLegendRows, buildBeamSpanDimensionSegments, formatBeamDimensionLength } from "../lib/beam-span-dimensions";
import { formatEngineeringValue } from "../lib/engineering-format";
import { summaryMetricLabel } from "../lib/result-metrics";
import { STRUCTURE_STATE_COLORS, STRUCTURE_VISUAL_STROKES } from "../lib/structure-visual-tokens";
import { useCanvasDrag } from "../hooks/useModelCanvasZoom";

interface BeamPreviewProps {
  beam?: BeamPreviewData | null;
  compact?: boolean;
  viewSettings: ResultViewSettings;
  onChangeViewSettings: (settings: ResultViewSettings) => void;
}

type BeamLoadArrow = BeamLoadMarker & {
  svgX: number;
  y1: number;
  y2: number;
  labelY: number;
};

type BeamDistributedLoadBand = {
  key: string;
  type: "uniform" | "linear";
  startX: number;
  endX: number;
  labelX: number;
  guideY: number;
  labelY: number;
  arrowStartY: number;
  arrowEndY: number;
  arrowXs: number[];
  label: string;
};

type BeamSummaryItem = {
  label: string;
  main: ReactNode;
  sub: string;
  highlight?: boolean;
};

const SVG_W = 1000;
const SVG_H = 300;
const BEAM_Y = 150;
const BEAM_LEFT = 80;
const BEAM_RIGHT = 920;
const BEAM_LEN = BEAM_RIGHT - BEAM_LEFT;
const SPAN_MEMBER_LABEL_Y = BEAM_Y + 22;
const PEAK_LABEL_GAP_Y = 30;
const PEAK_LABEL_MIN_Y = 28;
const PEAK_LABEL_MAX_Y = SVG_H - 38;
const NODE_BADGE_OFFSET_X = 10;
const NODE_BADGE_OFFSET_Y = -18;
const DISTRIBUTED_LOAD_GUIDE_STROKE_WIDTH = 1.5;
const DISTRIBUTED_LOAD_ARROW_STROKE_WIDTH = 1.15;
const POINT_LOAD_ARROW_STROKE_WIDTH = 1.9;
const DISTRIBUTED_LOAD_ARROW_MARKER_SIZE = 4.4;
const POINT_LOAD_ARROW_MARKER_SIZE = 6.5;
const BEAM_PREVIEW_AUTO_DEFLECTION_TARGET_PX = 80;
const BEAM_PREVIEW_AUTO_DEFLECTION_TARGET_COMPACT_PX = 64;
const BEAM_PREVIEW_MANUAL_DEFLECTION_SCALE_CAP = 100000;
const svgTextFont = "Inter, Microsoft YaHei, system-ui, sans-serif";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distributedArrowXs(startX: number, endX: number) {
  const width = Math.max(0, endX - startX);
  const arrowCount = Math.max(3, Math.min(30, Math.floor(width / 28) + 1));
  return Array.from({ length: arrowCount }, (_, index) => startX + width * (index / (arrowCount - 1)));
}

function resolveSignedPeakDeflectionMm(beam: BeamPreviewData) {
  const targetX = beam.maxDeflection?.xM;
  if (!Number.isFinite(targetX) || !beam.curve.length) {
    return beam.maxDeflection?.valueMm ?? 0;
  }

  const sortedCurve = beam.curve.slice().sort((a, b) => a.x - b.x);
  let nearest = sortedCurve[0];
  for (const point of sortedCurve) {
    if (Math.abs(point.x - targetX) < Math.abs((nearest?.x ?? 0) - targetX)) {
      nearest = point;
    }
  }

  if (nearest && Math.abs(nearest.x - targetX) < 1e-6) {
    return nearest.vMm;
  }

  let before: BeamPreviewData["curve"][number] | undefined;
  let after: BeamPreviewData["curve"][number] | undefined;
  for (const point of sortedCurve) {
    if (point.x <= targetX) before = point;
    if (!after && point.x >= targetX) after = point;
  }
  if (before && after && after.x !== before.x) {
    const ratio = (targetX - before.x) / (after.x - before.x);
    return before.vMm + (after.vMm - before.vMm) * ratio;
  }

  return nearest?.vMm ?? beam.maxDeflection?.valueMm ?? 0;
}

function placePeakDeflectionLabel(peakPoint: { x: number; y: number }, signedDeflectionMm: number) {
  const preferBelowPeak = signedDeflectionMm < 0 || (Math.abs(signedDeflectionMm) < 1e-9 && peakPoint.y >= BEAM_Y);
  const preferredY = preferBelowPeak ? peakPoint.y + PEAK_LABEL_GAP_Y : peakPoint.y - PEAK_LABEL_GAP_Y;
  const fallbackY = preferBelowPeak ? peakPoint.y - PEAK_LABEL_GAP_Y : peakPoint.y + PEAK_LABEL_GAP_Y;
  const rawY = preferredY >= PEAK_LABEL_MIN_Y && preferredY <= PEAK_LABEL_MAX_Y ? preferredY : fallbackY;
  const y = clamp(rawY, PEAK_LABEL_MIN_Y, PEAK_LABEL_MAX_Y);
  const isBelowPeak = y >= peakPoint.y;
  return {
    x: clamp(peakPoint.x, BEAM_LEFT + 92, BEAM_RIGHT - 92),
    y,
    connectorY: isBelowPeak ? y - 8 : y + 22,
    anchor: peakPoint.x < BEAM_LEFT + 120 ? ("start" as const) : peakPoint.x > BEAM_RIGHT - 120 ? ("end" as const) : ("middle" as const),
  };
}

export function BeamPreview({ beam, compact = false, viewSettings, onChangeViewSettings }: BeamPreviewProps) {
  const { showLoads, showDisplacement, showExtremeLabel, displacementScale: manualDeflectionScale } = viewSettings;
  
  const totalLength = beam?.totalLength || 1;
  const layoutScalePxPerM = BEAM_LEN / totalLength;

  const { canvasScrollRef, isCanvasDragging, handleCanvasPointerDown, handleCanvasPointerMove, finishCanvasDrag, handleCanvasClickCapture } = useCanvasDrag();
  const mapX = useCallback((x: number) => BEAM_LEFT + (x / totalLength) * BEAM_LEN, [totalLength]);
  const maxAbsDeflectionMm = useMemo(() => {
    const vals = (beam?.curve || []).map((p) => Math.abs(p.vMm));
    return Math.max(0, ...vals);
  }, [beam?.curve]);
  const hasDeflection = Boolean(beam?.curve.length) && maxAbsDeflectionMm > 1e-9;
  const autoDeflectionDisplayScale = hasDeflection
    ? Math.max(1, Math.round(Math.min(
        (compact ? BEAM_PREVIEW_AUTO_DEFLECTION_TARGET_COMPACT_PX : BEAM_PREVIEW_AUTO_DEFLECTION_TARGET_PX) / ((maxAbsDeflectionMm / 1000.0) * layoutScalePxPerM),
        BEAM_PREVIEW_MANUAL_DEFLECTION_SCALE_CAP,
      )))
    : 0;
  const deflectionDisplayScaleMax = hasDeflection
    ? Math.max(10, Math.ceil(Math.min(Math.max(autoDeflectionDisplayScale * 2, autoDeflectionDisplayScale, 10), BEAM_PREVIEW_MANUAL_DEFLECTION_SCALE_CAP) / 10) * 10)
    : 10;
  const deflectionDisplayScale = hasDeflection
    ? clamp(manualDeflectionScale ?? autoDeflectionDisplayScale, 1, deflectionDisplayScaleMax)
    : 0;
  const showDisplacementLayer = showDisplacement && hasDeflection;
  const showExtremeDeflectionLabel = showDisplacementLayer && showExtremeLabel;
  const mapY = useCallback((vMm: number) => BEAM_Y - (vMm / 1000.0) * deflectionDisplayScale * layoutScalePxPerM, [deflectionDisplayScale, layoutScalePxPerM]);

  const curvePoints = useMemo(() => {
    return (beam?.curve || [])
      .map((p) => `${mapX(p.x).toFixed(1)},${mapY(p.vMm).toFixed(1)}`)
      .join(" ");
  }, [beam?.curve, mapX, mapY]);

  const loadArrows = useMemo(() => {
    return (beam?.loads || []).filter((load) => load.type === "point").map((load): BeamLoadArrow => {
      const x = mapX(load.x);
      const mag = load.intensityKnPerM ?? load.intensityKn ?? 1;
      const len = 30 + Math.min(44, Math.abs(mag) * 1.5);
      const isUpward = mag < 0;
      return {
        ...load,
        svgX: x,
        y1: isUpward ? BEAM_Y + len : BEAM_Y - len,
        y2: BEAM_Y,
        labelY: isUpward ? BEAM_Y + len + 16 : BEAM_Y - len - 8,
      };
    });
  }, [beam?.loads, mapX]);

  const distributedLoadBands = useMemo(() => {
    const loads = beam?.loads ?? [];
    const bands: BeamDistributedLoadBand[] = [];
    const uniformLoads = loads.filter((load) => load.type === "uniform");
    const linearLoads = loads.filter((load) => load.type === "linear");

    uniformLoads.forEach((load, index) => {
      const startX = mapX(load.startX ?? Math.max(0, load.x - (load.length ?? totalLength) / 2));
      const endX = mapX(load.endX ?? Math.min(totalLength, load.x + (load.length ?? totalLength) / 2));
      const intensity = load.intensityKnPerM ?? 0;
      const downward = intensity >= 0;
      const guideY = downward ? BEAM_Y - 70 : BEAM_Y + 70;
      bands.push({
        key: `uniform-${index}`,
        type: "uniform",
        startX,
        endX,
        labelX: (startX + endX) / 2,
        guideY,
        labelY: downward ? guideY - 10 : guideY + 18,
        arrowStartY: downward ? guideY + 5 : guideY - 5,
        arrowEndY: downward ? BEAM_Y - 8 : BEAM_Y + 8,
        arrowXs: distributedArrowXs(startX, endX),
        label: `q=${Math.abs(intensity).toFixed(1)} kN/m`,
      });
    });

    if (linearLoads.length) {
      const grouped = new Map<string, BeamLoadMarker[]>();
      linearLoads.forEach((load) => {
        const key = `${load.startX ?? load.x}:${load.endX ?? load.x}`;
        grouped.set(key, [...(grouped.get(key) ?? []), load]);
      });
      Array.from(grouped.values()).forEach((group, index) => {
        const sortedGroup = group.slice().sort((a, b) => a.x - b.x);
        const first = sortedGroup[0];
        const last = sortedGroup[sortedGroup.length - 1] ?? first;
        const startX = mapX(first?.startX ?? first?.x ?? 0);
        const endX = mapX(first?.endX ?? last?.x ?? totalLength);
        const averageIntensity = sortedGroup.reduce((sum, load) => sum + (load.intensityKnPerM ?? 0), 0) / Math.max(1, sortedGroup.length);
        const downward = averageIntensity >= 0;
        const guideY = downward ? BEAM_Y - (uniformLoads.length ? 52 : 70) : BEAM_Y + (uniformLoads.length ? 52 : 70);
        bands.push({
          key: `linear-${index}`,
          type: "linear",
          startX,
          endX,
          labelX: (startX + endX) / 2,
          guideY,
          labelY: downward ? guideY - 10 : guideY + 18,
          arrowStartY: downward ? guideY + 5 : guideY - 5,
          arrowEndY: downward ? BEAM_Y - 8 : BEAM_Y + 8,
          arrowXs: distributedArrowXs(startX, endX),
          label: `q=${Math.abs(first?.intensityKnPerM ?? 0).toFixed(1)}→${Math.abs(last?.intensityKnPerM ?? 0).toFixed(1)} kN/m`,
        });
      });
    }

    return bands;
  }, [beam, mapX, totalLength]);

  const spanDimensions = useMemo(
    () => buildBeamSpanDimensionSegments(beam?.spans ?? [], totalLength, BEAM_LEFT, BEAM_RIGHT, {
      memberIds: beam?.spanIds,
      nodeIds: beam?.nodes?.map((node, index) => node.id ?? `${index + 1}`),
    }),
    [beam?.nodes, beam?.spanIds, beam?.spans, totalLength],
  );
  const dimensionLegendRows = useMemo(
    () => beam ? [`梁长=${formatBeamDimensionLength(totalLength)}`, ...buildBeamSpanDimensionLegendRows(spanDimensions, compact ? 310 : 420, compact ? 10 : 12)] : [],
    [beam, compact, spanDimensions, totalLength],
  );

  const supportLabelByIndex = useMemo(
    () => new Map((beam?.supports || []).map((support, index) => [index, support.label || `S${index + 1}`])),
    [beam?.supports],
  );
  const reactionBadges = (beam?.reactions || []).map((r, i) => ({
    label: r.supportId ?? supportLabelByIndex.get(i) ?? `S${i + 1}`,
    val: `${Math.abs(r.valueKn ?? 0).toFixed(2)} kN`,
  }));
  const maxDeflectionLabel = summaryMetricLabel("beam", "max_deflection", "最大挠度");
  const signedPeakDeflectionMm = beam?.maxDeflection ? resolveSignedPeakDeflectionMm(beam) : 0;
  const peakPoint = beam?.maxDeflection
    ? {
        x: mapX(beam.maxDeflection.xM),
        y: mapY(signedPeakDeflectionMm),
      }
    : null;
  const peakLabel = peakPoint ? placePeakDeflectionLabel(peakPoint, signedPeakDeflectionMm) : null;

  if (!beam) {
    return (
      <GlassCard className={`flex items-center justify-center border-dashed border-primary/10 ${compact ? "h-40 sm:h-48" : "h-48 sm:h-52"}`}>
        <div className="text-center">
          <p className="text-sm font-medium opacity-50">运行计算后将显示梁系受力变形</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="overflow-hidden">
      <div className={`flex gap-3 border-b border-slate-200/70 px-4 py-4 sm:px-5 dark:border-white/5 ${compact ? "flex-col items-start" : "flex-wrap items-start justify-between"}`}>
        <div className="min-w-0">
          <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>受力变形</h3>
          {showDisplacementLayer ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              <span>位移倍率</span>
              <span className="font-mono text-[11px] font-semibold text-sky-600 dark:text-sky-300">{deflectionDisplayScale}×</span>
              <input
                type="range"
                name="beam-deflection-display-scale"
                min={1}
                max={deflectionDisplayScaleMax}
                step={1}
                value={deflectionDisplayScale}
                onChange={(event) => onChangeViewSettings({ ...viewSettings, displacementScale: Number(event.currentTarget.value) })}
                className="result-preview-scale-slider w-28 sm:w-36"
                aria-label="梁系挠度显示放大倍率"
              />
              <button
                type="button"
                onClick={() => onChangeViewSettings({ ...viewSettings, displacementScale: null })}
                className={`h-6 rounded-md border px-2 text-[10px] font-semibold transition-colors ${
                  manualDeflectionScale === null
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
              { key: "loads", label: "荷载", active: showLoads, onClick: () => onChangeViewSettings({ ...viewSettings, showLoads: !showLoads }) },
              { key: "displacement", label: "位移", active: showDisplacement && hasDeflection, onClick: () => onChangeViewSettings({ ...viewSettings, showDisplacement: !showDisplacement }), disabled: !hasDeflection },
              { key: "extreme", label: "极值", active: showExtremeLabel, onClick: () => onChangeViewSettings({ ...viewSettings, showExtremeLabel: !showExtremeLabel }), disabled: !showDisplacementLayer },
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
              {beam.beamTypeLabel}
            </span>
            <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-300">
              {beam.loadTypeLabel}
            </span>
          </div>
        </div>
      </div>

      {/* SVG 工程预览图 */}
      <div
        ref={canvasScrollRef}
        className={`structure-preview-surface relative overflow-auto ${isCanvasDragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handleCanvasPointerMove}
        onPointerUp={finishCanvasDrag}
        onPointerCancel={finishCanvasDrag}
        onClickCapture={handleCanvasClickCapture}
      >
        <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className={`block w-full ${compact ? "h-[180px] sm:h-[240px]" : "h-[220px] sm:h-[260px]"}`}>
          <defs>
            <linearGradient id="beamGrad" x1="0%" x2="100%">
              <stop offset="0%" stopColor="var(--structure-preview-base-start)" stopOpacity="0.95" />
              <stop offset="100%" stopColor="var(--structure-preview-base-end)" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="curveGrad" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--structure-preview-deformed-start)" stopOpacity="0.8" />
              <stop offset="100%" stopColor="var(--structure-preview-deformed-start)" stopOpacity="0" />
            </linearGradient>
            <marker
              id="beamPreviewDistributedLoadArrow"
              viewBox="0 0 8 8"
              markerWidth={DISTRIBUTED_LOAD_ARROW_MARKER_SIZE}
              markerHeight={DISTRIBUTED_LOAD_ARROW_MARKER_SIZE}
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="var(--structure-preview-load)" />
            </marker>
            <marker
              id="beamPreviewPointLoadArrow"
              viewBox="0 0 8 8"
              markerWidth={POINT_LOAD_ARROW_MARKER_SIZE}
              markerHeight={POINT_LOAD_ARROW_MARKER_SIZE}
              refX="7"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 z" fill="var(--structure-preview-load)" />
            </marker>
          </defs>

          <g fill="var(--structure-preview-label)" stroke="var(--structure-preview-text-halo)" strokeWidth="3" paintOrder="stroke" fontFamily={svgTextFont}>
            {dimensionLegendRows.map((row, index) => (
              <text key={`beam-preview-dimension-${index}`} x="32" y={28 + index * 15} fontSize={compact ? "10" : "12"} fontWeight="600">
                {row}
              </text>
            ))}
          </g>

          {/* 主梁线 */}
          <line x1={BEAM_LEFT} y1={BEAM_Y} x2={BEAM_RIGHT} y2={BEAM_Y}
            stroke="url(#beamGrad)" strokeWidth={STRUCTURE_VISUAL_STROKES.previewMember} strokeLinecap="round" />

          <g fill="var(--structure-preview-label)" stroke="var(--structure-preview-text-halo)" strokeWidth="3" paintOrder="stroke" fontFamily={svgTextFont}>
            {spanDimensions.map((dimension) => {
              if (!dimension.label) return null;
              const midX = (dimension.start + dimension.end) / 2;
              return (
                <text key={`beam-preview-span-${dimension.index}`} x={midX} y={SPAN_MEMBER_LABEL_Y} textAnchor="middle" fontSize={compact ? "10" : "12"} fontWeight="700">
                  {dimension.label}
                </text>
              );
            })}
          </g>

          {/* 支座 */}
          {(beam.supports || []).map((s: BeamSupport, i) => {
            const sx = mapX(s.x);
            return s.type === "fixed" ? (
              <g key={i}>
                <rect x={sx - 14} y={BEAM_Y - 5} width="28" height="44" rx="3"
                  fill="var(--structure-preview-support-fill)" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />
              </g>
            ) : s.type === "free" ? (
              <g key={i}>
                <circle cx={sx} cy={BEAM_Y} r="7" fill="none" stroke="var(--structure-preview-support-stroke)" strokeDasharray="3 3" />
              </g>
            ) : (
              <g key={i}>
                <polygon points={`${sx - 16},${BEAM_Y + 26} ${sx + 16},${BEAM_Y + 26} ${sx},${BEAM_Y + 2}`}
                  fill="var(--structure-preview-support-fill)" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />
                <line x1={sx - 18} y1={BEAM_Y + 30} x2={sx + 18} y2={BEAM_Y + 30}
                  stroke="var(--structure-preview-support-line)" strokeWidth="2" />
                {s.type === "roller" ? (
                  <>
                    <circle cx={sx - 9} cy={BEAM_Y + 36} r="3" fill="none" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />
                    <circle cx={sx + 9} cy={BEAM_Y + 36} r="3" fill="none" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />
                  </>
                ) : null}
              </g>
            );
          })}

          {/* 节点圆点 */}
          {(beam.nodes || []).map((n, i) => {
            const x = mapX(n.x);
            const badgeX = x + NODE_BADGE_OFFSET_X;
            const badgeY = BEAM_Y + NODE_BADGE_OFFSET_Y;
            return (
              <g key={i}>
                <circle cx={x} cy={BEAM_Y} r="4" fill={n.support ? "var(--structure-preview-node)" : "var(--structure-preview-guide)"} />
                <circle cx={badgeX} cy={badgeY} r={compact ? "7" : "8"} fill="var(--structure-preview-badge-fill)" stroke="var(--structure-preview-badge-stroke)" strokeWidth="1.3" />
                <text x={badgeX} y={badgeY} fill="var(--structure-preview-badge-text)" textAnchor="middle" dominantBaseline="middle" fontSize={compact ? "8" : "9"} fontWeight="700" fontFamily={svgTextFont}>
                  {n.id ?? `${i + 1}`}
                </text>
              </g>
            );
          })}

          {/* 分布荷载 */}
          {showLoads && distributedLoadBands.map((band) => (
            <g key={band.key}>
              <line x1={band.startX} y1={band.guideY} x2={band.endX} y2={band.guideY} stroke="var(--structure-preview-load)" strokeWidth={DISTRIBUTED_LOAD_GUIDE_STROKE_WIDTH} opacity="0.86" />
              {band.arrowXs.map((x, index) => (
                <line
                  key={`${band.key}-${index}`}
                  x1={x}
                  y1={band.arrowStartY}
                  x2={x}
                  y2={band.arrowEndY}
                  stroke="var(--structure-preview-load)"
                  strokeWidth={DISTRIBUTED_LOAD_ARROW_STROKE_WIDTH}
                  markerEnd="url(#beamPreviewDistributedLoadArrow)"
                />
              ))}
              <text x={band.labelX} y={band.labelY} fill="var(--structure-preview-label)" textAnchor="middle" fontSize="11"
                stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke" fontWeight="500" fontFamily={svgTextFont}>
                {band.label}
              </text>
            </g>
          ))}

          {/* 集中荷载箭头 */}
          {showLoads && loadArrows.map((load, i) => (
            <g key={i}>
              <line x1={load.svgX} y1={load.y1} x2={load.svgX} y2={load.y2}
                stroke="var(--structure-preview-load)" strokeWidth={POINT_LOAD_ARROW_STROKE_WIDTH} markerEnd="url(#beamPreviewPointLoadArrow)" />
              {load.type === "point" ? (
                <text x={load.svgX + (i % 2 === 0 ? -8 : 8)} y={load.labelY} fill="var(--structure-preview-label)" textAnchor={i % 2 === 0 ? "end" : "start"} fontSize="11"
                  stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke" fontFamily={svgTextFont}>
                  {`P=${Math.abs(load.intensityKn || 0).toFixed(1)}kN`}
                </text>
              ) : null}
            </g>
          ))}

          {/* 变形曲线 */}
          {showDisplacementLayer && curvePoints && (
            <polyline points={curvePoints}
              fill="none" stroke="var(--structure-preview-deformed-start)" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* 最大挠度标注点 */}
          {showExtremeDeflectionLabel && beam.maxDeflection && peakPoint && peakLabel && (
            <g>
              <line
                x1={peakPoint.x}
                y1={peakPoint.y}
                x2={peakLabel.x}
                y2={peakLabel.connectorY}
                stroke="var(--structure-preview-peak-label)"
                strokeOpacity="0.55"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <circle
                cx={peakPoint.x}
                cy={peakPoint.y}
                r="5" fill={STRUCTURE_STATE_COLORS.peakDot} stroke={STRUCTURE_STATE_COLORS.peakDotStroke} strokeWidth="1.5"
              />
              <text
                x={peakLabel.x}
                y={peakLabel.y}
                fill="var(--structure-preview-peak-label)"
                stroke="var(--structure-preview-text-halo)"
                strokeWidth="4"
                paintOrder="stroke"
                textAnchor={peakLabel.anchor}
                fontSize="11"
                fontWeight="600"
                fontFamily={svgTextFont}
              >
                <tspan x={peakLabel.x} dy="0">最大挠度 {formatEngineeringValue(Math.abs(beam.maxDeflection.valueMm), "mm")}</tspan>
                <tspan x={peakLabel.x} dy="15">距左端 {beam.maxDeflection.xM.toFixed(2)} m</tspan>
              </text>
            </g>
          )}

          {/* 参考基线 */}
          <line x1={BEAM_LEFT} y1={BEAM_Y + 80} x2={BEAM_RIGHT} y2={BEAM_Y + 80}
            stroke="var(--structure-preview-guide)" strokeOpacity="0.45" strokeDasharray="6 6" />
        </svg>
      </div>

      {/* 底部数据摘要 */}
      <div className="grid grid-cols-1 gap-px border-t border-slate-200/70 bg-slate-200/70 dark:border-white/5 dark:bg-white/5 md:grid-cols-3">
        {([
          {
            label: "模型摘要",
            main: `${(beam.supports || []).length} 支座 · ${(beam.loads || []).length} 荷载组`,
            sub: `${beam.beamTypeLabel} · ${beam.loadTypeLabel}`,
          },
          {
            label: "支座反力",
            main: reactionBadges.length ? (
              <div className="flex flex-wrap gap-2">
                {reactionBadges.map((reaction) => (
                  <span
                    key={reaction.label}
                    className="inline-flex items-center rounded-lg border border-white/10 bg-white/5 px-3 py-1 font-mono text-sm font-bold text-foreground"
                  >
                    {reaction.label} {reaction.val}
                  </span>
                ))}
              </div>
            ) : (
              "—"
            ),
            sub: "竖向反力（kN）",
          },
          {
            label: maxDeflectionLabel,
            main: formatEngineeringValue(Math.abs(beam.maxDeflection?.valueMm ?? 0), "mm"),
            sub: `距左端 ${(beam.maxDeflection?.xM ?? 0).toFixed(2)} m`,
            highlight: true,
          },
        ] satisfies BeamSummaryItem[]).map((item, i) => (
          <div key={i} className={`structure-preview-summary-cell ${compact ? "px-4 py-3" : "px-5 py-4"}`}>
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
