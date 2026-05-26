import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent as ReactChangeEvent, CSSProperties, Dispatch, PointerEvent as ReactPointerEvent, SetStateAction } from "react";
import {
  Activity,
  FileText,
  FileDown,
  FilePlus,
  FileUp,
  GripVertical,
  Layers,
  MoreHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Save,
  Settings,
  Moon,
  Sun,
  X,
} from "lucide-react";
import { BeamForm } from "./components/BeamForm";
import { FrameForm } from "./components/FrameForm";
import { TrussForm } from "./components/TrussForm";
import { ModuleSectionNav } from "./components/ModuleSectionNav";
import { TemplateLibraryPanel } from "./components/TemplateLibraryPanel";
import { SystemSettingsPanel } from "./components/SystemSettingsPanel";
import { NewAnalysisObjectDialog } from "./components/NewAnalysisObjectDialog";
import { ProjectTreePanel } from "./components/ProjectTreePanel";
import { ProjectInfoDialog } from "./components/ProjectInfoDialog";
import { WorkbenchModelCanvas } from "./components/WorkbenchModelCanvas";
import { WorkbenchResultTabs } from "./components/WorkbenchResultTabs";
import { WorkbenchSensitivityPanel } from "./components/WorkbenchSensitivityPanel";
import { GlassCard } from "./components/ui/GlassCard";
import { Button } from "./components/ui/button";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useTemplateLibrary } from "./hooks/useTemplateLibrary";
import type { WorkspaceState } from "./lib/workspace-state";
import { createWorkspaceSnapshot, restoreWorkspaceSnapshot } from "./lib/template-library";
import {
  addAnalysisObjectToProject,
  createDefaultSolverProject,
  createWorkspaceFromProject,
  getActiveAnalysisObject,
  removeAnalysisObjectFromProject,
  normalizeProjectInfo,
  normalizeSolverProject,
  setActiveAnalysisObject,
  updateActiveAnalysisObject,
  updateActiveAnalysisObjectWorkspace,
  type AnalysisObject,
  type AnalysisObjectType,
  type ProjectInfo,
  type SolverProject,
  type WorkbenchView,
} from "./lib/solver-project";
import { normalizeReportExportOptions, type ReportExportOptions } from "./lib/report-options";
import {
  ARCHSIGHT_SOLVER_PROJECT_ACCEPT,
  createArchSightSolverProjectFile,
  getArchSightSolverProjectFileName,
  isFilePickerAbort,
  openArchSightSolverProjectFileWithPicker,
  readArchSightSolverProjectFile,
  saveArchSightSolverProjectFile,
  supportsNativeProjectFiles,
  type ProjectFileHandle,
} from "./lib/project-file";
import type { BeamPreviewStyle, ProjectTemplate, SensitivityResults } from "./types/beam";
import type { BeamWorkbenchSelection, FrameWorkbenchSelection, TrussWorkbenchSelection, WorkbenchSelection, WorkbenchSelectionOptions } from "./types/workbench-selection";
import type { TemplateActionResult } from "./lib/template-library";
import { useWorkbenchSession } from "./hooks/useWorkbenchSession";
import { useWorkbenchActions, type AnalysisResults } from "./hooks/useWorkbenchActions";
import { beamResultForView, frameResultForView, trussResultForView } from "./lib/api-envelope";
import { APP_VERSION, BUSUANZI_VISIT_STATS_ENABLED, loadBusuanziVisitStats } from "./lib/app-metadata";

const INSPECTOR_WIDTH_STORAGE_KEY = "archsight.inspectorWidth";
const INSPECTOR_COLLAPSED_STORAGE_KEY = "archsight.inspectorCollapsed";
const DEFAULT_INSPECTOR_WIDTH = 400;
const MIN_INSPECTOR_WIDTH = 360;
const MAX_INSPECTOR_WIDTH = 680;
const MODULE_NAV_WIDTH_STORAGE_KEY = "archsight.moduleNavWidth";
const MODULE_NAV_COLLAPSED_STORAGE_KEY = "archsight.moduleNavCollapsed";
const DEFAULT_MODULE_NAV_WIDTH = 248;
const MIN_MODULE_NAV_WIDTH = 232;
const MAX_MODULE_NAV_WIDTH = 288;
const COLLAPSED_MODULE_NAV_WIDTH = 76;
const COLLAPSED_INSPECTOR_WIDTH = 68;
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
const LEGACY_REPORT_EXPORT_OPTIONS_STORAGE_KEY = "archsight-solver.report-export-options";

