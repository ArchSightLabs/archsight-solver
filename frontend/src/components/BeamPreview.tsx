import { useCallback, useMemo, type ReactNode } from "react";
import { GlassCard } from "./ui/GlassCard";
import type { BeamLoadMarker, BeamPreviewData, BeamSupport } from "../types/beam";

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
const svgTextFont = "Inter, Microsoft YaHei, system-ui, sans-serif";

function supportTypeLabel(type: string) {
  if (type === "fixed") return "固结";
  if (type === "roller") return "滚动";
  if (type === "free") return "自由端";
  return "铰支";
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
    return (beam?.loads || []).map((load): BeamLoadArrow => {
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

  const distributedLoadLabels = useMemo(() => {
    const loads = beam?.loads ?? [];
    const labels: Array<{ x: number; y: number; text: string }> = [];
    const uniformLoads = loads.filter((load) => load.type === "uniform");
    const linearLoads = loads.filter((load) => load.type === "linear");

    if (uniformLoads.length) {
      const positions = uniformLoads.map((load) => mapX(load.x));
      labels.push({
        x: positions.reduce((sum, value) => sum + value, 0) / positions.length,
        y: BEAM_Y - 106,
        text: `沿梁均布荷载 ${Math.abs(uniformLoads[0]?.intensityKnPerM || 0).toFixed(1)} 千牛/米`,
      });
    }

    if (linearLoads.length) {
      const positions = linearLoads.map((load) => mapX(load.x));
      labels.push({
        x: positions.reduce((sum, value) => sum + value, 0) / positions.length,
        y: uniformLoads.length ? BEAM_Y - 88 : BEAM_Y - 106,
        text: `沿梁线性分布荷载 ${Math.abs(linearLoads[0]?.intensityKnPerM || 0).toFixed(1)} → ${Math.abs(linearLoads[linearLoads.length - 1]?.intensityKnPerM || 0).toFixed(1)} 千牛/米`,
      });
    }

    return labels;
  }, [beam, mapX]);

  const reactionBadges = (beam?.reactions || []).map((r, i) => ({
    label: `第 ${i + 1} 支座`,
    val: `${Math.abs(r.valueKn ?? 0).toFixed(2)} 千牛`,
  }));
  const peakPoint = beam?.maxDeflection
    ? {
        x: mapX(beam.maxDeflection.xM),
        y: mapY(beam.maxDeflection.valueMm),
      }
    : null;
  const peakLabel = peakPoint
    ? {
        x: peakPoint.x < SVG_W / 2 ? peakPoint.x + 34 : peakPoint.x - 34,
        y: peakPoint.y < BEAM_Y ? peakPoint.y + 32 : peakPoint.y - 26,
        anchor: peakPoint.x < SVG_W / 2 ? ("start" as const) : ("end" as const),
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

          {/* 梁长标注 */}
          <text x="32" y="28" fill="var(--structure-preview-label)" fontSize={compact ? "10" : "12"} fontFamily="Fira Code">
            梁长 = {totalLength.toFixed(2)} 米
          </text>

          {/* 主梁线 */}
          <line x1={BEAM_LEFT} y1={BEAM_Y} x2={BEAM_RIGHT} y2={BEAM_Y}
            stroke="url(#beamGrad)" strokeWidth="7" strokeLinecap="round" />

          {/* 支座 */}
          {(beam.supports || []).map((s: BeamSupport, i) => {
            const sx = mapX(s.x);
            const label = `${s.label ?? `S${i + 1}`} ${supportTypeLabel(s.type)}`;
            return s.type === "fixed" ? (
              <g key={i}>
                <rect x={sx - 14} y={BEAM_Y - 5} width="28" height="44" rx="3"
                  fill="var(--structure-preview-support-fill)" stroke="var(--structure-preview-support-stroke)" strokeWidth="1" />
                <text x={sx} y={BEAM_Y + 56} fill="var(--structure-preview-label)" textAnchor="middle" fontSize="11"
                  fontFamily={svgTextFont}>{label}</text>
              </g>
            ) : s.type === "free" ? (
              <g key={i}>
                <circle cx={sx} cy={BEAM_Y} r="7" fill="none" stroke="var(--structure-preview-support-stroke)" strokeDasharray="3 3" />
                <text x={sx} y={BEAM_Y + 34} fill="var(--structure-preview-label)" textAnchor="middle" fontSize="11"
                  fontFamily={svgTextFont}>{label}</text>
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
                <text x={sx} y={BEAM_Y + 44} fill="var(--structure-preview-label)" textAnchor="middle" fontSize="11"
                  fontFamily={svgTextFont}>{label}</text>
              </g>
            );
          })}

          {/* 节点圆点 */}
          {(beam.nodes || []).map((n, i) => (
            <circle key={i} cx={mapX(n.x)} cy={BEAM_Y} r="4"
              fill={n.support ? "var(--structure-preview-node)" : "var(--structure-preview-guide)"} />
          ))}

          {/* 荷载箭头 */}
          {loadArrows.map((load, i) => (
            <g key={i}>
              <line x1={load.svgX} y1={load.y1} x2={load.svgX} y2={load.y2}
                stroke="var(--structure-preview-load)" strokeWidth="2" markerEnd="url(#arrowLoad)" />
              {load.type === "point" ? (
                <text x={load.svgX + (i % 2 === 0 ? -8 : 8)} y={load.labelY} fill="var(--structure-preview-label)" textAnchor={i % 2 === 0 ? "end" : "start"} fontSize="11"
                  stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke" fontFamily={svgTextFont}>
                  {`P = ${Math.abs(load.intensityKn || 0).toFixed(1)} 千牛`}
                </text>
              ) : null}
            </g>
          ))}

          {distributedLoadLabels.map((distributedLoadLabel) => (
            <text key={distributedLoadLabel.text} x={distributedLoadLabel.x} y={distributedLoadLabel.y} fill="var(--structure-preview-label)" textAnchor="middle" fontSize="11"
              stroke="var(--structure-preview-text-halo)" strokeWidth="4" paintOrder="stroke" fontWeight="500" fontFamily={svgTextFont}>
              {distributedLoadLabel.text}
            </text>
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
                y2={peakLabel.y - 8}
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
                <tspan x={peakLabel.x} dy="0">最大挠度 {Math.abs(beam.maxDeflection.valueMm).toFixed(3)} 毫米</tspan>
                <tspan x={peakLabel.x} dy="15">距左端 {beam.maxDeflection.xM.toFixed(2)} 米</tspan>
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
            sub: "竖向反力（千牛）",
          },
          {
            label: "挠度峰值",
            main: `${Math.abs(beam.maxDeflection?.valueMm ?? 0).toFixed(4)} 毫米`,
            sub: `距左端 ${(beam.maxDeflection?.xM ?? 0).toFixed(2)} 米`,
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
