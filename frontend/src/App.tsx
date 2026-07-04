import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  GripVertical,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { BeamForm } from "./components/BeamForm";
import { FrameForm } from "./components/FrameForm";
import { TrussForm } from "./components/TrussForm";
import type { NewAnalysisObjectStartMode } from "./components/NewAnalysisObjectDialog";
import { ProjectTreePanel } from "./components/ProjectTreePanel";
import { SystemSettingsPanel } from "./components/SystemSettingsPanel";
import { GlobalDialogs } from "./components/GlobalDialogs";
import { DialogProvider, useDialogs } from "./contexts/DialogContext";
import { AppHeader } from "./components/AppHeader";
import { ModelDiagnosticsPanel } from "./components/ModelDiagnosticsPanel";
import { WorkbenchInspectorPanel } from "./components/WorkbenchInspectorPanel";
import { WorkbenchModelCanvas } from "./components/WorkbenchModelCanvas";
import { WorkbenchResultTabs } from "./components/WorkbenchResultTabs";
import { WorkbenchSensitivityPanel } from "./components/WorkbenchSensitivityPanel";
import { WorkbenchViewTabs } from "./components/WorkbenchViewTabs";
import { GlassCard } from "./components/ui/GlassCard";
import { Button } from "./components/ui/button";
import { useTemplateLibrary } from "./hooks/useTemplateLibrary";
import { materialLibraryFromCustomMaterials } from "./lib/material-presets";
import { getActiveAnalysisObject, type ProjectInfo } from "./lib/solver-project";
import { moduleSectionId, moduleSectionsForMode, normalizeModuleSectionId, objectNavigatorSectionId } from "./lib/workbench-navigation";
import { ARCHSIGHT_SOLVER_PROJECT_ACCEPT } from "./lib/project-file";
import type { ProjectTemplate } from "./types/beam";
import type { BeamWorkbenchSelection, FrameWorkbenchSelection, TrussWorkbenchSelection, WorkbenchSelection, WorkbenchSelectionOptions } from "./types/workbench-selection";
import { restoreWorkspaceSnapshot, type TemplateActionResult } from "./lib/template-library";
import { useWorkbenchSession } from "./hooks/useWorkbenchSession";
import { useAnalysisObjectManager } from "./hooks/useAnalysisObjectManager";
import { useProjectFileActions } from "./hooks/useProjectFileActions";
import { useResizableWorkbenchLayout } from "./hooks/useResizableWorkbenchLayout";
import { useSolverHostBridge } from "./hooks/useSolverHostBridge";
import { createInitialSolverProject, useSolverProjectDocument } from "./hooks/useSolverProjectDocument";
import { useVisitStats } from "./hooks/useVisitStats";
import { useWorkbenchRuntime } from "./hooks/useWorkbenchRuntime";
import { APP_VERSION, BUSUANZI_VISIT_STATS_ENABLED } from "./lib/app-metadata";
import {
  applyModelGeometryAction,
  canDeleteModelSelections,
  deleteModelSelections,
  modelGeometryToolbarState,
  moveModelCanvasNode,
  type ModelGeometryAction,
} from "./lib/model-workflow-actions";
import {
  isZeroModelLabelOffset,
  modelLabelOffsetCount,
  modelLabelOffsetsForMode,
  normalizeModelLabelOffset,
  type ModelLabelOffset,
} from "./lib/model-label-overrides";
import { normalizeGridSnapStep } from "./lib/node-coordinate-snap";
import type { CanvasPoint } from "./lib/model-canvas-projection";
import type { AnalysisMode } from "./types/structure";
import type { WorkspaceState } from "./lib/workspace-state";
import {
  filterSelectionSetForMode,
  primarySelectionForMode,
  replaceSelectionSetForMode,
  toggleWorkbenchSelection,
  uniqueWorkbenchSelections,
} from "./lib/workbench-selection-utils";
import { buildModelDiagnostics } from "./lib/model-diagnostics";

const SOLVER_HOST_ALLOWED_ORIGINS = import.meta.env.VITE_SOLVER_HOST_ALLOWED_ORIGINS ?? "";

