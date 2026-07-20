import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { ModelPreviewStyle, SensitivityResults } from "../types/beam";
import type { Material } from "../types/material";
import type { ReportExportOptions } from "../lib/report-options";
import { normalizeReportExportOptions } from "../lib/report-options";
import { normalizeProjectCustomMaterials } from "../lib/material-presets";
import {
  clearProjectAutosaveDraft,
  createProjectAutosaveDraft,
  readProjectAutosaveDraft,
  writeProjectAutosaveDraft,
} from "../lib/project-autosave";
import type { WorkspaceState } from "../lib/workspace-state";
import type { LegacyAnalysisResults } from "../lib/api-envelope";
import type { ResultProvenance } from "../lib/result-provenance";
import {
  clearAnalysisObjectResults,
  commitAnalysisObjectResult,
  commitAnalysisObjectSensitivity,
  createWorkspaceFromProject,
  createDefaultSolverProject,
  getActiveAnalysisObject,
  normalizeProjectInfo,
  normalizeSolverProject,
  updateActiveAnalysisObjectWorkspace,
  type ProjectInfo,
  type SolverProject,
} from "../lib/solver-project";
import type { ProjectFileHandle } from "../lib/project-file";
import {
  advanceProjectDocumentRevision,
  captureProjectDocumentSnapshot,
  completeProjectDocumentSave,
  createProjectDocumentLifecycle,
  isProjectDocumentDirty,
  isSameProjectDocument,
  replaceProjectDocumentRevision,
  type ProjectDocumentLifecycle,
  type ProjectDocumentSnapshot,
} from "../lib/project-document-lifecycle";
import {
  createEmptyWorkspaceHistory,
  pushWorkspaceHistory,
  redoWorkspaceHistory,
  undoWorkspaceHistory,
  workspaceStatesEqual,
  type WorkspaceHistoryState,
} from "../lib/workspace-history";

const LEGACY_REPORT_EXPORT_OPTIONS_STORAGE_KEY = "archsight-solver.report-export-options";

interface InitialProjectDocumentState {
  project: SolverProject;
  projectFileName: string | null;
  lastSavedAt: string | null;
  isProjectDirty: boolean;
  fileStatusMessage: string | null;
}

function browserLocalStorage(): globalThis.Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readLegacyReportExportOptions() {
  try {
    const raw = browserLocalStorage()?.getItem(LEGACY_REPORT_EXPORT_OPTIONS_STORAGE_KEY);
    return raw ? normalizeReportExportOptions(JSON.parse(raw) as Partial<ReportExportOptions>) : normalizeReportExportOptions(null);
  } catch {
    return normalizeReportExportOptions(null);
  }
}

export function createInitialSolverProject(projectInfo?: Partial<ProjectInfo> | null) {
  const project = projectInfo ? createDefaultSolverProject(projectInfo) : createDefaultSolverProject();
  return normalizeSolverProject({
    ...project,
    settings: {
      ...project.settings,
      reportExportOptions: readLegacyReportExportOptions(),
    },
  });
}

function createInitialProjectDocumentState(localAutosaveEnabled: boolean): InitialProjectDocumentState {
  const storage = browserLocalStorage();
  if (localAutosaveEnabled && storage) {
    const autosave = readProjectAutosaveDraft(storage);
    if (autosave.ok && autosave.draft) {
      return {
        project: autosave.draft.projectFile.project,
        projectFileName: autosave.draft.fileName,
        lastSavedAt: null,
        isProjectDirty: true,
        fileStatusMessage: "已恢复浏览器本地工程草稿，请保存为正式工程文件。",
      };
    }
  }
  return {
    project: createInitialSolverProject(),
    projectFileName: null,
    lastSavedAt: null,
    isProjectDirty: false,
    fileStatusMessage: null,
  };
}

