import { GitBranch, Plus, Trash2 } from "lucide-react";

import { Button } from "./ui/button";
import { DropdownSelect } from "./ui/DropdownSelect";
import { Input } from "./ui/input";
import type { BeamLoadCase, BeamLoadInput } from "../types/beam.ts";

const BEAM_CASE_LOAD_TYPE_OPTIONS = [
  { value: "uniform", label: "均布荷载" },
  { value: "point", label: "集中力" },
  { value: "linear", label: "线性分布荷载" },
];

interface BeamLoadCaseSectionProps {
  loadCases: BeamLoadCase[];
  totalLength: number;
  fieldLabelClass: string;
  onAddLoadCase: () => void;
  onUpdateLoadCase: (loadCaseIndex: number, patch: Partial<BeamLoadCase>) => void;
  onRemoveLoadCase: (loadCaseIndex: number) => void;
  onAddLoadToCase: (loadCaseIndex: number) => void;
  onUpdateLoadInCase: (loadCaseIndex: number, loadIndex: number, patch: BeamLoadInput) => void;
  onRemoveLoadFromCase: (loadCaseIndex: number, loadIndex: number) => void;
}

function createBeamCaseLoadForType(type: BeamLoadInput["type"], totalLength: number): BeamLoadInput {
  if (type === "point") {
    return { type: "point", pointLoadKn: 10, x: totalLength / 2 };
  }
  if (type === "linear") {
    return { type: "linear", qStartKnPerM: 8, qEndKnPerM: 12, start: 0, end: totalLength };
  }
  return { type: "uniform", qKnPerM: 10, start: 0, end: totalLength };
}

function clampBeamPosition(value: number, totalLength: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), Math.max(totalLength, 0));
}

function BeamCaseLoadEditor({
  load,
  loadIndex,
  totalLength,
  fieldLabelClass,
  onUpdate,
  onRemove,
}: {
  load: BeamLoadInput;
  loadIndex: number;
  totalLength: number;
  fieldLabelClass: string;
  onUpdate: (next: BeamLoadInput) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-1">
          <div className={fieldLabelClass}>荷载类型</div>
          <DropdownSelect
            value={load.type}
            onChange={(nextValue) => onUpdate(createBeamCaseLoadForType(nextValue as BeamLoadInput["type"], totalLength))}
            options={BEAM_CASE_LOAD_TYPE_OPTIONS}
            className="text-xs font-mono"
            menuClassName="text-xs font-mono"
            ariaLabel={`第 ${loadIndex + 1} 条梁系工况荷载类型`}
          />
        </div>
        <div className="flex items-end">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onRemove} aria-label={`删除第 ${loadIndex + 1} 条工况荷载`}>
            <Trash2 className="h-4 w-4 text-rose-300" />
          </Button>
        </div>
      </div>
      {load.type === "point" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className={fieldLabelClass}>集中力（kN）</div>
            <Input aria-label={`第 ${loadIndex + 1} 条集中力（kN）`} type="number" step="0.1" value={load.pointLoadKn} onChange={(event) => onUpdate({ ...load, pointLoadKn: Number(event.target.value) || 0 })} className="min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>作用位置 x（m）</div>
            <Input aria-label={`第 ${loadIndex + 1} 条集中力作用位置`} type="number" step="0.1" min="0" max={totalLength} value={load.x} onChange={(event) => onUpdate({ ...load, x: clampBeamPosition(Number(event.target.value), totalLength) })} className="min-w-0 font-mono text-xs" />
          </div>
        </div>
      ) : load.type === "linear" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <div className={fieldLabelClass}>起点荷载（kN/m）</div>
            <Input aria-label={`第 ${loadIndex + 1} 条线性荷载起点荷载`} type="number" step="0.1" value={load.qStartKnPerM} onChange={(event) => onUpdate({ ...load, qStartKnPerM: Number(event.target.value) || 0 })} className="min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>终点荷载（kN/m）</div>
            <Input aria-label={`第 ${loadIndex + 1} 条线性荷载终点荷载`} type="number" step="0.1" value={load.qEndKnPerM} onChange={(event) => onUpdate({ ...load, qEndKnPerM: Number(event.target.value) || 0 })} className="min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>起点 x（m）</div>
            <Input aria-label={`第 ${loadIndex + 1} 条线性荷载起点`} type="number" step="0.1" min="0" max={totalLength} value={load.start} onChange={(event) => onUpdate({ ...load, start: clampBeamPosition(Number(event.target.value), totalLength) })} className="min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>终点 x（m）</div>
            <Input aria-label={`第 ${loadIndex + 1} 条线性荷载终点`} type="number" step="0.1" min="0" max={totalLength} value={load.end} onChange={(event) => onUpdate({ ...load, end: clampBeamPosition(Number(event.target.value), totalLength) })} className="min-w-0 font-mono text-xs" />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <div className={fieldLabelClass}>均布荷载（kN/m）</div>
            <Input aria-label={`第 ${loadIndex + 1} 条均布荷载`} type="number" step="0.1" value={load.qKnPerM} onChange={(event) => onUpdate({ ...load, qKnPerM: Number(event.target.value) || 0 })} className="min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>起点 x（m）</div>
            <Input aria-label={`第 ${loadIndex + 1} 条均布荷载起点`} type="number" step="0.1" min="0" max={totalLength} value={load.start ?? 0} onChange={(event) => onUpdate({ ...load, start: clampBeamPosition(Number(event.target.value), totalLength) })} className="min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>终点 x（m）</div>
            <Input aria-label={`第 ${loadIndex + 1} 条均布荷载终点`} type="number" step="0.1" min="0" max={totalLength} value={load.end ?? totalLength} onChange={(event) => onUpdate({ ...load, end: clampBeamPosition(Number(event.target.value), totalLength) })} className="min-w-0 font-mono text-xs" />
          </div>
        </div>
      )}
    </div>
  );
}

