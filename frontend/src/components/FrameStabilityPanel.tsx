import { useMemo, useState } from "react";
import { BarChart3, ChevronLeft, ChevronRight, ShieldCheck } from "lucide-react";
import { GlassCard } from "./ui/GlassCard";
import { formatEngineeringValue } from "../lib/engineering-format";
import { calculationMetricTitle } from "../lib/calculation-artifacts";
import { buildNonlinearPathKeyPoints, layoutNonlinearPathLabels, nonlinearPathPlotPoints } from "../lib/frame-nonlinear-path";
import type {
  FrameBucklingMode,
  FrameBucklingModeShape,
  FrameCalculationResults,
  FrameNonlinearPathTrace,
  FrameStructure,
} from "../types/structure";

type FrameStabilityPanelProps = {
  results: FrameCalculationResults;
  compact?: boolean;
};

type StabilityStatus = "未启用" | "已收敛" | "未收敛" | "失败" | "无轴压" | "未提供";

type Point = {
  x: number;
  y: number;
};

type ModeCurve = {
  memberId: string;
  basePoints: Point[];
  deformedPoints: Point[];
};

const STABILITY_METHOD_TITLES: Record<string, string> = {
  linear_first_order_v1: "首阶线性分析",
  initial_stress_v1: "初始应力迭代（兼容）",
  corotational_newton_v1: "共回转 Newton 法",
  linear_buckling_v1: "线性屈曲特征值法",
};

function stabilityMethodTitle(value: string | undefined | null) {
  if (!value) return "未提供方法";
  return STABILITY_METHOD_TITLES[value] ?? value;
}

function normalizeStatus(value: string | undefined | null): StabilityStatus {
  switch (value) {
    case "converged":
    case "已收敛":
      return "已收敛";
    case "not_converged":
    case "未收敛":
      return "未收敛";
    case "failed":
    case "失败":
      return "失败";
    case "no_compression":
    case "无轴压":
      return "无轴压";
    case "not_enabled":
    case "未启用":
      return "未启用";
    default:
      return value ? "未提供" : "未提供";
  }
}

function statusTone(status: StabilityStatus) {
  if (status === "已收敛") return "text-emerald-600 dark:text-emerald-400";
  if (status === "未启用" || status === "无轴压") return "text-slate-500 dark:text-slate-400";
  if (status === "未收敛" || status === "失败") return "text-rose-600 dark:text-rose-400";
  return "text-amber-600 dark:text-amber-400";
}

function nonlinearStabilityLabel(status: string | undefined) {
  if (status === "stable") return "切线稳定";
  if (status === "near_critical") return "接近临界";
  if (status === "unstable") return "切线不稳定";
  return "未单独评估";
}

function scalarSummary(label: string, value: string, detail?: string) {
  return { label, value, detail };
}

