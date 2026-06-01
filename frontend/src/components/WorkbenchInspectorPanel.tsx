import type { PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { moduleTitleForMode } from "../lib/workbench-navigation";
import type { AnalysisMode } from "../types/structure";
import { ModuleSectionNav, type ModuleSectionNavItem } from "./ModuleSectionNav";
import { GlassCard } from "./ui/GlassCard";
import { Button } from "./ui/button";

interface WorkbenchInspectorPanelProps {
  analysisMode: AnalysisMode;
  activeModuleSectionId: string;
  collapsed: boolean;
  items: ModuleSectionNavItem[];
  children: ReactNode;
  onCollapsedChange: (collapsed: boolean) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onSelectSection: (sectionId: string) => void;
}

export function WorkbenchInspectorPanel({
  analysisMode,
  activeModuleSectionId,
  collapsed,
  items,
  children,
  onCollapsedChange,
  onResizeStart,
  onSelectSection,
}: WorkbenchInspectorPanelProps) {
  return (
    <aside className="relative space-y-5 xl:sticky xl:top-24 xl:max-h-[calc(100vh-11.5rem)]">
      {collapsed ? (
        <GlassCard className="flex min-h-[22rem] flex-col items-center gap-3 p-2 xl:h-[calc(100vh-7rem)]">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => onCollapsedChange(false)}
            aria-label="展开右侧属性检查器"
            title="展开属性检查器"
            className="h-9 w-9 rounded-lg border-white/10 bg-white/[0.03]"
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>
          <div className="mt-2 flex flex-1 items-start justify-center">
            <span className="[writing-mode:vertical-rl] text-xs font-bold tracking-[0.2em] text-muted-foreground">
              参数区
            </span>
          </div>
        </GlassCard>
      ) : (
        <>
          <button
            type="button"
            aria-label="拖动调整属性检查器宽度"
            title="拖动调整参数区宽度"
            onPointerDown={onResizeStart}
            className="group absolute -left-4 top-0 hidden h-[calc(100vh-7rem)] w-3 cursor-col-resize items-center justify-center xl:flex"
          >
            <span className="h-20 w-1 rounded-full bg-slate-300/50 transition-colors group-hover:bg-primary/70 dark:bg-slate-700 dark:group-hover:bg-sky-400" />
          </button>
          <GlassCard className="inspector-panel flex min-h-0 flex-col gap-4 p-4 sm:p-5 xl:max-h-[calc(100vh-11.5rem)]">
            <ModuleSectionNav
              title={moduleTitleForMode(analysisMode)}
              items={items}
              activeId={activeModuleSectionId}
              onSelect={onSelectSection}
              behavior="select"
              rightSlot={
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => onCollapsedChange(true)}
                  aria-label="收起右侧参数面板"
                  title="收起参数面板"
                  className="hidden h-8 w-8 shrink-0 rounded-lg border-white/10 bg-white/[0.03] xl:inline-flex"
                >
                  <PanelRightClose className="h-4 w-4" />
                </Button>
              }
            />
            <div className="min-h-0 flex-1 overflow-visible pr-0 xl:overflow-y-auto xl:pr-2 custom-scrollbar">
              <div className="space-y-4">
                {children}
              </div>
            </div>
          </GlassCard>
        </>
      )}
    </aside>
  );
}
