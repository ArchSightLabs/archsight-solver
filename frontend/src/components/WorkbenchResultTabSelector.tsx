import { useRef, type KeyboardEvent } from "react";
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
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const focusTab = (tabId: string) => {
    onSelectTab(tabId);
    window.requestAnimationFrame(() => {
      tabRefs.current[tabId]?.focus();
    });
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "Home" && event.key !== "End") {
      return;
    }
    event.preventDefault();
    const lastIndex = tabs.length - 1;
    const nextIndex =
      event.key === "Home" ? 0 :
      event.key === "End" ? lastIndex :
      event.key === "ArrowRight" ? (index + 1) % tabs.length :
      (index - 1 + tabs.length) % tabs.length;
    const nextTab = tabs[nextIndex];
    if (nextTab) {
      focusTab(nextTab.id);
    }
  };
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 9.5rem), 1fr))" }}
      role="tablist"
      aria-label="结果页签"
    >
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        const active = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            id={`result-tab-${tab.id}`}
            ref={(node) => {
              tabRefs.current[tab.id] = node;
            }}
            onClick={() => focusTab(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            role="tab"
            aria-selected={active}
            aria-controls={`result-panel-${tab.id}`}
            tabIndex={active ? 0 : -1}
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