type AnalysisObjectPageState = {
  moduleSectionId?: string;
  resultTabId?: string;
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
  const { isDark, setIsDark, clientId } = useWorkbenchSession();
  const [pageStateByObjectId, setPageStateByObjectId] = useState<Record<string, AnalysisObjectPageState>>({});
  const [workbenchSelectionState, setWorkbenchSelectionState] = useState<WorkbenchSelectionState>({ primary: null, items: [] });
  const [gridSnapEnabled, setGridSnapEnabled] = useState(false);
  const [gridSnapStepM, setGridSnapStepM] = useState(0.5);
  const workbenchSelection = workbenchSelectionState.primary;
  const workbenchSelectionSet = workbenchSelectionState.items;
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const fileMenuRef = useRef<HTMLDivElement | null>(null);
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
    setCustomMaterials,
    setModelPreviewStyle,
    setProject,
    setReportExportOptions,
    undoWorkspaceChange,
    updateProjectInfo,
    updateWorkspace,
    redoWorkspaceChange,
    canUndoWorkspace,
    canRedoWorkspace,
    workspace,
  } = useSolverProjectDocument();
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
  } = useResizableWorkbenchLayout(isSystemSettingsDocked);
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
    handleRunWorkspace,
    handleSensitivity,
    isScanning,
    isSolving,
    isDirty,
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
    modelDiagnostics,
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

  useEffect(() => {
    const isEditableTarget = (target: globalThis.EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (isEditableTarget(event.target) || !(event.ctrlKey || event.metaKey)) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "z" && event.shiftKey) {
        event.preventDefault();
        redoWorkspaceChange();
        return;
      }
      if (key === "z") {
        event.preventDefault();
        undoWorkspaceChange();
        return;
      }
      if (key === "y") {
        event.preventDefault();
        redoWorkspaceChange();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [redoWorkspaceChange, undoWorkspaceChange]);

  const activeObjectPageState = pageStateByObjectId[activeAnalysisObject.id] ?? {};
  const moduleSections = moduleSectionsForMode(analysisMode);
  const normalizedActiveModuleSection = normalizeModuleSectionId(analysisMode, activeObjectPageState.moduleSectionId ?? project.settings.activeModuleSection);

  const activeModuleSectionId = normalizedActiveModuleSection && moduleSections.some((item) => item.id === normalizedActiveModuleSection)
    ? normalizedActiveModuleSection
    : moduleSections[0]?.id ?? "";
  const setActiveModuleSection = useCallback((sectionId: string) => {
    setPageStateByObjectId((current) => ({
      ...current,
      [activeAnalysisObject.id]: {
        ...current[activeAnalysisObject.id],
        moduleSectionId: sectionId,
      },
    }));
  }, [activeAnalysisObject.id]);
  const setActiveResultTab = useCallback((tabId: string) => {
    setPageStateByObjectId((current) => ({
      ...current,
      [activeAnalysisObject.id]: {
        ...current[activeAnalysisObject.id],
        resultTabId: tabId,
      },
    }));
  }, [activeAnalysisObject.id]);

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
    onProjectOpened: resetAllPageState,
    onPublicExampleClosed: () => setIsPublicExamplesOpen(false),
    project,
    projectFileHandle,
    replaceProject,
    syncRuntimeFromAnalysisObject,
  });
  const syncRuntimeFromProject = useCallback((nextProject: typeof project) => {
    syncRuntimeFromAnalysisObject(getActiveAnalysisObject(nextProject));
  }, [syncRuntimeFromAnalysisObject]);
  const {
    emitProjectChanged,
    requestHostSave,
  } = useSolverHostBridge({
    allowedOrigins: SOLVER_HOST_ALLOWED_ORIGINS,
    applyCurrentRuntimeToProject,
    project,
    replaceProject,
    setFileStatusMessage,
    syncRuntimeFromProject,
  });
  const handleSaveProject = useCallback((forceSaveAs = false) => {
    if (!forceSaveAs && requestHostSave()) {
      setFileStatusMessage("已向外部宿主请求保存工程。");
      return;
    }
    void handleSaveProjectFile(forceSaveAs);
  }, [handleSaveProjectFile, requestHostSave, setFileStatusMessage]);
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
    applyCurrentRuntimeToProject,
    markProjectDirty,
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
    resetRuntimeForNewAnalysisObject,
    setFileStatusMessage,
    setProject,
    syncRuntimeFromAnalysisObject,
  });
  const handleCreateAnalysisObjectWithPath = useCallback((type: AnalysisMode, name: string, startMode: NewAnalysisObjectStartMode) => {
    pendingNewObjectStartModeRef.current = startMode;
    handleCreateAnalysisObject(type, name);
  }, [handleCreateAnalysisObject]);
  const fileDisplayName = projectFileName ?? "未选择文件";
  const fileStateLabel = isProjectDirty ? "未保存" : lastSavedAt ? "已保存" : "新建项目";
  const handleWorkbenchSelectionChange = useCallback((next: WorkbenchSelection, options?: WorkbenchSelectionOptions) => {
    setWorkbenchSelectionState((current) => {
      const scoped = filterSelectionSetForMode(current.items, next.mode);
      const nextForMode = options?.additive ? toggleWorkbenchSelection(scoped, next) : [next];
      return {
        primary: nextForMode.at(-1) ?? null,
        items: replaceSelectionSetForMode(current.items, next.mode, nextForMode),
      };
    });
    if (options?.openEditor === false) {
      return;
    }
    const selectedEditorId = objectNavigatorSectionId(next.mode);
    if (moduleSections.some((section) => section.id === selectedEditorId)) {
      setActiveModuleSection(selectedEditorId);
    }
  }, [moduleSections, setActiveModuleSection]);
  const handleWorkbenchSelectionSetChange = useCallback((next: WorkbenchSelection[], options?: WorkbenchSelectionOptions) => {
    const scoped = uniqueWorkbenchSelections(next.filter((selection) => selection.mode === analysisMode));
    setWorkbenchSelectionState((current) => ({
      primary: scoped.at(-1) ?? null,
      items: replaceSelectionSetForMode(current.items, analysisMode, scoped),
    }));
    if (options?.openEditor === false || scoped.length === 0) {
      return;
    }
    const selectedEditorId = objectNavigatorSectionId(analysisMode);
    if (moduleSections.some((section) => section.id === selectedEditorId)) {
      setActiveModuleSection(selectedEditorId);
    }
  }, [analysisMode, moduleSections, setActiveModuleSection]);
  const activeWorkbenchSelectionSet = useMemo(
    () => filterSelectionSetForMode(workbenchSelectionSet, analysisMode),
    [analysisMode, workbenchSelectionSet],
  );
  const activeWorkbenchSelection = primarySelectionForMode(workbenchSelection, workbenchSelectionSet, analysisMode);
  const activeGeometrySelectionSet = useMemo(
    () => activeWorkbenchSelectionSet.filter((selection) => selection.type !== "label"),
    [activeWorkbenchSelectionSet],
  );
  const activeGeometrySelection = activeWorkbenchSelection?.type === "label" ? null : activeWorkbenchSelection;
  const modelGeometryToolbar = useMemo(
    () => activeWorkbenchSelection?.type === "label"
      ? null
      : modelGeometryToolbarState(workspace, activeGeometrySelection, activeGeometrySelectionSet),
    [activeGeometrySelection, activeGeometrySelectionSet, activeWorkbenchSelection, workspace],
  );
  const canDeleteWorkbenchSelection = useMemo(
    () => canDeleteModelSelections(workspace, activeGeometrySelectionSet),
    [activeGeometrySelectionSet, workspace],
  );
  const activeModelLabelOffsets = modelLabelOffsetsForMode(workspace, analysisMode);
  const activeModelLabelOffsetCount = modelLabelOffsetCount(activeModelLabelOffsets);
  const canResetSelectedModelLabel = activeWorkbenchSelection?.type === "label" && Boolean(activeModelLabelOffsets?.[activeWorkbenchSelection.id]);
  const updateModelLabelOffsets = useCallback((
    mode: "beam" | "frame" | "truss",
    updater: (current: Record<string, ModelLabelOffset>) => Record<string, ModelLabelOffset>,
  ) => {
    updateWorkspace((current) => {
      const currentOffsets = { ...(modelLabelOffsetsForMode(current, mode) ?? {}) };
      const nextOffsets = updater(currentOffsets);
      const normalizedOffsets = Object.fromEntries(
        Object.entries(nextOffsets)
          .map(([labelId, offset]) => [labelId, normalizeModelLabelOffset(offset)] as const)
          .filter((entry): entry is [string, ModelLabelOffset] => Boolean(entry[1]) && !isZeroModelLabelOffset(entry[1]))
      );
      const modelLabelOffsets = Object.keys(normalizedOffsets).length ? normalizedOffsets : undefined;
      if (mode === "beam") {
        return { ...current, beam: { ...current.beam, modelLabelOffsets } };
      }
      if (mode === "frame") {
        return { ...current, frame: { ...current.frame, modelLabelOffsets } };
      }
      return { ...current, truss: { ...current.truss, modelLabelOffsets } };
    });
  }, [updateWorkspace]);
  const handleMoveWorkbenchLabel = useCallback((mode: "beam" | "frame" | "truss", labelId: string, offset: ModelLabelOffset) => {
    updateModelLabelOffsets(mode, (current) => ({
      ...current,
      [labelId]: offset,
    }));
  }, [updateModelLabelOffsets]);
  const handleResetSelectedModelLabel = useCallback(() => {
    if (!activeWorkbenchSelection || activeWorkbenchSelection.type !== "label") return;
    updateModelLabelOffsets(activeWorkbenchSelection.mode, (current) => {
      const next = { ...current };
      delete next[activeWorkbenchSelection.id];
      return next;
    });
  }, [activeWorkbenchSelection, updateModelLabelOffsets]);
  const handleResetAllModelLabels = useCallback(() => {
    updateModelLabelOffsets(analysisMode, () => ({}));
  }, [analysisMode, updateModelLabelOffsets]);
  const handleGridSnapStepChange = useCallback((stepM: number) => {
    setGridSnapStepM(normalizeGridSnapStep(stepM));
  }, []);
  const handleModelGeometryAction = useCallback((action: ModelGeometryAction) => {
    const result = applyModelGeometryAction({
      workspace,
      selection: activeGeometrySelection,
      selectionSet: activeGeometrySelectionSet,
      action,
      materialLibrary: projectMaterialLibrary,
    });
    if (!result) return;
    updateWorkspace(result.workspace);
    if (result.selection) {
      handleWorkbenchSelectionChange(result.selection, { openEditor: false });
    }
  }, [activeGeometrySelection, activeGeometrySelectionSet, handleWorkbenchSelectionChange, projectMaterialLibrary, updateWorkspace, workspace]);
  const handleDeleteWorkbenchSelection = useCallback(() => {
    const result = deleteModelSelections({
      workspace,
      selections: activeGeometrySelectionSet,
    });
    if (!result) return;
    updateWorkspace(result.workspace);
    setWorkbenchSelectionState((current) => ({
      primary: null,
      items: replaceSelectionSetForMode(current.items, analysisMode, []),
    }));
  }, [activeGeometrySelectionSet, analysisMode, updateWorkspace, workspace]);
  const handleMoveWorkbenchNode = useCallback((mode: AnalysisMode, nodeId: string, point: CanvasPoint) => {
    const result = moveModelCanvasNode({
      workspace,
      mode,
      nodeId,
      point,
    });
    if (!result) return;
    updateWorkspace(result.workspace);
    if (result.selection) {
      handleWorkbenchSelectionChange(result.selection, { openEditor: false });
    }
  }, [handleWorkbenchSelectionChange, updateWorkspace, workspace]);
  const handleRunGeneratedWorkspace = useCallback((nextWorkspace: WorkspaceState) => {
    updateWorkspace(nextWorkspace);
    void handleRunWorkspace(nextWorkspace);
  }, [handleRunWorkspace, updateWorkspace]);
  useEffect(() => {
    const isEditableTarget = (target: globalThis.EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    };
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === 's' || event.key === 'S')) {
        event.preventDefault();
        handleSaveProject(event.shiftKey);
        return;
      }
      if (isEditableTarget(event.target) || workbenchView !== "model" || (event.key !== "Delete" && event.key !== "Backspace")) {
        return;
      }
      if (!canDeleteModelSelections(workspace, activeGeometrySelectionSet)) {
        return;
      }
      event.preventDefault();
      handleDeleteWorkbenchSelection();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeGeometrySelectionSet, handleDeleteWorkbenchSelection, handleSaveProject, workbenchView, workspace]);
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
  const beamSelection = workbenchSelection?.mode === "beam" && workbenchSelection.type !== "label" ? (workbenchSelection as BeamWorkbenchSelection) : null;
  const frameSelection = workbenchSelection?.mode === "frame" && workbenchSelection.type !== "label" ? (workbenchSelection as FrameWorkbenchSelection) : null;
  const trussSelection = workbenchSelection?.mode === "truss" && workbenchSelection.type !== "label" ? (workbenchSelection as TrussWorkbenchSelection) : null;
  const formContent =
    analysisMode === "beam" ? (
      <BeamForm
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
      <TrussForm
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
      <FrameForm
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
        onOpenProjectFile={handleOpenProjectFile}
        onSaveProjectFile={handleSaveProject}
        setIsDark={setIsDark}
        setIsFileMenuOpen={setIsFileMenuOpen}
      />

      <main className="relative z-10 mx-auto max-w-[118rem] px-4 pb-12 pt-4 sm:px-6 sm:pb-16 sm:pt-6 xl:pb-0">
        <div
          className="grid grid-cols-1 gap-5 xl:items-stretch transition-all duration-500 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] min-h-[calc(100vh-10rem)]"
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
                onRemoveObject={handleRemoveAnalysisObject}
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

          <section className="min-w-0 flex flex-col gap-5">
            <div className="xl:hidden">
              <GlassCard className="p-3">
                <ProjectTreePanel
                  project={project}
                  compact={isCompactWorkbench}
                  onSelectObject={handleSelectAnalysisObject}
                  onRemoveObject={handleRemoveAnalysisObject}
                />
              </GlassCard>
            </div>

            <WorkbenchViewTabs value={workbenchView} onChange={setWorkbenchView} />
            {workbenchView === "model" ? (
              <div className="flex-1 flex flex-col min-h-0">
                <WorkbenchModelCanvas
                  workspace={workspace}
                  mode={analysisMode}
                compact={isCompactWorkbench}
                modelPreviewStyle={project.settings.modelPreviewStyle}
                selection={activeWorkbenchSelection}
                selectionSet={activeWorkbenchSelectionSet}
                canDeleteSelection={canDeleteWorkbenchSelection}
                canRedoWorkspace={canRedoWorkspace}
                canUndoWorkspace={canUndoWorkspace}
                geometryToolbar={modelGeometryToolbar}
                gridSnapEnabled={gridSnapEnabled}
                gridSnapStepM={gridSnapStepM}
                labelOffsetCount={activeModelLabelOffsetCount}
                canResetSelectedLabel={canResetSelectedModelLabel}
                onDeleteSelection={handleDeleteWorkbenchSelection}
                onGeometryAction={handleModelGeometryAction}
                onGridSnapEnabledChange={setGridSnapEnabled}
                onGridSnapStepChange={handleGridSnapStepChange}
                onMoveLabel={handleMoveWorkbenchLabel}
                onMoveNode={handleMoveWorkbenchNode}
                onRedoWorkspace={redoWorkspaceChange}
                onResetAllLabels={handleResetAllModelLabels}
                onResetSelectedLabel={handleResetSelectedModelLabel}
                onSelect={handleWorkbenchSelectionChange}
                onSelectionSetChange={handleWorkbenchSelectionSetChange}
                onUndoWorkspace={undoWorkspaceChange}
                />
              </div>
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
                  activeTabId={activeObjectPageState.resultTabId ?? ""}
                  onActiveTabChange={setActiveResultTab}
                  workspace={workspace}
                  updateWorkspace={updateWorkspace}
                  isDirty={isDirty}
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
            <ModelDiagnosticsPanel diagnostics={modelDiagnostics} compact={isCompactWorkbench} />
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

      <GlobalDialogs
        isCompactWorkbench={isCompactWorkbench}
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
