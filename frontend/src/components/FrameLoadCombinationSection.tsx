import { Plus, Trash2, Waypoints } from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";
import type { FrameLoadCase, FrameLoadCombination } from "../types/structure.ts";

interface FrameLoadCombinationSectionProps {
  loadCases: FrameLoadCase[];
  loadCombinations: FrameLoadCombination[];
  fieldLabelClass: string;
  onAddLoadCombination: () => void;
  onUpdateLoadCombination: (combinationIndex: number, patch: Partial<FrameLoadCombination>) => void;
  onRemoveLoadCombination: (combinationIndex: number) => void;
}

export function FrameLoadCombinationSection({
  loadCases,
  loadCombinations,
  fieldLabelClass,
  onAddLoadCombination,
  onUpdateLoadCombination,
  onRemoveLoadCombination,
}: FrameLoadCombinationSectionProps) {
  return (
    <section id="frame-custom-load-combinations" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow flex items-center gap-2">
          <Waypoints className="h-3.5 w-3.5 text-primary" />
          荷载组合
        </div>
        <Button variant="outline" size="sm" onClick={onAddLoadCombination} className="h-8 rounded-xl" disabled={loadCases.length === 0}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          新增组合
        </Button>
      </div>
      {loadCases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-muted-foreground">先定义荷载工况后可编辑组合系数。</div>
      ) : loadCombinations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-muted-foreground">未设置荷载组合。</div>
      ) : (
        <div className="space-y-3">
          {loadCombinations.map((combination, combinationIndex) => (
            <div key={combination.id} className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
                <div className="space-y-1">
                  <div className={fieldLabelClass}>组合编号</div>
                  <Input aria-label={`第 ${combinationIndex + 1} 个组合编号`} value={combination.id} onChange={(event) => onUpdateLoadCombination(combinationIndex, { id: event.target.value })} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>组合名称</div>
                  <Input aria-label={`第 ${combinationIndex + 1} 个组合名称`} value={combination.title} onChange={(event) => onUpdateLoadCombination(combinationIndex, { title: event.target.value })} className="h-10 min-w-0 text-xs" />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10"
                    aria-label={`删除第 ${combinationIndex + 1} 个荷载组合`}
                    onClick={() => onRemoveLoadCombination(combinationIndex)}
                  >
                    <Trash2 className="h-4 w-4 text-rose-300" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <div className={fieldLabelClass}>组合标签</div>
                <Input
                  aria-label={`第 ${combinationIndex + 1} 个组合标签`}
                  value={(combination.tags ?? []).join(", ")}
                  onChange={(event) =>
                    onUpdateLoadCombination(combinationIndex, {
                      tags: event.target.value
                        .split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean),
                    })
                  }
                  className="h-10 min-w-0 text-xs"
                  placeholder="ULS, 包络"
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {loadCases.map((loadCase) => (
                  <div key={`${combination.id}-${loadCase.id}`} className="space-y-1">
                    <div className={fieldLabelClass}>{loadCase.id} 系数</div>
                    <Input
                      aria-label={`${combination.id} 中 ${loadCase.id} 的组合系数`}
                      type="number"
                      step="0.1"
                      value={combination.factors[loadCase.id] ?? 0}
                      onChange={(event) =>
                        onUpdateLoadCombination(combinationIndex, {
                          factors: { ...combination.factors, [loadCase.id]: Number(event.target.value) || 0 },
                        })
                      }
                      className="h-10 min-w-0 font-mono text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
