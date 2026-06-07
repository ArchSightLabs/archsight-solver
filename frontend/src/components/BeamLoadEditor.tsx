import { Plus, Minus } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  activeBeamLinearLoads,
  beamLoadTypeAfterPatch,
  normalizedBeamRatioRange,
} from "../lib/beam-loads.ts";
import type { BeamWorkspaceState } from "../types/beam.ts";

interface BeamLoadEditorProps {
  value: BeamWorkspaceState;
  totalLength: number;
  fieldLabelClass: string;
  onChange: (next: BeamWorkspaceState) => void;
  compact?: boolean;
}

function LoadStatusBadge({ enabled }: { enabled: boolean }) {
  return (
    <span
      className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[10px] font-black ${
        enabled
          ? "border-emerald-300/70 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-300"
          : "border-slate-300/80 bg-slate-50 text-slate-500 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-400"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-slate-400"}`} />
      {enabled ? "已启用" : "已停用"}
    </span>
  );
}

export function BeamLoadEditor({ value, totalLength, fieldLabelClass, onChange, compact = false }: BeamLoadEditorProps) {
  const activeLinearLoads = activeBeamLinearLoads(value);
  const uniformRange = normalizedBeamRatioRange(value.uniformLoadStartRatio, value.uniformLoadEndRatio);
  const uniformLoadLength = totalLength * (uniformRange.endRatio - uniformRange.startRatio);
  const primaryLinearLoad = activeLinearLoads[0] ?? {
    id: "L1",
    qStartKnPerM: value.distributedLoadStart,
    qEndKnPerM: value.distributedLoadEnd,
    startRatio: value.distributedLoadStartRatio,
    endRatio: value.distributedLoadEndRatio,
  };

  const updateWorkspace = <K extends keyof BeamWorkspaceState>(field: K, nextValue: BeamWorkspaceState[K]) => {
    onChange({
      ...value,
      [field]: nextValue,
    });
  };

  const patchLoadState = (patch: Partial<BeamWorkspaceState>) => {
    const currentLinearLoads = activeBeamLinearLoads(value);
    const shouldEnableLinear = patch.linearLoadEnabled === true;
    const linearLoadsPatch = shouldEnableLinear && !patch.linearLoads && currentLinearLoads.length === 0
      ? {
          linearLoads: [{
            id: "L1",
            qStartKnPerM: value.distributedLoadStart,
            qEndKnPerM: value.distributedLoadEnd,
            startRatio: value.distributedLoadStartRatio,
            endRatio: value.distributedLoadEndRatio,
          }],
        }
      : {};
    const nextPatch = { ...linearLoadsPatch, ...patch };
    onChange({
      ...value,
      ...nextPatch,
      loadType: beamLoadTypeAfterPatch(value, nextPatch),
    });
  };

  const updatePrimaryLinearLoad = (patch: Partial<BeamWorkspaceState["linearLoads"][number]>) => {
    const [current, ...rest] = activeBeamLinearLoads(value);
    const baseLoad = current ?? {
      id: "L1",
      qStartKnPerM: value.distributedLoadStart,
      qEndKnPerM: value.distributedLoadEnd,
      startRatio: value.distributedLoadStartRatio,
      endRatio: value.distributedLoadEndRatio,
    };
    const nextLoad = { ...baseLoad, ...patch };
    patchLoadState({
      linearLoadEnabled: true,
      linearLoads: [nextLoad, ...rest],
      distributedLoadStart: nextLoad.qStartKnPerM,
      distributedLoadEnd: nextLoad.qEndKnPerM,
      distributedLoadStartRatio: nextLoad.startRatio,
      distributedLoadEndRatio: nextLoad.endRatio,
    });
  };

  const updateUniformLoadRange = (patch: Partial<Pick<BeamWorkspaceState, "uniformLoadStartRatio" | "uniformLoadEndRatio">>) => {
    const range = normalizedBeamRatioRange(
      patch.uniformLoadStartRatio ?? value.uniformLoadStartRatio,
      patch.uniformLoadEndRatio ?? value.uniformLoadEndRatio
    );
    patchLoadState({
      uniformLoadStartRatio: range.startRatio,
      uniformLoadEndRatio: range.endRatio,
    });
  };

  const addPointLoad = () => {
    const nextIndex = value.pointLoads.length;
    const pointLoads = [
      ...value.pointLoads,
      {
        id: `P${nextIndex + 1}`,
        magnitudeKn: value.pointLoad || 10,
        positionRatio: nextIndex === 0 ? value.pointLoadPositionRatio : (nextIndex + 1) / (nextIndex + 2),
      },
    ];
    patchLoadState({
      pointLoads,
      pointLoad: pointLoads[0]?.magnitudeKn ?? value.pointLoad,
      pointLoadPositionRatio: pointLoads[0]?.positionRatio ?? value.pointLoadPositionRatio,
    });
  };

  const updatePointLoad = (index: number, patch: Partial<BeamWorkspaceState["pointLoads"][number]>) => {
    const pointLoads = value.pointLoads.map((load, loadIndex) =>
      loadIndex === index ? { ...load, ...patch } : load
    );
    patchLoadState({
      pointLoads,
      pointLoad: pointLoads[0]?.magnitudeKn ?? value.pointLoad,
      pointLoadPositionRatio: pointLoads[0]?.positionRatio ?? value.pointLoadPositionRatio,
    });
  };

  const removePointLoad = (index: number) => {
    const pointLoads = value.pointLoads
      .filter((_, loadIndex) => loadIndex !== index)
      .map((load, loadIndex) => ({ ...load, id: load.id || `P${loadIndex + 1}` }));
    patchLoadState({
      pointLoads,
      pointLoad: pointLoads[0]?.magnitudeKn ?? 0,
      pointLoadPositionRatio: pointLoads[0]?.positionRatio ?? 0.5,
    });
  };

  return (
    <div className="space-y-3 rounded-lg border border-white/8 bg-slate-950/20 p-3">
      <div className="grid grid-cols-1 gap-3">
        <section className="space-y-3 rounded-lg border border-white/8 bg-background/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className={fieldLabelClass}>均布荷载</div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">q = {value.q.toFixed(1)} kN/m</div>
            </div>
            <div className="flex items-center gap-2">
              <LoadStatusBadge enabled={value.uniformLoadEnabled} />
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-lg border-white/10 bg-white/[0.03] px-3 text-[11px] font-semibold text-foreground/70 hover:border-sky-300/35 hover:bg-sky-400/10 hover:text-foreground"
                onClick={() => patchLoadState({ uniformLoadEnabled: !value.uniformLoadEnabled })}
              >
                {value.uniformLoadEnabled ? "停用荷载" : "启用荷载"}
              </Button>
            </div>
          </div>
          {value.uniformLoadEnabled ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <div className={fieldLabelClass}>均布荷载 q（kN/m）</div>
                <Input aria-label="均布荷载 q（kN/m）" type="number" step="0.1" value={value.q} onChange={(event) => updateWorkspace("q", Number(event.target.value) || 0)} className="min-w-0 font-mono text-xs" compact={compact} />
              </div>
              <div className="space-y-1">
                <div className={fieldLabelClass}>起点位置比例（0-1）</div>
                <Input aria-label="均布荷载起点位置比例（0-1）" type="number" step="0.05" min="0" max="1" value={uniformRange.startRatio} onChange={(event) => updateUniformLoadRange({ uniformLoadStartRatio: Number(event.target.value) || 0 })} className="min-w-0 font-mono text-xs" compact={compact} />
              </div>
              <div className="space-y-1">
                <div className={fieldLabelClass}>终点位置比例（0-1）</div>
                <Input aria-label="均布荷载终点位置比例（0-1）" type="number" step="0.05" min="0" max="1" value={uniformRange.endRatio} onChange={(event) => updateUniformLoadRange({ uniformLoadEndRatio: Number(event.target.value) || 0 })} className="min-w-0 font-mono text-xs" compact={compact} />
              </div>
              <div className="rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 font-mono text-[11px] text-muted-foreground sm:col-span-2">
                作用区间 {uniformRange.startRatio.toFixed(2)}-{uniformRange.endRatio.toFixed(2)}，长度 {uniformLoadLength.toFixed(2)} m
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-lg border border-white/8 bg-background/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className={fieldLabelClass}>线性分布荷载</div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">
                n = {activeLinearLoads.length || 1}，q1/q2 = {primaryLinearLoad.qStartKnPerM.toFixed(1)}/{primaryLinearLoad.qEndKnPerM.toFixed(1)} kN/m
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LoadStatusBadge enabled={value.linearLoadEnabled} />
              <Button
                type="button"
                variant="outline"
                className="h-8 rounded-lg border-white/10 bg-white/[0.03] px-3 text-[11px] font-semibold text-foreground/70 hover:border-sky-300/35 hover:bg-sky-400/10 hover:text-foreground"
                onClick={() => patchLoadState({ linearLoadEnabled: !value.linearLoadEnabled })}
              >
                {value.linearLoadEnabled ? "停用荷载" : "启用荷载"}
              </Button>
            </div>
          </div>
          {value.linearLoadEnabled ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <div className={fieldLabelClass}>起点荷载（kN/m）</div>
                <Input aria-label="线性分布荷载起点荷载（kN/m）" type="number" step="0.1" value={primaryLinearLoad.qStartKnPerM} onChange={(event) => updatePrimaryLinearLoad({ qStartKnPerM: Number(event.target.value) || 0 })} className="min-w-0 font-mono text-xs" compact={compact} />
              </div>
              <div className="space-y-1">
                <div className={fieldLabelClass}>终点荷载（kN/m）</div>
                <Input aria-label="线性分布荷载终点荷载（kN/m）" type="number" step="0.1" value={primaryLinearLoad.qEndKnPerM} onChange={(event) => updatePrimaryLinearLoad({ qEndKnPerM: Number(event.target.value) || 0 })} className="min-w-0 font-mono text-xs" compact={compact} />
              </div>
              <div className="space-y-1">
                <div className={fieldLabelClass}>起点位置比例（0-1）</div>
                <Input aria-label="线性分布荷载起点位置比例（0-1）" type="number" step="0.05" min="0" max="1" value={primaryLinearLoad.startRatio} onChange={(event) => updatePrimaryLinearLoad({ startRatio: Number(event.target.value) || 0 })} className="min-w-0 font-mono text-xs" compact={compact} />
              </div>
              <div className="space-y-1">
                <div className={fieldLabelClass}>终点位置比例（0-1）</div>
                <Input aria-label="线性分布荷载终点位置比例（0-1）" type="number" step="0.05" min="0" max="1" value={primaryLinearLoad.endRatio} onChange={(event) => updatePrimaryLinearLoad({ endRatio: Number(event.target.value) || 0 })} className="min-w-0 font-mono text-xs" compact={compact} />
              </div>
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-lg border border-white/8 bg-background/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className={fieldLabelClass}>集中力</div>
              <div className="mt-1 font-mono text-[11px] text-muted-foreground">n = {value.pointLoads.length}</div>
            </div>
            <Button type="button" variant="outline" className="h-8 rounded-lg px-3 text-[11px] font-semibold" onClick={addPointLoad}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              新增集中力
            </Button>
          </div>
          {value.pointLoads.length ? (
            <div className="space-y-2">
              {value.pointLoads.map((load, index) => (
                <div key={load.id} className="grid grid-cols-1 gap-3 rounded-lg border border-white/8 bg-white/[0.02] p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-1">
                    <div className={fieldLabelClass}>{load.id} 集中力（kN）</div>
                    <Input aria-label={`${load.id} 集中力（kN）`} type="number" step="0.1" value={load.magnitudeKn} onChange={(event) => updatePointLoad(index, { magnitudeKn: Number(event.target.value) || 0 })} className="min-w-0 font-mono text-xs" compact={compact} />
                  </div>
                  <div className="space-y-1">
                    <div className={fieldLabelClass}>作用位置比例（0-1）</div>
                    <Input aria-label={`${load.id} 作用位置比例（0-1）`} type="number" step="0.05" min="0" max="1" value={load.positionRatio} onChange={(event) => updatePointLoad(index, { positionRatio: Number(event.target.value) || 0 })} className="min-w-0 font-mono text-xs" compact={compact} />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="self-end justify-self-end text-rose-300 hover:bg-rose-500/10" onClick={() => removePointLoad(index)} aria-label={`删除 ${load.id}`}>
                    <Minus className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-white/10 px-3 py-3 text-xs text-muted-foreground">暂无集中力。</div>
          )}
        </section>
      </div>
    </div>
  );
}
