import { useCallback, useMemo, type ReactNode } from "react";
import { GlassCard } from "./ui/GlassCard";
import type { BeamLoadMarker, BeamPreviewData, BeamSupport } from "../types/beam";
import { buildBeamSpanDimensionLegendRows, buildBeamSpanDimensionSegments, formatBeamDimensionLength } from "../lib/beam-span-dimensions";
import { formatEngineeringValue } from "../lib/engineering-format";

interface BeamPreviewProps {
  beam?: BeamPreviewData | null;
  compact?: boolean;
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
const PEAK_LABEL_Y = 46;
const SPAN_MEMBER_LABEL_Y = BEAM_Y + 22;
const svgTextFont = "Inter, Microsoft YaHei, system-ui, sans-serif";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function distributedArrowXs(startX: number, endX: number) {
  const width = Math.max(0, endX - startX);
  const arrowCount = Math.max(3, Math.min(30, Math.floor(width / 28)));
  return Array.from({ length: arrowCount }, (_, index) => startX + width * ((index + 0.5) / arrowCount));
}

export function BeamPreview({ beam, compact = false }: BeamPreviewProps) {
  const totalLength = beam?.totalLength || 1;

  const mapX = useCallback((x: number) => BEAM_LEFT + (x / totalLength) * BEAM_LEN, [totalLength]);
  const maxDeflMm = useMemo(() => {
    const vals = (beam?.curve || []).map((p) => Math.abs(p.vMm));
    return Math.max(1, ...vals);
  }, [beam?.curve]);
  const mapY = useCallback((vMm: number) => BEAM_Y - (vMm / maxDeflMm) * 80, [maxDeflMm]);

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
  const peakPoint = beam?.maxDeflection
    ? {
        x: mapX(beam.maxDeflection.xM),
        y: mapY(beam.maxDeflection.valueMm),
      }
    : null;
  const peakLabel = peakPoint
    ? {
        x: clamp(peakPoint.x, BEAM_LEFT + 92, BEAM_RIGHT - 92),
        y: PEAK_LABEL_Y,
        anchor: peakPoint.x < BEAM_LEFT + 120 ? ("start" as const) : peakPoint.x > BEAM_RIGHT - 120 ? ("end" as const) : ("middle" as const),
      }
    : null;

  if (!beam) {
    return (
      <GlassCard className={`flex items-center justify-center border-dashed border-primary/10 ${compact ? "h-40 sm:h-48" : "h-48 sm:h-52"}`}>
        <div className="text-center">
          <p className="text-sm font-medium opacity-50">运行计算后将显示梁体预览</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="overflow-hidden">
      <div className={`flex gap-3 border-b border-slate-200/70 px-4 py-4 sm:px-5 dark:border-white/5 ${compact ? "flex-col items-start" : "flex-wrap items-center justify-between"}`}>
        <div className="min-w-0">
          <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>结构预览</h3>
        </div>
        <div className={`flex flex-wrap gap-2 ${compact ? "w-full" : ""}`}>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            {beam.beamTypeLabel}
          </span>
          <span className="rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-[10px] font-bold text-sky-700 dark:border-sky-400/20 dark:bg-sky-500/10 dark:text-sky-300">
            {beam.loadTypeLabel}
          </span>
        </div>
      </div>

      {/* SVG 工程预览图 */}
      <div className="structure-preview-surface relative">
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
            <marker id="arrowLoad" viewBox="0 0 8 8" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto">
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
            stroke="url(#beamGrad)" strokeWidth="7" strokeLinecap="round" />

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
            return (
              <g key={i}>
                <circle cx={x} cy={BEAM_Y} r="4" fill={n.support ? "var(--structure-preview-node)" : "var(--structure-preview-guide)"} />
                <circle cx={x + 12} cy={BEAM_Y - 18} r={compact ? "7" : "8"} fill="var(--model-badge-fill)" stroke="var(--model-badge-stroke)" strokeWidth="1.3" />
                <text x={x + 12} y={BEAM_Y - 18} fill="var(--model-badge-text)" textAnchor="middle" dominantBaseline="middle" fontSize={compact ? "8" : "9"} fontWeight="700" fontFamily={svgTextFont}>
                  {n.id ?? `${i + 1}`}
                </text>
              </g>
            );
          })}

          {/* 分布荷载 */}
          {distributedLoadBands.map((band) => (
            <g key={band.key}>
              <line x1={band.startX} y1={band.guideY} x2={band.endX} y2={band.guideY} stroke="var(--structure-preview-load)" strokeWidth="1.7" opacity="0.86" />
              {band.arrowXs.map((x, index) => (
                <line key={`${band.key}-${index}`} x1={x} y1={band.arrowStartY} x2={x} y2={band.arrowEndY} stroke="var(--structure-preview-load)" strokeWidth="1.8" markerEnd="url(#arrowLoad)" />
              ))}
              <text x={band.labelX} y={band.labelY} fill="var(--structure-preview-label)" textAnchor="middle" fontSize="11"
                stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke" fontWeight="500" fontFamily={svgTextFont}>
                {band.label}
              </text>
            </g>
          ))}

          {/* 集中荷载箭头 */}
          {loadArrows.map((load, i) => (
            <g key={i}>
              <line x1={load.svgX} y1={load.y1} x2={load.svgX} y2={load.y2}
                stroke="var(--structure-preview-load)" strokeWidth="2" markerEnd="url(#arrowLoad)" />
              {load.type === "point" ? (
                <text x={load.svgX + (i % 2 === 0 ? -8 : 8)} y={load.labelY} fill="var(--structure-preview-label)" textAnchor={i % 2 === 0 ? "end" : "start"} fontSize="11"
                  stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke" fontFamily={svgTextFont}>
                  {`P=${Math.abs(load.intensityKn || 0).toFixed(1)}kN`}
                </text>
              ) : null}
            </g>
          ))}

          {/* 变形曲线 */}
          {curvePoints && (
            <polyline points={curvePoints}
              fill="none" stroke="var(--structure-preview-deformed-start)" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round" />
          )}

          {/* 最大挠度标注点 */}
          {beam.maxDeflection && peakPoint && peakLabel && (
            <g>
              <line
                x1={peakPoint.x}
                y1={peakPoint.y}
                x2={peakLabel.x}
                y2={peakLabel.y + 22}
                stroke="var(--structure-preview-peak-label)"
                strokeOpacity="0.55"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <circle
                cx={peakPoint.x}
                cy={peakPoint.y}
                r="5" fill="#d97706" stroke="#ffedd5" strokeWidth="1.5"
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
            label: "挠度峰值",
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