export function BeamLoadCaseSection({
  loadCases,
  totalLength,
  fieldLabelClass,
  onAddLoadCase,
  onUpdateLoadCase,
  onRemoveLoadCase,
  onAddLoadToCase,
  onUpdateLoadInCase,
  onRemoveLoadFromCase,
}: BeamLoadCaseSectionProps) {
  return (
    <section id="beam-custom-load-cases" className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow flex items-center gap-2">
          <GitBranch className="h-3.5 w-3.5 text-primary" />
          荷载工况
        </div>
        <Button variant="outline" size="sm" onClick={onAddLoadCase} className="h-8 rounded-xl">
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          新增工况
        </Button>
      </div>
      {loadCases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-muted-foreground">未设置独立荷载工况，求解器将使用上方基本荷载。</div>
      ) : (
        <div className="space-y-3">
          {loadCases.map((loadCase, loadCaseIndex) => (
            <div key={loadCase.id} className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
                <div className="space-y-1">
                  <div className={fieldLabelClass}>工况编号</div>
                  <Input aria-label={`第 ${loadCaseIndex + 1} 个工况编号`} value={loadCase.id} onChange={(event) => onUpdateLoadCase(loadCaseIndex, { id: event.target.value })} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>工况名称</div>
                  <Input aria-label={`第 ${loadCaseIndex + 1} 个工况名称`} value={loadCase.title} onChange={(event) => onUpdateLoadCase(loadCaseIndex, { title: event.target.value })} className="h-10 min-w-0 text-xs" />
                </div>
                <div className="flex items-end gap-2">
                  <Button variant="outline" size="sm" onClick={() => onAddLoadToCase(loadCaseIndex)} className="h-10 rounded-xl">
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    荷载
                  </Button>
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => onRemoveLoadCase(loadCaseIndex)} aria-label={`删除第 ${loadCaseIndex + 1} 个工况`}>
                    <Trash2 className="h-4 w-4 text-rose-300" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                {loadCase.loads.map((load, loadIndex) => (
                  <BeamCaseLoadEditor
                    key={`beam-load-case-${loadCaseIndex}-load-${loadIndex}`}
                    load={load}
                    loadIndex={loadIndex}
                    totalLength={totalLength}
                    fieldLabelClass={fieldLabelClass}
                    onUpdate={(nextLoad) => onUpdateLoadInCase(loadCaseIndex, loadIndex, nextLoad)}
                    onRemove={() => onRemoveLoadFromCase(loadCaseIndex, loadIndex)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function createDefaultBeamCaseLoad(totalLength: number): BeamLoadInput {
  return createBeamCaseLoadForType("uniform", totalLength);
}
