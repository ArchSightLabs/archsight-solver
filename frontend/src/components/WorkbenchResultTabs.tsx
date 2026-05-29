import { lazy, Suspense, useMemo, useState } from "react";
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
import { WorkbenchResultTabSelector } from "./WorkbenchResultTabSelector";
import { WorkbenchResultToolbar } from "./WorkbenchResultToolbar";
import {
  AssumptionsPanel,
  BeamBenchmarkPanel,
  DataCurvePanel,
  EmptyResult,
  LoadingPanel,
  SummaryGrid,
} from "./workbench-result-panels";
import {
  beamDataCurveOptions,
  beamSummaryRows,
  frameDataCurveOptions,
  frameSummaryRows,
  trussDataCurveOptions,
  trussSummaryRows,
} from "./workbench-result-metrics";
import { buildDisplayedFrameResults, buildFrameDisplayOptions, resultTabsForMode, type FrameDisplayOption } from "./workbench-result-model";

const BeamPreview = lazy(() => import("./BeamPreview").then((module) => ({ default: module.BeamPreview })));
const BeamResultDiagrams = lazy(() => import("./BeamResultDiagrams").then((module) => ({ default: module.BeamResultDiagrams })));
const FramePreview = lazy(() => import("./FramePreview").then((module) => ({ default: module.FramePreview })));
const FrameMemberDiagrams = lazy(() => import("./FrameMemberDiagrams").then((module) => ({ default: module.FrameMemberDiagrams })));
const TrussPreview = lazy(() => import("./TrussPreview").then((module) => ({ default: module.TrussPreview })));
const TrussResultDiagrams = lazy(() => import("./TrussResultDiagrams").then((module) => ({ default: module.TrussResultDiagrams })));