function NonlinearPathChart({
  trace,
  selectedStep,
  onSelectStep,
}: {
  trace: FrameNonlinearPathTrace;
  selectedStep: number;
  onSelectStep: (step: number) => void;
}) {
  const points = nonlinearPathPlotPoints(trace);
  const keyPoints = buildNonlinearPathKeyPoints(trace);
  const residualPeak = keyPoints.find((point) => point.kind === "residual_peak");
  const width = 820;
  const height = 280;
  const padding = { left: 56, right: 30, top: 34, bottom: 42 };
  const xValues = [...points.map((point) => point.pathProgress), ...keyPoints.map((point) => point.pathProgress)];
  const yValues = [...points.map((point) => point.displacementMm), ...keyPoints.map((point) => point.displacementMm), 0];
  const minX = Math.min(...xValues, 0);
  const maxX = Math.max(...xValues, 1);
  const minY = Math.min(...yValues);
  const maxY = Math.max(...yValues, 1e-9);
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const project = (point: { pathProgress: number; displacementMm: number }) => ({
    x: padding.left + ((point.pathProgress - minX) / spanX) * (width - padding.left - padding.right),
    y: height - padding.bottom - ((point.displacementMm - minY) / spanY) * (height - padding.top - padding.bottom),
  });
  const keyPointLabels = layoutNonlinearPathLabels(
    keyPoints.map((point, index) => ({
      id: `${point.kind}-${point.step}-${index}`,
      label: point.label,
      ...project(point),
    })),
    {
      left: padding.left + 4,
      right: width - padding.right - 4,
      top: 8,
      bottom: height - padding.bottom - 6,
    },
  );

  if (!points.length) return <div className="text-xs text-muted-foreground">尚无已收敛荷载步。</div>;

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-white/8 bg-slate-950/20 p-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-auto min-w-0 w-full"
        role="img"
        aria-label={residualPeak ? `几何非线性荷载路径，当前残差峰值 ${residualPeak.label}` : "几何非线性荷载路径，关键点、拐点和残差峰值均标注数值"}
      >
        <line x1={padding.left} y1={height - padding.bottom} x2={width - padding.right} y2={height - padding.bottom} stroke="rgba(148,163,184,.45)" />
        <line x1={padding.left} y1={padding.top} x2={padding.left} y2={height - padding.bottom} stroke="rgba(148,163,184,.45)" />
        <polyline points={toPolyline(points.map(project))} fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinejoin="round" />
        {points.map((point) => {
          const plotted = project(point);
          const selected = point.step === selectedStep;
          return (
            <circle
              key={point.step}
              cx={plotted.x}
              cy={plotted.y}
              r={selected ? 6 : 4}
              fill={selected ? "#f59e0b" : "#38bdf8"}
              stroke="#082f49"
              strokeWidth="1.5"
              role="button"
              tabIndex={0}
              aria-label={`查看荷载步 ${point.step}`}
              onClick={() => onSelectStep(point.step)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") onSelectStep(point.step);
              }}
              className="cursor-pointer focus:outline-none"
            />
          );
        })}
        {keyPoints.map((point, index) => {
          const plotted = project(point);
          const labelPlacement = keyPointLabels[index]!;
          const tone = point.kind === "failure"
            ? "#fb7185"
            : point.kind === "cutback"
              ? "#fbbf24"
              : point.kind === "residual_peak"
                ? "#f472b6"
                : "#a5f3fc";
          return (
            <g
              key={labelPlacement.id}
              data-keypoint-kind={point.kind}
              aria-label={`路径关键点：${point.label}`}
            >
              <line x1={plotted.x} y1={plotted.y} x2={labelPlacement.leaderX} y2={labelPlacement.leaderY} stroke={tone} strokeDasharray="3 3" />
              <circle cx={plotted.x} cy={plotted.y} r="4.5" fill={tone} />
              <text
                x={labelPlacement.labelX}
                y={labelPlacement.labelY}
                textAnchor={labelPlacement.textAnchor}
                fill={tone}
                className="text-[10px] font-semibold"
              >
                {point.label}
              </text>
            </g>
          );
        })}
        <text x={width / 2} y={height - 8} textAnchor="middle" className="fill-slate-400 text-[11px] font-semibold">荷载路径进度（预荷载 → 变量荷载）</text>
        <text x="14" y={height / 2} transform={`rotate(-90 14 ${height / 2})`} textAnchor="middle" className="fill-slate-400 text-[11px] font-semibold">最大位移 / mm</text>
      </svg>
    </div>
  );
}

