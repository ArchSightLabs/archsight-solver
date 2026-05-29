import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, FileText, LineChart, Network, Play, RotateCw, Settings2, Table2, Triangle } from "lucide-react";
import { GlassCard } from "./ui/GlassCard";
import { Button } from "./ui/button";
import type { BeamCalculationResults } from "../types/beam";
import type {
  AnalysisMode,
  FrameCalculationResults,
  TrussCalculationResults,
} from "../types/structure";
import type { ExportFormat } from "../hooks/useWorkbenchActions";
import {
  REPORT_FIGURE_MODE_OPTIONS,
  REPORT_FIGURE_SCOPE_OPTIONS,
  REPORT_TEMPLATE_OPTIONS,
  type ReportExportOptions,
  type ReportFigureMode,
  type ReportFigureScope,
  type ReportTemplate,
} from "../lib/report-options";
import { formatEngineeringValue } from "../lib/engineering-format";
import { buildDisplayedFrameResults, buildFrameDisplayOptions, resultTabsForMode, type FrameDisplayOption } from "./workbench-result-model";

const BeamPreview = lazy(() => import("./BeamPreview").then((module) => ({ default: module.BeamPreview })));
const BeamResultDiagrams = lazy(() => import("./BeamResultDiagrams").then((module) => ({ default: module.BeamResultDiagrams })));
const FramePreview = lazy(() => import("./FramePreview").then((module) => ({ default: module.FramePreview })));
const FrameMemberDiagrams = lazy(() => import("./FrameMemberDiagrams").then((module) => ({ default: module.FrameMemberDiagrams })));
const TrussPreview = lazy(() => import("./TrussPreview").then((module) => ({ default: module.TrussPreview })));
const TrussResultDiagrams = lazy(() => import("./TrussResultDiagrams").then((module) => ({ default: module.TrussResultDiagrams })));
const BeamChart = lazy(() => import("./BeamChart").then((module) => ({ default: module.BeamChart })));
interface WorkbenchResultTabsProps {
  analysisMode: AnalysisMode;
  beamResults: BeamCalculationResults | null;
  frameResults: FrameCalculationResults | null;
  trussResults: TrussCalculationResults | null;
  exportingFormat: ExportFormat | null;
  reportExportOptions: ReportExportOptions;
  compact?: boolean;
  onReportExportOptionsChange: (options: ReportExportOptions) => void;
  onExport: (format: ExportFormat) => void;
  onRunCalculation: () => void;
  isSolving: boolean;
  runLabel: string;
}

type SummaryRow = {
  label: string;
  value: string;
  detail?: string;
};

type ReportOptionSelectProps = {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
};

function ReportOptionSelect({ label, value, options, onChange }: ReportOptionSelectProps) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">{label}</span>
      <select
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
    </label>
  );
}

function EmptyResult({ mode, compact = false }: { mode: AnalysisMode; compact?: boolean }) {
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
          {mode === "frame" ? "等待框架计算" : mode === "truss" ? "等待桁架计算" : "等待梁系计算"}
        </h3>
      </div>
    </GlassCard>
  );
}

function SummaryGrid({
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
              <div className={`mt-1.5 leading-relaxed text-slate-600 dark:text-slate-300/80 ${compact ? "text-[10px]" : "text-xs"}`}>{row.detail}</div>
            ) : null}
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function LoadingPanel({ compact = false }: { compact?: boolean }) {
  return (
    <GlassCard className={`flex items-center justify-center border-dashed border-primary/10 bg-primary/[0.01] ${compact ? "min-h-[220px]" : "min-h-[280px] sm:min-h-[460px]"}`}>
      <div className="text-center">
        <div className="mx-auto mb-4 h-14 w-14 animate-pulse rounded-lg border border-primary/10 bg-primary/10" />
        <h3 className="text-xl font-black tracking-tight">图表加载中</h3>
      </div>
    </GlassCard>
  );
}

