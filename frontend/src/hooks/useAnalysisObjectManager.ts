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
  applyCurrentRuntimeToProject: (sourceProject: SolverProject) => SolverProject;
  markProjectDirty: () => void;
  onCreatedDialogClose: () => void;
  project: SolverProject;
  resetRuntimeForNewAnalysisObject: () => void;
  setFileStatusMessage: (message: string) => void;
  setProject: Dispatch<SetStateAction<SolverProject>>;
  syncRuntimeFromAnalysisObject: (object: AnalysisObject) => void;
}

export function useAnalysisObjectManager({
  applyCurrentRuntimeToProject,
  markProjectDirty,
  onCreatedDialogClose,
  project,
  resetRuntimeForNewAnalysisObject,
  setFileStatusMessage,
  setProject,
  syncRuntimeFromAnalysisObject,
}: UseAnalysisObjectManagerOptions) {
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
    resetRuntimeForNewAnalysisObject();
    markProjectDirty();
    setFileStatusMessage(`已新建分析对象：${name}`);
    onCreatedDialogClose();
  };

  const handleRemoveAnalysisObject = (objectId: string) => {
    if (project.objects.length <= 1) return;
    if (!window.confirm("删除该分析对象会同时移除其输入与计算结果，是否继续？")) return;
    const nextProject = removeAnalysisObjectFromProject(applyCurrentRuntimeToProject(project), objectId);
    setProject(nextProject);
    syncRuntimeFromAnalysisObject(getActiveAnalysisObject(nextProject));
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
