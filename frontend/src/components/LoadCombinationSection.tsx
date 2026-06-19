import { Plus, Trash2, Waypoints } from "lucide-react";

import { Button } from "./ui/button";
import { Input } from "./ui/input";

export interface LoadCaseForCombination {
  id: string;
  title: string;
}

export interface LoadCombinationForEditor {
  id: string;
  title: string;
  factors: Record<string, number>;
  tags?: string[];
}

interface LoadCombinationSectionProps<TCombination extends LoadCombinationForEditor> {
  id: string;
  title?: string;
  emptyCaseMessage?: string;
  emptyCombinationMessage?: string;
  loadCases: LoadCaseForCombination[];
  loadCombinations: TCombination[];
  fieldLabelClass: string;
  onAddLoadCombination: () => void;
  onUpdateLoadCombination: (combinationIndex: number, patch: Partial<TCombination>) => void;
  onRemoveLoadCombination: (combinationIndex: number) => void;
}

export function LoadCombinationSection<TCombination extends LoadCombinationForEditor>({
  id,
  title = "荷载组合",
  emptyCaseMessage = "先定义荷载工况后可编辑组合系数。",
  emptyCombinationMessage = "未设置荷载组合。",
  loadCases,
  loadCombinations,
  fieldLabelClass,
  onAddLoadCombination,
  onUpdateLoadCombination,
  onRemoveLoadCombination,
}: LoadCombinationSectionProps<TCombination>) {
  return (
    <section id={id} className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="eyebrow flex items-center gap-2">
          <Waypoints className="h-3.5 w-3.5 text-primary" />
          {title}
        </div>
        <Button variant="outline" size="sm" onClick={onAddLoadCombination} className="h-8 rounded-xl" disabled={loadCases.length === 0}>
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          新增组合
        </Button>
      </div>
      {loadCases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-muted-foreground">{emptyCaseMessage}</div>
      ) : loadCombinations.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-muted-foreground">{emptyCombinationMessage}</div>
      ) : (
        <div className="space-y-3">
          {loadCombinations.map((combination, combinationIndex) => (
            <div key={combination.id} className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
                <div className="space-y-1">
                  <div className={fieldLabelClass}>组合编号</div>
                  <Input aria-label={`第 ${combinationIndex + 1} 个组合编号`} value={combination.id} onChange={(event) => onUpdateLoadCombination(combinationIndex, { id: event.target.value } as Partial<TCombination>)} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>组合名称</div>
                  <Input aria-label={`第 ${combinationIndex + 1} 个组合名称`} value={combination.title} onChange={(event) => onUpdateLoadCombination(combinationIndex, { title: event.target.value } as Partial<TCombination>)} className="h-10 min-w-0 text-xs" />
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
                    } as Partial<TCombination>)
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
                        } as Partial<TCombination>)
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
