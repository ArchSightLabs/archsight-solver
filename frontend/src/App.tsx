import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  GripVertical,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import { BeamForm } from "./components/BeamForm";
import { FrameForm } from "./components/FrameForm";
import { TrussForm } from "./components/TrussForm";
import { TemplateLibraryPanel } from "./components/TemplateLibraryPanel";
import { SystemSettingsPanel } from "./components/SystemSettingsPanel";
import { NewAnalysisObjectDialog } from "./components/NewAnalysisObjectDialog";
import { ProjectTreePanel } from "./components/ProjectTreePanel";
import { ProjectInfoDialog } from "./components/ProjectInfoDialog";
import { PublicExamplesDialog } from "./components/PublicExamplesDialog";
import { BenchmarkSubmissionDialog } from "./components/BenchmarkSubmissionDialog";
import { AppHeader } from "./components/AppHeader";
import { WorkbenchInspectorPanel } from "./components/WorkbenchInspectorPanel";
import { WorkbenchModelCanvas } from "./components/WorkbenchModelCanvas";
import { WorkbenchResultTabs } from "./components/WorkbenchResultTabs";
import { WorkbenchSensitivityPanel } from "./components/WorkbenchSensitivityPanel";
import { WorkbenchViewTabs } from "./components/WorkbenchViewTabs";
import { GlassCard } from "./components/ui/GlassCard";
import { Button } from "./components/ui/button";
import { useTemplateLibrary } from "./hooks/useTemplateLibrary";
import { createWorkspaceSnapshot, restoreWorkspaceSnapshot } from "./lib/template-library";
import type { ProjectInfo } from "./lib/solver-project";
import { moduleSectionsForMode, normalizeModuleSectionId, objectNavigatorSectionId } from "./lib/workbench-navigation";
import { ARCHSIGHT_SOLVER_PROJECT_ACCEPT } from "./lib/project-file";
import type { ProjectTemplate } from "./types/beam";
import type { BeamWorkbenchSelection, FrameWorkbenchSelection, TrussWorkbenchSelection, WorkbenchSelection, WorkbenchSelectionOptions } from "./types/workbench-selection";
import type { TemplateActionResult } from "./lib/template-library";
import { useWorkbenchSession } from "./hooks/useWorkbenchSession";
import { useAnalysisObjectManager } from "./hooks/useAnalysisObjectManager";
import { useProjectFileActions } from "./hooks/useProjectFileActions";
import { useResizableWorkbenchLayout } from "./hooks/useResizableWorkbenchLayout";
import { createInitialSolverProject, useSolverProjectDocument } from "./hooks/useSolverProjectDocument";
import { useVisitStats } from "./hooks/useVisitStats";
import { useWorkbenchRuntime } from "./hooks/useWorkbenchRuntime";
import { APP_VERSION, BUSUANZI_VISIT_STATS_ENABLED } from "./lib/app-metadata";

const HIDDEN_VISIT_STATS_STYLE = {
  position: "absolute",
  width: "1px",
  height: "1px",
  overflow: "hidden",
  clipPath: "inset(50%)",
  whiteSpace: "nowrap",
} satisfies CSSProperties;
const RELEASE_NOTES_HREF = "/docs/release-notes.html";
const USER_MANUAL_HREF = "/docs/user-manual.html";

