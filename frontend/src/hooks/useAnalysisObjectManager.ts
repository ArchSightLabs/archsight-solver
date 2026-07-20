import { useMemo, type Dispatch, type SetStateAction } from "react";
import {
  addAnalysisObjectToProject,
  getActiveAnalysisObject,
  removeAnalysisObjectFromProject,
  setActiveAnalysisObject,
  type AnalysisObject,
  type AnalysisObjectType,
  type SolverProject,
} from "../lib/solver-project";

interface UseAnalysisObjectManagerOptions {
  markProjectDirty: () => void;
  onAnalysisObjectChanged: () => void;
  onCreatedDialogClose: () => void;
  onCreatedAnalysisObject?: (object: AnalysisObject) => void;
  project: SolverProject;
  isProjectReadOnly: boolean;
  setFileStatusMessage: (message: string) => void;
  setProject: Dispatch<SetStateAction<SolverProject>>;
  setProjectForNavigation: Dispatch<SetStateAction<SolverProject>>;
}

export function useAnalysisObjectManager({
  markProjectDirty,
  onAnalysisObjectChanged,
  onCreatedDialogClose,
  onCreatedAnalysisObject,
  project,
  isProjectReadOnly,
  setFileStatusMessage,
  setProject,
  setProjectForNavigation,
}: UseAnalysisObjectManagerOptions) {
  const objectCountByType = useMemo(() => ({
    beam: project.objects.filter((object) => object.type === "beam").length,
    frame: project.objects.filter((object) => object.type === "frame").length,
    truss: project.objects.filter((object) => object.type === "truss").length,
  }), [project.objects]);

  const handleSelectAnalysisObject = (objectId: string) => {
    if (objectId === project.activeObjectId) return;
    const nextProject = setActiveAnalysisObject(project, objectId);
    setProjectForNavigation(nextProject);
    onAnalysisObjectChanged();
  };

  const handleCreateAnalysisObject = (type: AnalysisObjectType, name: string) => {
    if (isProjectReadOnly) {
      setFileStatusMessage("外部宿主只读模式下不能新建分析对象。");
      return;
    }
    const nextProject = addAnalysisObjectToProject(project, type, name);
    const nextObject = getActiveAnalysisObject(nextProject);
    setProject(nextProject);
    onAnalysisObjectChanged();
    markProjectDirty();
    setFileStatusMessage(`已新建分析对象：${name}`);
    onCreatedAnalysisObject?.(nextObject);
    onCreatedDialogClose();
  };

  const handleRemoveAnalysisObject = (objectId: string) => {
    if (isProjectReadOnly) {
      setFileStatusMessage("外部宿主只读模式下不能删除分析对象。");
      return;
    }
    if (project.objects.length <= 1) return;
    if (!window.confirm("删除该分析对象会同时移除其输入与计算结果，是否继续？")) return;
    const nextProject = removeAnalysisObjectFromProject(project, objectId);
    setProject(nextProject);
    onAnalysisObjectChanged();
    markProjectDirty();
    setFileStatusMessage("已删除分析对象");
  };

  return {
    handleCreateAnalysisObject,
    handleRemoveAnalysisObject,
    handleSelectAnalysisObject,
    objectCountByType,
  };
}
