import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { ModelPreviewStyle } from "../types/beam";
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
import {
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

function createInitialProjectDocumentState(): InitialProjectDocumentState {
  const storage = browserLocalStorage();
  if (storage) {
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

export function useSolverProjectDocument() {
  const [initialDocumentState] = useState(createInitialProjectDocumentState);
  const [project, setProject] = useState<SolverProject>(initialDocumentState.project);
  const [projectFileHandle, setProjectFileHandle] = useState<ProjectFileHandle | null>(null);
  const [projectFileName, setProjectFileName] = useState<string | null>(initialDocumentState.projectFileName);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(initialDocumentState.lastSavedAt);
  const [isProjectDirty, setIsProjectDirty] = useState(initialDocumentState.isProjectDirty);
  const [fileStatusMessage, setFileStatusMessage] = useState<string | null>(initialDocumentState.fileStatusMessage);
  const workspace = useMemo(() => createWorkspaceFromProject(project), [project]);
  const activeAnalysisObject = useMemo(() => getActiveAnalysisObject(project), [project]);

  useEffect(() => {
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
  }, [isProjectDirty, lastSavedAt, project, projectFileName]);

  const markProjectDirty = useCallback(() => {
    setLastSavedAt(null);
    setIsProjectDirty(true);
  }, []);

  const updateWorkspace: Dispatch<SetStateAction<WorkspaceState>> = useCallback((next) => {
    markProjectDirty();
    setProject((current) => {
      const currentWorkspace = createWorkspaceFromProject(current);
      const nextWorkspace = typeof next === "function" ? next(currentWorkspace) : next;
      return updateActiveAnalysisObjectWorkspace(current, nextWorkspace);
    });
  }, [markProjectDirty]);

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
  }, [markProjectDirty]);

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
  }, [markProjectDirty]);

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
  }, [markProjectDirty]);

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
  }, [markProjectDirty]);

  const replaceProject = useCallback((
    nextProject: SolverProject,
    fileName: string | null,
    handle: ProjectFileHandle | null,
    savedAt: string | null,
    message: string,
  ) => {
    setProject(nextProject);
    setProjectFileHandle(handle);
    setProjectFileName(fileName);
    setLastSavedAt(savedAt);
    setIsProjectDirty(false);
    setFileStatusMessage(message);
  }, []);

  const clearProjectFileLink = useCallback((message: string) => {
    setProjectFileHandle(null);
    setProjectFileName(null);
    setFileStatusMessage(message);
  }, []);

  return {
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
    setProjectFileHandle,
    setProjectFileName,
    setReportExportOptions,
    updateProjectInfo,
    updateWorkspace,
    workspace,
  };
}