function App() {
  const { isDark, setIsDark, clientId } = useWorkbenchSession();
  const [activeModuleSection, setActiveModuleSection] = useState("");
  const [workbenchSelection, setWorkbenchSelection] = useState<WorkbenchSelection | null>(null);
  const [isNewAnalysisObjectDialogOpen, setIsNewAnalysisObjectDialogOpen] = useState(false);
  const [projectInfoDialogMode, setProjectInfoDialogMode] = useState<"create" | "edit" | null>(null);
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false);
  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false);
  const [isPublicExamplesOpen, setIsPublicExamplesOpen] = useState(false);
  const [isBenchmarkSubmissionOpen, setIsBenchmarkSubmissionOpen] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement | null>(null);
  const {
    activeAnalysisObject,
    clearProjectFileLink,
    fileStatusMessage,
    isProjectDirty,
    lastSavedAt,
    markProjectDirty,
    project,
    projectFileHandle,
    projectFileName,
    replaceProject,
    setFileStatusMessage,
    setModelPreviewStyle,
    setProject,
    setReportExportOptions,
    updateProjectInfo,
    updateWorkspace,
    workspace,
  } = useSolverProjectDocument();
  const reportExportOptions = project.settings.reportExportOptions;
  const {
    handleInspectorResizeStart,
    handleModuleNavResizeStart,
    isCompactWorkbench,
    isModuleNavCollapsed,
    isSystemSettingsDocked,
    setIsInspectorCollapsed,
    setIsModuleNavCollapsed,
    showInspectorCollapsed,
    workbenchGridStyle,
  } = useResizableWorkbenchLayout(isSystemSettingsOpen);
  const resetWorkbenchContext = useCallback(() => {
    setWorkbenchSelection(null);
    setActiveModuleSection("");
  }, []);
  const visitStats = useVisitStats();
  const {
    applyCurrentRuntimeToProject,
    beamResults,
    benchmarkSubmissionContext,
    clearCurrentAnalysisRuntime,
    exportingFormat,
    frameResults,
    handleExport,
    handleRunAndReview,
    handleRunCurrentModule,
    handleSensitivity,
    isScanning,
    isSolving,
    markRuntimePersisted,
    operationNotice,
    resetRuntimeForNewAnalysisObject,
    runLabel,
    sensitivityData,
    syncRuntimeFromAnalysisObject,
    trussResults,
    workbenchView,
    setWorkbenchView,
  } = useWorkbenchRuntime({
    activeAnalysisObject,
    clientId,
    markProjectDirty,
    projectName: project.settings.projectInfo.name,
    reportExportOptions,
    resetWorkbenchContext,
    setProject,
    updateWorkspace,
    workspace,
  });
  
  const {
    templates,
    baselineTemplateId,
    isAtCapacity,
    saveTemplate,
    duplicateTemplate,
    deleteTemplate,
    setBaselineTemplate,
  } = useTemplateLibrary();

  useEffect(() => {
    if (!isTemplateLibraryOpen && !isSystemSettingsOpen && !isNewAnalysisObjectDialogOpen && !isPublicExamplesOpen && !isBenchmarkSubmissionOpen && projectInfoDialogMode === null) {
      return;
    }
    const shouldLockScroll =
      isTemplateLibraryOpen ||
      isPublicExamplesOpen ||
      isBenchmarkSubmissionOpen ||
      (isSystemSettingsOpen && !isSystemSettingsDocked) ||
      isNewAnalysisObjectDialogOpen ||
      projectInfoDialogMode !== null;

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTemplateLibraryOpen(false);
        setIsPublicExamplesOpen(false);
        setIsBenchmarkSubmissionOpen(false);
        setIsSystemSettingsOpen(false);
        setIsNewAnalysisObjectDialogOpen(false);
        setProjectInfoDialogMode(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    if (shouldLockScroll) {
      document.body.style.overflow = "hidden";
    }
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      if (shouldLockScroll) {
        document.body.style.overflow = previousOverflow;
      }
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isSystemSettingsDocked, isTemplateLibraryOpen, isPublicExamplesOpen, isBenchmarkSubmissionOpen, isSystemSettingsOpen, isNewAnalysisObjectDialogOpen, projectInfoDialogMode]);

  useEffect(() => {
    if (!isFileMenuOpen) {
      return;
    }

    const handlePointerDown = (event: globalThis.PointerEvent) => {
      const target = event.target as globalThis.Node | null;
      if (target && !fileMenuRef.current?.contains(target)) {
        setIsFileMenuOpen(false);
      }
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFileMenuOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isFileMenuOpen]);

  const analysisMode = workspace.analysisMode;
  const moduleSections = moduleSectionsForMode(analysisMode);
  const normalizedActiveModuleSection = normalizeModuleSectionId(analysisMode, activeModuleSection);

  const activeModuleSectionId = normalizedActiveModuleSection && moduleSections.some((item) => item.id === normalizedActiveModuleSection)
    ? normalizedActiveModuleSection
    : moduleSections[0]?.id ?? "";

  const handleRestoreTemplate = (template: ProjectTemplate): TemplateActionResult<void> => {
    const restoredWorkspace = restoreWorkspaceSnapshot(template.snapshot);
    updateWorkspace(restoredWorkspace);
    clearProjectFileLink(`已恢复模板：${template.name}`);
    clearCurrentAnalysisRuntime();
    return { ok: true };
  };

  const {
    handleNewProjectFile,
    handleOpenProjectFile,
    handleOpenPublicExampleProject,
    handleProjectFileChange,
    handleSaveProjectFile,
    projectFileInputRef,
  } = useProjectFileActions({
    applyCurrentRuntimeToProject,
    isProjectDirty,
    markRuntimePersisted,
    onNewProjectRequested: () => setProjectInfoDialogMode("create"),
    onProjectOpened: resetWorkbenchContext,
    onPublicExampleClosed: () => setIsPublicExamplesOpen(false),
    project,
    projectFileHandle,
    replaceProject,
    syncRuntimeFromAnalysisObject,
  });
  const {
    handleCreateAnalysisObject,
    handleRemoveAnalysisObject,
    handleSelectAnalysisObject,
    objectCountByType,
  } = useAnalysisObjectManager({
    applyCurrentRuntimeToProject,
    markProjectDirty,
    onCreatedDialogClose: () => setIsNewAnalysisObjectDialogOpen(false),
    project,
    resetRuntimeForNewAnalysisObject,
    setFileStatusMessage,
    setProject,
    syncRuntimeFromAnalysisObject,
  });
  const fileDisplayName = projectFileName ?? "未选择文件";
  const fileStateLabel = isProjectDirty ? "未保存" : lastSavedAt ? "已保存" : "新建项目";
  const handleWorkbenchSelectionChange = (next: WorkbenchSelection, options?: WorkbenchSelectionOptions) => {
    setWorkbenchSelection(next);
    if (options?.openEditor === false) {
      return;
    }
    const selectedEditorId = objectNavigatorSectionId(next.mode);
    if (moduleSections.some((section) => section.id === selectedEditorId)) {
      setActiveModuleSection(selectedEditorId);
    }
  };
  const handleCreateProjectWithInfo = (next: ProjectInfo) => {
    replaceProject(createInitialSolverProject(next), null, null, null, "新建项目");
    resetRuntimeForNewAnalysisObject();
    setProjectInfoDialogMode(null);
  };
  const handleUpdateProjectInfo = (next: ProjectInfo) => {
    updateProjectInfo(next);
    setProjectInfoDialogMode(null);
    setFileStatusMessage("已更新工程信息");
  };
  const beamSelection = workbenchSelection?.mode === "beam" ? (workbenchSelection as BeamWorkbenchSelection) : null;
  const frameSelection = workbenchSelection?.mode === "frame" ? (workbenchSelection as FrameWorkbenchSelection) : null;
  const trussSelection = workbenchSelection?.mode === "truss" ? (workbenchSelection as TrussWorkbenchSelection) : null;
  const formContent =
    analysisMode === "beam" ? (
      <BeamForm
        value={workspace.beam}
        onChange={(next) => updateWorkspace((current) => ({ ...current, beam: next }))}
        activeSectionId={activeModuleSectionId}
        selection={beamSelection}
        onSelectionChange={handleWorkbenchSelectionChange}
      />
    ) : analysisMode === "truss" ? (
      <TrussForm
        value={workspace.truss}
        onChange={(next) => updateWorkspace((current) => ({ ...current, truss: next }))}
        activeSectionId={activeModuleSectionId}
        selection={trussSelection}
        onSelectionChange={handleWorkbenchSelectionChange}
      />
    ) : (
      <FrameForm
        value={workspace.frame}
        onChange={(next) => updateWorkspace((current) => ({ ...current, frame: next }))}
        activeSectionId={activeModuleSectionId}
        selection={frameSelection}
        onSelectionChange={handleWorkbenchSelectionChange}
      />
    );

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-background text-foreground transition-colors duration-500">
      <input
        ref={projectFileInputRef}
        type="file"
        name="project-file"
        accept={ARCHSIGHT_SOLVER_PROJECT_ACCEPT}
        className="hidden"
        onChange={handleProjectFileChange}
      />
      <div className="fixed inset-0 pointer-events-none opacity-[0.02] dark:opacity-[0.08] [background-image:linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="fixed top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <AppHeader
        appVersion={APP_VERSION}
        fileDisplayName={fileDisplayName}
        fileMenuRef={fileMenuRef}
        fileStateLabel={fileStateLabel}
        fileStatusMessage={fileStatusMessage}
        isCompactWorkbench={isCompactWorkbench}
        isDark={isDark}
        isFileMenuOpen={isFileMenuOpen}
        isProjectDirty={isProjectDirty}
        releaseNotesHref={RELEASE_NOTES_HREF}
        onNewProjectFile={handleNewProjectFile}
        onOpenBenchmarkSubmission={() => setIsBenchmarkSubmissionOpen(true)}
        onOpenProjectFile={handleOpenProjectFile}
        onOpenPublicExamples={() => setIsPublicExamplesOpen(true)}
        onOpenSystemSettings={() => setIsSystemSettingsOpen(true)}
        onSaveProjectFile={(forceSaveAs) => void handleSaveProjectFile(forceSaveAs)}
        setIsDark={setIsDark}
        setIsFileMenuOpen={setIsFileMenuOpen}
      />

      <main className="relative z-10 mx-auto max-w-[118rem] px-4 pb-12 pt-4 sm:px-6 sm:pb-16 sm:pt-6 xl:pb-0">
        <div
          className="grid grid-cols-1 gap-5 xl:items-start"
          style={workbenchGridStyle}
        >
          <aside className="relative hidden xl:block xl:sticky xl:top-24">
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
                onSelectObject={handleSelectAnalysisObject}
                onCreateObject={() => setIsNewAnalysisObjectDialogOpen(true)}
                onRemoveObject={handleRemoveAnalysisObject}
                onEditProjectInfo={() => setProjectInfoDialogMode("edit")}
              />
            </GlassCard>
            {!isModuleNavCollapsed && (
              <button
                type="button"
                aria-label="拖动调整工程树宽度"
                title="拖动调整工程树宽度"
                onPointerDown={handleModuleNavResizeStart}
                className="group absolute -right-4 top-0 hidden h-[calc(100vh-7rem)] w-3 cursor-col-resize items-center justify-center xl:flex"
              >
                <span className="flex h-16 w-1 items-center justify-center rounded-full bg-slate-300/50 transition-colors group-hover:bg-primary/70 dark:bg-slate-700 dark:group-hover:bg-sky-400">
                  <GripVertical className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </button>
            )}
          </aside>

          <section className="min-w-0 space-y-5">
            <div className="mb-5 xl:hidden">
              <GlassCard className="p-3">
                <ProjectTreePanel
                  project={project}
                  compact={isCompactWorkbench}
                  onSelectObject={handleSelectAnalysisObject}
                  onCreateObject={() => setIsNewAnalysisObjectDialogOpen(true)}
                  onRemoveObject={handleRemoveAnalysisObject}
                  onEditProjectInfo={() => setProjectInfoDialogMode("edit")}
                />
              </GlassCard>
            </div>

            <WorkbenchViewTabs value={workbenchView} onChange={setWorkbenchView} />
            {workbenchView === "model" ? (
              <WorkbenchModelCanvas
                workspace={workspace}
                mode={analysisMode}
                compact={isCompactWorkbench}
                modelPreviewStyle={project.settings.modelPreviewStyle}
                selection={workbenchSelection?.mode === analysisMode ? workbenchSelection : null}
                onSelect={handleWorkbenchSelectionChange}
              />
            ) : workbenchView === "sensitivity" ? (
              <WorkbenchSensitivityPanel
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
                <WorkbenchResultTabs
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
                />
              </section>
            )}
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
            {formContent}
          </WorkbenchInspectorPanel>
          {isSystemSettingsDocked ? (
            <SystemSettingsPanel
              compact={false}
              docked
              releaseNotesHref={RELEASE_NOTES_HREF}
              userManualHref={USER_MANUAL_HREF}
              modelPreviewStyle={project.settings.modelPreviewStyle}
              visitStats={visitStats}
              onModelPreviewStyleChange={setModelPreviewStyle}
              onOpenTemplateLibrary={() => setIsTemplateLibraryOpen(true)}
              onClose={() => setIsSystemSettingsOpen(false)}
            />
          ) : null}
        </div>
      </main>

      {BUSUANZI_VISIT_STATS_ENABLED ? (
        <div aria-hidden="true" style={HIDDEN_VISIT_STATS_STYLE}>
          <span id="busuanzi_container_site_pv" style={{ display: "none" }}>
            <span id="busuanzi_value_site_pv" />
          </span>
          <span id="busuanzi_container_site_uv" style={{ display: "none" }}>
            <span id="busuanzi_value_site_uv" />
          </span>
        </div>
      ) : null}

      {isSystemSettingsOpen && !isSystemSettingsDocked && (
        <SystemSettingsPanel
          compact={isCompactWorkbench}
          releaseNotesHref={RELEASE_NOTES_HREF}
          userManualHref={USER_MANUAL_HREF}
          modelPreviewStyle={project.settings.modelPreviewStyle}
          visitStats={visitStats}
          onModelPreviewStyleChange={setModelPreviewStyle}
          onOpenTemplateLibrary={() => setIsTemplateLibraryOpen(true)}
          onClose={() => setIsSystemSettingsOpen(false)}
        />
      )}

      {isNewAnalysisObjectDialogOpen && (
        <NewAnalysisObjectDialog
          existingCountByType={objectCountByType}
          onCreate={handleCreateAnalysisObject}
          onClose={() => setIsNewAnalysisObjectDialogOpen(false)}
        />
      )}

      {projectInfoDialogMode && (
        <ProjectInfoDialog
          initialValue={projectInfoDialogMode === "edit" ? project.settings.projectInfo : null}
          title={projectInfoDialogMode === "edit" ? "设置工程信息" : "新建结构分析项目"}
          confirmLabel={projectInfoDialogMode === "edit" ? "保存工程信息" : "创建项目"}
          onSubmit={projectInfoDialogMode === "edit" ? handleUpdateProjectInfo : handleCreateProjectWithInfo}
          onClose={() => setProjectInfoDialogMode(null)}
        />
      )}

      {isPublicExamplesOpen && (
        <PublicExamplesDialog
          onClose={() => setIsPublicExamplesOpen(false)}
          onOpenProject={handleOpenPublicExampleProject}
        />
      )}

      {isBenchmarkSubmissionOpen && (
        <BenchmarkSubmissionDialog
          category={benchmarkSubmissionContext.category}
          payload={benchmarkSubmissionContext.payload}
          calculationResult={benchmarkSubmissionContext.calculationResult}
          objectName={benchmarkSubmissionContext.objectName}
          disabledReason={benchmarkSubmissionContext.disabledReason}
          isCalculating={isSolving}
          onRunCalculation={handleRunCurrentModule}
          onClose={() => setIsBenchmarkSubmissionOpen(false)}
        />
      )}

      {isTemplateLibraryOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="模板库"
          onClick={() => setIsTemplateLibraryOpen(false)}
        >
          <div
            className={`flex h-[100dvh] w-full flex-col bg-background/95 shadow-2xl ${isCompactWorkbench ? "rounded-none border-0" : "ml-auto max-w-[40rem] border-l border-white/10"}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={`sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-white/10 bg-background/95 backdrop-blur-md ${isCompactWorkbench ? "px-4 py-3" : "px-5 py-4"}`}>
              <div className="space-y-1">
                <div className="eyebrow opacity-50">模块入口</div>
                <h2 className="text-lg font-bold tracking-tight">模板管理</h2>
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsTemplateLibraryOpen(false)}
                aria-label="关闭模板管理"
                className="h-10 w-10 rounded-lg border-white/10 bg-white/[0.03]"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className={`flex-1 overflow-y-auto custom-scrollbar ${isCompactWorkbench ? "p-3" : "p-4"}`}>
              <TemplateLibraryPanel
                templates={templates}
                baselineTemplateId={baselineTemplateId}
                currentMode={analysisMode}
                isAtCapacity={isAtCapacity}
                compact={isCompactWorkbench}
                onSaveTemplate={(name) => saveTemplate(name, createWorkspaceSnapshot(workspace))}
                onSaveComplete={() => setIsTemplateLibraryOpen(false)}
                onRestoreTemplate={handleRestoreTemplate}
                onDuplicateTemplate={duplicateTemplate}
                onDeleteTemplate={deleteTemplate}
                onSetBaselineTemplate={setBaselineTemplate}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
