import { useMemo, useState } from "react";
import { BarChart3, ShieldCheck } from "lucide-react";
import { GlassCard } from "./ui/GlassCard";
import { formatEngineeringValue } from "../lib/engineering-format";
import type {
  FrameBucklingMode,
  FrameBucklingModeShape,
  FrameCalculationResults,
  FrameNodeResult,
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

function scalarSummary(label: string, value: string, detail?: string) {
  return { label, value, detail };
}

function stableNumber(value: number | null | undefined) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function toPolyline(points: Point[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function structureNodeMap(structure: FrameStructure): Map<string, FrameNodeResult | { x: number; y: number }> {
  const byId = new Map<string, FrameNodeResult | { x: number; y: number }>();
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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          scalarSummary("P-Delta 状态", secondStatus, secondOrder?.method),
          scalarSummary("P-Delta 放大", formatEngineeringValue(secondOrder?.amplificationFactor, ""), secondOrder?.limitations),
          scalarSummary("首阶位移", formatEngineeringValue(firstOrder?.summary.maxDisplacementMm ?? result.summary.maxDisplacementMm, "mm"), "首阶对比"),
          scalarSummary("二阶位移", formatEngineeringValue(secondOrder?.maxDisplacementMm ?? result.summary.maxDisplacementMm, "mm"), "最终二阶快照"),
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
            <div className="text-[10px] font-black tracking-widest text-muted-foreground">{item.label}</div>
            <div className={`mt-1 font-mono text-sm font-bold ${item.label === "P-Delta 状态" ? statusTone(secondStatus) : "text-primary"}`}>{item.value}</div>
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
                <th className="py-1 pr-3">loadFactor</th>
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
                  <td className="py-1.5 pr-3 font-mono">{formatEngineeringValue(item.equilibriumResidual ?? item.equilibriumRmsRelativeError ?? item.residualNorm, "")}</td>
                  <td className="py-1.5 pr-3 font-mono">{formatEngineeringValue(item.displacementIncrementMm ?? item.displacementMm, "mm")}</td>
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

function StabilityOverview({
  results,
  compact = false,
  selectedMode,
  onSelectMode,
}: {
  results: FrameCalculationResults;
  compact?: boolean;
  selectedMode: FrameBucklingMode | null;
  onSelectMode: (modeNumber: number) => void;
}) {
  const secondOrder = results.secondOrder;
  const buckling = results.buckling;
  const modes = buckling?.modes ?? [];
  const firstOrder = secondOrder?.firstOrder;
  const secondStatus = normalizeStatus(secondOrder?.status);

  return (
    <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-sky-500" />
        <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>稳定审查</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          scalarSummary("P-Delta 状态", secondStatus, secondOrder?.method),
          scalarSummary("P-Delta 放大", formatEngineeringValue(secondOrder?.amplificationFactor, ""), secondOrder?.limitations),
          scalarSummary("首阶位移", formatEngineeringValue(firstOrder?.summary.maxDisplacementMm ?? results.summary.maxDisplacementMm, "mm"), "首阶对比"),
          scalarSummary("二阶位移", formatEngineeringValue(secondOrder?.maxHorizontalDisplacementMm ?? results.summary.maxDisplacementMm, "mm"), "最终二阶快照"),
        ].map((item) => (
          <div key={item.label} className="rounded-lg border border-white/8 bg-white/[0.03] p-3">
            <div className="text-[10px] font-black tracking-widest text-muted-foreground">{item.label}</div>
            <div className={`mt-1 font-mono text-sm font-bold ${item.label === "P-Delta 状态" ? statusTone(secondStatus) : "text-primary"}`}>{item.value}</div>
            {item.detail ? <div className="mt-1 text-[10px] leading-snug text-muted-foreground">{item.detail}</div> : null}
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2 rounded-lg border border-white/8 bg-white/[0.03] p-3">
        <div className="text-[10px] font-black tracking-widest text-muted-foreground">模态选择器</div>
        <ModeSelector modes={modes} selectedModeNumber={selectedMode?.modeNumber ?? null} onSelectMode={onSelectMode} />
      </div>
    </GlassCard>
  );
}

export function FrameStabilityPanel({ results, compact = false }: FrameStabilityPanelProps) {
  const modes = useMemo(() => results.buckling?.modes ?? [], [results.buckling?.modes]);
  const [selectedModeNumber, setSelectedModeNumber] = useState<number | null>(modes[0]?.modeNumber ?? null);
  const selectedMode = useMemo(
    () => (selectedModeNumber == null ? modes[0] ?? null : modes.find((mode) => mode.modeNumber === selectedModeNumber) ?? modes[0] ?? null),
    [modes, selectedModeNumber],
  );

  return (
    <div className={`space-y-3 ${compact ? "" : "sm:space-y-4"}`}>
      <StabilityOverview
        results={results}
        compact={compact}
        selectedMode={selectedMode}
        onSelectMode={setSelectedModeNumber}
      />
      <div className="grid gap-3 xl:grid-cols-[1.2fr_0.8fr]">
        <GlassCard className={`${compact ? "p-3 sm:p-4" : "p-4 sm:p-5"}`}>
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-sky-500" />
            <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>全局振型图</h3>
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