function NonlinearPlaybackCanvas({ trace, selectedStep }: { trace: FrameNonlinearPathTrace; selectedStep: number }) {
  const referenceNodes = Array.isArray(trace.mesh.referenceNodes) ? trace.mesh.referenceNodes as Array<{ id: string; x: number; y: number }> : [];
  const refinedMembers = Array.isArray(trace.mesh.refinedMembers) ? trace.mesh.refinedMembers as Array<{ id: string; start: string; end: string }> : [];
  const keyframe = trace.keyframes.reduce((closest, current) =>
    Math.abs(current.step - selectedStep) < Math.abs(closest.step - selectedStep) ? current : closest,
    trace.keyframes[0]!,
  );
  if (!keyframe || !referenceNodes.length || !refinedMembers.length) {
    return <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-muted-foreground">当前轨迹没有几何关键帧。</div>;
  }
  const displacements = new Map(keyframe.nodeDisplacements.map((item) => [item.nodeIndex, item]));
  const bounds = expandBounds(computeStructureBounds(referenceNodes));
  const structureSize = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 1);
  const maximumTranslation = Math.max(...keyframe.nodeDisplacements.map((item) => Math.hypot(item.uxM, item.uyM)), 1e-12);
  const displayScale = Math.min(100, 0.16 * structureSize / maximumTranslation);
  const deformedNodes = referenceNodes.map((node, index) => {
    const displacement = displacements.get(index);
    return {
      id: node.id,
      x: node.x + stableNumber(displacement?.uxM) * displayScale,
      y: node.y + stableNumber(displacement?.uyM) * displayScale,
    };
  });
  const nodeMap = new Map(referenceNodes.map((node) => [node.id, node]));
  const deformedMap = new Map(deformedNodes.map((node) => [node.id, node]));
  const allBounds = expandBounds(computeStructureBounds([...referenceNodes, ...deformedNodes]));
  const width = 820;
  const height = 300;
  const scale = Math.min(width / Math.max(allBounds.maxX - allBounds.minX, 1e-9), height / Math.max(allBounds.maxY - allBounds.minY, 1e-9));
  const project = (point: Point) => ({ x: (point.x - allBounds.minX) * scale, y: height - (point.y - allBounds.minY) * scale });

  return (
    <div className="overflow-hidden rounded-xl border border-white/8 bg-slate-950/20">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[260px] w-full" role="img" aria-label={`非线性荷载步 ${selectedStep} 的变形过程关键帧`}>
        {refinedMembers.map((member) => {
          const start = nodeMap.get(member.start);
          const end = nodeMap.get(member.end);
          if (!start || !end) return null;
          const p1 = project(start);
          const p2 = project(end);
          return <line key={`base-${member.id}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(148,163,184,.5)" strokeWidth="1.5" strokeDasharray="5 4" />;
        })}
        {refinedMembers.map((member) => {
          const start = deformedMap.get(member.start);
          const end = deformedMap.get(member.end);
          if (!start || !end) return null;
          const p1 = project(start);
          const p2 = project(end);
          return <line key={`deformed-${member.id}`} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" />;
        })}
        <text x="16" y="22" className="fill-slate-400 text-[11px] font-semibold">灰：参考几何 蓝：放大位移 × {formatEngineeringValue(displayScale, "")}</text>
        <text x="16" y="40" className="fill-cyan-300 text-[11px] font-semibold">步 {keyframe.step} · 固定 {formatEngineeringValue(keyframe.fixedLoadFactor ?? 0, "")} · 变量 {formatEngineeringValue(keyframe.loadFactor, "")}</text>
      </svg>
    </div>
  );
}

function NonlinearPathPanel({ result, compact }: { result: FrameCalculationResults; compact: boolean }) {
  const trace = result.secondOrder?.nonlinearPathTrace;
  const [selectedStep, setSelectedStep] = useState(trace?.keyframes.at(-1)?.step ?? 0);
  const [explanationLevel, setExplanationLevel] = useState<"intro" | "engineering" | "algorithm">("engineering");
  if (!trace) return null;
  const residualPeak = buildNonlinearPathKeyPoints(trace).find((point) => point.kind === "residual_peak");
  const keyframeSteps = trace.keyframes.map((item) => item.step);
  const currentIndex = Math.max(0, keyframeSteps.findIndex((step) => step === selectedStep));
  const methodLabels = Object.fromEntries(
    (result.secondOrder?.methodComparison?.methods ?? []).map((method) => [
      String(method.id ?? "unknown"),
      String(method.label ?? STABILITY_METHOD_TITLES[String(method.id ?? "")] ?? "未提供方法"),
    ]),
  );
  const explanations = {
    intro: "结构会在每个荷载步更新形状，再寻找内力与外力平衡；播放的是实际求解路径，不是动画插值。",
    engineering: "平衡收敛只说明该荷载点成立；切线稳定、接近临界或不稳定单独报告，不能把已收敛解释为安全。",
    algorithm: "共回转 Newton 法使用共回转基本变形、解析一致切线、全 Newton、残差线搜索和自适应切步回退；荷载控制不追踪极限点后的分支。",
  };
  return (
    <GlassCard className={compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black tracking-widest text-sky-500">非线性路径 · 专业求解轨迹</div>
          <h3 className={`${compact ? "text-lg" : "text-xl"} mt-1 font-black tracking-tight`}>几何非线性过程播放</h3>
          <p className="mt-1 text-xs text-muted-foreground">路径拐点、残差峰值、切步、最小稳定指标和终止点均保留数值标注。</p>
        </div>
        <div className="flex gap-2">
          {(["intro", "engineering", "algorithm"] as const).map((level) => (
            <button key={level} type="button" onClick={() => setExplanationLevel(level)} aria-pressed={explanationLevel === level} className={`rounded-full border px-3 py-1 text-[10px] font-bold ${explanationLevel === level ? "border-sky-400 bg-sky-500/15 text-sky-300" : "border-white/10 text-muted-foreground"}`}>
              {level === "intro" ? "入门" : level === "engineering" ? "工程" : "算法"}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.03] p-3 text-xs leading-relaxed text-muted-foreground">{explanations[explanationLevel]}</div>
      <div className="mt-4 grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <NonlinearPathChart trace={trace} selectedStep={selectedStep} onSelectStep={setSelectedStep} />
        <NonlinearPlaybackCanvas trace={trace} selectedStep={selectedStep} />
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" aria-label="上一个非线性关键帧" disabled={currentIndex <= 0} onClick={() => setSelectedStep(keyframeSteps[Math.max(0, currentIndex - 1)] ?? 0)} className="rounded-lg border border-white/10 p-2 disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
        <input aria-label="选择非线性荷载步" type="range" min={0} max={Math.max(0, keyframeSteps.length - 1)} value={currentIndex} onChange={(event) => setSelectedStep(keyframeSteps[Number(event.target.value)] ?? 0)} className="min-w-0 flex-1 accent-sky-500" />
        <button type="button" aria-label="下一个非线性关键帧" disabled={currentIndex >= keyframeSteps.length - 1} onClick={() => setSelectedStep(keyframeSteps[Math.min(keyframeSteps.length - 1, currentIndex + 1)] ?? 0)} className="rounded-lg border border-white/10 p-2 disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
        <span className="font-mono text-xs text-muted-foreground">{currentIndex + 1}/{keyframeSteps.length}</span>
      </div>
      {residualPeak ? <div className="mt-2 text-[11px] text-muted-foreground">残差峰值：{residualPeak.label}</div> : null}
      {result.secondOrder?.methodComparison ? (
        <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-3">
          <div className="text-[10px] font-black tracking-widest text-muted-foreground">方法比较</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {result.secondOrder.methodComparison.metrics.map((metric) => Object.entries(metric.values).map(([method, value]) => (
              <div key={`${metric.id}-${method}`} className={`rounded-lg border p-2 ${metric.comparable ? "border-white/8 bg-white/[0.02]" : "border-amber-400/20 bg-amber-400/[0.04]"}`}>
                <div className="text-[10px] text-muted-foreground">{stabilityMethodTitle(methodLabels[method] ?? method)} · {calculationMetricTitle(metric.id)}</div>
                <div className="font-mono text-sm font-bold text-primary">{formatEngineeringValue(value, metric.unit)}</div>
                {!metric.comparable ? <div className="mt-1 text-[9px] leading-relaxed text-amber-300">参考项/不可直接比较：{metric.unavailableReason ?? "比较条件不一致"}</div> : null}
              </div>
            )))}
          </div>
          <details className="mt-3 text-[10px] text-muted-foreground">
            <summary className="cursor-pointer select-none font-semibold">技术审计信息</summary>
            <div className="mt-1 break-all font-mono leading-relaxed">
              轨迹协议：{trace.schema}；求解算法：{trace.algorithm.id} v{trace.algorithm.version}；比较指标：{result.secondOrder.methodComparison.metrics.map((metric) => metric.id).join("、")}
            </div>
          </details>
        </div>
      ) : null}
    </GlassCard>
  );
}

function stableNumber(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function toPolyline(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function structureNodeMap(structure: FrameStructure): Map<string, { x: number; y: number }> {
  const byId = new Map<string, { x: number; y: number }>();
  for (const node of structure.nodes) {
    byId.set(node.id, node);
  }
  return byId;
}

function ratioSeries(shape: FrameBucklingModeShape, memberLength: number): number[] {
  if (shape.ratios?.length) {
    return shape.ratios.map((ratio) => Math.min(Math.max(ratio, 0), 1));
  }
  if (!shape.stationsM.length) {
    const count = Math.max(shape.ux.length, shape.uy.length, shape.rz.length, 0);
    return Array.from({ length: count }, (_, index) => (count > 1 ? index / (count - 1) : 0));
  }
  return shape.stationsM.map((station) => (memberLength > 0 ? Math.min(Math.max(station / memberLength, 0), 1) : 0));
}

function buildModeCurve(
  structure: FrameStructure,
  memberId: string,
  shape: FrameBucklingModeShape,
  displacementScale: number,
): ModeCurve | null {
  const member = structure.members.find((candidate) => candidate.id === memberId);
  const startNode = member ? structure.nodes.find((node) => node.id === member.start) : undefined;
  const endNode = member ? structure.nodes.find((node) => node.id === member.end) : undefined;
  if (!member || !startNode || !endNode) {
    return null;
  }

  const memberLength = Math.hypot(endNode.x - startNode.x, endNode.y - startNode.y) || 1;
  const ratios = ratioSeries(shape, memberLength);
  const pointCount = Math.min(ratios.length, shape.ux.length, shape.uy.length, shape.rz.length);
  if (pointCount === 0) {
    return {
      memberId,
      basePoints: [
        { x: startNode.x, y: startNode.y },
        { x: endNode.x, y: endNode.y },
      ],
      deformedPoints: [
        { x: startNode.x, y: startNode.y },
        { x: endNode.x, y: endNode.y },
      ],
    };
  }

  const basePoints = Array.from({ length: pointCount }, (_, index) => {
    const ratio = ratios[index] ?? 0;
    return {
      x: startNode.x + (endNode.x - startNode.x) * ratio,
      y: startNode.y + (endNode.y - startNode.y) * ratio,
    };
  });
  const deformedPoints = basePoints.map((point, index) => ({
    x: point.x + stableNumber(shape.ux[index]) * displacementScale,
    y: point.y + stableNumber(shape.uy[index]) * displacementScale,
  }));
  return { memberId, basePoints, deformedPoints };
}

function computeStructureBounds(points: Point[]) {
  if (!points.length) {
    return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  }
  return points.reduce(
    (bounds, point) => ({
      minX: Math.min(bounds.minX, point.x),
      maxX: Math.max(bounds.maxX, point.x),
      minY: Math.min(bounds.minY, point.y),
      maxY: Math.max(bounds.maxY, point.y),
    }),
    {
      minX: points[0]!.x,
      maxX: points[0]!.x,
      minY: points[0]!.y,
      maxY: points[0]!.y,
    },
  );
}

function expandBounds(bounds: { minX: number; maxX: number; minY: number; maxY: number }, paddingRatio = 0.14) {
  const width = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const height = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const padX = Math.max(width * paddingRatio, 0.25);
  const padY = Math.max(height * paddingRatio, 0.25);
  return {
    minX: bounds.minX - padX,
    maxX: bounds.maxX + padX,
    minY: bounds.minY - padY,
    maxY: bounds.maxY + padY,
  };
}

function buildModeCurves(structure: FrameStructure, mode: FrameBucklingMode): ModeCurve[] {
  const nodeMap = structureNodeMap(structure);
  const shapesByMemberId = new Map((mode.memberModeShapes ?? []).map((shape) => [shape.memberId, shape]));
  const maxMagnitude = Math.max(
    ...Array.from(shapesByMemberId.values()).flatMap((shape) =>
      shape.ux.flatMap((ux, index) => [Math.abs(ux), Math.abs(shape.uy[index] ?? 0)]),
    ),
    1e-9,
  );
  const memberBounds = structure.members.flatMap((member) => {
    const start = nodeMap.get(member.start);
    const end = nodeMap.get(member.end);
    if (!start || !end) return [];
    return [{ x: start.x, y: start.y }, { x: end.x, y: end.y }];
  });
  const structureBounds = computeStructureBounds(memberBounds);
  const sizeScale = Math.max(structureBounds.maxX - structureBounds.minX, structureBounds.maxY - structureBounds.minY, 1);
  const displacementScale = 0.18 * sizeScale / maxMagnitude;

  return structure.members
    .map((member) => {
      const shape = shapesByMemberId.get(member.id);
      if (!shape) {
        const start = nodeMap.get(member.start);
        const end = nodeMap.get(member.end);
        if (!start || !end) return null;
        return {
          memberId: member.id,
          basePoints: [
            { x: start.x, y: start.y },
            { x: end.x, y: end.y },
          ],
          deformedPoints: [
            { x: start.x, y: start.y },
            { x: end.x, y: end.y },
          ],
        } satisfies ModeCurve;
      }
      return buildModeCurve(structure, member.id, shape, displacementScale);
    })
    .filter((value): value is ModeCurve => Boolean(value));
}

function structurePoints(structure: FrameStructure) {
  return structure.nodes.map((node) => ({ x: node.x, y: node.y }));
}

function ModeSelector({
  modes,
  selectedModeNumber,
  onSelectMode,
}: {
  modes: FrameBucklingMode[];
  selectedModeNumber: number | null;
  onSelectMode: (modeNumber: number) => void;
}) {
  if (!modes.length) {
    return <div className="text-xs text-muted-foreground">未提供特征模态。</div>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {modes.map((mode) => {
        const active = mode.modeNumber === selectedModeNumber;
        return (
          <button
            key={mode.modeNumber}
            type="button"
            onClick={() => onSelectMode(mode.modeNumber)}
            aria-pressed={active}
            aria-label={`查看屈曲模态 ${mode.modeNumber}，临界因子 ${formatEngineeringValue(mode.criticalLoadFactor, "")}`}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
              active
                ? "border-sky-500 bg-sky-500/15 text-sky-600 dark:text-sky-300"
                : "border-white/10 bg-white/[0.03] text-muted-foreground hover:border-sky-400/50 hover:text-foreground"
            }`}
          >
            模态 {mode.modeNumber} · λ {formatEngineeringValue(mode.criticalLoadFactor, "")}
          </button>
        );
      })}
    </div>
  );
}