interface VisitStats {
  pageViews: string;
  uniqueVisitors: string;
}

function clampInspectorWidth(value: number) {
  return Math.min(MAX_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, value));
}

function clampModuleNavWidth(value: number) {
  return Math.min(MAX_MODULE_NAV_WIDTH, Math.max(MIN_MODULE_NAV_WIDTH, value));
}

function readStoredNumber(key: string) {
  const stored = window.localStorage.getItem(key);
  if (stored === null) return null;

  const value = Number(stored);
  return Number.isFinite(value) ? value : null;
}

function readLegacyReportExportOptions() {
  try {
    const raw = window.localStorage.getItem(LEGACY_REPORT_EXPORT_OPTIONS_STORAGE_KEY);
    return raw ? normalizeReportExportOptions(JSON.parse(raw) as Partial<ReportExportOptions>) : normalizeReportExportOptions(null);
  } catch {
    return normalizeReportExportOptions(null);
  }
}

function createInitialSolverProject(projectInfo?: Partial<ProjectInfo> | null) {
  const project = projectInfo ? createDefaultSolverProject(projectInfo) : createDefaultSolverProject();
  return normalizeSolverProject({
    ...project,
    settings: {
      ...project.settings,
      reportExportOptions: readLegacyReportExportOptions(),
    },
  });
}

