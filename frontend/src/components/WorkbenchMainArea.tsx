import { Suspense, lazy } from "react";
import type { CSSProperties, Dispatch, PointerEventHandler, ReactNode, SetStateAction } from "react";
import {
  GripVertical,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import type { ModelPreviewStyle } from "../types/beam";
import type { WorkspaceState } from "../lib/workspace-state";
import type { SolverProject } from "../lib/solver-project";
import type { VisitStats } from "../hooks/useVisitStats";
import { GlassCard } from "./ui/GlassCard";
import { Button } from "./ui/button";
import { ProjectTreePanel } from "./ProjectTreePanel";
import { WorkbenchViewTabs } from "./WorkbenchViewTabs";
import { WorkbenchInspectorPanel } from "./WorkbenchInspectorPanel";
import { ModelDiagnosticsPanel } from "./ModelDiagnosticsPanel";
import { SystemSettingsPanel } from "./SystemSettingsPanel";
import { LoadingPanel } from "./workbench-result-panels";
import type { WorkbenchModelCanvasController } from "./WorkbenchModelCanvas";
import type { BeamCalculationResults, SensitivityResults } from "../types/beam";
import type { AnalysisMode, FrameCalculationResults, TrussCalculationResults } from "../types/structure";
import type { ExportFormat } from "../hooks/useWorkbenchActions";
import type { ModelDiagnosticIssue, ModelDiagnostics } from "../lib/model-diagnostics";
import type { ReportExportOptions } from "../lib/report-options";
import type { ResultValidity } from "../lib/result-provenance";
import type { WorkbenchOperationNotice as WorkbenchOperationNoticeModel } from "../lib/workbench-operation-status";
import type { WorkbenchView } from "../lib/solver-project";
import type { ResultDisplayOption } from "./workbench-result-model";

const LazyWorkbenchModelCanvas = lazy(() => import("./WorkbenchModelCanvas").then((module) => ({ default: module.WorkbenchModelCanvas })));
const LazyWorkbenchSensitivityPanel = lazy(() => import("./WorkbenchSensitivityPanel").then((module) => ({ default: module.WorkbenchSensitivityPanel })));
const LazyWorkbenchResultTabs = lazy(() => import("./WorkbenchResultTabs").then((module) => ({ default: module.WorkbenchResultTabs })));

interface AnalysisObjectPageState {
  resultTabId?: string;
}

interface WorkbenchMainAreaProps {
  analysisMode: AnalysisMode;
  activeModuleSectionId: string;
  activeObjectPageState: AnalysisObjectPageState;
  beamResults: BeamCalculationResults | null;
  exportingFormat: ExportFormat | null;
  frameResults: FrameCalculationResults | null;
  handleExport: (format: ExportFormat, resultSource?: ResultDisplayOption) => void;
  handleInspectorResizeStart: PointerEventHandler<HTMLButtonElement>;
  handleModuleNavResizeStart: PointerEventHandler<HTMLButtonElement>;
  handleModelDiagnosticNavigate: (diagnostic: ModelDiagnosticIssue) => void;
  handleRemoveAnalysisObject: (objectId: string) => void;
  handleRunAndReview: () => void;
  handleSensitivity: (config: { range: number; steps: number; targetSpanIndex: number; responseMetric: string }) => Promise<void> | void;
  handleSelectAnalysisObject: (objectId: string) => void;
  isCompactWorkbench: boolean;
  isEmbeddedWorkbench: boolean;
  isModuleNavCollapsed: boolean;
  isProjectReadOnly: boolean;
  isScanning: boolean;
  isSolving: boolean;
  isSystemSettingsDocked: boolean;
  modelCanvasController: WorkbenchModelCanvasController;
  modelDiagnostics: ModelDiagnostics;
  moduleSections: Array<{ id: string; label: string }>;
  operationNotice: WorkbenchOperationNoticeModel | null;
  project: SolverProject;
  reportExportOptions: ReportExportOptions;
  resultValidity: ResultValidity;
  runLabel: string;
  sensitivityData: SensitivityResults | null;
  setActiveModuleSection: (sectionId: string) => void;
  setActiveResultTab: (tabId: string) => void;
  setIsInspectorCollapsed: Dispatch<SetStateAction<boolean>>;
  setIsModuleNavCollapsed: Dispatch<SetStateAction<boolean>>;
  setModelPreviewStyle: (style: ModelPreviewStyle) => void;
  setReportExportOptions: (options: ReportExportOptions) => void;
  setWorkbenchView: Dispatch<SetStateAction<WorkbenchView>>;
  showInspectorCollapsed: boolean;
  trussResults: TrussCalculationResults | null;
  visitStats: VisitStats;
  workbenchGridStyle?: CSSProperties;
  workbenchView: WorkbenchView;
  workspace: WorkspaceState;
  formContent: ReactNode;
  onOpenTemplateLibrary: () => void;
  onCloseSystemSettings: () => void;
  releaseNotesHref: string;
  userManualHref: string;
  updateWorkspace: Dispatch<SetStateAction<WorkspaceState>>;
}

export function WorkbenchMainArea({
  analysisMode,
  activeModuleSectionId,
  activeObjectPageState,
  beamResults,
  exportingFormat,
  frameResults,
  handleExport,
  handleInspectorResizeStart,
  handleModuleNavResizeStart,
  handleModelDiagnosticNavigate,
  handleRemoveAnalysisObject,
  handleRunAndReview,
  handleSensitivity,
  handleSelectAnalysisObject,
  isCompactWorkbench,
  isEmbeddedWorkbench,
  isModuleNavCollapsed,
  isProjectReadOnly,
  isScanning,
  isSolving,
  isSystemSettingsDocked,
  modelCanvasController,
  modelDiagnostics,
  moduleSections,
  operationNotice,
  project,
  reportExportOptions,
  resultValidity,
  runLabel,
  sensitivityData,
  setActiveModuleSection,
  setActiveResultTab,
  setIsInspectorCollapsed,
  setIsModuleNavCollapsed,
  setModelPreviewStyle,
  setReportExportOptions,
  setWorkbenchView,
  showInspectorCollapsed,
  trussResults,
  visitStats,
  workbenchGridStyle,
  workbenchView,
  workspace,
  formContent,
  onOpenTemplateLibrary,
  onCloseSystemSettings,
  releaseNotesHref,
  userManualHref,
  updateWorkspace,
}: WorkbenchMainAreaProps) {
  return (
    <main className={`relative z-10 mx-auto max-w-[118rem] px-4 pt-4 ${isEmbeddedWorkbench ? "pb-4 sm:px-4 sm:pb-4 sm:pt-4" : "pb-12 sm:px-6 sm:pb-16 sm:pt-6 xl:pb-0"}`}>
      <div
        className={`grid grid-cols-1 gap-5 xl:items-stretch transition-all duration-500 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] ${isEmbeddedWorkbench ? "min-h-[calc(100vh-2rem)]" : "min-h-[calc(100vh-10rem)]"}`}
        style={workbenchGridStyle}
      >
        <aside className={`relative hidden xl:block xl:sticky ${isEmbeddedWorkbench ? "xl:top-4" : "xl:top-24"}`}>
          <GlassCard className={`transition-all ${isModuleNavCollapsed ? "p-2" : "p-3"}`}>
            <div className={`mb-3 flex items-center ${isModuleNavCollapsed ? "justify-center" : "justify-between gap-2 border-b border-white/10 pb-2"}`}>
              {!isModuleNavCollapsed && (
                <div className="min-w-0">
                  <div className="eyebrow truncate text-slate-500 dark:text-slate-300">工程树</div>
                </div>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setIsModuleNavCollapsed((current) => !current)}
                aria-label={isModuleNavCollapsed ? "展开工程树" : "收起工程树"}
                title={isModuleNavCollapsed ? "展开工程树" : "收起工程树"}
                className="h-8 w-8 shrink-0 rounded-lg border-white/10 bg-white/[0.03]"
              >
                {isModuleNavCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
              </Button>
            </div>
            <ProjectTreePanel
              project={project}
              collapsed={isModuleNavCollapsed}
              compact={isCompactWorkbench}
              readOnly={isProjectReadOnly}
              hostManagedProject={isEmbeddedWorkbench}
              onSelectObject={handleSelectAnalysisObject}
              onRemoveObject={handleRemoveAnalysisObject}
            />
          </GlassCard>
          {!isModuleNavCollapsed && (
            <button
              type="button"
              aria-label="拖动调整工程树宽度"
              title="拖动调整工程树宽度"
              onPointerDown={handleModuleNavResizeStart}
              className={`group absolute -right-4 top-0 hidden w-3 cursor-col-resize items-center justify-center xl:flex ${isEmbeddedWorkbench ? "h-[calc(100vh-2rem)]" : "h-[calc(100vh-7rem)]"}`}
            >
              <span className="flex h-16 w-1 items-center justify-center rounded-full bg-slate-300/50 transition-colors group-hover:bg-primary/70 dark:bg-slate-700 dark:group-hover:bg-sky-400">
                <GripVertical className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
            </button>
          )}
        </aside>

        <section className="min-w-0 flex flex-col gap-5">
          <div className="xl:hidden">
            <GlassCard className="p-3">
              <ProjectTreePanel
                project={project}
                compact={isCompactWorkbench}
                readOnly={isProjectReadOnly}
                hostManagedProject={isEmbeddedWorkbench}
                onSelectObject={handleSelectAnalysisObject}
                onRemoveObject={handleRemoveAnalysisObject}
              />
            </GlassCard>
          </div>

          <WorkbenchViewTabs value={workbenchView} onChange={setWorkbenchView} />
          <Suspense fallback={<LoadingPanel compact={isCompactWorkbench} />}>
            {workbenchView === "model" ? (
              <div className="flex-1 flex flex-col min-h-0">
                <LazyWorkbenchModelCanvas
                  workspace={workspace}
                  mode={analysisMode}
                  compact={isCompactWorkbench}
                  modelPreviewStyle={project.settings.modelPreviewStyle}
                  controller={modelCanvasController}
                />
              </div>
            ) : workbenchView === "sensitivity" ? (
              <LazyWorkbenchSensitivityPanel
                analysisMode={analysisMode}
                workspace={workspace}
                sensitivityData={sensitivityData}
                isScanning={isScanning}
                operationNotice={operationNotice}
                compact={isCompactWorkbench}
                onRunSensitivity={handleSensitivity}
              />
            ) : (
              <section className="min-w-0 space-y-4" aria-label="结果反馈">
                <LazyWorkbenchResultTabs
                  analysisMode={analysisMode}
                  beamResults={beamResults}
                  frameResults={frameResults}
                  trussResults={trussResults}
                  exportingFormat={exportingFormat}
                  reportExportOptions={reportExportOptions}
                  compact={isCompactWorkbench}
                  onReportExportOptionsChange={setReportExportOptions}
                  onExport={handleExport}
                  onRunCalculation={handleRunAndReview}
                  isSolving={isSolving}
                  runLabel={runLabel}
                  operationNotice={operationNotice}
                  activeTabId={activeObjectPageState.resultTabId ?? ""}
                  onActiveTabChange={setActiveResultTab}
                  workspace={workspace}
                  updateWorkspace={updateWorkspace}
                  resultValidity={resultValidity}
                />
              </section>
            )}
          </Suspense>
        </section>

        <WorkbenchInspectorPanel
          analysisMode={analysisMode}
          activeModuleSectionId={activeModuleSectionId}
          collapsed={showInspectorCollapsed}
          items={moduleSections}
          onCollapsedChange={setIsInspectorCollapsed}
          onResizeStart={handleInspectorResizeStart}
          onSelectSection={setActiveModuleSection}
        >
          <ModelDiagnosticsPanel diagnostics={modelDiagnostics} compact={isCompactWorkbench} onNavigate={handleModelDiagnosticNavigate} />
          <fieldset disabled={isProjectReadOnly} aria-label={isProjectReadOnly ? "只读建模区域" : "建模区域"} className="min-w-0 border-0 p-0 disabled:opacity-70">
            {formContent}
          </fieldset>
        </WorkbenchInspectorPanel>
        {isSystemSettingsDocked && !isEmbeddedWorkbench ? (
          <SystemSettingsPanel
            compact={false}
            docked
            releaseNotesHref={releaseNotesHref}
            userManualHref={userManualHref}
            modelPreviewStyle={project.settings.modelPreviewStyle}
            visitStats={visitStats}
            onModelPreviewStyleChange={setModelPreviewStyle}
            onOpenTemplateLibrary={onOpenTemplateLibrary}
            onClose={onCloseSystemSettings}
          />
        ) : null}
      </div>
    </main>
  );
}
