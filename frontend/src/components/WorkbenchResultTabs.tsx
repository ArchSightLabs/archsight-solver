import { useMemo, useState } from "react";
import { GlassCard } from "./ui/GlassCard";
import type { BeamCalculationResults } from "../types/beam";
import type {
  AnalysisMode,
  FrameCalculationResults,
  TrussCalculationResults,
} from "../types/structure";
import type { ExportFormat } from "../hooks/useWorkbenchActions";
import type { ReportExportOptions } from "../lib/report-options";
import type { WorkbenchOperationNotice as WorkbenchOperationNoticeModel } from "../lib/workbench-operation-status";
import { WorkbenchOperationNotice } from "./WorkbenchOperationNotice";
import { WorkbenchResultContent } from "./WorkbenchResultContent";
import { WorkbenchResultTabSelector } from "./WorkbenchResultTabSelector";
import { WorkbenchResultToolbar } from "./WorkbenchResultToolbar";
import {
  buildDisplayedBeamResults,
  buildDisplayedFrameResults,
  buildDisplayedTrussResults,
  buildResultDisplayOptions,
  resultTabsForMode,
  type ResultDisplayOption,
} from "./workbench-result-model";

interface WorkbenchResultTabsProps {
  analysisMode: AnalysisMode;
  beamResults: BeamCalculationResults | null;
  frameResults: FrameCalculationResults | null;
  trussResults: TrussCalculationResults | null;
  exportingFormat: ExportFormat | null;
  reportExportOptions: ReportExportOptions;
  compact?: boolean;
  onReportExportOptionsChange: (options: ReportExportOptions) => void;
  onExport: (format: ExportFormat, resultSource?: ResultDisplayOption) => void;
  onRunCalculation: () => void;
  isSolving: boolean;
  runLabel: string;
  operationNotice: WorkbenchOperationNoticeModel | null;
  activeTabId?: string;
  onActiveTabChange?: (tabId: string) => void;
  workspace: import("../lib/workspace-state").WorkspaceState;
  updateWorkspace: import("react").Dispatch<import("react").SetStateAction<import("../lib/workspace-state").WorkspaceState>>;
  isDirty?: boolean;
}

