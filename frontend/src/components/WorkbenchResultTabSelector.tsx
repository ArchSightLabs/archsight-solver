import type { ResultTab } from "./workbench-result-model";

interface WorkbenchResultTabSelectorProps {
  tabs: ResultTab[];
  activeTabId: string;
  compact: boolean;
  onSelectTab: (tabId: string) => void;
}

export function WorkbenchResultTabSelector({
  tabs,
  activeTabId,
  compact,
  onSelectTab,
}: WorkbenchResultTabSelectorProps) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-7">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onSelectTab(tab.id)}
            aria-pressed={active}
            title={tab.description}
            className={`flex min-w-0 items-center gap-2 rounded-lg border text-left transition-all ${
              active
                ? "border-slate-300 bg-slate-100/75 text-slate-950 shadow-sm dark:!border-sky-400/35 dark:!bg-sky-400/[0.12] dark:!text-sky-100"
                : "border-slate-200/70 bg-white/35 text-muted-foreground hover:border-slate-300 hover:bg-slate-50/80 hover:text-foreground dark:!border-slate-700/80 dark:!bg-slate-900/45 dark:!text-slate-300 dark:hover:!border-sky-400/35 dark:hover:!bg-sky-400/10 dark:hover:!text-sky-100"
            } ${compact ? "px-3 py-2.5" : "px-3 py-3"}`}
          >
            <span className={`flex shrink-0 items-center justify-center rounded-lg ${compact ? "h-7 w-7" : "h-8 w-8"} ${active ? "bg-sky-400 text-slate-950 dark:!bg-sky-400 dark:!text-slate-950" : "bg-slate-100 text-slate-600 dark:!bg-slate-800 dark:!text-slate-300"}`}>
              <Icon className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
            </span>
            <span className="min-w-0">
              <span className={`block truncate font-bold ${compact ? "text-[13px]" : "text-sm"}`}>{tab.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
