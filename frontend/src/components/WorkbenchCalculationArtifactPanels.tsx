import { useEffect, useMemo, useRef, useState } from "react";
import { GitCompareArrows, Plus, Trash2 } from "lucide-react";
import type { BeamCalculationResults } from "../types/beam";
import type {
  AnalysisMode,
  CalculationReviewPoint,
  CalculationSnapshotComparison,
  FrameCalculationResults,
  TrussCalculationResults,
} from "../types/structure";
import { analysisVocabulary } from "../lib/analysis-vocabulary";
import { trackSolverAnalyticsEvent } from "../analytics/umami-analytics";
import { formatEngineeringValue } from "../lib/engineering-format";
import {
  appendCalculationSnapshot,
  calculationCriticalPointKindTitle,
  calculationMetricTitle,
  calculationObjectTitle,
  calculationSideTitle,
  calculationSourceIdTitle,
  calculationSourceTypeTitle,
  calculationStatusTitle,
  compareCalculationSnapshots,
  createCalculationSnapshotFromResult,
  measureCalculationSnapshotBytes,
  MAX_SNAPSHOT_BYTES,
} from "../lib/calculation-artifacts.ts";
import type { WorkspaceState } from "../lib/workspace-state.ts";
import { GlassCard } from "./ui/GlassCard";

type CalculationResults = BeamCalculationResults | FrameCalculationResults | TrussCalculationResults;
type WorkspaceSlice = WorkspaceState["beam"] | WorkspaceState["frame"] | WorkspaceState["truss"];

interface CalculationArtifactPanelProps {
  analysisMode: AnalysisMode;
  results: CalculationResults | null;
  workspace: WorkspaceState;
  updateWorkspace: import("react").Dispatch<import("react").SetStateAction<WorkspaceState>>;
  compact?: boolean;
}

type ReviewDraft = {
  kind: string;
  targetType: CalculationReviewPoint["targetType"];
  label: string;
  targetId: string;
  metricKey: string;
  station: string;
  side: string;
  note: string;
};

function reviewMetricOptions(mode: AnalysisMode, targetType: CalculationReviewPoint["targetType"]) {
  if (mode === "beam") {
    return [
      { value: "deflection", label: "挠度" },
      { value: "moment", label: "弯矩" },
      { value: "shear", label: "剪力" },
    ];
  }
  if (mode === "truss") {
    return targetType === "node"
      ? [
          { value: "resultant", label: "合位移" },
          { value: "ux", label: "X 向位移" },
          { value: "uy", label: "Y 向位移" },
          { value: "reactionFx", label: "X 向反力" },
          { value: "reactionFy", label: "Y 向反力" },
        ]
      : [{ value: "axial", label: "轴力" }];
  }
  return targetType === "node"
    ? [
        { value: "resultant", label: "合位移" },
        { value: "ux", label: "X 向位移" },
        { value: "uy", label: "Y 向位移" },
        { value: "reactionFx", label: "X 向反力" },
        { value: "reactionFy", label: "Y 向反力" },
        { value: "reactionMz", label: "约束弯矩" },
      ]
    : [
        { value: "moment", label: "弯矩" },
        { value: "shear", label: "剪力" },
        { value: "axial", label: "轴力" },
        { value: "deflection", label: "构件挠度" },
      ];
}

function modeWorkspace(workspace: WorkspaceState, analysisMode: AnalysisMode) {
  return analysisMode === "frame" ? workspace.frame : analysisMode === "truss" ? workspace.truss : workspace.beam;
}

function updateModeWorkspace(
  updateWorkspace: import("react").Dispatch<import("react").SetStateAction<WorkspaceState>>,
  analysisMode: AnalysisMode,
  updater: (workspace: WorkspaceSlice) => WorkspaceSlice,
) {
  updateWorkspace((current) => {
    if (analysisMode === "frame") {
      return { ...current, frame: updater(current.frame) as WorkspaceState["frame"] };
    }
    if (analysisMode === "truss") {
      return { ...current, truss: updater(current.truss) as WorkspaceState["truss"] };
    }
    return { ...current, beam: updater(current.beam) as WorkspaceState["beam"] };
  });
}