export function useSolverProjectDocument({ localAutosaveEnabled = true }: { localAutosaveEnabled?: boolean } = {}) {
  const [initialDocumentState] = useState(() => createInitialProjectDocumentState(localAutosaveEnabled));
  const [project, setProjectState] = useState<SolverProject>(initialDocumentState.project);
  const [projectFileHandle, setProjectFileHandle] = useState<ProjectFileHandle | null>(null);
  const [projectFileName, setProjectFileName] = useState<string | null>(initialDocumentState.projectFileName);
  const [documentLifecycle, setDocumentLifecycleState] = useState(() => createProjectDocumentLifecycle({
    dirty: initialDocumentState.isProjectDirty,
    lastSavedAt: initialDocumentState.lastSavedAt,
  }));
  const [fileStatusMessage, setFileStatusMessage] = useState<string | null>(initialDocumentState.fileStatusMessage);
  const [workspaceHistory, setWorkspaceHistoryState] = useState<WorkspaceHistoryState>(createEmptyWorkspaceHistory);
  const [isProjectReadOnly, setIsProjectReadOnlyState] = useState(false);
  const projectReadOnlyRef = useRef(false);
  const documentLifecycleRef = useRef(documentLifecycle);
  const projectRef = useRef(project);
  const activeObjectIdRef = useRef(project.activeObjectId);
  const workspaceHistoryRef = useRef(workspaceHistory);
  const workspace = useMemo(() => createWorkspaceFromProject(project), [project]);
  const activeAnalysisObject = useMemo(() => getActiveAnalysisObject(project), [project]);
  const isProjectDirty = isProjectDocumentDirty(documentLifecycle);
  const lastSavedAt = documentLifecycle.lastSavedAt;

  const setDocumentLifecycle = useCallback((nextLifecycle: ProjectDocumentLifecycle) => {
    documentLifecycleRef.current = nextLifecycle;
    setDocumentLifecycleState(nextLifecycle);
  }, []);

  const setWorkspaceHistory = useCallback((nextHistory: WorkspaceHistoryState) => {
    workspaceHistoryRef.current = nextHistory;
    setWorkspaceHistoryState(nextHistory);
  }, []);

  const resetWorkspaceHistory = useCallback(() => {
    setWorkspaceHistory(createEmptyWorkspaceHistory());
  }, [setWorkspaceHistory]);

  const setProjectReadOnly = useCallback((readOnly: boolean) => {
    projectReadOnlyRef.current = readOnly;
    setIsProjectReadOnlyState(readOnly);
    if (readOnly) {
      setFileStatusMessage("外部宿主只读模式：建模、导入和保存操作已锁定。");
    }
  }, []);

  const notifyReadOnlyMutation = useCallback(() => {
    setFileStatusMessage("当前工程由外部宿主以只读模式打开，不能修改或保存。");
  }, []);

  const setProjectForNavigation: Dispatch<SetStateAction<SolverProject>> = useCallback((next) => {
    setProjectState((current) => {
      const nextProject = typeof next === "function" ? next(current) : next;
      projectRef.current = nextProject;
      return nextProject;
    });
  }, []);

  const setProject: Dispatch<SetStateAction<SolverProject>> = useCallback((next) => {
    if (projectReadOnlyRef.current) {
      notifyReadOnlyMutation();
      return;
    }
    setProjectForNavigation(next);
  }, [notifyReadOnlyMutation, setProjectForNavigation]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    workspaceHistoryRef.current = workspaceHistory;
  }, [workspaceHistory]);

  useEffect(() => {
    if (activeObjectIdRef.current === project.activeObjectId) {
      return;
    }
    activeObjectIdRef.current = project.activeObjectId;
    resetWorkspaceHistory();
  }, [project.activeObjectId, resetWorkspaceHistory]);

  useEffect(() => {
    if (!localAutosaveEnabled) return;
    const storage = browserLocalStorage();
    if (!storage) return;
    try {
      if (isProjectDirty) {
        writeProjectAutosaveDraft(storage, createProjectAutosaveDraft(project, projectFileName, lastSavedAt));
      } else {
        clearProjectAutosaveDraft(storage);
      }
    } catch {
      // localStorage 可能因隐私模式、配额或浏览器策略不可写；正式工程文件保存仍由用户显式触发。
    }
  }, [isProjectDirty, lastSavedAt, localAutosaveEnabled, project, projectFileName]);

  const markProjectDirty = useCallback(() => {
    if (projectReadOnlyRef.current) {
      notifyReadOnlyMutation();
      return;
    }
    setDocumentLifecycle(advanceProjectDocumentRevision(documentLifecycleRef.current));
  }, [notifyReadOnlyMutation, setDocumentLifecycle]);

  const commitProjectMutation = useCallback((mutate: (current: SolverProject) => SolverProject) => {
    if (projectReadOnlyRef.current) {
      notifyReadOnlyMutation();
      return false;
    }
    const currentProject = projectRef.current;
    const nextProject = mutate(currentProject);
    if (nextProject === currentProject) return false;
    projectRef.current = nextProject;
    setProjectState(nextProject);
    markProjectDirty();
    return true;
  }, [markProjectDirty, notifyReadOnlyMutation]);

  const commitAnalysisResult = useCallback((
    objectId: string,
    result: Exclude<LegacyAnalysisResults, null>,
    provenance: ResultProvenance,
  ) => commitProjectMutation((current) => commitAnalysisObjectResult(current, objectId, result, provenance)), [commitProjectMutation]);

  const commitSensitivityResult = useCallback((
    objectId: string,
    result: SensitivityResults,
    provenance: ResultProvenance,
  ) => commitProjectMutation((current) => commitAnalysisObjectSensitivity(current, objectId, result, provenance)), [commitProjectMutation]);

  const clearAnalysisResults = useCallback((objectId: string) =>
    commitProjectMutation((current) => clearAnalysisObjectResults(current, objectId)), [commitProjectMutation]);

  const getProjectRevision = useCallback(() => documentLifecycleRef.current.revision, []);
  const getProjectDocumentSnapshot = useCallback(
    () => captureProjectDocumentSnapshot(documentLifecycleRef.current),
    [],
  );

  const markProjectSaved = useCallback((expectedRevision: number, message = "工程已保存。") => {
    const completion = completeProjectDocumentSave(
      documentLifecycleRef.current,
      expectedRevision,
      new Date().toISOString(),
    );
    if (!completion.accepted) {
      setFileStatusMessage("外部宿主已保存较早版本，当前修改仍未保存。");
      return false;
    }
    setDocumentLifecycle(completion.lifecycle);
    setFileStatusMessage(message);
    return true;
  }, [setDocumentLifecycle]);

  const completeProjectFileSave = useCallback((
    savedProject: SolverProject,
    expectedSnapshot: ProjectDocumentSnapshot,
    fileName: string,
    handle: ProjectFileHandle | null,
    savedAt: string,
    message: string,
  ) => {
    if (!isSameProjectDocument(documentLifecycleRef.current, expectedSnapshot)) {
      setFileStatusMessage("此前工程的本地保存已完成，当前工程未受影响。");
      return false;
    }
    setProjectFileHandle(handle);
    setProjectFileName(fileName);
    const completion = completeProjectDocumentSave(
      documentLifecycleRef.current,
      expectedSnapshot.revision,
      savedAt,
    );
    if (!completion.accepted) {
      setFileStatusMessage("本地文件已保存较早版本，当前修改仍未保存。");
      return false;
    }
    setProjectForNavigation(savedProject);
    setDocumentLifecycle(completion.lifecycle);
    setFileStatusMessage(message);
    return true;
  }, [setDocumentLifecycle, setProjectForNavigation]);

  const updateWorkspace: Dispatch<SetStateAction<WorkspaceState>> = useCallback((next) => {
    if (projectReadOnlyRef.current) {
      notifyReadOnlyMutation();
      return;
    }
    const currentProject = projectRef.current;
    const currentWorkspace = createWorkspaceFromProject(currentProject);
    const nextWorkspace = typeof next === "function" ? next(currentWorkspace) : next;
    if (workspaceStatesEqual(currentWorkspace, nextWorkspace)) {
      return;
    }
    setWorkspaceHistory(pushWorkspaceHistory(workspaceHistoryRef.current, currentWorkspace, nextWorkspace));
    markProjectDirty();
    const nextProject = updateActiveAnalysisObjectWorkspace(currentProject, nextWorkspace);
    projectRef.current = nextProject;
    setProjectState(nextProject);
  }, [markProjectDirty, notifyReadOnlyMutation, setWorkspaceHistory]);

  const undoWorkspaceChange = useCallback(() => {
    if (projectReadOnlyRef.current) {
      notifyReadOnlyMutation();
      return;
    }
    const currentProject = projectRef.current;
    const currentWorkspace = createWorkspaceFromProject(currentProject);
    const result = undoWorkspaceHistory(workspaceHistoryRef.current, currentWorkspace);
    if (!result) {
      return;
    }
    setWorkspaceHistory(result.history);
    markProjectDirty();
    setFileStatusMessage("已撤销上一步建模编辑。");
    const nextProject = updateActiveAnalysisObjectWorkspace(currentProject, result.workspace);
    projectRef.current = nextProject;
    setProjectState(nextProject);
  }, [markProjectDirty, notifyReadOnlyMutation, setWorkspaceHistory]);

  const redoWorkspaceChange = useCallback(() => {
    if (projectReadOnlyRef.current) {
      notifyReadOnlyMutation();
      return;
    }
    const currentProject = projectRef.current;
    const currentWorkspace = createWorkspaceFromProject(currentProject);
    const result = redoWorkspaceHistory(workspaceHistoryRef.current, currentWorkspace);
    if (!result) {
      return;
    }
    setWorkspaceHistory(result.history);
    markProjectDirty();
    setFileStatusMessage("已重做下一步建模编辑。");
    const nextProject = updateActiveAnalysisObjectWorkspace(currentProject, result.workspace);
    projectRef.current = nextProject;
    setProjectState(nextProject);
  }, [markProjectDirty, notifyReadOnlyMutation, setWorkspaceHistory]);

  const setReportExportOptions = useCallback((options: ReportExportOptions) => {
    markProjectDirty();
    setProject((current) => normalizeSolverProject({
      ...current,
      settings: {
        ...current.settings,
        reportExportOptions: options,
      },
      updatedAt: new Date().toISOString(),
    }));
  }, [markProjectDirty, setProject]);

  const setModelPreviewStyle = useCallback((style: ModelPreviewStyle) => {
    markProjectDirty();
    setProject((current) => normalizeSolverProject({
      ...current,
      settings: {
        ...current.settings,
        modelPreviewStyle: style,
      },
      updatedAt: new Date().toISOString(),
    }));
  }, [markProjectDirty, setProject]);

  const setCustomMaterials = useCallback((customMaterials: Material[]) => {
    markProjectDirty();
    setProject((current) => normalizeSolverProject({
      ...current,
      settings: {
        ...current.settings,
        customMaterials: normalizeProjectCustomMaterials(customMaterials),
      },
      updatedAt: new Date().toISOString(),
    }));
  }, [markProjectDirty, setProject]);

  const updateProjectInfo = useCallback((next: ProjectInfo) => {
    const normalizedProjectInfo = normalizeProjectInfo(next);
    markProjectDirty();
    setProject((current) => normalizeSolverProject({
      ...current,
      name: normalizedProjectInfo.name,
      settings: {
        ...current.settings,
        projectInfo: normalizedProjectInfo,
      },
      updatedAt: new Date().toISOString(),
    }));
  }, [markProjectDirty, setProject]);

  const replaceProject = useCallback((
    nextProject: SolverProject,
    fileName: string | null,
    handle: ProjectFileHandle | null,
    savedAt: string | null,
    message: string,
  ) => {
    setProjectForNavigation(nextProject);
    setProjectFileHandle(handle);
    setProjectFileName(fileName);
    setDocumentLifecycle(replaceProjectDocumentRevision(documentLifecycleRef.current, savedAt));
    setFileStatusMessage(message);
    activeObjectIdRef.current = nextProject.activeObjectId;
    resetWorkspaceHistory();
  }, [resetWorkspaceHistory, setDocumentLifecycle, setProjectForNavigation]);

  const clearProjectFileLink = useCallback((message: string) => {
    if (projectReadOnlyRef.current) {
      notifyReadOnlyMutation();
      return;
    }
    setProjectFileHandle(null);
    setProjectFileName(null);
    setFileStatusMessage(message);
  }, [notifyReadOnlyMutation]);

  return {
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
    getProjectRevision,
    getProjectDocumentSnapshot,
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
    updateProjectInfo,
    updateWorkspace,
    undoWorkspaceChange,
    redoWorkspaceChange,
    canUndoWorkspace: workspaceHistory.past.length > 0,
    canRedoWorkspace: workspaceHistory.future.length > 0,
    workspace,
  };
}