interface WorkbenchResultTabsProps {
  analysisMode: AnalysisMode;
  beamResults: BeamCalculationResults | null;
  frameResults: FrameCalculationResults | null;
  trussResults: TrussCalculationResults | null;
  exportingFormat: ExportFormat | null;
  reportExportOptions: ReportExportOptions;
  compact?: boolean;
  onReportExportOptionsChange: (options: ReportExportOptions) => void;
  onExport: (format: ExportFormat) => void;
  onRunCalculation: () => void;
  isSolving: boolean;
  runLabel: string;
  operationNotice: WorkbenchOperationNoticeModel | null;
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
}: WorkbenchResultTabsProps) {
  const tabs = resultTabsForMode(analysisMode);
  const [activeTabState, setActiveTabState] = useState({ mode: analysisMode, tabId: tabs[0].id });
  const [frameDisplayState, setFrameDisplayState] = useState<FrameDisplayOption>({ source: "primary", id: "__primary__", label: "主结果", description: "基本荷载" });
  const activeTab = activeTabState.mode === analysisMode ? activeTabState.tabId : tabs[0].id;
  const hasResults = analysisMode === "frame" ? Boolean(frameResults) : analysisMode === "truss" ? Boolean(trussResults) : Boolean(beamResults);
  const activeTabId = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0].id;
  const activeTabMeta = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];
  const frameDisplayOptions = useMemo(() => buildFrameDisplayOptions(frameResults), [frameResults]);
  const activeFrameDisplayOption = frameDisplayOptions.find((option) => option.source === frameDisplayState.source && option.id === frameDisplayState.id) ?? frameDisplayOptions[0];
  const displayedFrameResults = useMemo(() => buildDisplayedFrameResults(frameResults, activeFrameDisplayOption), [activeFrameDisplayOption, frameResults]);

  const content = (() => {
    if (!hasResults) {
      return <EmptyResult mode={analysisMode} compact={compact} />;
    }

    if (analysisMode === "beam" && beamResults) {
      if (activeTabId === "overview") {
        return (
          <div className={`space-y-3 ${compact ? "" : "sm:space-y-4"}`}>
            {beamResults.beam ? (
              <Suspense fallback={<LoadingPanel compact={compact} />}>
                <BeamPreview beam={beamResults.beam} compact={compact} />
              </Suspense>
            ) : null}
            <Suspense fallback={<LoadingPanel compact={compact} />}>
              <BeamResultDiagrams results={beamResults} compact={compact} />
            </Suspense>
            <DataCurvePanel options={beamDataCurveOptions(beamResults)} compact={compact} />
            <AssumptionsPanel mode="beam" compact={compact} />
            <BeamBenchmarkPanel results={beamResults} compact={compact} />
            <SummaryGrid compact={compact} rows={beamSummaryRows(beamResults)} />
          </div>
        );
      }
      if (activeTabId === "preview") {
        return beamResults.beam ? (
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <BeamPreview beam={beamResults.beam} compact={compact} />
          </Suspense>
        ) : (
          <EmptyResult mode="beam" compact={compact} />
        );
      }
      if (activeTabId === "diagrams") {
        return (
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <BeamResultDiagrams results={beamResults} compact={compact} />
          </Suspense>
        );
      }
      if (activeTabId === "curves") {
        return <DataCurvePanel options={beamDataCurveOptions(beamResults)} compact={compact} />;
      }
      return (
        <div className="space-y-3">
          <AssumptionsPanel mode="beam" compact={compact} />
          <BeamBenchmarkPanel results={beamResults} compact={compact} />
          <SummaryGrid compact={compact} rows={beamSummaryRows(beamResults)} />
        </div>
      );
    }

    if (analysisMode === "truss") {
      if (!trussResults) {
        return <EmptyResult mode="truss" compact={compact} />;
      }

      if (activeTabId === "overview") {
        return (
          <div className={`space-y-3 ${compact ? "" : "sm:space-y-4"}`}>
            <Suspense fallback={<LoadingPanel compact={compact} />}>
              <TrussPreview truss={trussResults.truss ?? null} compact={compact} />
            </Suspense>
            <Suspense fallback={<LoadingPanel compact={compact} />}>
              <TrussResultDiagrams truss={trussResults.truss ?? null} compact={compact} />
            </Suspense>
            <DataCurvePanel options={trussDataCurveOptions(trussResults)} compact={compact} />
            <AssumptionsPanel mode="truss" compact={compact} />
            <SummaryGrid compact={compact} rows={trussSummaryRows(trussResults)} />
          </div>
        );
      }
      if (activeTabId === "preview") {
        return (
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <TrussPreview truss={trussResults.truss ?? null} compact={compact} />
          </Suspense>
        );
      }
      if (activeTabId === "diagrams") {
        return (
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <TrussResultDiagrams truss={trussResults.truss ?? null} compact={compact} />
          </Suspense>
        );
      }
      if (activeTabId === "curves") {
        return <DataCurvePanel options={trussDataCurveOptions(trussResults)} compact={compact} />;
      }
      return (
        <div className="space-y-3">
          <AssumptionsPanel mode="truss" compact={compact} />
          <SummaryGrid compact={compact} rows={trussSummaryRows(trussResults)} />
        </div>
      );
    }

    if (!displayedFrameResults) {
      return <EmptyResult mode="frame" compact={compact} />;
    }

    if (activeTabId === "overview") {
      return (
        <div className={`space-y-3 ${compact ? "" : "sm:space-y-4"}`}>
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <FramePreview frame={displayedFrameResults.frame ?? null} compact={compact} />
          </Suspense>
          <Suspense fallback={<LoadingPanel compact={compact} />}>
            <FrameMemberDiagrams frame={displayedFrameResults.frame ?? null} diagrams={displayedFrameResults.memberDiagrams ?? []} compact={compact} />
          </Suspense>
          <DataCurvePanel options={frameDataCurveOptions(displayedFrameResults)} compact={compact} />
          <AssumptionsPanel mode="frame" compact={compact} />
          <SummaryGrid compact={compact} rows={frameSummaryRows(displayedFrameResults)} />
        </div>
      );
    }
    if (activeTabId === "preview") {
      return (
        <Suspense fallback={<LoadingPanel compact={compact} />}>
          <FramePreview frame={displayedFrameResults.frame ?? null} compact={compact} />
        </Suspense>
      );
    }
    if (activeTabId === "diagrams") {
      return (
        <Suspense fallback={<LoadingPanel compact={compact} />}>
          <FrameMemberDiagrams frame={displayedFrameResults.frame ?? null} diagrams={displayedFrameResults.memberDiagrams ?? []} compact={compact} />
        </Suspense>
      );
    }
    if (activeTabId === "curves") {
      return <DataCurvePanel options={frameDataCurveOptions(displayedFrameResults)} compact={compact} />;
    }
    return (
      <div className="space-y-3">
        <AssumptionsPanel mode="frame" compact={compact} />
        <SummaryGrid compact={compact} rows={frameSummaryRows(displayedFrameResults)} />
      </div>
    );
  })();

  return (
    <section className={`space-y-2 sm:space-y-4 ${compact ? "sm:space-y-3" : ""}`}>
      <GlassCard className={`relative z-40 overflow-visible ${compact ? "space-y-3 p-3 sm:p-4" : "space-y-3 p-4 sm:p-5"}`}>
        <div className={`flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between ${compact ? "sm:gap-3" : "sm:gap-3"}`}>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className={`${compact ? "text-lg" : "text-xl"} font-black tracking-tight`}>{activeTabMeta.label}</h3>
              {analysisMode === "frame" && activeFrameDisplayOption ? (
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.08] px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                  {activeFrameDisplayOption.label}
                </span>
              ) : null}
            </div>
            {analysisMode === "frame" && frameDisplayOptions.length > 1 ? (
              <div className="flex max-w-3xl flex-wrap gap-2 pt-1">
                {frameDisplayOptions.map((option) => {
                  const active = option.source === activeFrameDisplayOption?.source && option.id === activeFrameDisplayOption.id;
                  return (
                    <button
                      key={`${option.source}-${option.id}`}
                      type="button"
                      onClick={() => setFrameDisplayState(option)}
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
            compact={compact}
            hasResults={hasResults}
            isSolving={isSolving}
            runLabel={runLabel}
            exportingFormat={exportingFormat}
            reportExportOptions={reportExportOptions}
            onRunCalculation={onRunCalculation}
            onExport={onExport}
            onReportExportOptionsChange={onReportExportOptionsChange}
          />
        </div>

        <WorkbenchOperationNotice notice={operationNotice} compact={compact} />

        <WorkbenchResultTabSelector
          tabs={tabs}
          activeTabId={activeTabId}
          compact={compact}
          onSelectTab={(tabId) => setActiveTabState({ mode: analysisMode, tabId })}
        />
      </GlassCard>
      <div className={`relative z-0 ${compact ? "min-h-[260px] sm:min-h-[360px]" : "min-h-[320px] sm:min-h-[460px]"}`}>{content}</div>
    </section>
  );
}
