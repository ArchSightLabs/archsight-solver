import { Activity, FileText, Layers, type LucideIcon } from "lucide-react";
import type { WorkbenchView } from "../lib/solver-project";
import { GlassCard } from "./ui/GlassCard";

const WORKBENCH_VIEW_ITEMS: Array<{ id: WorkbenchView; label: string; shortLabel: string; icon: LucideIcon }> = [
  { id: "model", label: "参数建模", shortLabel: "参数建模", icon: Layers },
  { id: "results", label: "结构计算", shortLabel: "结构计算", icon: FileText },
  { id: "sensitivity", label: "敏感性分析", shortLabel: "敏感性", icon: Activity },
];

interface WorkbenchViewTabsProps {
  value: WorkbenchView;
  onChange: (next: WorkbenchView) => void;
}

export function WorkbenchViewTabs({ value, onChange }: WorkbenchViewTabsProps) {
  return (
    <GlassCard className="p-2 sm:p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2" role="toolbar" aria-label="主工作区功能切换">
        <div className="grid w-full min-w-0 flex-1 grid-cols-3 gap-2 sm:min-w-[22rem] sm:flex-none sm:gap-3" role="tablist" aria-label="主工作区分页">
          {WORKBENCH_VIEW_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = value === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={item.label}
                title={item.label}
                onClick={() => onChange(item.id)}
                className={`inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-bold transition-colors ${
                  active
                    ? "border-sky-500/55 bg-sky-400 text-slate-950 shadow-sm shadow-sky-500/15 dark:border-sky-300/40 dark:bg-sky-400 dark:text-slate-950"
                    : "border-slate-200/80 bg-white/60 text-slate-600 hover:border-sky-300/60 hover:bg-slate-100 hover:text-slate-950 dark:border-slate-600/80 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-sky-400/65 dark:hover:bg-sky-400/12 dark:hover:text-sky-50"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}