export function WorkbenchResultTabs({
  analysisMode,
  beamResults,
  frameResults,
  trussResults,
  exportingFormat,
  reportExportOptions,
  compact = false,
  onReportExportOptionsChange,
  onExport,
  onRunCalculation,
  isSolving,
  runLabel,
  operationNotice,
  activeTabId: controlledActiveTabId,
  onActiveTabChange,
  workspace,
  updateWorkspace,
  isDirty,
}: WorkbenchResultTabsProps) {
  const tabs = resultTabsForMode(analysisMode);
  const [activeTabState, setActiveTabState] = useState({ mode: analysisMode, tabId: tabs[0].id });
  const [displayState, setDisplayState] = useState<{ mode: AnalysisMode; option: ResultDisplayOption }>({
    mode: analysisMode,
    option: { source: "primary", id: "__primary__", label: "主结果", description: "基本荷载" },
  });
  const activeTab = controlledActiveTabId !== undefined ? controlledActiveTabId : (activeTabState.mode === analysisMode ? activeTabState.tabId : tabs[0].id);
  const hasResults = analysisMode === "frame" ? Boolean(frameResults) : analysisMode === "truss" ? Boolean(trussResults) : Boolean(beamResults);
  const activeTabId = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0].id;
  const activeTabMeta = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const resultDisplayOptions = useMemo(
    () => buildResultDisplayOptions(analysisMode === "frame" ? frameResults : analysisMode === "truss" ? trussResults : beamResults),
    [analysisMode, beamResults, frameResults, trussResults],
  );
  const activeDisplayOption =
    resultDisplayOptions.find((option) => displayState.mode === analysisMode && option.source === displayState.option.source && option.id === displayState.option.id) ?? resultDisplayOptions[0];
  const displayedBeamResults = useMemo(() => buildDisplayedBeamResults(beamResults, activeDisplayOption), [activeDisplayOption, beamResults]);
  const displayedFrameResults = useMemo(() => buildDisplayedFrameResults(frameResults, activeDisplayOption), [activeDisplayOption, frameResults]);
  const displayedTrussResults = useMemo(() => buildDisplayedTrussResults(trussResults, activeDisplayOption), [activeDisplayOption, trussResults]);
  const modelHash = analysisMode === "frame" ? frameResults?.meta?.modelHash : analysisMode === "truss" ? trussResults?.meta?.modelHash : beamResults?.meta?.modelHash;
  const handleSelectTab = (tabId: string) => {
    setActiveTabState({ mode: analysisMode, tabId });
    onActiveTabChange?.(tabId);
  };

  const content = (
    <WorkbenchResultContent
      analysisMode={analysisMode}
      activeTabId={activeTabId}
      compact={compact}
      hasResults={hasResults}
      beamResults={displayedBeamResults}
      trussResults={displayedTrussResults}
      displayedFrameResults={displayedFrameResults}
      workspace={workspace}
      updateWorkspace={updateWorkspace}
    />
  );

  return (
    <section className={`space-y-2 sm:space-y-4 ${compact ? "sm:space-y-3" : ""}`}>
      <GlassCard className={`relative z-40 overflow-visible ${compact ? "space-y-3 p-3 sm:p-4" : "space-y-3 p-4 sm:p-5"}`}>
        <div className={`flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between ${compact ? "sm:gap-3" : "sm:gap-3"}`}>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>{activeTabMeta.label}</h3>
              {activeDisplayOption ? (
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {activeDisplayOption.label}
                </span>
              ) : null}
              {hasResults && !isDirty && (
                <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  已同步
                </span>
              )}
              {hasResults && isDirty && (
                <span className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-medium text-amber-600 dark:border-amber-900/30 dark:bg-amber-900/20 dark:text-amber-400">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                  参数已修改 (需重新计算)
                </span>
              )}
              {modelHash && (
                <span className="font-mono text-[9px] text-slate-400 dark:text-slate-500 truncate max-w-[120px] sm:max-w-[200px]" title={`模型签名: ${modelHash}`}>
                  {modelHash.substring(0, 12)}
                </span>
              )}
            </div>
            {resultDisplayOptions.length > 1 ? (
              <div className="flex max-w-3xl flex-wrap gap-2 pt-1">
                {resultDisplayOptions.map((option) => {
                  const active = option.source === activeDisplayOption?.source && option.id === activeDisplayOption.id;
                  return (
                    <button
                      key={`${option.source}-${option.id}`}
                      type="button"
                      onClick={() => setDisplayState({ mode: analysisMode, option })}
                      aria-pressed={active}
                      className={`rounded-lg border px-3 py-2 text-left text-[11px] transition-colors ${
                        active
                          ? "border-slate-300 bg-slate-100/80 text-slate-900 dark:!border-emerald-400/35 dark:!bg-emerald-500/[0.12] dark:!text-emerald-100"
                          : "border-slate-200/70 bg-white/35 text-muted-foreground hover:border-slate-300 hover:bg-slate-50/80 hover:text-foreground dark:!border-slate-700/80 dark:!bg-slate-900/45 dark:!text-slate-300 dark:hover:!border-sky-400/35 dark:hover:!bg-sky-400/10 dark:hover:!text-sky-100"
                      }`}
                    >
                      <span className="block font-bold">{option.label}</span>
                      <span className="block text-[10px] opacity-70">{option.description}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <WorkbenchResultToolbar
            analysisMode={analysisMode}
            compact={compact}
            hasResults={hasResults}
            isSolving={isSolving}
            runLabel={runLabel}
            exportingFormat={exportingFormat}
            reportExportOptions={reportExportOptions}
            onRunCalculation={onRunCalculation}
            onExport={(format) => onExport(format, activeDisplayOption)}
            onReportExportOptionsChange={onReportExportOptionsChange}
          />
        </div>

        <WorkbenchOperationNotice notice={operationNotice} compact={compact} />

        <WorkbenchResultTabSelector
          tabs={tabs}
          activeTabId={activeTabId}
          compact={compact}
          onSelectTab={handleSelectTab}
        />
      </GlassCard>
      <div className={`relative z-0 ${compact ? "min-h-[260px] sm:min-h-[360px]" : "min-h-[320px] sm:min-h-[460px]"}`}>{content}</div>
    </section>
  );
}
