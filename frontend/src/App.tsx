import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, SetStateAction } from "react";
import type { NewAnalysisObjectStartMode } from "./components/NewAnalysisObjectDialog";
import { GlobalDialogs } from "./components/GlobalDialogs";
import { DialogProvider, useDialogs } from "./contexts/DialogContext";
import { AppHeader } from "./components/AppHeader";
import type { WorkbenchModelCanvasController } from "./components/WorkbenchModelCanvas";
import { LoadingPanel } from "./components/workbench-result-panels";
import { WorkbenchMainArea } from "./components/WorkbenchMainArea";
import { useTemplateLibrary } from "./hooks/useTemplateLibrary";
import { useWorkbenchModelCanvasController } from "./hooks/useWorkbenchModelCanvasController";
import { materialLibraryFromCustomMaterials } from "./lib/material-presets";
import type { ProjectInfo, WorkbenchView } from "./lib/solver-project";
import { moduleSectionId, objectNavigatorSectionId } from "./lib/workbench-navigation";
import { ARCHSIGHT_SOLVER_PROJECT_ACCEPT } from "./lib/project-file";
import type { ProjectTemplate } from "./types/beam";
import type { BeamWorkbenchSelection, FrameWorkbenchSelection, TrussWorkbenchSelection, WorkbenchSelection } from "./types/workbench-selection";
import { restoreWorkspaceSnapshot, type TemplateActionResult } from "./lib/template-library";
import { useWorkbenchSession } from "./hooks/useWorkbenchSession";
import { useAnalysisObjectManager } from "./hooks/useAnalysisObjectManager";
import { useProjectFileActions } from "./hooks/useProjectFileActions";
import { useResizableWorkbenchLayout } from "./hooks/useResizableWorkbenchLayout";
import { useSolverHostBridge } from "./hooks/useSolverHostBridge";
import { createInitialSolverProject, useSolverProjectDocument } from "./hooks/useSolverProjectDocument";
import { useVisitStats } from "./hooks/useVisitStats";
import { useWorkbenchRuntime } from "./hooks/useWorkbenchRuntime";
import { useWorkbenchAppChrome } from "./hooks/useWorkbenchAppChrome";
import { useWorkbenchPageSelectionFlow } from "./hooks/useWorkbenchPageSelectionFlow";
import { APP_VERSION, BUSUANZI_VISIT_STATS_ENABLED } from "./lib/app-metadata";
import {
  canDeleteModelSelections,
} from "./lib/model-workflow-actions";
import type { AnalysisMode } from "./types/structure";
import type { WorkspaceState } from "./lib/workspace-state";
import { buildModelDiagnostics } from "./lib/model-diagnostics";
import { resolveHostAllowedOrigins, resolveWorkbenchPresentation } from "./lib/workbench-presentation";

const LazyBeamForm = lazy(() => import("./components/BeamForm").then((module) => ({ default: module.BeamForm })));
const LazyFrameForm = lazy(() => import("./components/FrameForm").then((module) => ({ default: module.FrameForm })));
const LazyTrussForm = lazy(() => import("./components/TrussForm").then((module) => ({ default: module.TrussForm })));

const SOLVER_HOST_ALLOWED_ORIGINS = resolveHostAllowedOrigins(
  typeof window !== "undefined" ? window.__ARCHSIGHT_SOLVER_RUNTIME_CONFIG__?.hostAllowedOrigins : "",
  import.meta.env.VITE_SOLVER_HOST_ALLOWED_ORIGINS,
);

type AnalysisObjectPageState = {
  moduleSectionId?: string;
  resultTabId?: string;
  workbenchView?: WorkbenchView;
};

interface WorkbenchSelectionState {
  primary: WorkbenchSelection | null;
  items: WorkbenchSelection[];
}

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