function createDefaultReviewDraft(mode: AnalysisMode): ReviewDraft {
  return {
    kind: mode === "beam" ? "beam-check" : mode === "frame" ? "frame-check" : "truss-check",
    targetType: "node",
    label: "复核点 1",
    targetId: "",
    metricKey: mode === "beam" ? "deflection" : "resultant",
    station: "",
    side: "",
    note: "",
  };
}

function reviewPointLabel(point: CalculationReviewPoint): string {
  const suffix = [
    point.targetType,
    point.targetId,
    point.metricKey,
    point.station == null ? "" : formatEngineeringValue(point.station, "m"),
    point.side,
  ].filter(Boolean).join(" · ");
  return suffix ? `${point.label} · ${suffix}` : point.label;
}

function formatComparisonValue(value: number | null, unit?: string) {
  if (value === null) return "—";
  return formatEngineeringValue(value, unit ?? "");
}

function renderComparisonRow(row: CalculationSnapshotComparison["rows"][number]) {
  const leftText = row.leftText ?? formatComparisonValue(row.left, row.unit);
  const rightText = row.rightText ?? formatComparisonValue(row.right, row.unit);
  const absDiff = row.absDiff == null ? "—" : formatComparisonValue(row.absDiff, row.unit);
  const relDiff = row.relDiff == null ? "—" : `${(row.relDiff * 100).toFixed(2)} %`;
  return { leftText, rightText, absDiff, relDiff };
}

