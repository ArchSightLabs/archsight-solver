import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { ModelPreviewStyle } from "../types/beam";
import type { Material } from "../types/material";
import type { ReportExportOptions } from "../lib/report-options";
import { normalizeReportExportOptions } from "../lib/report-options";
import { normalizeProjectCustomMaterials } from "../lib/material-presets";
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

function readLegacyReportExportOptions() {
  try {
    const raw = window.localStorage.getItem(LEGACY_REPORT_EXPORT_OPTIONS_STORAGE_KEY);
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

export function useSolverProjectDocument() {
  const [project, setProject] = useState<SolverProject>(() => createInitialSolverProject());
  const [projectFileHandle, setProjectFileHandle] = useState<ProjectFileHandle | null>(null);
  const [projectFileName, setProjectFileName] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isProjectDirty, setIsProjectDirty] = useState(false);
  const [fileStatusMessage, setFileStatusMessage] = useState<string | null>(null);
  const workspace = useMemo(() => createWorkspaceFromProject(project), [project]);
  const activeAnalysisObject = useMemo(() => getActiveAnalysisObject(project), [project]);

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
