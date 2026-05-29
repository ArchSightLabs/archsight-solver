import { useCallback, useRef, type ChangeEvent as ReactChangeEvent } from "react";
import {
  createArchSightSolverProjectFile,
  getArchSightSolverProjectFileName,
  isFilePickerAbort,
  openArchSightSolverProjectFileWithPicker,
  readArchSightSolverProjectFile,
  saveArchSightSolverProjectFile,
  supportsNativeProjectFiles,
  type ProjectFileHandle,
} from "../lib/project-file";
import {
  getActiveAnalysisObject,
  normalizeSolverProject,
  type SolverProject,
} from "../lib/solver-project";

interface UseProjectFileActionsOptions {
  applyCurrentRuntimeToProject: (sourceProject: SolverProject) => SolverProject;
  isProjectDirty: boolean;
  markRuntimePersisted: () => void;
  onNewProjectRequested: () => void;
  onProjectOpened: () => void;
  onPublicExampleClosed: () => void;
  project: SolverProject;
  projectFileHandle: ProjectFileHandle | null;
  replaceProject: (
    nextProject: SolverProject,
    fileName: string | null,
    handle: ProjectFileHandle | null,
    savedAt: string | null,
    message: string,
  ) => void;
  syncRuntimeFromAnalysisObject: (object: ReturnType<typeof getActiveAnalysisObject>) => void;
}

export function useProjectFileActions({
  applyCurrentRuntimeToProject,
  isProjectDirty,
  markRuntimePersisted,
  onNewProjectRequested,
  onProjectOpened,
  onPublicExampleClosed,
  project,
  projectFileHandle,
  replaceProject,
  syncRuntimeFromAnalysisObject,
}: UseProjectFileActionsOptions) {
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);

  const confirmDiscardUnsavedChanges = useCallback(() =>
    !isProjectDirty || window.confirm("当前项目有未保存更改。继续操作会放弃这些更改，是否继续？"), [isProjectDirty]);

  const loadProject = useCallback((
    nextProject: SolverProject,
    fileName: string | null,
    handle: ProjectFileHandle | null,
    savedAt: string | null,
    message: string,
  ) => {
    replaceProject(nextProject, fileName, handle, savedAt, message);
    syncRuntimeFromAnalysisObject(getActiveAnalysisObject(nextProject));
    onProjectOpened();
  }, [onProjectOpened, replaceProject, syncRuntimeFromAnalysisObject]);

  const handleNewProjectFile = useCallback(() => {
    if (!confirmDiscardUnsavedChanges()) return;
    onNewProjectRequested();
  }, [confirmDiscardUnsavedChanges, onNewProjectRequested]);

  const handleSaveProjectFile = useCallback(async (forceSaveAs = false) => {
    try {
      const savedProject = applyCurrentRuntimeToProject(project);
      const projectFile = createArchSightSolverProjectFile(savedProject);
      const result = await saveArchSightSolverProjectFile(projectFile, projectFileHandle, forceSaveAs);
      markRuntimePersisted();
      replaceProject(
        savedProject,
        result.fileName,
        result.handle,
        result.savedAt,
        result.mode === "download" ? `已下载导出：${result.fileName}` : `${forceSaveAs ? "保存副本" : "保存"}成功：${result.fileName}`
      );
    } catch (error) {
      if (isFilePickerAbort(error)) return;
      alert(`项目文件保存失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }, [applyCurrentRuntimeToProject, markRuntimePersisted, project, projectFileHandle, replaceProject]);

  const handleOpenProjectFile = useCallback(() => {
    if (!confirmDiscardUnsavedChanges()) return;
    if (!supportsNativeProjectFiles()) {
      projectFileInputRef.current?.click();
      return;
    }

    void (async () => {
      try {
        const { projectFile, handle, fileName } = await openArchSightSolverProjectFileWithPicker();
        loadProject(projectFile.project, fileName, handle, projectFile.updatedAt, `已打开：${fileName}`);
      } catch (error) {
        if (isFilePickerAbort(error)) return;
        alert(`项目文件读取失败：${error instanceof Error ? error.message : "未知错误"}`);
      }
    })();
  }, [confirmDiscardUnsavedChanges, loadProject]);

  const handleOpenPublicExampleProject = useCallback((nextProject: SolverProject, title: string) => {
    if (!confirmDiscardUnsavedChanges()) return;
    const normalizedProject = normalizeSolverProject(nextProject);
    loadProject(normalizedProject, null, null, normalizedProject.updatedAt, `已打开公开验证工程：${title}`);
    onPublicExampleClosed();
  }, [confirmDiscardUnsavedChanges, loadProject, onPublicExampleClosed]);

  const handleProjectFileChange = useCallback(async (event: ReactChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const projectFile = await readArchSightSolverProjectFile(file);
      const fileName = file.name || getArchSightSolverProjectFileName(projectFile.project);
      loadProject(projectFile.project, fileName, null, projectFile.updatedAt, `已打开：${fileName}`);
    } catch (error) {
      alert(`项目文件读取失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }, [loadProject]);

  return {
    handleNewProjectFile,
    handleOpenProjectFile,
    handleOpenPublicExampleProject,
    handleProjectFileChange,
    handleSaveProjectFile,
    projectFileInputRef,
  };
}