function App() {
  const { isDark, setIsDark, clientId } = useWorkbenchSession();
  const [activeModuleSection, setActiveModuleSection] = useState("");
  const [project, setProject] = useState<SolverProject>(() => createInitialSolverProject());
  const [workbenchSelection, setWorkbenchSelection] = useState<WorkbenchSelection | null>(null);
  const [workbenchView, setWorkbenchView] = useState<WorkbenchView>("model");
  const [isNewAnalysisObjectDialogOpen, setIsNewAnalysisObjectDialogOpen] = useState(false);
  const [projectInfoDialogMode, setProjectInfoDialogMode] = useState<"create" | "edit" | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);
  const fileMenuRef = useRef<HTMLDivElement | null>(null);
  const skipNextRuntimePersistRef = useRef(true);
  const lastRuntimePersistRef = useRef<{
    analysisData: AnalysisResults;
    sensitivityData: SensitivityResults | null;
    workbenchView: WorkbenchView;
  }>({ analysisData: null, sensitivityData: null, workbenchView: "model" });
  const [projectFileHandle, setProjectFileHandle] = useState<ProjectFileHandle | null>(null);
  const [projectFileName, setProjectFileName] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isProjectDirty, setIsProjectDirty] = useState(false);
  const [fileStatusMessage, setFileStatusMessage] = useState<string | null>(null);
  const [inspectorWidth, setInspectorWidth] = useState(() => {
    const stored = readStoredNumber(INSPECTOR_WIDTH_STORAGE_KEY);
    return stored === null ? DEFAULT_INSPECTOR_WIDTH : clampInspectorWidth(stored);
  });
  const [isInspectorCollapsed, setIsInspectorCollapsed] = useState(
    () => window.localStorage.getItem(INSPECTOR_COLLAPSED_STORAGE_KEY) === "true"
  );
  const [moduleNavWidth, setModuleNavWidth] = useState(() => {
    const stored = readStoredNumber(MODULE_NAV_WIDTH_STORAGE_KEY);
    return stored === null ? DEFAULT_MODULE_NAV_WIDTH : clampModuleNavWidth(stored);
  });
  const [isModuleNavCollapsed, setIsModuleNavCollapsed] = useState(
    () => window.localStorage.getItem(MODULE_NAV_COLLAPSED_STORAGE_KEY) === "true"
  );
  const isCompactWorkbench = useMediaQuery("(max-width: 1023px)");
  const showInspectorCollapsed = !isCompactWorkbench && isInspectorCollapsed;
  const workspace = useMemo(() => createWorkspaceFromProject(project), [project]);
  const setCompactWorkbenchView = (view: "parameters" | "results") => {
    setWorkbenchView(view === "results" ? "results" : "model");
  };
  const updateWorkspace: Dispatch<SetStateAction<WorkspaceState>> = useCallback((next) => {
    setLastSavedAt(null);
    setIsProjectDirty(true);
    setProject((current) => {
      const currentWorkspace = createWorkspaceFromProject(current);
      const nextWorkspace = typeof next === "function" ? next(currentWorkspace) : next;
      return updateActiveAnalysisObjectWorkspace(current, nextWorkspace);
    });
  }, []);
  const reportExportOptions = project.settings.reportExportOptions;
  const setReportExportOptions = useCallback((options: ReportExportOptions) => {
    setLastSavedAt(null);
    setIsProjectDirty(true);
    setProject((current) => normalizeSolverProject({
      ...current,
      settings: {
        ...current.settings,
        reportExportOptions: options,
      },
      updatedAt: new Date().toISOString(),
    }));
  }, []);
  const setBeamPreviewStyle = useCallback((style: BeamPreviewStyle) => {
    setLastSavedAt(null);
    setIsProjectDirty(true);
    setProject((current) => normalizeSolverProject({
      ...current,
      settings: {
        ...current.settings,
        beamPreviewStyle: style,
      },
      updatedAt: new Date().toISOString(),
    }));
  }, []);

  const {
    analysisData,
    setAnalysisData,
    sensitivityData,
    setSensitivityData,
    isSolving,
    isScanning,
    exportingFormat,
    handleRunCurrentModule,
    handleSensitivity,
    handleExport,
  } = useWorkbenchActions(workspace, updateWorkspace, setCompactWorkbenchView, clientId, reportExportOptions, project.settings.projectInfo.name);

  useEffect(() => {
    const previousRuntime = lastRuntimePersistRef.current;
    const isSameRuntime =
      previousRuntime.analysisData === analysisData &&
      previousRuntime.sensitivityData === sensitivityData &&
      previousRuntime.workbenchView === workbenchView;

    if (skipNextRuntimePersistRef.current) {
      skipNextRuntimePersistRef.current = false;
      lastRuntimePersistRef.current = { analysisData, sensitivityData, workbenchView };
      return;
    }
    if (isSameRuntime) {
      return;
    }
    lastRuntimePersistRef.current = { analysisData, sensitivityData, workbenchView };
    setProject((current) => updateActiveAnalysisObject(current, (object) => ({
      ...object,
      results: analysisData,
      sensitivityResults: sensitivityData,
      workbenchView,
    })));
    setLastSavedAt(null);
    setIsProjectDirty(true);
  }, [analysisData, sensitivityData, workbenchView]);

  const syncRuntimeFromAnalysisObject = useCallback((object: AnalysisObject) => {
    skipNextRuntimePersistRef.current = true;
    setAnalysisData(object.results);
    setSensitivityData(object.sensitivityResults);
    setWorkbenchView(object.workbenchView);
    setWorkbenchSelection(null);
    setActiveModuleSection("");
  }, [setAnalysisData, setSensitivityData]);

  const applyCurrentRuntimeToProject = useCallback((sourceProject: SolverProject) => updateActiveAnalysisObject(sourceProject, (object) => ({
    ...object,
    results: analysisData,
    sensitivityResults: sensitivityData,
    workbenchView,
  })), [analysisData, sensitivityData, workbenchView]);

  const [isTemplateLibraryOpen, setIsTemplateLibraryOpen] = useState(false);
  const [isSystemSettingsOpen, setIsSystemSettingsOpen] = useState(false);
  const [isFileMenuOpen, setIsFileMenuOpen] = useState(false);
  const [visitStats, setVisitStats] = useState<VisitStats>({ pageViews: "", uniqueVisitors: "" });
  
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
    window.localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(inspectorWidth));
  }, [inspectorWidth]);

  useEffect(() => {
    window.localStorage.setItem(INSPECTOR_COLLAPSED_STORAGE_KEY, String(isInspectorCollapsed));
  }, [isInspectorCollapsed]);

  useEffect(() => {
    window.localStorage.setItem(MODULE_NAV_WIDTH_STORAGE_KEY, String(moduleNavWidth));
  }, [moduleNavWidth]);

  useEffect(() => {
    window.localStorage.setItem(MODULE_NAV_COLLAPSED_STORAGE_KEY, String(isModuleNavCollapsed));
  }, [isModuleNavCollapsed]);

  useEffect(() => {
    if (!BUSUANZI_VISIT_STATS_ENABLED) return;

    const syncVisitStats = () => {
      const pageViews = document.getElementById("busuanzi_value_site_pv")?.textContent?.trim() || "";
      const uniqueVisitors = document.getElementById("busuanzi_value_site_uv")?.textContent?.trim() || "";
      setVisitStats({ pageViews, uniqueVisitors });
    };

    const observer = new window.MutationObserver(syncVisitStats);
    const observedNodes = [
      document.getElementById("busuanzi_value_site_pv"),
      document.getElementById("busuanzi_value_site_uv"),
    ].filter((node): node is HTMLElement => Boolean(node));

    observedNodes.forEach((node) => observer.observe(node, { childList: true, characterData: true, subtree: true }));
    syncVisitStats();
    loadBusuanziVisitStats();

    const fallbackTimer = window.setTimeout(syncVisitStats, 2500);
    return () => {
      observer.disconnect();
      window.clearTimeout(fallbackTimer);
    };
  }, []);

  const handleModuleNavResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isCompactWorkbench || isModuleNavCollapsed) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = moduleNavWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setModuleNavWidth(clampModuleNavWidth(startWidth + moveEvent.clientX - startX));
    };
    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  const handleInspectorResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isCompactWorkbench || showInspectorCollapsed) return;
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = inspectorWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      setInspectorWidth(clampInspectorWidth(startWidth + startX - moveEvent.clientX));
    };
    const handlePointerUp = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  };

  useEffect(() => {
    if (!isTemplateLibraryOpen && !isSystemSettingsOpen && !isNewAnalysisObjectDialogOpen && projectInfoDialogMode === null) {
      return;
    }

    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsTemplateLibraryOpen(false);
        setIsSystemSettingsOpen(false);
        setIsNewAnalysisObjectDialogOpen(false);
        setProjectInfoDialogMode(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isTemplateLibraryOpen, isSystemSettingsOpen, isNewAnalysisObjectDialogOpen, projectInfoDialogMode]);

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
  const moduleSections = useMemo(() => {
    if (analysisMode === "beam") {
      return [
        { id: "beam-typical-cases", label: "模板" },
        { id: "beam-basic", label: "基本" },
        { id: "beam-object-navigator", label: "对象" },
        { id: "beam-text-model", label: "文本" },
        { id: "beam-advanced-tables", label: "表格" },
      ];
    }

    if (analysisMode === "truss") {
      return [
        { id: "truss-typical-cases", label: "模板" },
        { id: "truss-custom-overview", label: "基本" },
        { id: "truss-object-navigator", label: "对象" },
        { id: "truss-text-model", label: "文本" },
        { id: "truss-advanced-tables", label: "表格" },
      ];
    }

    return [
      { id: "frame-typical-cases", label: "模板" },
      { id: "frame-custom-overview", label: "基本" },
      { id: "frame-object-navigator", label: "对象" },
      { id: "frame-text-model", label: "文本" },
      { id: "frame-advanced-tables", label: "表格" },
    ];
  }, [analysisMode]);

  const frameResults = useMemo(() => frameResultForView(analysisData), [analysisData]);
  const trussResults = useMemo(() => trussResultForView(analysisData), [analysisData]);
  const beamResults = useMemo(() => beamResultForView(analysisData), [analysisData]);
  const activeModuleSectionId = moduleSections.some((item) => item.id === activeModuleSection)
    ? activeModuleSection
    : moduleSections[0]?.id ?? "";

  const handleRestoreTemplate = (template: ProjectTemplate): TemplateActionResult<void> => {
    const restoredWorkspace = restoreWorkspaceSnapshot(template.snapshot);
    updateWorkspace(restoredWorkspace);
    setProjectFileHandle(null);
    setProjectFileName(null);
    setFileStatusMessage(`已恢复模板：${template.name}`);
    setWorkbenchSelection(null);
    setAnalysisData(null);
    setSensitivityData(null);
    setWorkbenchView("model");
    return { ok: true };
  };

  const confirmDiscardUnsavedChanges = () =>
    !isProjectDirty || window.confirm("当前项目有未保存更改。继续操作会放弃这些更改，是否继续？");

  const replaceProject = (nextProject: SolverProject, fileName: string | null, handle: ProjectFileHandle | null, savedAt: string | null, message: string) => {
    setProject(nextProject);
    setProjectFileHandle(handle);
    setProjectFileName(fileName);
    setLastSavedAt(savedAt);
    setIsProjectDirty(false);
    setFileStatusMessage(message);
    syncRuntimeFromAnalysisObject(getActiveAnalysisObject(nextProject));
  };

  const handleNewProjectFile = () => {
    if (!confirmDiscardUnsavedChanges()) return;
    setProjectInfoDialogMode("create");
  };

  const handleSaveProjectFile = async (forceSaveAs = false) => {
    try {
      const savedProject = applyCurrentRuntimeToProject(project);
      const projectFile = createArchSightSolverProjectFile(savedProject);
      const result = await saveArchSightSolverProjectFile(projectFile, projectFileHandle, forceSaveAs);
      skipNextRuntimePersistRef.current = true;
      lastRuntimePersistRef.current = { analysisData, sensitivityData, workbenchView };
      setProject(savedProject);
      setProjectFileHandle(result.handle);
      setProjectFileName(result.fileName);
      setLastSavedAt(result.savedAt);
      setIsProjectDirty(false);
      setFileStatusMessage(result.mode === "download" ? `已下载导出：${result.fileName}` : `${forceSaveAs ? "另存为" : "保存"}成功：${result.fileName}`);
    } catch (error) {
      if (isFilePickerAbort(error)) return;
      alert(`项目文件保存失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  const handleOpenProjectFile = () => {
    if (!confirmDiscardUnsavedChanges()) return;
    if (!supportsNativeProjectFiles()) {
      projectFileInputRef.current?.click();
      return;
    }

    void (async () => {
      try {
        const { projectFile, handle, fileName } = await openArchSightSolverProjectFileWithPicker();
        replaceProject(projectFile.project, fileName, handle, projectFile.updatedAt, `已打开：${fileName}`);
      } catch (error) {
        if (isFilePickerAbort(error)) return;
        alert(`项目文件读取失败：${error instanceof Error ? error.message : "未知错误"}`);
      }
    })();
  };

  const handleProjectFileChange = async (event: ReactChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const projectFile = await readArchSightSolverProjectFile(file);
      const fileName = file.name || getArchSightSolverProjectFileName(projectFile.project);
      replaceProject(projectFile.project, fileName, null, projectFile.updatedAt, `已打开：${fileName}`);
    } catch (error) {
      alert(`项目文件读取失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  };

  const runLabel = isSolving ? "计算中..." : analysisMode === "frame" ? "运行平面框架计算" : analysisMode === "truss" ? "运行平面桁架计算" : "运行连续梁计算";
  const fileDisplayName = projectFileName ?? "未选择文件";
  const fileStateLabel = isProjectDirty ? "未保存" : lastSavedAt ? "已保存" : "新建项目";
  const objectCountByType = useMemo(() => ({
    beam: project.objects.filter((object) => object.type === "beam").length,
    frame: project.objects.filter((object) => object.type === "frame").length,
    truss: project.objects.filter((object) => object.type === "truss").length,
  }), [project.objects]);
  const handleSelectAnalysisObject = (objectId: string) => {
    if (objectId === project.activeObjectId) return;
    const nextProject = setActiveAnalysisObject(applyCurrentRuntimeToProject(project), objectId);
    setProject(nextProject);
    syncRuntimeFromAnalysisObject(getActiveAnalysisObject(nextProject));
  };
  const handleCreateAnalysisObject = (type: AnalysisObjectType, name: string) => {
    const nextProject = addAnalysisObjectToProject(applyCurrentRuntimeToProject(project), type, name);
    setProject(nextProject);
    skipNextRuntimePersistRef.current = true;
    setAnalysisData(null);
    setSensitivityData(null);
    setWorkbenchView("model");
    setWorkbenchSelection(null);
    setActiveModuleSection("");
    setIsProjectDirty(true);
    setLastSavedAt(null);
    setFileStatusMessage(`已新建分析对象：${name}`);
    setIsNewAnalysisObjectDialogOpen(false);
  };
  const handleRemoveAnalysisObject = (objectId: string) => {
    if (project.objects.length <= 1) return;
    if (!window.confirm("删除该分析对象会同时移除其输入与计算结果，是否继续？")) return;
    const nextProject = removeAnalysisObjectFromProject(applyCurrentRuntimeToProject(project), objectId);
    setProject(nextProject);
    syncRuntimeFromAnalysisObject(getActiveAnalysisObject(nextProject));
    setIsProjectDirty(true);
    setLastSavedAt(null);
    setFileStatusMessage("已删除分析对象");
  };
  const workbenchViewItems = [
    { id: "model" as const, label: "参数建模", shortLabel: "参数建模", icon: Layers },
    { id: "results" as const, label: "结构计算", shortLabel: "结构计算", icon: FileText },
    { id: "sensitivity" as const, label: "敏感性分析", shortLabel: "敏感性", icon: Activity },
  ];
  const handleRunAndReview = () => {
    setWorkbenchView("results");
    handleRunCurrentModule();
  };
  const handleWorkbenchSelectionChange = (next: WorkbenchSelection, options?: WorkbenchSelectionOptions) => {
    setWorkbenchSelection(next);
    if (options?.openEditor === false) {
      return;
    }
    const selectedEditorId =
      next.mode === "beam" ? "beam-object-navigator" : next.mode === "frame" ? "frame-object-navigator" : "truss-object-navigator";
    if (moduleSections.some((section) => section.id === selectedEditorId)) {
      setActiveModuleSection(selectedEditorId);
    }
  };
  const handleProjectInfoChange = (next: ProjectInfo) => {
    const normalizedProjectInfo = normalizeProjectInfo(next);
    setLastSavedAt(null);
    setIsProjectDirty(true);
    setProject((current) => normalizeSolverProject({
      ...current,
      name: normalizedProjectInfo.name,
      settings: {
        ...current.settings,
        projectInfo: normalizedProjectInfo,
      },
      updatedAt: new Date().toISOString(),
    }));
  };
  const handleCreateProjectWithInfo = (next: ProjectInfo) => {
    replaceProject(createInitialSolverProject(next), null, null, null, "新建项目");
    setProjectInfoDialogMode(null);
  };
  const handleUpdateProjectInfo = (next: ProjectInfo) => {
    handleProjectInfoChange(next);
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
        accept={ARCHSIGHT_SOLVER_PROJECT_ACCEPT}
        className="hidden"
        onChange={handleProjectFileChange}
      />
      <div className="fixed inset-0 pointer-events-none opacity-[0.02] dark:opacity-[0.08] [background-image:linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] [background-size:32px_32px]" />
      <div className="fixed top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <header className="sticky top-0 z-30 border-b border-white/8 bg-background/85 backdrop-blur-2xl">
        <div className="mx-auto max-w-[118rem] px-4 py-2.5 sm:px-6 sm:py-3">
          <div className={`grid xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center ${isCompactWorkbench ? "gap-3" : "gap-4"}`}>
            <div>
              <div className="flex flex-wrap items-end">
                <h1 className={`font-heading font-extrabold leading-tight tracking-tight ${isCompactWorkbench ? "text-[1.25rem]" : "text-lg sm:text-xl md:text-2xl"}`}>
                  ArchSight 结构力学求解器
                </h1>
                <a
                  className="ml-2 mb-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-1 font-mono text-[11px] font-black text-sky-700 transition-colors hover:border-sky-400/60 hover:bg-sky-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/70 dark:text-sky-200"
                  href={RELEASE_NOTES_HREF}
                  target="_blank"
                  rel="noreferrer"
                  title="查看版本发布记录"
                >
                  v{APP_VERSION}
                </a>
              </div>
              <div
                className="mt-2 flex max-w-full flex-wrap items-center gap-2 text-xs font-bold text-muted-foreground"
                title={fileDisplayName}
              >
                <span className="max-w-[18rem] truncate rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1">
                  {fileDisplayName}
                </span>
                <span className={`rounded-lg border px-2.5 py-1 ${isProjectDirty ? "border-amber-500/25 bg-amber-500/10 text-amber-600 dark:text-amber-300" : "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"}`}>
                  {fileStateLabel}
                </span>
                {fileStatusMessage ? <span className="truncate opacity-75">{fileStatusMessage}</span> : null}
              </div>
            </div>

            <div className={`flex flex-wrap items-center justify-start xl:justify-end ${isCompactWorkbench ? "gap-2" : "gap-3"}`}>
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.035] p-1 shadow-sm shadow-black/5 dark:bg-white/[0.025]">
                <Button
                  variant="ghost"
                  onClick={handleNewProjectFile}
                  className={`rounded-lg font-bold text-foreground hover:bg-primary/10 ${isCompactWorkbench ? "h-9 px-3 text-xs" : "h-10 px-3.5"}`}
                >
                  <FilePlus className={`mr-2 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                  新建
                </Button>
                <Button
                  variant="ghost"
                  onClick={handleOpenProjectFile}
                  className={`rounded-lg font-bold text-foreground hover:bg-primary/10 ${isCompactWorkbench ? "h-9 px-3 text-xs" : "h-10 px-3.5"}`}
                >
                  <FileUp className={`mr-2 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                  打开
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => void handleSaveProjectFile(false)}
                  className={`rounded-lg font-bold text-foreground hover:bg-primary/10 ${isCompactWorkbench ? "h-9 px-3 text-xs" : "h-10 px-3.5"}`}
                >
                  <Save className={`mr-2 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                  保存
                </Button>
                <div ref={fileMenuRef} className="relative">
                  <Button
                    variant="ghost"
                    onClick={() => setIsFileMenuOpen((current) => !current)}
                    aria-haspopup="menu"
                    aria-expanded={isFileMenuOpen}
                    aria-label="更多文件操作"
                    title="更多文件操作"
                    className={`rounded-lg font-bold text-foreground hover:bg-primary/10 ${isCompactWorkbench ? "h-9 px-2.5" : "h-10 px-3"}`}
                  >
                    <MoreHorizontal className={isCompactWorkbench ? "h-4 w-4" : "h-5 w-5"} />
                    <span className="sr-only">更多文件操作</span>
                  </Button>
                  {isFileMenuOpen ? (
                    <div
                      role="menu"
                      className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-44 rounded-xl border border-border bg-popover p-1.5 text-popover-foreground shadow-xl shadow-black/15"
                    >
                      <div className="px-3 py-2 text-[0.68rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">文件操作</div>
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setIsFileMenuOpen(false);
                          void handleSaveProjectFile(true);
                        }}
                        className="flex w-full items-center rounded-lg px-3 py-2 text-left text-sm font-bold text-foreground hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <FileDown className="mr-2 h-4 w-4" />
                        另存为
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => setIsDark((current) => !current)}
                aria-label={isDark ? "切换到浅色主题" : "切换到深色主题"}
                title={isDark ? "切换到浅色主题" : "切换到深色主题"}
                className={`rounded-lg border-white/10 bg-white/[0.03] font-bold text-foreground hover:bg-primary/5 ${isCompactWorkbench ? "h-10 px-3 text-xs" : "h-11 px-4"}`}
              >
                {isDark ? (
                  <Sun className={`mr-2 text-amber-400 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                ) : (
                  <Moon className={`mr-2 text-blue-600 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                )}
                {isDark ? "浅色" : "深色"}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsSystemSettingsOpen(true)}
                className={`rounded-lg border-white/10 bg-white/[0.03] font-bold text-foreground hover:bg-primary/5 ${isCompactWorkbench ? "h-10 px-3 text-xs" : "h-11 px-4"}`}
              >
                <Settings className={`mr-2 ${isCompactWorkbench ? "h-3.5 w-3.5" : "h-4 w-4"}`} />
                系统设置
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[118rem] px-4 pb-12 pt-4 sm:px-6 sm:pb-16 sm:pt-6">
        <div
          className="grid grid-cols-1 gap-5 xl:items-start"
          style={
            isCompactWorkbench
              ? undefined
              : {
                  gridTemplateColumns: `${
                    isModuleNavCollapsed ? COLLAPSED_MODULE_NAV_WIDTH : moduleNavWidth
                  }px minmax(0,1fr) ${showInspectorCollapsed ? COLLAPSED_INSPECTOR_WIDTH : inspectorWidth}px`,
                }
          }
        >
          <aside className="relative hidden xl:block xl:sticky xl:top-24">
            <GlassCard className={`transition-all ${isModuleNavCollapsed ? "p-2" : "p-3"}`}>
              <div className={`mb-3 flex items-center ${isModuleNavCollapsed ? "justify-center" : "justify-between gap-2"}`}>
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

            <GlassCard className="p-2 sm:p-3">
              <div className="flex min-w-0 flex-wrap items-center justify-end gap-2" role="toolbar" aria-label="主工作区功能切换">
                  <div
                    className="grid w-full min-w-0 flex-1 grid-cols-3 gap-2 sm:min-w-[22rem] sm:flex-none sm:gap-3"
                    role="tablist"
                    aria-label="主工作区分页"
                  >
                    {workbenchViewItems.map((item) => {
                      const Icon = item.icon;
                      const active = workbenchView === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          aria-label={item.label}
                          title={item.label}
                          onClick={() => setWorkbenchView(item.id)}
                          className={`inline-flex h-10 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 text-sm font-bold transition-colors ${
                            active
                              ? "border-sky-500/55 bg-sky-400 text-slate-950 shadow-sm shadow-sky-500/15 dark:border-sky-300/40 dark:bg-sky-400 dark:text-slate-950"
                              : "border-slate-200/80 bg-white/60 text-slate-600 hover:border-sky-300/60 hover:bg-slate-100 hover:text-slate-950 dark:border-slate-600/80 dark:bg-slate-900/70 dark:text-slate-300 dark:hover:border-sky-400/65 dark:hover:bg-sky-400/12 dark:hover:text-sky-50"
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.shortLabel}</span>
                        </button>
                      );
                    })}
                  </div>
              </div>
            </GlassCard>

            {workbenchView === "model" ? (
              <WorkbenchModelCanvas
                workspace={workspace}
                mode={analysisMode}
                compact={isCompactWorkbench}
                beamPreviewStyle={project.settings.beamPreviewStyle}
                selection={workbenchSelection?.mode === analysisMode ? workbenchSelection : null}
                onSelect={handleWorkbenchSelectionChange}
              />
            ) : workbenchView === "sensitivity" ? (
              <WorkbenchSensitivityPanel
                analysisMode={analysisMode}
                workspace={workspace}
                sensitivityData={sensitivityData}
                isScanning={isScanning}
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
                />
              </section>
            )}
          </section>

          <aside className="relative space-y-5 xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)]">
            {showInspectorCollapsed ? (
              <GlassCard className="flex min-h-[22rem] flex-col items-center gap-3 p-2 xl:h-[calc(100vh-7rem)]">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setIsInspectorCollapsed(false)}
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
              onPointerDown={handleInspectorResizeStart}
              className="group absolute -left-4 top-0 hidden h-[calc(100vh-7rem)] w-3 cursor-col-resize items-center justify-center xl:flex"
            >
              <span className="h-20 w-1 rounded-full bg-slate-300/50 transition-colors group-hover:bg-primary/70 dark:bg-slate-700 dark:group-hover:bg-sky-400" />
            </button>
            <GlassCard className="inspector-panel flex min-h-0 flex-col gap-4 p-4 sm:p-5 xl:max-h-[calc(100vh-7rem)]">
              <ModuleSectionNav
                title={analysisMode === "beam" ? "梁系参数" : analysisMode === "frame" ? "框架参数" : "桁架参数"}
                items={moduleSections}
                activeId={activeModuleSectionId}
                onSelect={setActiveModuleSection}
                behavior="select"
                rightSlot={
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setIsInspectorCollapsed(true)}
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
                  {formContent}
                </div>
              </div>
            </GlassCard>
              </>
            )}
          </aside>
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

      {isSystemSettingsOpen && (
        <SystemSettingsPanel
          compact={isCompactWorkbench}
          releaseNotesHref={RELEASE_NOTES_HREF}
          userManualHref={USER_MANUAL_HREF}
          beamPreviewStyle={project.settings.beamPreviewStyle}
          visitStats={visitStats}
          onBeamPreviewStyleChange={setBeamPreviewStyle}
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