function AppContent() {
  const [presentation] = useState(() => resolveWorkbenchPresentation(
    typeof window === "undefined" ? "" : window.location.search,
  ));
  const isEmbeddedWorkbench = presentation.embedded;
  const { isDark, setIsDark, clientId } = useWorkbenchSession(presentation.theme);
  const [pageStateByObjectId, setPageStateByObjectId] = useState<Record<string, AnalysisObjectPageState>>({});
  const [workbenchSelectionState, setWorkbenchSelectionState] = useState<WorkbenchSelectionState>({ primary: null, items: [] });
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
  const [gridSnapStepM, setGridSnapStepM] = useState(0.5);
  const {
    isSystemSettingsDocked,
    setProjectInfoDialogMode,
    setIsSystemSettingsOpen,
    setIsPublicExamplesOpen,
    setIsTemplateLibraryOpen,
    setIsNewAnalysisObjectDialogOpen
  } = useDialogs();

  const {
    activeAnalysisObject,
    clearAnalysisResults,
    clearProjectFileLink,
    completeProjectFileSave,
    commitAnalysisResult,
    commitSensitivityResult,
    fileStatusMessage,
    isProjectDirty,
    isProjectReadOnly,
    lastSavedAt,
    getProjectDocumentSnapshot,
    getProjectRevision,
    markProjectDirty,
    markProjectSaved,
    project,
    projectFileHandle,
    projectFileName,
    replaceProject,
    setFileStatusMessage,
    setCustomMaterials,
    setModelPreviewStyle,
    setProject,
    setProjectForNavigation,
    setProjectReadOnly,
    setReportExportOptions,
    undoWorkspaceChange,
    updateProjectInfo,
    updateWorkspace,
    redoWorkspaceChange,
    canUndoWorkspace,
    canRedoWorkspace,
    workspace,
  } = useSolverProjectDocument({ localAutosaveEnabled: !isEmbeddedWorkbench });
  const reportExportOptions = project.settings.reportExportOptions;
  const projectMaterialLibrary = useMemo(
    () => materialLibraryFromCustomMaterials(project.settings.customMaterials),
    [project.settings.customMaterials]
  );
  const {
    handleInspectorResizeStart,
    handleModuleNavResizeStart,
    isCompactWorkbench,
    isModuleNavCollapsed,
    setIsInspectorCollapsed,
    setIsModuleNavCollapsed,
    showInspectorCollapsed,
    workbenchGridStyle,
  } = useResizableWorkbenchLayout(isSystemSettingsDocked && !isEmbeddedWorkbench);
  const analysisMode = workspace.analysisMode;
  const modelDiagnostics = useMemo(() => buildModelDiagnostics(workspace), [workspace]);
  const resetWorkbenchContext = useCallback(() => {
    setWorkbenchSelectionState({ primary: null, items: [] });
  }, []);
  const pendingNewObjectStartModeRef = useRef<NewAnalysisObjectStartMode>("quick");
  const sectionForStartMode = useCallback((mode: AnalysisMode, startMode: NewAnalysisObjectStartMode) => {
    if (startMode === "object") return objectNavigatorSectionId(mode);
    if (startMode === "text") return moduleSectionId(mode, "text");
    return moduleSectionId(mode, "template");
  }, []);
  const resetAllPageState = useCallback(() => {
    setWorkbenchSelectionState({ primary: null, items: [] });
    setPageStateByObjectId({});
  }, []);
  const activeObjectPageState = pageStateByObjectId[activeAnalysisObject.id] ?? {};
  const workbenchView = activeObjectPageState.workbenchView ?? activeAnalysisObject.workbenchView ?? "model";
  const setWorkbenchView = useCallback((nextView: SetStateAction<WorkbenchView>) => {
    setPageStateByObjectId((current) => {
      const currentView = current[activeAnalysisObject.id]?.workbenchView ?? activeAnalysisObject.workbenchView ?? "model";
      const resolvedView = typeof nextView === "function" ? nextView(currentView) : nextView;
      return {
        ...current,
        [activeAnalysisObject.id]: {
          ...current[activeAnalysisObject.id],
          workbenchView: resolvedView,
        },
      };
    });
  }, [activeAnalysisObject.id, activeAnalysisObject.workbenchView]);
  const visitStats = useVisitStats();
  const {
    beamResults,
    benchmarkSubmissionContext,
    clearCurrentAnalysisRuntime,
    exportingFormat,
    frameResults,
    handleExport,
    handleAnalysisObjectChanged,
    handleRunAndReview,
    handleRunCurrentModule,
    handleRunWorkspace,
    handleSensitivity,
    isScanning,
    isSolving,
    operationNotice,
    resultValidity,
    resetRuntimeForNewAnalysisObject,
    runLabel,
    sensitivityData,
    trussResults,
  } = useWorkbenchRuntime({
    activeAnalysisObject,
    clientId,
    clearAnalysisResults,
    commitAnalysisResult,
    commitSensitivityResult,
    getProjectRevision,
    modelDiagnostics,
    projectName: project.settings.projectInfo.name,
    reportExportOptions,
    resetWorkbenchContext,
    setWorkbenchView,
    updateWorkspace,
    workbenchView,
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
  } = useTemplateLibrary({ localPersistenceEnabled: !isEmbeddedWorkbench });

  const {
    activeGeometrySelection,
    activeGeometrySelectionSet,
    activeModuleSectionId,
    activeWorkbenchSelection,
    activeWorkbenchSelectionSet,
    handleModelDiagnosticNavigate,
    handleWorkbenchSelectionChange,
    handleWorkbenchSelectionSetChange,
    moduleSections,
    setActiveModuleSection,
    setActiveResultTab,
  } = useWorkbenchPageSelectionFlow({
    activeAnalysisObjectId: activeAnalysisObject.id,
    analysisMode,
    activeObjectPageState,
    fallbackActiveModuleSectionId: project.settings.activeModuleSection,
    setPageStateByObjectId,
    setWorkbenchSelectionState,
    setWorkbenchView,
    workbenchSelectionState,
  });

  const handleRestoreTemplate = (template: ProjectTemplate): TemplateActionResult<void> => {
    if (isProjectReadOnly) {
      setFileStatusMessage("外部宿主只读模式下不能恢复模板。");
      return { ok: false, error: "readonly" };
    }
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
    completeProjectFileSave,
    getProjectDocumentSnapshot,
    isProjectDirty,
    isProjectReadOnly,
    onNewProjectRequested: () => setProjectInfoDialogMode("create"),
    onProjectOpened: resetAllPageState,
    onPublicExampleClosed: () => setIsPublicExamplesOpen(false),
    project,
    projectFileHandle,
    replaceProject,
  });
  const handleHostSaveResult = useCallback((status: string, projectRevision: number | null) => {
    if (status === "saved" && projectRevision !== null) {
      markProjectSaved(projectRevision, "外部宿主已保存工程。");
    }
  }, [markProjectSaved]);
  const {
    emitProjectChanged,
    hostMode,
    hostOrigin,
    hostSessionId,
    requestHostSave,
  } = useSolverHostBridge({
    allowedOrigins: SOLVER_HOST_ALLOWED_ORIGINS,
    getProjectRevision,
    project,
    onHostModeChange: (mode) => setProjectReadOnly(mode === "readonly"),
    onHostSaveResult: handleHostSaveResult,
    replaceProject,
    setFileStatusMessage,
  });
  const handleSaveProject = useCallback((forceSaveAs = false) => {
    if (isProjectReadOnly) {
      setFileStatusMessage("外部宿主只读模式下不能保存工程。");
      return;
    }
    if (!forceSaveAs && requestHostSave()) {
      setFileStatusMessage("已向外部宿主请求保存工程。");
      return;
    }
    void handleSaveProjectFile(forceSaveAs);
  }, [handleSaveProjectFile, isProjectReadOnly, requestHostSave, setFileStatusMessage]);
  useEffect(() => {
    if (isProjectDirty) {
      emitProjectChanged();
    }
  }, [emitProjectChanged, isProjectDirty, project.updatedAt]);
  const {
    handleCreateAnalysisObject,
    handleRemoveAnalysisObject,
    handleSelectAnalysisObject,
    objectCountByType,
  } = useAnalysisObjectManager({
    markProjectDirty,
    onAnalysisObjectChanged: handleAnalysisObjectChanged,
    onCreatedDialogClose: () => setIsNewAnalysisObjectDialogOpen(false),
    onCreatedAnalysisObject: (object) => {
      setPageStateByObjectId((current) => ({
        ...current,
        [object.id]: {
          ...current[object.id],
          moduleSectionId: sectionForStartMode(object.type, pendingNewObjectStartModeRef.current),
        },
      }));
    },
    project,
    isProjectReadOnly,
    setFileStatusMessage,
    setProject,
    setProjectForNavigation,
  });
  const handleCreateAnalysisObjectWithPath = useCallback((type: AnalysisMode, name: string, startMode: NewAnalysisObjectStartMode) => {
    pendingNewObjectStartModeRef.current = startMode;
    handleCreateAnalysisObject(type, name);
  }, [handleCreateAnalysisObject]);
  const fileDisplayName = projectFileName ?? "未选择文件";
  const fileStateLabel = isProjectDirty ? "未保存" : lastSavedAt ? "已保存" : "新建项目";
  const hostStatusLabel = hostSessionId
    ? `外部宿主：${hostMode === "readonly" ? "只读" : "可编辑"}${hostOrigin ? ` · ${hostOrigin}` : ""}`
    : null;
  const modelCanvasController: WorkbenchModelCanvasController = useWorkbenchModelCanvasController({
    activeSelection: activeWorkbenchSelection,
    activeSelectionSet: activeWorkbenchSelectionSet,
    activeGeometrySelection,
    activeGeometrySelectionSet,
    analysisMode,
    canRedoWorkspace,
    canUndoWorkspace,
    gridSnapEnabled,
    gridSnapStepM,
    projectMaterialLibrary,
    setGridSnapEnabled,
    setGridSnapStepM,
    onSelect: handleWorkbenchSelectionChange,
    onSelectionSetChange: handleWorkbenchSelectionSetChange,
    updateWorkspace,
    redoWorkspaceChange,
    undoWorkspaceChange,
    workspace,
  });
  const workbenchAppChrome = useWorkbenchAppChrome({
    canDeleteSelection: canDeleteModelSelections(workspace, activeGeometrySelectionSet),
    onDeleteSelection: modelCanvasController.onDeleteSelection,
    onRedoWorkspace: redoWorkspaceChange,
    onSaveProject: handleSaveProject,
    onUndoWorkspace: undoWorkspaceChange,
    workbenchView,
  });
  const fileMenuRef = workbenchAppChrome.fileMenuRef;
  const isFileMenuOpen = workbenchAppChrome.isFileMenuOpen;
  const setIsFileMenuOpen = workbenchAppChrome.setIsFileMenuOpen;
  const handleRunGeneratedWorkspace = useCallback((nextWorkspace: WorkspaceState) => {
    if (isProjectReadOnly) {
      setFileStatusMessage("外部宿主只读模式下不能生成或替换模型。");
      return;
    }
    updateWorkspace(nextWorkspace);
    void handleRunWorkspace(nextWorkspace);
  }, [handleRunWorkspace, isProjectReadOnly, setFileStatusMessage, updateWorkspace]);
  const handleCreateProjectWithInfo = (next: ProjectInfo) => {
    replaceProject(createInitialSolverProject(next), null, null, null, "新建项目");
    resetAllPageState();
    resetRuntimeForNewAnalysisObject();
    setProjectInfoDialogMode(null);
  };
  const handleUpdateProjectInfo = (next: ProjectInfo) => {
    updateProjectInfo(next);
    setProjectInfoDialogMode(null);
    setFileStatusMessage("已更新工程设置");
  };
  const beamSelection = activeWorkbenchSelection?.mode === "beam" && activeWorkbenchSelection.type !== "label" ? (activeWorkbenchSelection as BeamWorkbenchSelection) : null;
  const frameSelection = activeWorkbenchSelection?.mode === "frame" && activeWorkbenchSelection.type !== "label" ? (activeWorkbenchSelection as FrameWorkbenchSelection) : null;
  const trussSelection = activeWorkbenchSelection?.mode === "truss" && activeWorkbenchSelection.type !== "label" ? (activeWorkbenchSelection as TrussWorkbenchSelection) : null;
  const formContent =
    <Suspense fallback={<LoadingPanel compact={isCompactWorkbench} />}>
      {analysisMode === "beam" ? (
        <LazyBeamForm
          value={workspace.beam}
          materialLibrary={projectMaterialLibrary}
          onMaterialLibraryChange={setCustomMaterials}
          onChange={(next) => updateWorkspace((current) => ({ ...current, beam: next }))}
          onRunGeneratedModel={(next) => handleRunGeneratedWorkspace({ ...workspace, analysisMode: "beam", beam: next })}
          activeSectionId={activeModuleSectionId}
          selection={beamSelection}
          onSelectionChange={handleWorkbenchSelectionChange}
          compact={isCompactWorkbench}
        />
      ) : analysisMode === "truss" ? (
        <LazyTrussForm
          value={workspace.truss}
          materialLibrary={projectMaterialLibrary}
          onChange={(next) => updateWorkspace((current) => ({ ...current, truss: next }))}
          onRunGeneratedModel={(next) => handleRunGeneratedWorkspace({ ...workspace, analysisMode: "truss", truss: next })}
          activeSectionId={activeModuleSectionId}
          selection={trussSelection}
          onSelectionChange={handleWorkbenchSelectionChange}
          gridSnapEnabled={gridSnapEnabled}
          gridSnapStepM={gridSnapStepM}
          compact={isCompactWorkbench}
        />
      ) : (
        <LazyFrameForm
          value={workspace.frame}
          materialLibrary={projectMaterialLibrary}
          onChange={(next) => updateWorkspace((current) => ({ ...current, frame: next }))}
          onRunGeneratedModel={(next) => handleRunGeneratedWorkspace({ ...workspace, analysisMode: "frame", frame: next })}
          activeSectionId={activeModuleSectionId}
          selection={frameSelection}
          onSelectionChange={handleWorkbenchSelectionChange}
          gridSnapEnabled={gridSnapEnabled}
          gridSnapStepM={gridSnapStepM}
          compact={isCompactWorkbench}
        />
      )}
    </Suspense>
  ;

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

      {!isEmbeddedWorkbench ? (
        <AppHeader
          appVersion={APP_VERSION}
          fileDisplayName={fileDisplayName}
          fileMenuRef={fileMenuRef}
          fileStateLabel={fileStateLabel}
          fileStatusMessage={fileStatusMessage}
          hostStatusLabel={hostStatusLabel}
          isCompactWorkbench={isCompactWorkbench}
          isDark={isDark}
          isFileMenuOpen={isFileMenuOpen}
          isProjectDirty={isProjectDirty}
          isProjectReadOnly={isProjectReadOnly}
          releaseNotesHref={RELEASE_NOTES_HREF}
          onNewProjectFile={handleNewProjectFile}
          onOpenProjectFile={handleOpenProjectFile}
          onSaveProjectFile={handleSaveProject}
          setIsDark={setIsDark}
          setIsFileMenuOpen={setIsFileMenuOpen}
        />
      ) : null}

      <WorkbenchMainArea
        analysisMode={analysisMode}
        activeModuleSectionId={activeModuleSectionId}
        activeObjectPageState={activeObjectPageState}
        beamResults={beamResults}
        exportingFormat={exportingFormat}
        frameResults={frameResults}
        handleExport={handleExport}
        handleInspectorResizeStart={handleInspectorResizeStart}
        handleModuleNavResizeStart={handleModuleNavResizeStart}
        handleModelDiagnosticNavigate={handleModelDiagnosticNavigate}
        handleRemoveAnalysisObject={handleRemoveAnalysisObject}
        handleRunAndReview={handleRunAndReview}
        handleSensitivity={handleSensitivity}
        handleSelectAnalysisObject={handleSelectAnalysisObject}
        isCompactWorkbench={isCompactWorkbench}
        isEmbeddedWorkbench={isEmbeddedWorkbench}
        isModuleNavCollapsed={isModuleNavCollapsed}
        isProjectReadOnly={isProjectReadOnly}
        isScanning={isScanning}
        isSolving={isSolving}
        isSystemSettingsDocked={isSystemSettingsDocked}
        modelCanvasController={modelCanvasController}
        modelDiagnostics={modelDiagnostics}
        moduleSections={moduleSections}
        onCloseSystemSettings={() => setIsSystemSettingsOpen(false)}
        onOpenTemplateLibrary={() => setIsTemplateLibraryOpen(true)}
        operationNotice={operationNotice}
        project={project}
        releaseNotesHref={RELEASE_NOTES_HREF}
        reportExportOptions={reportExportOptions}
        resultValidity={resultValidity}
        runLabel={runLabel}
        sensitivityData={sensitivityData}
        setActiveModuleSection={setActiveModuleSection}
        setActiveResultTab={setActiveResultTab}
        setIsInspectorCollapsed={setIsInspectorCollapsed}
        setIsModuleNavCollapsed={setIsModuleNavCollapsed}
        setModelPreviewStyle={setModelPreviewStyle}
        setReportExportOptions={setReportExportOptions}
        setWorkbenchView={setWorkbenchView}
        showInspectorCollapsed={showInspectorCollapsed}
        trussResults={trussResults}
        updateWorkspace={updateWorkspace}
        userManualHref={USER_MANUAL_HREF}
        visitStats={visitStats}
        workbenchGridStyle={workbenchGridStyle}
        workbenchView={workbenchView}
        workspace={workspace}
        formContent={formContent}
      />

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

      <GlobalDialogs
        hostManagedProject={isEmbeddedWorkbench}
        isCompactWorkbench={isCompactWorkbench}
        isProjectReadOnly={isProjectReadOnly}
        project={project}
        visitStats={visitStats}
        setModelPreviewStyle={setModelPreviewStyle}
        objectCountByType={objectCountByType}
        handleCreateAnalysisObject={handleCreateAnalysisObjectWithPath}
        setCustomMaterials={setCustomMaterials}
        handleUpdateProjectInfo={handleUpdateProjectInfo}
        handleCreateProjectWithInfo={handleCreateProjectWithInfo}
        handleOpenPublicExampleProject={handleOpenPublicExampleProject}
        benchmarkSubmissionContext={benchmarkSubmissionContext}
        isSolving={isSolving}
        handleRunCurrentModule={handleRunCurrentModule}
        analysisMode={analysisMode}
        templates={templates}
        baselineTemplateId={baselineTemplateId}
        isAtCapacity={isAtCapacity}
        saveTemplate={saveTemplate}
        workspace={workspace}
        handleRestoreTemplate={handleRestoreTemplate}
        duplicateTemplate={duplicateTemplate}
        deleteTemplate={deleteTemplate}
        setBaselineTemplate={setBaselineTemplate}
        RELEASE_NOTES_HREF={RELEASE_NOTES_HREF}
        USER_MANUAL_HREF={USER_MANUAL_HREF}
      />
    </div>
  );
}

export default function App() {
  return (
    <DialogProvider>
      <AppContent />
    </DialogProvider>
  );
}
