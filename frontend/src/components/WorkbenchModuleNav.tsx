import { Activity, Building2, Layers, Triangle } from "lucide-react";
import type { AnalysisMode } from "../types/structure";
import { analysisVocabulary } from "../lib/analysis-vocabulary";
import { cn } from "@/lib/utils";

interface WorkbenchModuleNavProps {
  value: AnalysisMode;
  onChange: (mode: AnalysisMode) => void;
  layout?: "vertical" | "horizontal";
  density?: "regular" | "compact";
  label?: string;
  collapsed?: boolean;
  className?: string;
}

const MODULES: Array<{
  mode: AnalysisMode;
  title: string;
  ariaLabel: string;
  icon: typeof Layers;
}> = [
  {
    mode: "beam",
    title: analysisVocabulary("beam").systemLabel,
    ariaLabel: `${analysisVocabulary("beam").analysisLabel}工作台`,
    icon: Layers,
  },
  {
    mode: "truss",
    title: analysisVocabulary("truss").systemLabel,
    ariaLabel: analysisVocabulary("truss").analysisLabel,
    icon: Triangle,
  },
  {
    mode: "frame",
    title: analysisVocabulary("frame").systemLabel,
    ariaLabel: analysisVocabulary("frame").analysisLabel,
    icon: Building2,
  },
];

export function WorkbenchModuleNav({
  value,
  onChange,
  layout = "vertical",
  density = "regular",
  label = "结构体系",
  collapsed = false,
  className,
}: WorkbenchModuleNavProps) {
  const isHorizontal = layout === "horizontal";
  const isCompact = density === "compact";
  const isCollapsed = !isHorizontal && collapsed;
  const showLabel = Boolean(label);
  return (
    <nav className={cn("min-w-0", isCollapsed ? "space-y-2" : "space-y-3", className)} aria-label="计算模块">
      {showLabel ? (
        <div
          className={cn(
            "eyebrow flex items-center gap-2 text-slate-500 dark:text-slate-300",
            isHorizontal && "mb-0",
            isCollapsed && "sr-only"
          )}
        >
          <Activity className="h-3.5 w-3.5" />
          {label}
        </div>
      ) : null}
      <div
        className={cn(
          isHorizontal
            ? isCompact
              ? "grid grid-cols-3 gap-2"
              : "flex flex-nowrap gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0"
            : "grid gap-2"
        )}
      >
        {MODULES.map((module) => {
          const Icon = module.icon;
          const active = module.mode === value;
          return (
            <button
              key={module.mode}
              type="button"
              onClick={() => onChange(module.mode)}
              className={cn(
                "flex items-center rounded-lg border text-left transition-all",
                isHorizontal
                  ? isCompact
                    ? "min-w-0 flex-col justify-center gap-1.5 px-1.5 py-2 text-center"
                    : "min-w-[11.5rem] flex-none gap-3 px-3 py-2.5 sm:min-w-[13.5rem] sm:flex-1"
                  : isCollapsed
                    ? "h-12 w-full justify-center px-0 py-0"
                    : "w-full gap-3 px-3 py-2.5",
                active
                  ? "border-sky-400/45 bg-sky-500/[0.13] text-slate-950 shadow-sm dark:!border-sky-400/45 dark:!bg-sky-400/[0.14] dark:!text-sky-50"
                  : "border-slate-200/70 bg-white/55 text-slate-600 hover:border-sky-300 hover:bg-sky-50 hover:text-slate-950 dark:!border-slate-700/80 dark:!bg-slate-900/45 dark:!text-slate-300 dark:hover:!border-sky-400/35 dark:hover:!bg-sky-400/10 dark:hover:!text-sky-100"
              )}
              aria-current={active ? "page" : undefined}
              aria-pressed={active}
              aria-label={module.ariaLabel}
              title={isCollapsed ? module.title : undefined}
            >
              <span
                className={`flex shrink-0 items-center justify-center rounded-md ${
                  isHorizontal && isCompact ? "h-6 w-6" : isCollapsed ? "h-9 w-9" : "h-10 w-10"
                } ${active ? "bg-sky-400 text-slate-950 shadow-sm" : "bg-slate-100 text-slate-500 dark:!bg-slate-800 dark:!text-slate-300"}`}
              >
                <Icon className={isHorizontal && isCompact ? "h-3 w-3" : "h-4 w-4"} />
              </span>
              <span className={cn("min-w-0 flex-1", isHorizontal && isCompact && "text-center", isCollapsed && "sr-only")}>
                <span
                  className={cn(
                    "block truncate font-bold",
                    isHorizontal ? (isCompact ? "text-[11px] leading-tight" : "text-xs") : "text-[15px] leading-tight"
                  )}
                >
                  {module.title}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
