import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { SensitivityResults } from "../types/beam";
import type { WorkspaceState } from "../lib/workspace-state";
import {
  updateActiveAnalysisObject,
  type AnalysisObject,
  type SolverProject,
  type WorkbenchView,
} from "../lib/solver-project";
import type { ReportExportOptions } from "../lib/report-options";
import { buildBeamPayload, buildFramePayload, buildTrussPayload, validateCustomFrameWorkspace, validateCustomTrussWorkspace } from "../solver-payload";
import { beamResultForView, frameResultForView, trussResultForView } from "../lib/api-envelope";
import { analysisVocabulary } from "../lib/analysis-vocabulary";
import { useWorkbenchActions, type AnalysisResults } from "./useWorkbenchActions";
import { solvingRunLabel } from "../lib/workbench-operation-status";

const BENCHMARK_SUBMISSION_NEEDS_RESULT_REASON = "请先运行当前分析对象的结构计算，再生成验证投稿包。";

interface UseWorkbenchRuntimeOptions {
  activeAnalysisObject: AnalysisObject;
  clientId: string;
  markProjectDirty: () => void;
  projectName: string;
  reportExportOptions: ReportExportOptions;
  resetWorkbenchContext: () => void;
  setProject: Dispatch<SetStateAction<SolverProject>>;
  updateWorkspace: Dispatch<SetStateAction<WorkspaceState>>;
  workspace: WorkspaceState;
}

export function useWorkbenchRuntime({
  activeAnalysisObject,
  clientId,
  markProjectDirty,
  projectName,
  reportExportOptions,
  resetWorkbenchContext,
  setProject,
  updateWorkspace,
  workspace,
}: UseWorkbenchRuntimeOptions) {
  const [workbenchView, setWorkbenchView] = useState<WorkbenchView>("model");
  const skipNextRuntimePersistRef = useRef(true);
  const lastRuntimePersistRef = useRef<{
    analysisData: AnalysisResults;
    sensitivityData: SensitivityResults | null;
    workbenchView: WorkbenchView;
  }>({ analysisData: null, sensitivityData: null, workbenchView: "model" });
  const setCompactWorkbenchView = useCallback((view: "parameters" | "results") => {
    setWorkbenchView(view === "results" ? "results" : "model");
  }, []);

  const {
    analysisData,
    setAnalysisData,
    sensitivityData,
    setSensitivityData,
    isSolving,
    isScanning,
    exportingFormat,
    operationNotice,
    setOperationNotice,
    handleRunCurrentModule,
    handleSensitivity,
    handleExport,
  } = useWorkbenchActions(
    workspace,
    updateWorkspace,
    setCompactWorkbenchView,
    clientId,
    reportExportOptions,
    projectName,
    activeAnalysisObject.benchmark
  );

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
    markProjectDirty();
  }, [analysisData, markProjectDirty, sensitivityData, setProject, workbenchView]);

  const syncRuntimeFromAnalysisObject = useCallback((object: AnalysisObject) => {
    skipNextRuntimePersistRef.current = true;
    setAnalysisData(object.results);
    setSensitivityData(object.sensitivityResults);
    setOperationNotice(null);
    setWorkbenchView(object.workbenchView);
    resetWorkbenchContext();
  }, [resetWorkbenchContext, setAnalysisData, setOperationNotice, setSensitivityData]);

  const resetRuntimeForNewAnalysisObject = useCallback(() => {
    skipNextRuntimePersistRef.current = true;
    setAnalysisData(null);
    setSensitivityData(null);
    setOperationNotice(null);
    setWorkbenchView("model");
    resetWorkbenchContext();
  }, [resetWorkbenchContext, setAnalysisData, setOperationNotice, setSensitivityData]);

  const clearCurrentAnalysisRuntime = useCallback(() => {
    skipNextRuntimePersistRef.current = true;
    lastRuntimePersistRef.current = { analysisData: null, sensitivityData: null, workbenchView: "model" };
    setAnalysisData(null);
    setSensitivityData(null);
    setOperationNotice(null);
    setWorkbenchView("model");
    setProject((current) => updateActiveAnalysisObject(current, (object) => ({
      ...object,
      results: null,
      sensitivityResults: null,
      workbenchView: "model",
    })));
    markProjectDirty();
    resetWorkbenchContext();
  }, [markProjectDirty, resetWorkbenchContext, setAnalysisData, setOperationNotice, setProject, setSensitivityData]);

  const markRuntimePersisted = useCallback(() => {
    skipNextRuntimePersistRef.current = true;
    lastRuntimePersistRef.current = { analysisData, sensitivityData, workbenchView };
  }, [analysisData, sensitivityData, workbenchView]);

  const applyCurrentRuntimeToProject = useCallback((sourceProject: SolverProject) => updateActiveAnalysisObject(sourceProject, (object) => ({
    ...object,
    results: analysisData,
    sensitivityResults: sensitivityData,
    workbenchView,
  })), [analysisData, sensitivityData, workbenchView]);

  const analysisMode = workspace.analysisMode;
  const frameResults = useMemo(() => frameResultForView(analysisData), [analysisData]);
  const trussResults = useMemo(() => trussResultForView(analysisData), [analysisData]);
  const beamResults = useMemo(() => beamResultForView(analysisData), [analysisData]);
  const benchmarkSubmissionContext = useMemo(() => {
    if (analysisMode === "frame") {
      const disabledReason = validateCustomFrameWorkspace(workspace.frame);
      const payload = disabledReason ? null : buildFramePayload(workspace.frame);
      return {
        category: "frame" as const,
        payload,
        calculationResult: frameResults,
        disabledReason: disabledReason ?? (frameResults ? null : BENCHMARK_SUBMISSION_NEEDS_RESULT_REASON),
        objectName: activeAnalysisObject.name,
      };
    }
    if (analysisMode === "truss") {
      const disabledReason = validateCustomTrussWorkspace(workspace.truss);
      const payload = disabledReason ? null : buildTrussPayload(workspace.truss);
      return {
        category: "truss" as const,
        payload,
        calculationResult: trussResults,
        disabledReason: disabledReason ?? (trussResults ? null : BENCHMARK_SUBMISSION_NEEDS_RESULT_REASON),
        objectName: activeAnalysisObject.name,
      };
    }
    const payload = buildBeamPayload(workspace.beam);
    return {
      category: "beam" as const,
      payload,
      calculationResult: beamResults,
      disabledReason: beamResults ? null : BENCHMARK_SUBMISSION_NEEDS_RESULT_REASON,
      objectName: activeAnalysisObject.name,
    };
  }, [activeAnalysisObject.name, analysisMode, beamResults, frameResults, trussResults, workspace.beam, workspace.frame, workspace.truss]);
  const runLabel = isSolving ? solvingRunLabel(analysisMode) : analysisVocabulary(analysisMode).runLabel;

  const handleRunAndReview = () => {
    setWorkbenchView("results");
    handleRunCurrentModule();
  };

  return {
    analysisData,
    applyCurrentRuntimeToProject,
    beamResults,
    benchmarkSubmissionContext,
    clearCurrentAnalysisRuntime,
    exportingFormat,
    frameResults,
    handleExport,
    handleRunAndReview,
    handleRunCurrentModule,
    handleSensitivity,
    isScanning,
    isSolving,
    markRuntimePersisted,
    operationNotice,
    resetRuntimeForNewAnalysisObject,
    runLabel,
    sensitivityData,
    syncRuntimeFromAnalysisObject,
    trussResults,
    workbenchView,
    setWorkbenchView,
  };
}
