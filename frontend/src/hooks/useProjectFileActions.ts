import { useCallback, useRef, type ChangeEvent as ReactChangeEvent } from "react";
import {
  createArchSightSolverProjectFile,
  getArchSightSolverProjectFileName,
  isFilePickerAbort,
  openArchSightSolverProjectFileWithPicker,
  projectFileDiagnosticsMessage,
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
  isProjectReadOnly: boolean;
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
  isProjectReadOnly,
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
    if (isProjectReadOnly) return;
    if (!confirmDiscardUnsavedChanges()) return;
    onNewProjectRequested();
  }, [confirmDiscardUnsavedChanges, isProjectReadOnly, onNewProjectRequested]);

  const handleSaveProjectFile = useCallback(async (forceSaveAs = false) => {
    if (isProjectReadOnly) return;
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
        result.mode === "download" ? `已下载导出：${result.fileName}` : `${forceSaveAs ? "另存为" : "保存"}成功：${result.fileName}`
      );
    } catch (error) {
      if (isFilePickerAbort(error)) return;
      alert(`项目文件保存失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }, [applyCurrentRuntimeToProject, isProjectReadOnly, markRuntimePersisted, project, projectFileHandle, replaceProject]);

  const handleOpenProjectFile = useCallback(() => {
    if (isProjectReadOnly) return;
    if (!confirmDiscardUnsavedChanges()) return;
    if (!supportsNativeProjectFiles()) {
      projectFileInputRef.current?.click();
      return;
    }

    void (async () => {
      try {
        const { projectFile, handle, fileName } = await openArchSightSolverProjectFileWithPicker();
        const diagnosticsMessage = projectFileDiagnosticsMessage(projectFile.diagnostics ?? []);
        loadProject(projectFile.project, fileName, handle, projectFile.updatedAt, diagnosticsMessage ? `已打开：${fileName}；${diagnosticsMessage}` : `已打开：${fileName}`);
      } catch (error) {
        if (isFilePickerAbort(error)) return;
        alert(`项目文件读取失败：${error instanceof Error ? error.message : "未知错误"}`);
      }
    })();
  }, [confirmDiscardUnsavedChanges, isProjectReadOnly, loadProject]);

  const handleOpenPublicExampleProject = useCallback((nextProject: SolverProject, title: string) => {
    if (isProjectReadOnly) return;
    if (!confirmDiscardUnsavedChanges()) return;
    const normalizedProject = normalizeSolverProject(nextProject);
    loadProject(normalizedProject, null, null, normalizedProject.updatedAt, `已打开公开验证工程：${title}`);
    onPublicExampleClosed();
  }, [confirmDiscardUnsavedChanges, isProjectReadOnly, loadProject, onPublicExampleClosed]);

  const handleProjectFileChange = useCallback(async (event: ReactChangeEvent<HTMLInputElement>) => {
    if (isProjectReadOnly) {
      event.target.value = "";
      return;
    }
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    try {
      const projectFile = await readArchSightSolverProjectFile(file);
      const fileName = file.name || getArchSightSolverProjectFileName(projectFile.project);
      const diagnosticsMessage = projectFileDiagnosticsMessage(projectFile.diagnostics ?? []);
      loadProject(projectFile.project, fileName, null, projectFile.updatedAt, diagnosticsMessage ? `已打开：${fileName}；${diagnosticsMessage}` : `已打开：${fileName}`);
    } catch (error) {
      alert(`项目文件读取失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }, [isProjectReadOnly, loadProject]);

  return {
    handleNewProjectFile,
    handleOpenProjectFile,
    handleOpenPublicExampleProject,
    handleProjectFileChange,
    handleSaveProjectFile,
    projectFileInputRef,
  };
}