export function CalculationTracePanel({ analysisMode, results, workspace, updateWorkspace, compact = false }: CalculationArtifactPanelProps) {
  const trace = results?.calculationTrace ?? [];
  const reviewPoints = modeWorkspace(workspace, analysisMode).reviewPoints ?? [];
  const [draft, setDraft] = useState<ReviewDraft>(() => createDefaultReviewDraft(analysisMode));
  const metricOptions = useMemo(() => reviewMetricOptions(analysisMode, draft.targetType), [analysisMode, draft.targetType]);

  const quickKinds = useMemo(() => [
    { targetType: "node" as const, label: "节点复核点", kind: "node-check" },
    ...(analysisMode !== "beam" ? [{ targetType: "member" as const, label: "构件复核点", kind: "member-check" }] : []),
    ...(analysisMode !== "truss" ? [{ targetType: "station" as const, label: "截面复核点", kind: "station-check" }] : []),
  ], [analysisMode]);

  const modelTargets = useMemo(() => {
    if (!results) {
      return { nodes: [], members: [] };
    }

    if (analysisMode === "beam" && "beam" in results) {
      const beamNodes = results.beam?.nodes ?? [];
      const nodes = beamNodes.flatMap((node) => (node.id ? [node.id] : []));
      const members = results.beam?.spanIds ?? [];
      return { nodes, members };
    }

    if ("structure" in results) {
      const nodes = results.structure.nodes?.flatMap((node) => (node.id ? [node.id] : [])) ?? [];
      const members = results.structure.members?.flatMap((member) => (member.id ? [member.id] : [])) ?? [];
      return { nodes, members };
    }

    return { nodes: [], members: [] };
  }, [analysisMode, results]);

  const reviewDraftError = useMemo(() => {
    if (reviewPoints.length >= 32) return "每个分析对象最多保存 32 个复核点";
    if ((draft.targetType === "node" || draft.targetType === "member") && !draft.targetId.trim()) {
      return "节点或构件复核点必须选择目标 ID";
    }
    if (draft.targetType === "station") {
      const station = Number(draft.station);
      if (!draft.station.trim() || !Number.isFinite(station) || station < 0) return "截面位置必须是大于或等于 0 的有限数值";
      if (analysisMode !== "beam" && !draft.targetId.trim()) return "框架或桁架截面复核点必须选择构件 ID";
    }
    if (!metricOptions.some((option) => option.value === draft.metricKey)) return "请选择适用于当前对象的复核指标";
    if (draft.side && !["exact", "left", "right", "jump_left", "jump_right"].includes(draft.side)) {
      return "侧别只支持 exact、left、right、jump_left 或 jump_right";
    }
    return "";
  }, [analysisMode, draft.metricKey, draft.side, draft.station, draft.targetId, draft.targetType, metricOptions, reviewPoints.length]);

  const handleAddReviewPoint = () => {
    if (reviewDraftError) return;
    const point: CalculationReviewPoint = {
      id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `review-${Date.now()}`,
      kind: draft.kind.trim() || "custom",
      targetType: draft.targetType,
      label: draft.label.trim() || "复核点",
      targetId: draft.targetId.trim() || undefined,
      metricKey: draft.metricKey,
      station: draft.station.trim() ? Number(draft.station) : undefined,
      side: draft.side.trim() || undefined,
      note: draft.note.trim() || undefined,
    };
    updateModeWorkspace(updateWorkspace, analysisMode, (slice) => ({
      ...slice,
      reviewPoints: [...slice.reviewPoints, point],
    }));
    void trackSolverAnalyticsEvent("review_point_added", { analysis_mode: analysisMode });
    setDraft((current) => ({
      ...current,
      kind: draft.kind,
      targetType: draft.targetType,
      label: `${draft.targetType === "node" ? "节点" : draft.targetType === "member" ? "构件" : "截面"}复核点 ${reviewPoints.length + 1}`,
      targetId: draft.targetType === "node"
        ? modelTargets.nodes[0] ?? current.targetId
        : analysisMode === "beam"
          ? "beam"
          : modelTargets.members[0] ?? current.targetId,
      metricKey: draft.metricKey,
      station: draft.targetType === "station" ? current.station || "0" : current.station,
    }));
  };

  const handleDeleteReviewPoint = (id: string) => {
    updateModeWorkspace(updateWorkspace, analysisMode, (slice) => ({
      ...slice,
      reviewPoints: slice.reviewPoints.filter((point) => point.id !== id),
    }));
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>计算过程</h3>
          <span className="text-[11px] font-semibold text-muted-foreground">
            {trace.length} 步 · {reviewPoints.length} 个复核点
          </span>
        </div>
        {trace.length > 0 ? (
          <div className="space-y-2">
            {trace.map((entry, index) => (
              <article
                key={`${entry.stage}-${entry.title}-${index}`}
                tabIndex={0}
                aria-label={`计算过程第 ${index + 1} 步：${entry.title}`}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-foreground">{entry.title}</div>
                  <div className="text-[10px] font-semibold tracking-widest text-muted-foreground">第 {index + 1} 步</div>
                </div>
                <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {entry.detail ? <div>{entry.detail}</div> : null}
                  <div className="mt-1 flex flex-wrap gap-3">
                    {entry.step != null ? <span>步骤 {entry.step}</span> : null}
                    {entry.iteration != null ? <span>迭代 {entry.iteration}</span> : null}
                    {entry.residual != null ? <span>残差 {formatEngineeringValue(entry.residual, "")}</span> : null}
                    {entry.value != null ? <span>数值 {formatEngineeringValue(entry.value, entry.unit ?? "")}</span> : null}
                    {entry.sourceId ? <span>来源 {calculationSourceIdTitle(entry.sourceId)}</span> : null}
                    {entry.status ? <span>状态 {calculationStatusTitle(entry.status)}</span> : null}
                  </div>
                  <details className="mt-2 rounded-md border border-white/8 bg-black/5 px-2 py-1.5 dark:bg-black/15">
                    <summary className="cursor-pointer select-none font-semibold text-slate-500 dark:text-slate-400">技术审计信息</summary>
                    <div className="mt-1 break-all font-mono text-[10px] leading-relaxed opacity-80">
                      阶段代码：{entry.stage}{entry.technicalDetail ? ` · ${entry.technicalDetail}` : ""}
                    </div>
                  </details>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">当前结果未返回计算步骤。</p>
        )}
      </GlassCard>

      <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>复核点编辑</h3>
          <span className="text-[11px] font-semibold text-muted-foreground">修改后请重新求解，payload.reviewPoints 会随请求发送</span>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          {quickKinds.map((item) => (
            <button
              key={item.targetType}
              type="button"
              onClick={() => setDraft((current) => ({
                ...current,
                targetType: item.targetType,
                kind: item.kind,
                label: `${item.label}`,
                targetId: item.targetType === "node"
                  ? modelTargets.nodes[0] ?? current.targetId
                  : analysisMode === "beam"
                    ? "beam"
                    : modelTargets.members[0] ?? current.targetId,
                metricKey: reviewMetricOptions(analysisMode, item.targetType)[0]?.value ?? current.metricKey,
                station: item.targetType === "station" ? current.station || "0" : "",
              }))}
              className="rounded-lg border border-slate-200/80 bg-white/50 px-3 py-2 text-left text-sm font-bold text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-slate-900/45 dark:text-slate-200 dark:hover:border-sky-400/35 dark:hover:bg-sky-400/10"
            >
              <div>{item.label}</div>
              <div className="text-[10px] font-semibold text-muted-foreground">{item.targetType === "station" ? "沿杆件截面复核" : "可作为真实求解点"}</div>
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">名称</span>
            <input
              value={draft.label}
              onChange={(event) => setDraft((current) => ({ ...current, label: event.target.value }))}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition-colors hover:border-sky-300 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">类型</span>
            <select
              value={draft.targetType}
              onChange={(event) => setDraft((current) => ({
                ...current,
                targetType: event.target.value === "member" ? "member" : event.target.value === "station" ? "station" : "node",
                targetId: event.target.value === "node"
                  ? modelTargets.nodes[0] ?? ""
                  : analysisMode === "beam"
                    ? "beam"
                    : modelTargets.members[0] ?? "",
                metricKey: reviewMetricOptions(
                  analysisMode,
                  event.target.value === "member" ? "member" : event.target.value === "station" ? "station" : "node",
                )[0]?.value ?? current.metricKey,
              }))}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition-colors hover:border-sky-300 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {quickKinds.map((item) => <option key={item.targetType} value={item.targetType}>{item.label.replace("复核点", "")}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">复核指标</span>
            <select
              value={draft.metricKey}
              onChange={(event) => setDraft((current) => ({ ...current, metricKey: event.target.value }))}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition-colors hover:border-sky-300 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {metricOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">目标 ID</span>
            <input
              value={draft.targetId}
              onChange={(event) => setDraft((current) => ({ ...current, targetId: event.target.value }))}
              list={`${analysisMode}-review-targets`}
              placeholder="可选"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition-colors hover:border-sky-300 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
            <datalist id={`${analysisMode}-review-targets`}>
              {[...modelTargets.nodes, ...modelTargets.members].map((id) => <option key={id} value={id} />)}
            </datalist>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">截面位置 / m</span>
            <input
              value={draft.station}
              onChange={(event) => setDraft((current) => ({ ...current, station: event.target.value }))}
              inputMode="decimal"
              placeholder="可选"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition-colors hover:border-sky-300 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">侧别</span>
            <select
              value={draft.side}
              onChange={(event) => setDraft((current) => ({ ...current, side: event.target.value }))}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition-colors hover:border-sky-300 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">自动</option>
              <option value="exact">精确</option>
              <option value="left">左侧</option>
              <option value="right">右侧</option>
              <option value="jump_left">跳变左值</option>
              <option value="jump_right">跳变右值</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">备注</span>
            <input
              value={draft.note}
              onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              placeholder="可选"
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition-colors hover:border-sky-300 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="text-[11px] text-muted-foreground">
            可添加节点 / 构件 / 截面三类点位；当前已经存在 {reviewPoints.length} 个复核点。
          </div>
          <button
            type="button"
            onClick={handleAddReviewPoint}
            disabled={Boolean(reviewDraftError)}
            aria-describedby={reviewDraftError ? `${analysisMode}-review-point-error` : undefined}
            className="inline-flex items-center gap-2 rounded-lg border border-sky-400/35 bg-sky-400/10 px-3 py-2 text-sm font-bold text-sky-700 transition-colors hover:bg-sky-400/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-100"
          >
            <Plus className="h-4 w-4" />
            添加复核点
          </button>
        </div>
        {reviewDraftError ? <p id={`${analysisMode}-review-point-error`} role="alert" className="mt-2 text-[11px] text-amber-600 dark:text-amber-300">{reviewDraftError}</p> : null}
      </GlassCard>

      <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
        <h4 className={`${compact ? "mb-2 text-base" : "mb-3 text-lg"} font-black tracking-tight`}>已添加复核点</h4>
        {reviewPoints.length > 0 ? (
          <div className="space-y-2">
            {reviewPoints.map((point) => (
              <div key={point.id} className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                <div className="min-w-0">
                  <div className="font-bold text-foreground">{reviewPointLabel(point)}</div>
                  <div className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                    <span>{point.kind}</span>
                    {point.note ? <span className="ml-2">{point.note}</span> : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteReviewPoint(point.id)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200/80 bg-white/60 px-2 py-1 text-[11px] font-bold text-slate-700 transition-colors hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 dark:border-slate-700/80 dark:bg-slate-900/45 dark:text-slate-300 dark:hover:border-rose-500/35 dark:hover:bg-rose-500/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  删除
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">尚未添加复核点。</p>
        )}
      </GlassCard>
    </div>
  );
}

export function CriticalPointsPanel({ analysisMode, results, compact = false }: { analysisMode: AnalysisMode; results: CalculationResults | null; compact?: boolean }) {
  const criticalPoints = results?.criticalPoints ?? [];
  const governingEnvelope = results?.governingEnvelope ?? [];
  const inspectedEnvelopeIdsRef = useRef(new Set<string>());

  const trackEnvelopeInspection = (id: string) => {
    if (inspectedEnvelopeIdsRef.current.has(id)) return;
    inspectedEnvelopeIdsRef.current.add(id);
    void trackSolverAnalyticsEvent("governing_source_inspected", { analysis_mode: analysisMode });
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>工程关键点</h3>
          <span className="text-[11px] font-semibold text-muted-foreground">
            {criticalPoints.length} 个关键点 · {governingEnvelope.length} 个控制来源
          </span>
        </div>
        {criticalPoints.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-white/10">
            <table aria-label="工程关键点完整清单" className="w-full border-collapse text-left text-sm">
              <thead className="bg-white/[0.04] text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">名称</th>
                  <th className="px-3 py-2">类型</th>
                  <th className="px-3 py-2">指标</th>
                  <th className="px-3 py-2">数值</th>
                  <th className="px-3 py-2">位置</th>
                  <th className="px-3 py-2">来源</th>
                </tr>
              </thead>
              <tbody>
                {criticalPoints.map((point) => (
                  <tr key={point.id} className="border-t border-white/8 bg-white/[0.02]">
                    <td className="px-3 py-2 font-bold text-foreground">{point.label}</td>
                    <td className="px-3 py-2 text-muted-foreground">{calculationCriticalPointKindTitle(point.kind)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{calculationMetricTitle(point.metricKey)}</td>
                    <td className="px-3 py-2 font-mono font-bold text-primary">{point.value == null ? "—" : formatEngineeringValue(point.value, point.unit ?? "")}</td>
                    <td className="px-3 py-2 text-muted-foreground">{point.station == null ? "—" : formatEngineeringValue(point.station, "m")}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[
                        calculationSourceTypeTitle(point.sourceType),
                        calculationSourceIdTitle(point.sourceId),
                        calculationObjectTitle(point.kind, point.objectId),
                        calculationSideTitle(point.side),
                      ].filter(Boolean).join(" · ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">当前结果未返回关键点清单。</p>
        )}
      </GlassCard>

      <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
        <h4 className={`${compact ? "mb-2 text-base" : "mb-3 text-lg"} font-black tracking-tight`}>控制来源与包络</h4>
        {governingEnvelope.length > 0 ? (
          <div className="space-y-2">
            {governingEnvelope.map((item) => (
              <article
                key={item.id}
                tabIndex={0}
                aria-label={`控制来源：${item.label}`}
                onFocus={() => trackEnvelopeInspection(item.id)}
                onClick={() => trackEnvelopeInspection(item.id)}
                className="rounded-lg border border-white/10 bg-white/[0.03] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-foreground">{item.label}</div>
                  <div className="font-mono text-sm font-bold text-primary">
                    {item.value == null ? "—" : formatEngineeringValue(item.value, item.unit ?? "")}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                  <span>{calculationMetricTitle(item.metricKey)}</span>
                  {item.absoluteValue != null ? <span>绝对值 {formatEngineeringValue(item.absoluteValue, item.unit ?? "")}</span> : null}
                  {item.relativeValue != null ? <span>相对值 {formatEngineeringValue(item.relativeValue, "")}</span> : null}
                  {item.sourceType ? <span>来源 {calculationSourceTypeTitle(item.sourceType)}</span> : null}
                  {item.sourceLabel ? <span>{item.sourceLabel}</span> : null}
                  {item.sourceId ? <span>{calculationSourceIdTitle(item.sourceId)}</span> : null}
                  {item.objectId ? <span>对象 {item.objectId}</span> : null}
                  {item.station != null ? <span>位置 {formatEngineeringValue(item.station, "m")}</span> : null}
                  {item.scope ? <span>{item.scope === "location" ? "逐点包络" : "全局包络"}</span> : null}
                  {item.side ? <span>{calculationSideTitle(item.side)}</span> : null}
                </div>
                {item.sourceHash ? (
                  <details className="mt-2 text-[10px] text-muted-foreground">
                    <summary className="cursor-pointer select-none font-semibold">技术审计信息</summary>
                    <div className="mt-1 break-all font-mono">结果哈希：{item.sourceHash}</div>
                  </details>
                ) : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">当前结果未返回控制来源。</p>
        )}
      </GlassCard>
    </div>
  );
}

export function SnapshotComparisonPanel({ analysisMode, results, workspace, updateWorkspace, compact = false }: CalculationArtifactPanelProps) {
  const modeSlice = modeWorkspace(workspace, analysisMode);
  const savedSnapshots = useMemo(() => modeSlice.calculationSnapshots ?? [], [modeSlice.calculationSnapshots]);
  const [snapshotName, setSnapshotName] = useState(() => `${analysisVocabulary(analysisMode).systemLabel} 快照`);
  const [leftSnapshotId, setLeftSnapshotId] = useState("__current__");
  const [rightSnapshotId, setRightSnapshotId] = useState(savedSnapshots[0]?.id ?? "__current__");
  const trackedComparisonKeyRef = useRef<string | null>(null);

  const currentSnapshot = useMemo(() => {
    if (!results) return null;
    return createCalculationSnapshotFromResult({
      analysisMode,
      result: results as unknown as Record<string, unknown>,
      name: snapshotName.trim() || `${analysisVocabulary(analysisMode).systemLabel} 快照`,
    });
  }, [analysisMode, results, snapshotName]);

  const currentOptionLabel = currentSnapshot ? `当前结果 · ${currentSnapshot.name}` : "当前结果";
  const snapshotOptions = useMemo(() => {
    const options = [
      { value: "__current__", label: currentOptionLabel },
      ...savedSnapshots.map((snapshot) => ({
        value: snapshot.id,
        label: `${snapshot.name} · ${snapshot.createdAt.slice(0, 19).replace("T", " ")}`,
      })),
    ];
    return options;
  }, [currentOptionLabel, savedSnapshots]);

  const selectedLeft = leftSnapshotId === "__current__" ? currentSnapshot : savedSnapshots.find((snapshot) => snapshot.id === leftSnapshotId) ?? currentSnapshot;
  const selectedRight = rightSnapshotId === "__current__" ? currentSnapshot : savedSnapshots.find((snapshot) => snapshot.id === rightSnapshotId) ?? currentSnapshot;
  const comparison = useMemo<CalculationSnapshotComparison | null>(() => {
    if (!selectedLeft || !selectedRight) return null;
    return compareCalculationSnapshots(selectedLeft, selectedRight);
  }, [selectedLeft, selectedRight]);

  useEffect(() => {
    if (!comparison || leftSnapshotId === rightSnapshotId) return;
    const key = `${leftSnapshotId}:${rightSnapshotId}:${selectedLeft?.canonicalHash ?? ""}:${selectedRight?.canonicalHash ?? ""}`;
    if (trackedComparisonKeyRef.current === key) return;
    trackedComparisonKeyRef.current = key;
    void trackSolverAnalyticsEvent("snapshot_compared", { analysis_mode: analysisMode });
  }, [analysisMode, comparison, leftSnapshotId, rightSnapshotId, selectedLeft?.canonicalHash, selectedRight?.canonicalHash]);

  const handleSaveCurrentSnapshot = () => {
    if (!currentSnapshot || !currentSnapshot.canonicalHash || currentSnapshot.byteSize > MAX_SNAPSHOT_BYTES) return;
    updateModeWorkspace(updateWorkspace, analysisMode, (slice) => ({
      ...slice,
      calculationSnapshots: appendCalculationSnapshot(slice.calculationSnapshots, currentSnapshot, snapshotName.trim() || undefined),
    }));
    void trackSolverAnalyticsEvent("snapshot_saved", { analysis_mode: analysisMode });
  };

  const handleSelectSaved = (setter: (value: string) => void, value: string) => {
    setter(value);
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>快照保存</h3>
          <span className="text-[11px] font-semibold text-muted-foreground">
            {savedSnapshots.length} 个已保存快照 · 当前结果 {currentSnapshot ? `${(measureCalculationSnapshotBytes(currentSnapshot) / 1024).toFixed(1)} KB` : "不可用"}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">快照名称</span>
            <input
              value={snapshotName}
              onChange={(event) => setSnapshotName(event.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition-colors hover:border-sky-300 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </label>
          <button
            type="button"
            disabled={!currentSnapshot || !currentSnapshot.canonicalHash || currentSnapshot.byteSize > MAX_SNAPSHOT_BYTES}
            onClick={handleSaveCurrentSnapshot}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-sky-400/35 bg-sky-400/10 px-3 py-2 text-sm font-bold text-sky-700 transition-colors hover:bg-sky-400/15 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-100"
          >
            <Plus className="h-4 w-4" />
            保存当前快照
          </button>
        </div>
        {currentSnapshot && currentSnapshot.byteSize > MAX_SNAPSHOT_BYTES ? (
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-300">
            当前快照超过 {Math.round(MAX_SNAPSHOT_BYTES / 1000)} KB 硬上限，不能保存；请缩小结果范围后重新求解。
          </p>
        ) : null}
        {currentSnapshot && !currentSnapshot.canonicalHash ? (
          <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-300">
            当前结果缺少 canonical resultHash，不能保存为可复核快照。
          </p>
        ) : null}
      </GlassCard>

      <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>快照对比</h3>
          <GitCompareArrows className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">左侧快照</span>
            <select
              value={leftSnapshotId}
              onChange={(event) => handleSelectSaved(setLeftSnapshotId, event.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition-colors hover:border-sky-300 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {snapshotOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-bold text-slate-500 dark:text-slate-400">右侧快照</span>
            <select
              value={rightSnapshotId}
              onChange={(event) => handleSelectSaved(setRightSnapshotId, event.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800 outline-none transition-colors hover:border-sky-300 focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {snapshotOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        {comparison ? (
          <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
            <table aria-label="命名计算快照差异" className="w-full border-collapse text-left text-sm">
              <thead className="bg-white/[0.04] text-[11px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">字段</th>
                  <th className="px-3 py-2">左侧</th>
                  <th className="px-3 py-2">右侧</th>
                  <th className="px-3 py-2">绝对差</th>
                  <th className="px-3 py-2">相对差</th>
                </tr>
              </thead>
              <tbody>
                {comparison.rows.map((row) => {
                  const texts = renderComparisonRow(row);
                  return (
                    <tr key={row.key} className="border-t border-white/8 bg-white/[0.02] align-top">
                      <td className="px-3 py-2">
                        <div className="font-bold text-foreground">{row.label}</div>
                        {row.reason ? <div className="mt-1 text-[11px] leading-snug text-muted-foreground">{row.reason}</div> : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        <div>{texts.leftText}</div>
                        {row.leftText ? <div className="mt-1 text-[11px] text-slate-400">{row.leftText}</div> : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                        <div>{texts.rightText}</div>
                        {row.rightText ? <div className="mt-1 text-[11px] text-slate-400">{row.rightText}</div> : null}
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-primary">{texts.absDiff}</td>
                      <td className="px-3 py-2 font-mono font-bold text-primary">{texts.relDiff}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">选择两个快照后即可对比。</p>
        )}

        {comparison?.notes?.length ? (
          <div className="mt-3 space-y-1 text-[11px] text-muted-foreground">
            {comparison.notes.map((note) => <div key={note}>{note}</div>)}
          </div>
        ) : null}
      </GlassCard>
    </div>
  );
}
