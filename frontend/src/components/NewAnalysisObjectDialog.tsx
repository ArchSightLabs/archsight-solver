import { Network, Ruler, Triangle, X } from "lucide-react";
import { useMemo, useState } from "react";
import { analysisVocabulary } from "../lib/analysis-vocabulary";
import type { AnalysisObjectType } from "../lib/solver-project";
import { defaultAnalysisObjectName } from "../lib/solver-project";
import { Button } from "./ui/button";

interface NewAnalysisObjectDialogProps {
  existingCountByType: Record<AnalysisObjectType, number>;
  onCreate: (type: AnalysisObjectType, name: string) => void;
  onClose: () => void;
}

const TYPE_OPTIONS = [
  { type: "beam" as const, label: analysisVocabulary("beam").analysisLabel, icon: Ruler },
  { type: "truss" as const, label: analysisVocabulary("truss").analysisLabel, icon: Triangle },
  { type: "frame" as const, label: analysisVocabulary("frame").analysisLabel, icon: Network },
];

export function NewAnalysisObjectDialog({ existingCountByType, onCreate, onClose }: NewAnalysisObjectDialogProps) {
  const [selectedType, setSelectedType] = useState<AnalysisObjectType>("beam");
  const defaultName = useMemo(() => defaultAnalysisObjectName(selectedType, existingCountByType[selectedType] + 1), [existingCountByType, selectedType]);
  const [name, setName] = useState(defaultName);

  const handleTypeChange = (type: AnalysisObjectType) => {
    setSelectedType(type);
    setName(defaultAnalysisObjectName(type, existingCountByType[type] + 1));
  };

  const handleCreate = () => {
    onCreate(selectedType, name.trim() || defaultName);
  };

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="new-analysis-object-title" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-950 sm:p-5" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="new-analysis-object-title" className="text-lg font-black tracking-tight">新建分析对象</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            aria-label="关闭新建分析对象"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <div className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">对象类型</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TYPE_OPTIONS.map((option) => {
                const Icon = option.icon;
                const active = selectedType === option.type;
                return (
                  <button
                    key={option.type}
                    type="button"
                    onClick={() => handleTypeChange(option.type)}
                    className={`flex min-w-0 items-center gap-2 rounded-lg border px-3 py-3 text-left text-sm font-bold transition-colors ${
                      active
                        ? "border-sky-500/55 bg-sky-400 text-slate-950"
                        : "border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-sky-400/45"
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{option.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">对象名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-950 outline-none focus:border-sky-400 dark:border-slate-700 dark:bg-slate-900 dark:text-white"
              autoFocus
            />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} className="rounded-lg border-white/10 bg-white/[0.03] font-bold">
            取消
          </Button>
          <Button type="button" onClick={handleCreate} className="rounded-lg font-bold">
            创建
          </Button>
        </div>
      </div>
    </div>
  );
}