function StabilityModeCanvas({
  results,
  mode,
}: {
  results: FrameCalculationResults;
  mode: FrameBucklingMode | null;
}) {
  const structure = results.structure;
  const curves = mode ? buildModeCurves(structure, mode) : [];
  const nodes = structurePoints(structure);
  const modePoints = curves.flatMap((curve) => [...curve.basePoints, ...curve.deformedPoints]);
  const bounds = expandBounds(computeStructureBounds([...nodes, ...modePoints]));
  const width = 860;
  const height = 520;
  const spanX = Math.max(bounds.maxX - bounds.minX, 1e-6);
  const spanY = Math.max(bounds.maxY - bounds.minY, 1e-6);
  const scale = Math.min(width / spanX, height / spanY);
  const offsetX = 0.5 * (width - spanX * scale);
  const offsetY = 0.5 * (height - spanY * scale);
  const project = (point: Point) => ({
    x: offsetX + (point.x - bounds.minX) * scale,
    y: height - offsetY - (point.y - bounds.minY) * scale,
  });

  if (!mode) {
    return (
      <div className="flex min-h-[360px] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-white/[0.02] p-4 text-xs text-muted-foreground dark:border-slate-700">
        未启用屈曲结果或未返回特征模态。
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border border-white/8 bg-slate-950/30">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[340px] w-full"
          role="img"
          aria-label={`屈曲模态 ${mode.modeNumber} 全局振型图，灰色为原结构，蓝色为放大变形结构`}
        >
          <rect x="0" y="0" width={width} height={height} fill="rgba(255,255,255,0.02)" />
          {structure.members.map((member) => {
            const start = structure.nodes.find((node) => node.id === member.start);
            const end = structure.nodes.find((node) => node.id === member.end);
            if (!start || !end) return null;
            const p1 = project(start);
            const p2 = project(end);
            return <line key={member.id} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="rgba(148,163,184,0.65)" strokeWidth="2" />;
          })}
          {curves.map((curve) => (
            <g key={curve.memberId}>
              <polyline
                points={toPolyline(curve.basePoints.map(project))}
                fill="none"
                stroke="rgba(148,163,184,0.7)"
                strokeWidth="1.5"
                strokeDasharray="6 5"
              />
              <polyline
                points={toPolyline(curve.deformedPoints.map(project))}
                fill="none"
                stroke="#0ea5e9"
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>
          ))}
          {structure.nodes.map((node) => {
            const point = project(node);
            return <circle key={node.id} cx={point.x} cy={point.y} r="4" fill="#64748b" />;
          })}
          {structure.members.map((member) => {
            const start = structure.nodes.find((node) => node.id === member.start);
            const end = structure.nodes.find((node) => node.id === member.end);
            if (!start || !end) return null;
            const mid = project({ x: 0.5 * (start.x + end.x), y: 0.5 * (start.y + end.y) });
            return (
              <text key={`${member.id}-label`} x={mid.x + 6} y={mid.y - 6} className="fill-slate-500 text-[10px] font-semibold">
                {member.id}
              </text>
            );
          })}
          <text x="16" y="22" className="fill-slate-500 text-[11px] font-semibold">
            灰色：原结构，蓝色：选中模态的放大变形
          </text>
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
        <span>结构节点 {structure.nodes.length}</span>
        <span>构件 {structure.members.length}</span>
        <span>模态特征值 {formatEngineeringValue(mode.criticalLoadFactor, "")}</span>
        <span>残差 {formatEngineeringValue(mode.residualNorm, "")}</span>
        <span>约束残差 {formatEngineeringValue(mode.constraintResidual, "")}</span>
      </div>
    </div>
  );
}

function StabilityTracePanel({ result, compact = false }: { result: FrameCalculationResults; compact?: boolean }) {
  const secondOrder = result.secondOrder;
  const history = secondOrder?.iterationHistory ?? [];
  const firstOrder = secondOrder?.firstOrder;
  const secondStatus = normalizeStatus(secondOrder?.status);
  return (
    <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-sky-500" />
        <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>稳定审查</h3>
      </div>
      <div data-testid="stability-summary-grid" className="grid gap-3 sm:grid-cols-2">
        {[
          scalarSummary("平衡状态", secondStatus, [secondOrder?.method, stabilityMethodTitle(secondOrder?.algorithm?.id)].filter(Boolean).join(" · ")),
          scalarSummary("稳定状态", nonlinearStabilityLabel(secondOrder?.stabilityStatus), "平衡收敛不等于稳定或安全"),
          scalarSummary("二阶放大", formatEngineeringValue(secondOrder?.amplificationFactor, ""), secondOrder?.amplificationUnavailableReason ?? secondOrder?.limitations),
          scalarSummary("首阶位移", formatEngineeringValue(firstOrder?.summary.maxDisplacementMm ?? result.summary.maxDisplacementMm, "mm"), "首阶对比"),
          scalarSummary("二阶位移", formatEngineeringValue(secondOrder?.maxDisplacementMm ?? result.summary.maxDisplacementMm, "mm"), "最终二阶快照"),
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
            <div className="text-[10px] font-black tracking-widest text-muted-foreground">{item.label}</div>
            <div className={`mt-1 font-mono text-sm font-bold ${item.label === "平衡状态" ? statusTone(secondStatus) : item.label === "稳定状态" && secondOrder?.stabilityStatus === "unstable" ? "text-rose-500" : "text-primary"}`}>{item.value}</div>
            {item.detail ? <div className="mt-1 text-[10px] leading-snug text-muted-foreground">{item.detail}</div> : null}
          </div>
        ))}
      </div>
      <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.03] p-3">
        <div className="text-[10px] font-black tracking-widest text-muted-foreground">首阶 / 二阶 对比</div>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="rounded-md border border-white/8 bg-white/[0.02] p-2">
            <div className="text-[10px] text-muted-foreground">首阶最大位移</div>
            <div className="font-mono font-bold text-primary">{formatEngineeringValue(firstOrder?.summary.maxDisplacementMm ?? result.summary.maxDisplacementMm, "mm")}</div>
          </div>
          <div className="rounded-md border border-white/8 bg-white/[0.02] p-2">
            <div className="text-[10px] text-muted-foreground">二阶最大位移</div>
            <div className="font-mono font-bold text-primary">{formatEngineeringValue(secondOrder?.maxDisplacementMm ?? result.summary.maxDisplacementMm, "mm")}</div>
          </div>
          <div className="rounded-md border border-white/8 bg-white/[0.02] p-2">
            <div className="text-[10px] text-muted-foreground">放大系数</div>
            <div className="font-mono font-bold text-primary">{formatEngineeringValue(secondOrder?.amplificationFactor, "")}</div>
            {secondOrder?.amplificationUnavailableReason ? <div className="mt-1 text-[9px] text-amber-300">{secondOrder.amplificationUnavailableReason}</div> : null}
          </div>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.03] p-3">
        <div className="text-[10px] font-black tracking-widest text-muted-foreground">收敛轨迹</div>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="py-1 pr-3">步</th>
                <th className="py-1 pr-3">迭代</th>
                <th className="py-1 pr-3">荷载因子</th>
                <th className="py-1 pr-3">残差</th>
                <th className="py-1 pr-3">位移增量</th>
                <th className="py-1 pr-3">状态</th>
              </tr>
            </thead>
            <tbody>
              {history.length ? history.map((item, index) => (
                <tr key={`${item.step}-${item.iteration}-${index}`} className="border-t border-white/8">
                  <td className="py-1.5 pr-3 font-mono">{item.step}</td>
                  <td className="py-1.5 pr-3 font-mono">{item.iteration}</td>
                  <td className="py-1.5 pr-3 font-mono">{formatEngineeringValue(item.loadFactor, "")}</td>
                  <td className="py-1.5 pr-3 font-mono">{formatEngineeringValue(item.equilibriumResidualRelative ?? item.equilibriumResidual ?? item.equilibriumRmsRelativeError ?? item.residualNorm, "")}</td>
                  <td className="py-1.5 pr-3 font-mono">{formatEngineeringValue(item.displacementIncrementMm ?? (item.displacementIncrementMaxM == null ? item.displacementMm : item.displacementIncrementMaxM * 1000), "mm")}</td>
                  <td className="py-1.5 pr-3 font-semibold">{item.status === "converged" ? "已收敛" : item.status === "iterating" ? "迭代中" : (item.status ?? secondStatus)}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="py-2 text-muted-foreground">未提供迭代轨迹。</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </GlassCard>
  );
}

function StabilityBucklingPanel({
  result,
  compact = false,
}: {
  result: FrameCalculationResults;
  compact?: boolean;
}) {
  const buckling = result.buckling;
  if (!buckling) {
    return (
      <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">
          <BarChart3 className="h-4 w-4 text-sky-500" />
          屈曲模态
        </div>
        <p className="mt-2 text-xs text-muted-foreground">未提供屈曲结果。</p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
      <div className="mb-3 flex items-center gap-2">
        <BarChart3 className="h-4 w-4 text-sky-500" />
        <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>屈曲模态</h3>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
          <div className="text-[10px] font-black tracking-widest text-muted-foreground">状态</div>
          <div className={`mt-1 font-mono text-sm font-bold ${statusTone(normalizeStatus(buckling.status))}`}>{normalizeStatus(buckling.status)}</div>
          <div className="mt-1 text-[10px] text-muted-foreground">{buckling.method}</div>
        </div>
        <div className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
          <div className="text-[10px] font-black tracking-widest text-muted-foreground">临界因子</div>
          <div className="mt-1 font-mono text-sm font-bold text-primary">
            {buckling.criticalLoadFactor == null ? "—" : formatEngineeringValue(buckling.criticalLoadFactor, "")}
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">{buckling.limitations ?? "特征屈曲结果"}</div>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-white/8 bg-white/[0.03] p-3">
        <div className="text-[10px] font-black tracking-widest text-muted-foreground">模态表</div>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="py-1 pr-3">#</th>
                <th className="py-1 pr-3">临界因子</th>
                <th className="py-1 pr-3">残差</th>
                <th className="py-1 pr-3">约束</th>
                <th className="py-1 pr-3">构件模态</th>
              </tr>
            </thead>
            <tbody>
              {(buckling.modes ?? []).map((mode) => (
                <tr key={mode.modeNumber} className="border-t border-white/8">
                  <td className="py-1.5 pr-3 font-mono">{mode.modeNumber}</td>
                  <td className="py-1.5 pr-3 font-mono text-primary">{formatEngineeringValue(mode.criticalLoadFactor, "")}</td>
                  <td className="py-1.5 pr-3 font-mono">{formatEngineeringValue(mode.residualNorm, "")}</td>
                  <td className="py-1.5 pr-3 font-mono">{formatEngineeringValue(mode.constraintResidual, "")}</td>
                  <td className="py-1.5 pr-3 font-mono">{mode.memberModeShapes?.length ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </GlassCard>
  );
}

export function FrameStabilityPanel({ results, compact = false }: FrameStabilityPanelProps) {
  const modes = useMemo(() => results.buckling?.modes ?? [], [results.buckling?.modes]);
  const [selectedModeState, setSelectedModeState] = useState<FrameBucklingMode | null>(null);
  const selectedMode = selectedModeState && modes.includes(selectedModeState) ? selectedModeState : modes[0] ?? null;

  return (
    <div className={`space-y-3 ${compact ? "" : "sm:space-y-4"}`}>
      {results.secondOrder?.nonlinearPathTrace ? <NonlinearPathPanel result={results} compact={compact} /> : null}
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 32rem), 1fr))" }}
      >
        <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-sky-500" />
            <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>全局振型图</h3>
          </div>
          <div className="mb-3 space-y-2 rounded-lg border border-white/8 bg-white/[0.03] p-3">
            <div className="text-[10px] font-black tracking-widest text-muted-foreground">模态选择器</div>
            <ModeSelector
              modes={modes}
              selectedModeNumber={selectedMode?.modeNumber ?? null}
              onSelectMode={(modeNumber) => setSelectedModeState(modes.find((mode) => mode.modeNumber === modeNumber) ?? null)}
            />
          </div>
          <StabilityModeCanvas results={results} mode={selectedMode} />
        </GlassCard>
        <div className="space-y-3">
          <StabilityTracePanel result={results} compact={compact} />
          <StabilityBucklingPanel result={results} compact={compact} />
        </div>
      </div>
    </div>
  );
}