type DataCurveOption = {
  id: string;
  title: string;
  unit: string;
  yLabel: string;
  color: string;
  xData: number[];
  yData: number[];
  xLabels?: string[];
  xAxisLabel?: string;
  tooltipXLabel?: string;
  valueScale?: number;
};

function DataCurvePanel({ options, compact = false }: { options: DataCurveOption[]; compact?: boolean }) {
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

function beamDataCurveOptions(results: BeamCalculationResults): DataCurveOption[] {
  return [
    {
      id: "deflection",
      title: "挠度曲线",
      unit: "mm",
      yLabel: "挠度（mm）",
      color: "#0ea5e9",
      xData: results.x_data,
      yData: results.v_data,
      tooltipXLabel: "位置",
      xAxisLabel: "m",
      valueScale: 1000,
    },
    {
      id: "moment",
      title: "弯矩曲线",
      unit: "kN·m",
      yLabel: "弯矩（kN·m）",
      color: "#16a34a",
      xData: results.x_data,
      yData: results.moment_data,
      tooltipXLabel: "位置",
      xAxisLabel: "m",
      valueScale: 1,
    },
    {
      id: "shear",
      title: "剪力曲线",
      unit: "kN",
      yLabel: "剪力（kN）",
      color: "#f59e0b",
      xData: results.x_data,
      yData: results.shear_data,
      tooltipXLabel: "位置",
      xAxisLabel: "m",
      valueScale: 1,
    },
  ];
}

function trussDataCurveOptions(results: TrussCalculationResults): DataCurveOption[] {
  const nodeX = results.nodeIds.map((_, index) => index + 1);
  const memberX = results.memberIds.map((_, index) => index + 1);
  return [
    {
      id: "ux",
      title: "节点 X 向位移曲线",
      unit: "mm",
      yLabel: "X 向位移（mm）",
      color: "#22c55e",
      xData: nodeX,
      xLabels: results.nodeIds,
      yData: results.ux_data,
      xAxisLabel: "",
      tooltipXLabel: "节点",
      valueScale: 1,
    },
    {
      id: "uy",
      title: "节点 Y 向位移曲线",
      unit: "mm",
      yLabel: "Y 向位移（mm）",
      color: "#0ea5e9",
      xData: nodeX,
      xLabels: results.nodeIds,
      yData: results.uy_data,
      xAxisLabel: "",
      tooltipXLabel: "节点",
      valueScale: 1,
    },
    {
      id: "axial",
      title: "杆件轴力曲线",
      unit: "kN",
      yLabel: "杆件轴力（kN）",
      color: "#f59e0b",
      xData: memberX,
      xLabels: results.memberIds,
      yData: results.member_axial_data.map((item) => item.axialForceKn),
      xAxisLabel: "",
      tooltipXLabel: "杆件",
      valueScale: 1,
    },
  ];
}

function frameDataCurveOptions(results: FrameCalculationResults): DataCurveOption[] {
  const nodeX = results.nodeIds.map((_, index) => index + 1);
  return [
    {
      id: "ux",
      title: "节点 X 向位移曲线",
      unit: "mm",
      yLabel: "X 向位移（mm）",
      color: "#22c55e",
      xData: nodeX,
      xLabels: results.nodeIds,
      yData: results.ux_data,
      xAxisLabel: "",
      tooltipXLabel: "节点",
      valueScale: 1,
    },
    {
      id: "uy",
      title: "节点 Y 向位移曲线",
      unit: "mm",
      yLabel: "Y 向位移（mm）",
      color: "#0ea5e9",
      xData: nodeX,
      xLabels: results.nodeIds,
      yData: results.uy_data,
      xAxisLabel: "",
      tooltipXLabel: "节点",
      valueScale: 1,
    },
  ];
}

function beamSummaryRows(results: BeamCalculationResults): SummaryRow[] {
  return [
    {
      label: "允许挠度",
      value: formatEngineeringValue(results.summary?.allowableMm, "mm"),
      detail: `控制比 ${results.summary?.allowableRatio ?? 250} × · ${results.summary?.statusCode ?? "PENDING"}`,
    },
    {
      label: "最大挠度",
      value: formatEngineeringValue(results.summary?.maxDeflectionMm, "mm"),
      detail: `控制位置 ${formatEngineeringValue(results.summary?.maxDeflectionPositionM, "m")} · 挠度校核`,
    },
    {
      label: "跨段数量",
      value: `${results.payload?.spans.length ?? 0} 跨`,
      detail: `梁型 ${results.beam?.beamTypeLabel ?? "参数化梁系"} · 自动派生节点与支座`,
    },
    {
      label: "计算结论",
      value: results.summary?.status ?? "待计算",
      detail: results.summary?.method ?? "梁单元法 + Hermite 位移插值",
    },
  ];
}

function trussSummaryRows(results: TrussCalculationResults): SummaryRow[] {
  return [
    { label: "允许位移", value: formatEngineeringValue(results.summary.allowableMm, "mm"), detail: `控制比 ${results.summary.allowableRatio.toFixed(2)} × · ${results.summary.statusCode}` },
    { label: "最大位移", value: formatEngineeringValue(results.summary.maxDisplacementMm, "mm"), detail: `控制节点 ${results.summary.maxDisplacementNodeId ?? "—"} · 位移校核` },
    { label: "最大轴力", value: formatEngineeringValue(results.summary.maxAxialForceKn, "kN"), detail: `控制杆件 ${results.summary.maxAxialForceMemberId ?? "—"} · 轴力校核` },
    { label: "计算结论", value: results.summary.status, detail: results.summary.method },
  ];
}

function frameSummaryRows(results: FrameCalculationResults): SummaryRow[] {
  return [
    {
      label: "允许位移",
      value: formatEngineeringValue(results.summary.allowableMm, "mm"),
      detail: `控制节点 ${results.summary.maxDisplacementNodeId ?? "—"} · ${results.summary.statusCode}`,
    },
    {
      label: "最大位移",
      value: formatEngineeringValue(results.summary.maxDisplacementMm, "mm"),
      detail: `最大竖向位移 ${formatEngineeringValue(results.summary.maxVerticalMm, "mm")} · 位移校核`,
    },
    {
      label: "最大弯矩",
      value: formatEngineeringValue(results.summary.maxMomentKnM, "kN·m"),
      detail: `节点 ${results.nodeIds.length} 个 · 构件 ${results.memberIds.length} 个`,
    },
    {
      label: "计算结论",
      value: results.summary.status,
      detail: results.summary.method,
    },
  ];
}

function AssumptionsPanel({ mode, compact = false }: { mode: AnalysisMode; compact?: boolean }) {
  const rows =
    mode === "beam"
      ? [
          ["计算模型", "Euler-Bernoulli / Timoshenko 梁单元，节点自由度为竖向位移 v 与转角 θz。"],
          ["支座约束", "铰支座/滚动支座在梁弯曲模型中均约束 v；固结支座约束 v 与 θz；弹簧支座以刚度项进入整体刚度矩阵。"],
          ["符号约定", "挠度按竖向位移输出；弯矩、剪力采用求解器统一内力正负号，结果图以单位 kN、kN·m 和 mm 展示。"],
          ["单位换算", "E: GPa -> Pa，I: cm4 -> m4，q: kN/m -> N/m，P: kN -> N。"],
        ]
      : mode === "frame"
        ? [
            ["计算模型", "二维平面框架杆单元，节点自由度为 ux、uy、rz。"],
            ["内力读数", "弯矩图、剪力图、轴力图和局部 y 向挠度图按构件结构坐标绘制。"],
            ["支座约束", "节点支座类型、释放、内铰和弹簧均参与整体刚度矩阵。"],
            ["单位换算", "E: GPa，A: cm2，I: cm4；结果统一显示 kN、kN·m、mm。"],
          ]
        : [
            ["计算模型", "二维平面桁架杆单元，仅传递轴力，节点自由度为 ux、uy。"],
            ["专业边界", "桁架主指标为节点位移、杆件轴力、杆件轴应力和支座反力，不引入弯矩主指标。"],
            ["支座约束", "铰支座、滚动支座和自由节点按节点平动自由度装配。"],
            ["单位换算", "E: GPa，A: cm2；结果统一显示 kN、MPa、mm。"],
          ];
  return (
    <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
      <h3 className={`${compact ? "mb-3 text-lg" : "mb-4 text-xl"} font-black tracking-tight`}>计算假定与符号约定</h3>
      <div className={`grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-1 xl:grid-cols-2"}`}>
        {rows.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div className="mb-1 text-[10px] font-black tracking-widest text-muted-foreground">{label}</div>
            <div className="text-xs leading-relaxed text-foreground/70">{value}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function BeamBenchmarkPanel({ results, compact = false }: { results: BeamCalculationResults; compact?: boolean }) {
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

export function WorkbenchResultTabs({
  analysisMode,
  beamResults,
  frameResults,
  trussResults,
  exportingFormat,
  reportExportOptions,
  compact = false,
  onReportExportOptionsChange,
  onExport,
  onRunCalculation,
  isSolving,
  runLabel,
}: WorkbenchResultTabsProps) {
  const tabs = resultTabsForMode(analysisMode);
  const [activeTabState, setActiveTabState] = useState({ mode: analysisMode, tabId: tabs[0].id });
  const [frameDisplayState, setFrameDisplayState] = useState<FrameDisplayOption>({ source: "primary", id: "__primary__", label: "主结果", description: "基本荷载" });
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isExportSettingsOpen, setIsExportSettingsOpen] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const activeTab = activeTabState.mode === analysisMode ? activeTabState.tabId : tabs[0].id;
  const hasResults = analysisMode === "frame" ? Boolean(frameResults) : analysisMode === "truss" ? Boolean(trussResults) : Boolean(beamResults);
  const activeTabId = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0].id;
  const activeTabMeta = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const frameDisplayOptions = useMemo(() => buildFrameDisplayOptions(frameResults), [frameResults]);
  const activeFrameDisplayOption = frameDisplayOptions.find((option) => option.source === frameDisplayState.source && option.id === frameDisplayState.id) ?? frameDisplayOptions[0];
  const displayedFrameResults = useMemo(() => buildDisplayedFrameResults(frameResults, activeFrameDisplayOption), [activeFrameDisplayOption, frameResults]);
  const isExportingWord = exportingFormat === "docx";
  const isExportingExcel = exportingFormat === "xlsx";
  const isExportingAny = exportingFormat !== null;
  const exportLabel = isExportingWord ? "导出计算书..." : isExportingExcel ? "导出参数表..." : "成果导出";
  const updateReportExportOption = <K extends keyof ReportExportOptions>(key: K, value: ReportExportOptions[K]) => {
    onReportExportOptionsChange({ ...reportExportOptions, [key]: value });
  };
  const handleExportFormat = (format: ExportFormat) => {
    setIsExportMenuOpen(false);
    onExport(format);
  };
  const toggleExportMenu = () => {
    const nextOpen = !isExportMenuOpen;
    setIsExportMenuOpen(nextOpen);
    if (nextOpen) {
      setIsExportSettingsOpen(false);
    }
  };

  useEffect(() => {
    if (!isExportMenuOpen) return;

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      if (event.target instanceof globalThis.Node && !exportMenuRef.current?.contains(event.target)) {
        setIsExportMenuOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExportMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isExportMenuOpen]);

  const content = (() => {
    if (!hasResults) {
      return <EmptyResult mode={analysisMode} compact={compact} />;
    }

    if (analysisMode === "beam" && beamResults) {
      if (activeTabId === "overview") {
        return (
          <div className={`space-y-3 ${compact ? "" : "sm:space-y-4"}`}>
            {beamResults.beam ? (
              <Suspense fallback={<LoadingPanel compact={compact} />}>
                <BeamPreview beam={beamResults.beam} compact={compact} />
              </Suspense>
            ) : null}
            <Suspense fallback={<LoadingPanel compact={compact} />}>
              <BeamResultDiagrams results={beamResults} compact={compact} />
            </Suspense>
            <DataCurvePanel options={beamDataCurveOptions(beamResults)} compact={compact} />
            <AssumptionsPanel mode="beam" compact={compact} />
            <BeamBenchmarkPanel results={beamResults} compact={compact} />
            <SummaryGrid compact={compact} rows={beamSummaryRows(beamResults)} />
          </div>
        );
      }
      if (activeTabId === "preview") {
        return beamResults.beam ? (
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <BeamPreview beam={beamResults.beam} compact={compact} />
          </Suspense>
        ) : (
          <EmptyResult mode="beam" compact={compact} />
        );
      }
      if (activeTabId === "diagrams") {
        return (
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <BeamResultDiagrams results={beamResults} compact={compact} />
          </Suspense>
        );
      }
      if (activeTabId === "curves") {
        return <DataCurvePanel options={beamDataCurveOptions(beamResults)} compact={compact} />;
      }
      return (
        <div className="space-y-3">
            <AssumptionsPanel mode="beam" compact={compact} />
            <BeamBenchmarkPanel results={beamResults} compact={compact} />
            <SummaryGrid
              compact={compact}
              rows={beamSummaryRows(beamResults)}
            />
          </div>
        );
      }

    if (analysisMode === "truss") {
      if (!trussResults) {
        return <EmptyResult mode="truss" compact={compact} />;
      }

      if (activeTabId === "overview") {
        return (
          <div className={`space-y-3 ${compact ? "" : "sm:space-y-4"}`}>
            <Suspense fallback={<LoadingPanel compact={compact} />}>
              <TrussPreview truss={trussResults.truss ?? null} compact={compact} />
            </Suspense>
            <Suspense fallback={<LoadingPanel compact={compact} />}>
              <TrussResultDiagrams truss={trussResults.truss ?? null} compact={compact} />
            </Suspense>
            <DataCurvePanel options={trussDataCurveOptions(trussResults)} compact={compact} />
            <AssumptionsPanel mode="truss" compact={compact} />
            <SummaryGrid compact={compact} rows={trussSummaryRows(trussResults)} />
          </div>
        );
      }
      if (activeTabId === "preview") {
        return (
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <TrussPreview truss={trussResults.truss ?? null} compact={compact} />
          </Suspense>
        );
      }
      if (activeTabId === "diagrams") {
        return (
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <TrussResultDiagrams truss={trussResults.truss ?? null} compact={compact} />
          </Suspense>
        );
      }
      if (activeTabId === "curves") {
        return <DataCurvePanel options={trussDataCurveOptions(trussResults)} compact={compact} />;
      }
      return (
        <div className="space-y-3">
          <AssumptionsPanel mode="truss" compact={compact} />
          <SummaryGrid
            compact={compact}
            rows={trussSummaryRows(trussResults)}
          />
        </div>
      );
    }

    if (!displayedFrameResults) {
      return <EmptyResult mode="frame" compact={compact} />;
    }

    if (activeTabId === "overview") {
      return (
        <div className={`space-y-3 ${compact ? "" : "sm:space-y-4"}`}>
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <FramePreview frame={displayedFrameResults.frame ?? null} compact={compact} />
          </Suspense>
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <FrameMemberDiagrams frame={displayedFrameResults.frame ?? null} diagrams={displayedFrameResults.memberDiagrams ?? []} compact={compact} />
          </Suspense>
          <DataCurvePanel options={frameDataCurveOptions(displayedFrameResults)} compact={compact} />
          <AssumptionsPanel mode="frame" compact={compact} />
          <SummaryGrid compact={compact} rows={frameSummaryRows(displayedFrameResults)} />
        </div>
      );
    }
    if (activeTabId === "preview") {
      return (
        <Suspense fallback={<LoadingPanel compact={compact} />}>
          <FramePreview frame={displayedFrameResults.frame ?? null} compact={compact} />
        </Suspense>
      );
    }
    if (activeTabId === "diagrams") {
      return (
        <Suspense fallback={<LoadingPanel compact={compact} />}>
          <FrameMemberDiagrams frame={displayedFrameResults.frame ?? null} diagrams={displayedFrameResults.memberDiagrams ?? []} compact={compact} />
        </Suspense>
      );
    }
    if (activeTabId === "curves") {
      return <DataCurvePanel options={frameDataCurveOptions(displayedFrameResults)} compact={compact} />;
    }
    return (
      <div className="space-y-3">
        <AssumptionsPanel mode="frame" compact={compact} />
        <SummaryGrid
          compact={compact}
          rows={frameSummaryRows(displayedFrameResults)}
        />
      </div>
    );
  })();

  return (
    <section className={`space-y-2 sm:space-y-4 ${compact ? "sm:space-y-3" : ""}`}>
      <GlassCard className={`relative z-40 overflow-visible ${compact ? "space-y-3 p-3 sm:p-4" : "space-y-3 p-4 sm:p-5"}`}>
        <div className={`flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between ${compact ? "sm:gap-3" : "sm:gap-3"}`}>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>{activeTabMeta.label}</h3>
              {analysisMode === "frame" && activeFrameDisplayOption ? (
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {activeFrameDisplayOption.label}
                </span>
              ) : null}
            </div>
            {analysisMode === "frame" && frameDisplayOptions.length > 1 ? (
              <div className="flex max-w-3xl flex-wrap gap-2 pt-1">
                {frameDisplayOptions.map((option) => {
                  const active = option.source === activeFrameDisplayOption?.source && option.id === activeFrameDisplayOption.id;
                  return (
                    <button
                      key={`${option.source}-${option.id}`}
                      type="button"
                      onClick={() => setFrameDisplayState(option)}
                      aria-pressed={active}
                      className={`rounded-lg border px-3 py-2 text-left text-[11px] transition-colors ${
                        active
                          ? "border-slate-300 bg-slate-100/80 text-slate-900 dark:!border-emerald-400/35 dark:!bg-emerald-500/[0.12] dark:!text-emerald-100"
                          : "border-slate-200/70 bg-white/35 text-muted-foreground hover:border-slate-300 hover:bg-slate-50/80 hover:text-foreground dark:!border-slate-700/80 dark:!bg-slate-900/45 dark:!text-slate-300 dark:hover:!border-sky-400/35 dark:hover:!bg-sky-400/10 dark:hover:!text-sky-100"
                      }`}
                    >
                      <span className="block font-bold">{option.label}</span>
                      <span className="block text-[10px] opacity-70">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={onRunCalculation}
              disabled={isSolving}
              className={`rounded-lg font-bold shadow-lg shadow-primary/20 disabled:opacity-50 ${compact ? "h-10 px-3 text-xs" : "h-11 px-4"}`}
              title={runLabel}
            >
              {isSolving ? (
                <RotateCw className={`mr-2 animate-spin ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
              ) : (
                <Play className={`mr-2 ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
              )}
              {isSolving ? "计算中..." : "运行计算"}
            </Button>
            <div
              ref={exportMenuRef}
              className="relative"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) {
                  setIsExportMenuOpen(false);
                }
              }}
            >
              <Button
                type="button"
                variant="outline"
                onClick={toggleExportMenu}
                disabled={!hasResults || isExportingAny}
                aria-haspopup="menu"
                aria-expanded={isExportMenuOpen}
                className={`rounded-lg border-white/10 bg-white/[0.03] font-bold text-foreground hover:bg-primary/5 disabled:opacity-50 ${compact ? "h-10 px-3 text-xs" : "h-11 px-4"}`}
              >
                <FileText className={`mr-2 ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                {exportLabel}
                <ChevronDown className={`ml-2 transition-transform ${isExportMenuOpen ? "rotate-180" : ""} ${compact ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
              </Button>
              {isExportMenuOpen && hasResults && !isExportingAny ? (
                <div
                  role="menu"
                  className={`absolute right-0 top-full z-50 mt-2 w-[20rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-lg border border-slate-200 bg-white p-1.5 shadow-xl shadow-slate-950/10 dark:border-slate-700 dark:bg-slate-950 dark:shadow-black/30 ${compact ? "text-xs" : "text-sm"}`}
                >
                  <div className="px-2.5 pb-1 pt-1 text-[10px] font-black tracking-widest text-slate-500 dark:text-slate-400">
                    成果文件
                  </div>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleExportFormat("docx")}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-black">导出计算书</span>
                      <span className="block truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">Word · 模型、图形与校核摘要</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleExportFormat("xlsx")}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
                  >
                    <Table2 className="h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-black">导出参数表</span>
                      <span className="block truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">Excel · 输入参数与结果数据</span>
                    </span>
                  </button>
                  <div className="mt-1.5 border-t border-slate-200 p-1.5 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => setIsExportSettingsOpen((current) => !current)}
                      aria-expanded={isExportSettingsOpen}
                      className="flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-[11px] font-black text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      <span className="flex items-center gap-2">
                        <Settings2 className="h-3.5 w-3.5" />
                        计算书设置
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExportSettingsOpen ? "rotate-180" : ""}`} />
                    </button>
                    {isExportSettingsOpen ? (
                      <div className="grid gap-2 px-1 pb-1 pt-2">
                        <ReportOptionSelect
                          label="计算书模板"
                          value={reportExportOptions.template}
                          options={REPORT_TEMPLATE_OPTIONS}
                          onChange={(value) => updateReportExportOption("template", value as ReportTemplate)}
                        />
                        <ReportOptionSelect
                          label="图形模式"
                          value={reportExportOptions.figureMode}
                          options={REPORT_FIGURE_MODE_OPTIONS}
                          onChange={(value) => updateReportExportOption("figureMode", value as ReportFigureMode)}
                        />
                        <ReportOptionSelect
                          label="插图范围"
                          value={reportExportOptions.figureScope}
                          options={REPORT_FIGURE_SCOPE_OPTIONS}
                          onChange={(value) => updateReportExportOption("figureScope", value as ReportFigureScope)}
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
          {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabState({ mode: analysisMode, tabId: tab.id })}
              aria-pressed={active}
              title={tab.description}
              className={`flex min-w-0 items-center gap-2 rounded-lg border text-left transition-all ${
                active
                  ? "border-slate-300 bg-slate-100/75 text-slate-950 shadow-sm dark:!border-sky-400/35 dark:!bg-sky-400/[0.12] dark:!text-sky-100"
                  : "border-slate-200/70 bg-white/35 text-muted-foreground hover:border-slate-300 hover:bg-slate-50/80 hover:text-foreground dark:!border-slate-700/80 dark:!bg-slate-900/45 dark:!text-slate-300 dark:hover:!border-sky-400/35 dark:hover:!bg-sky-400/10 dark:hover:!text-sky-100"
              } ${compact ? "px-3 py-2.5" : "px-3 py-3"}`}
            >
              <span className={`flex shrink-0 items-center justify-center rounded-lg ${compact ? "h-7 w-7" : "h-8 w-8"} ${active ? "bg-sky-400 text-slate-950 dark:!bg-sky-400 dark:!text-slate-950" : "bg-slate-100 text-slate-600 dark:!bg-slate-800 dark:!text-slate-300"}`}>
                <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
              </span>
              <span className="min-w-0">
                <span className={`block truncate font-bold ${compact ? "text-[13px]" : "text-sm"}`}>{tab.label}</span>
              </span>
            </button>
          );
        })}
        </div>
      </GlassCard>
      <div className={`relative z-0 ${compact ? "min-h-[260px] sm:min-h-[360px]" : "min-h-[320px] sm:min-h-[460px]"}`}>{content}</div>
    </section>
  );
}
