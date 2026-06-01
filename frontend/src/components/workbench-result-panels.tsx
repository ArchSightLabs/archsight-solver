import { lazy, Suspense, useState } from "react";
import { LineChart, Network, Triangle } from "lucide-react";
import { GlassCard } from "./ui/GlassCard";
import type { BeamCalculationResults } from "../types/beam";
import type { AnalysisMode } from "../types/structure";
import { analysisVocabulary } from "../lib/analysis-vocabulary";
import { formatEngineeringValue } from "../lib/engineering-format";
import type { DataCurveOption, SummaryRow } from "./workbench-result-metrics";

const BeamChart = lazy(() => import("./BeamChart").then((module) => ({ default: module.BeamChart })));

type ReportOptionSelectProps = {
  id: string;
  name: string;
  label: string;
  hint?: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
};

export function ReportOptionSelect({ id, name, label, hint, value, options, onChange }: ReportOptionSelectProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">{label}</span>
      <select
        id={id}
        name={name}
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition-colors hover:border-sky-300 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1 block text-[10px] leading-snug text-slate-500 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function EmptyResult({ mode, compact = false }: { mode: AnalysisMode; compact?: boolean }) {
  return (
    <GlassCard className={`flex items-center justify-center border-2 border-dashed border-primary/10 bg-primary/[0.01] ${compact ? "min-h-[220px]" : "min-h-[280px] sm:min-h-[460px]"}`}>
      <div className="text-center">
        <div className={`mx-auto flex items-center justify-center rounded-lg border border-primary/10 bg-primary/10 ${compact ? "mb-4 h-14 w-14" : "mb-6 h-16 w-16"}`}>
          {mode === "frame" ? (
            <Network className={compact ? "h-7 w-7 text-primary" : "h-8 w-8 text-primary"} />
          ) : mode === "truss" ? (
            <Triangle className={compact ? "h-7 w-7 text-primary" : "h-8 w-8 text-primary"} />
          ) : (
            <LineChart className={compact ? "h-7 w-7 text-primary" : "h-8 w-8 text-primary"} />
          )}
        </div>
        <h3 className={`${compact ? "mb-1 text-xl" : "mb-2 text-2xl"} font-black tracking-tight`}>
          {analysisVocabulary(mode).waitingLabel}
        </h3>
      </div>
    </GlassCard>
  );
}

export function SummaryGrid({
  rows,
  compact = false,
}: {
  rows: SummaryRow[];
  compact?: boolean;
}) {
  return (
    <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
      <h3 className={`${compact ? "mb-3 text-lg" : "mb-4 text-xl"} font-black tracking-tight`}>结果摘要</h3>
      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"}`}>
        {rows.map((row) => (
          <div key={row.label} className={`rounded-lg border border-white/10 bg-white/[0.03] ${compact ? "p-3" : "p-4"}`}>
            <div className={`font-sans font-semibold leading-none text-slate-600 dark:text-slate-300 ${compact ? "mb-1 text-[10px]" : "mb-2 text-[11px]"}`}>
              {row.label}
            </div>
            <div className={`break-words font-mono font-bold text-primary ${compact ? "text-sm" : "text-lg"}`}>{row.value}</div>
            {row.detail ? (
              <div className={`mt-1.5 leading-snug text-slate-600 dark:text-slate-300/75 ${compact ? "text-[10px]" : "text-xs"}`}>{row.detail}</div>
            ) : null}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

export function LoadingPanel({ compact = false }: { compact?: boolean }) {
  return (
    <GlassCard className={`flex items-center justify-center border-dashed border-primary/10 bg-primary/[0.01] ${compact ? "min-h-[220px]" : "min-h-[280px] sm:min-h-[460px]"}`}>
      <div className="text-center">
        <div className="mx-auto mb-4 h-14 w-14 animate-pulse rounded-lg border border-primary/10 bg-primary/10" />
        <h3 className="text-xl font-black tracking-tight">图表加载中</h3>
      </div>
    </GlassCard>
  );
}

export function DataCurvePanel({ options, compact = false }: { options: DataCurveOption[]; compact?: boolean }) {
  const [selectedId, setSelectedId] = useState("all");
  const effectiveSelectedId = selectedId === "all" || !options.some((option) => option.id === selectedId) ? "all" : selectedId;
  const selected = effectiveSelectedId === "all" ? options[0] : options.find((option) => option.id === effectiveSelectedId) ?? options[0];
  if (!selected) {
    return <LoadingPanel compact={compact} />;
  }
  return (
    <div className="space-y-3">
      <GlassCard className={compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}>
        <div className="flex justify-end">
          <div className={`grid w-full gap-2 sm:w-auto ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`} role="tablist" aria-label="数据曲线类型">
            <button
              type="button"
              role="tab"
              aria-selected={effectiveSelectedId === "all"}
              onClick={() => setSelectedId("all")}
              className={`min-w-0 rounded-lg border px-3 py-2 text-left text-[12px] font-bold transition-colors ${
                effectiveSelectedId === "all"
                  ? "border-slate-300 bg-slate-100 text-slate-950 dark:border-sky-400/40 dark:bg-sky-400/[0.14] dark:text-sky-50"
                  : "border-slate-200/80 bg-white/45 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900/45 dark:text-slate-300 dark:hover:border-sky-400/35 dark:hover:bg-sky-400/10"
              }`}
            >
              <span className="block truncate">全部</span>
            </button>
            {options.map((option) => {
              const active = effectiveSelectedId !== "all" && option.id === selected.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setSelectedId(option.id)}
                  className={`min-w-0 rounded-lg border px-3 py-2 text-left text-[12px] font-bold transition-colors ${
                    active
                      ? "border-slate-300 bg-slate-100 text-slate-950 dark:border-sky-400/40 dark:bg-sky-400/[0.14] dark:text-sky-50"
                      : "border-slate-200/80 bg-white/45 text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900/45 dark:text-slate-300 dark:hover:border-sky-400/35 dark:hover:bg-sky-400/10"
                  }`}
                >
                  <span className="block truncate">{option.title}</span>
                </button>
              );
            })}
          </div>
        </div>
      </GlassCard>
      {effectiveSelectedId === "all" ? (
        <div className={`grid gap-3 ${compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3"}`}>
          {options.map((option) => (
            <Suspense key={option.id} fallback={<LoadingPanel compact={compact} />}>
              <BeamChart
                compact={compact}
                xData={option.xData}
                xLabels={option.xLabels}
                yData={option.yData}
                title={option.title}
                unit={option.unit}
                yLabel={option.yLabel}
                color={option.color}
                xAxisLabel={option.xAxisLabel}
                tooltipXLabel={option.tooltipXLabel}
                valueScale={option.valueScale}
              />
            </Suspense>
          ))}
        </div>
      ) : (
        <Suspense fallback={<LoadingPanel compact={compact} />}>
          <BeamChart
            compact={compact}
            xData={selected.xData}
            xLabels={selected.xLabels}
            yData={selected.yData}
            title={selected.title}
            unit={selected.unit}
            yLabel={selected.yLabel}
            color={selected.color}
            xAxisLabel={selected.xAxisLabel}
            tooltipXLabel={selected.tooltipXLabel}
            valueScale={selected.valueScale}
          />
        </Suspense>
      )}
    </div>
  );
}

type AssumptionSummary = {
  lead: string;
  items: readonly {
    label: string;
    value: string;
  }[];
};

const ASSUMPTION_SUMMARIES: Record<AnalysisMode, AssumptionSummary> = {
  beam: {
    lead: "梁弯曲线弹性静力分析",
    items: [
      { label: "模型", value: "梁单元 · v / θz" },
      { label: "支座", value: "铰/滚约束 v，固结约束 v+θz" },
      { label: "单位", value: "E:GPa · I:cm4 · mm/kN" },
    ],
  },
  frame: {
    lead: "二维平面框架线弹性静力分析",
    items: [
      { label: "模型", value: "框架杆单元 · ux/uy/rz" },
      { label: "内力", value: "弯矩 / 剪力 / 轴力" },
      { label: "单位", value: "E:GPa · A:cm2 · I:cm4" },
    ],
  },
  truss: {
    lead: "二维平面桁架线弹性静力分析",
    items: [
      { label: "模型", value: "桁架杆单元 · ux/uy" },
      { label: "内力", value: "只传轴力，不列弯矩" },
      { label: "单位", value: "E:GPa · A:cm2 · kN/MPa/mm" },
    ],
  },
};

export function AssumptionsPanel({ mode, compact = false }: { mode: AnalysisMode; compact?: boolean }) {
  const summary = ASSUMPTION_SUMMARIES[mode];
  return (
    <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
      <div className={`mb-3 flex flex-wrap items-baseline justify-between gap-2 ${compact ? "" : "sm:mb-4"}`}>
        <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>计算口径</h3>
        <span className="text-[11px] font-semibold text-muted-foreground">{summary.lead}</span>
      </div>
      <div className={`grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-1 md:grid-cols-3"}`}>
        {summary.items.map((item) => (
          <div key={item.label} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5">
            <div className="shrink-0 text-[10px] font-black tracking-widest text-muted-foreground">{item.label}</div>
            <div className="min-w-0 text-right text-xs font-semibold leading-snug text-foreground/75" title={item.value}>
              {item.value}
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

export function BeamBenchmarkPanel({ results, compact = false }: { results: BeamCalculationResults; compact?: boolean }) {
  const payload = results.payload;
  const candidates = [
    {
      title: "简支梁均布荷载",
      matches: payload?.beamType === "simply_supported" && payload?.loadType === "uniform" && payload.spans.length === 1,
      expectedDeflectionMm: payload ? (5 * payload.q * 1000 * Math.pow(payload.spans[0] ?? 0, 4)) / (384 * (payload.E * 1e9) * (payload.I * 1e-8)) * 1000 : 0,
      expectedXM: (payload?.spans[0] ?? 0) / 2,
      equation: "vmax = 5qL^4 / (384EI)",
    },
    {
      title: "悬臂梁均布荷载",
      matches: payload?.beamType === "cantilever" && payload?.loadType === "uniform" && payload.spans.length === 1,
      expectedDeflectionMm: payload ? (payload.q * 1000 * Math.pow(payload.spans[0] ?? 0, 4)) / (8 * (payload.E * 1e9) * (payload.I * 1e-8)) * 1000 : 0,
      expectedXM: payload?.spans[0] ?? 0,
      equation: "vmax = qL^4 / (8EI)",
    },
  ];
  const item = candidates.find((candidate) => candidate.matches);
  if (!item || !results.summary) {
    return (
      <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
        <h3 className={`${compact ? "mb-2 text-lg" : "mb-3 text-xl"} font-black tracking-tight`}>标准算例误差对照</h3>
        <p className="text-xs leading-relaxed text-muted-foreground">
          当前模型不是内置解析对照工况。简支梁/悬臂梁均布荷载会自动显示理论挠度、峰值位置和相对误差。
        </p>
      </GlassCard>
    );
  }
  const actual = results.summary.maxDeflectionMm;
  const errorPercent = item.expectedDeflectionMm > 0 ? Math.abs(actual - item.expectedDeflectionMm) / item.expectedDeflectionMm * 100 : 0;
  return (
    <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
      <h3 className={`${compact ? "mb-3 text-lg" : "mb-4 text-xl"} font-black tracking-tight`}>标准算例误差对照</h3>
      <div className={`grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"}`}>
        {[
          { label: "对照算例", value: item.title, detail: item.equation },
          { label: "解析最大挠度", value: formatEngineeringValue(item.expectedDeflectionMm, "mm"), detail: `理论位置 ${formatEngineeringValue(item.expectedXM, "m")}` },
          { label: "求解器最大挠度", value: formatEngineeringValue(actual, "mm"), detail: `求解位置 ${formatEngineeringValue(results.summary.maxDeflectionPositionM, "m")}` },
          { label: "相对误差", value: `${errorPercent.toFixed(3)} %`, detail: errorPercent <= 1 ? "解析对照通过" : "建议复核输入单位与边界" },
        ].map((row) => (
          <div key={row.label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-1 text-[10px] font-black tracking-widest text-muted-foreground">{row.label}</div>
            <div className="font-mono text-sm font-bold text-primary">{row.value}</div>
            <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{row.detail}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
