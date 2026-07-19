import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { SensitivityResults } from "../types/beam";
import type { WorkspaceState } from "../lib/workspace-state";
import { buildModelDiagnostics, type ModelDiagnostics } from "../lib/model-diagnostics";
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
import { solvingRunLabel, validationNotice } from "../lib/workbench-operation-status";
import type { ResultProvenance } from "../lib/result-provenance";

const BENCHMARK_SUBMISSION_NEEDS_RESULT_REASON = "请先运行当前分析对象的结构计算，再生成验证投稿包。";

interface UseWorkbenchRuntimeOptions {
  activeAnalysisObject: AnalysisObject;
  clientId: string;
  getProjectRevision: () => number;
  markProjectDirty: () => void;
  modelDiagnostics: ModelDiagnostics;
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
  getProjectRevision,
  markProjectDirty,
  modelDiagnostics,
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
    resultProvenance: ResultProvenance | null;
    workbenchView: WorkbenchView;
  }>({ analysisData: null, sensitivityData: null, resultProvenance: null, workbenchView: "model" });
  const setCompactWorkbenchView = useCallback((view: "parameters" | "results") => {
    setWorkbenchView(view === "results" ? "results" : "model");
  }, []);

  const {
    analysisData,
    setAnalysisData,
    resultProvenance,
    setResultProvenance,
    resultValidity,
    sensitivityData,
    setSensitivityData,
    isSolving,
    isScanning,
    exportingFormat,
    operationNotice,
    setOperationNotice,
    handleRunCurrentModule: runCurrentModule,
    handleRunPayload,
    handleSensitivity: runSensitivity,
    handleExport,
  } = useWorkbenchActions(
    workspace,
    updateWorkspace,
    setCompactWorkbenchView,
    clientId,
    reportExportOptions,
    projectName,
    activeAnalysisObject.id,
    getProjectRevision,
    activeAnalysisObject.benchmark
  );

  useEffect(() => {
    const previousRuntime = lastRuntimePersistRef.current;
    const isSameRuntime =
      previousRuntime.analysisData === analysisData &&
      previousRuntime.sensitivityData === sensitivityData &&
      previousRuntime.resultProvenance === resultProvenance &&
      previousRuntime.workbenchView === workbenchView;

    if (skipNextRuntimePersistRef.current) {
      skipNextRuntimePersistRef.current = false;
      lastRuntimePersistRef.current = { analysisData, sensitivityData, resultProvenance, workbenchView };
      return;
    }
    if (isSameRuntime) {
      return;
    }
    lastRuntimePersistRef.current = { analysisData, sensitivityData, resultProvenance, workbenchView };
    setProject((current) => updateActiveAnalysisObject(current, (object) => ({
      ...object,
      results: analysisData,
      sensitivityResults: sensitivityData,
      resultProvenance,
      workbenchView,
    })));
    markProjectDirty();
  }, [analysisData, markProjectDirty, resultProvenance, sensitivityData, setProject, workbenchView]);

  const syncRuntimeFromAnalysisObject = useCallback((object: AnalysisObject) => {
    skipNextRuntimePersistRef.current = true;
    setAnalysisData(object.results);
    setSensitivityData(object.sensitivityResults);
    setResultProvenance(object.resultProvenance);
    setOperationNotice(null);
    setWorkbenchView(object.workbenchView);
    resetWorkbenchContext();
  }, [resetWorkbenchContext, setAnalysisData, setOperationNotice, setResultProvenance, setSensitivityData]);

  const resetRuntimeForNewAnalysisObject = useCallback(() => {
    skipNextRuntimePersistRef.current = true;
    setAnalysisData(null);
    setSensitivityData(null);
    setResultProvenance(null);
    setOperationNotice(null);
    setWorkbenchView("model");
    resetWorkbenchContext();
  }, [resetWorkbenchContext, setAnalysisData, setOperationNotice, setResultProvenance, setSensitivityData]);

  const clearCurrentAnalysisRuntime = useCallback(() => {
    skipNextRuntimePersistRef.current = true;
    lastRuntimePersistRef.current = { analysisData: null, sensitivityData: null, resultProvenance: null, workbenchView: "model" };
    setAnalysisData(null);
    setSensitivityData(null);
    setResultProvenance(null);
    setOperationNotice(null);
    setWorkbenchView("model");
    setProject((current) => updateActiveAnalysisObject(current, (object) => ({
      ...object,
      results: null,
      sensitivityResults: null,
      resultProvenance: null,
      workbenchView: "model",
    })));
    markProjectDirty();
    resetWorkbenchContext();
  }, [markProjectDirty, resetWorkbenchContext, setAnalysisData, setOperationNotice, setProject, setResultProvenance, setSensitivityData]);

  const markRuntimePersisted = useCallback(() => {
    skipNextRuntimePersistRef.current = true;
    lastRuntimePersistRef.current = { analysisData, sensitivityData, resultProvenance, workbenchView };
  }, [analysisData, resultProvenance, sensitivityData, workbenchView]);

  const applyCurrentRuntimeToProject = useCallback((sourceProject: SolverProject) => updateActiveAnalysisObject(sourceProject, (object) => ({
    ...object,
    results: analysisData,
    sensitivityResults: sensitivityData,
    resultProvenance,
    workbenchView,
  })), [analysisData, resultProvenance, sensitivityData, workbenchView]);

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
        disabledReason: disabledReason ?? (frameResults && resultValidity.status === "current" ? null : resultValidity.status === "missing" ? BENCHMARK_SUBMISSION_NEEDS_RESULT_REASON : resultValidity.message),
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
        disabledReason: disabledReason ?? (trussResults && resultValidity.status === "current" ? null : resultValidity.status === "missing" ? BENCHMARK_SUBMISSION_NEEDS_RESULT_REASON : resultValidity.message),
        objectName: activeAnalysisObject.name,
      };
    }
    const payload = buildBeamPayload(workspace.beam);
    return {
      category: "beam" as const,
      payload,
      calculationResult: beamResults,
      disabledReason: beamResults && resultValidity.status === "current" ? null : resultValidity.status === "missing" ? BENCHMARK_SUBMISSION_NEEDS_RESULT_REASON : resultValidity.message,
      objectName: activeAnalysisObject.name,
    };
  }, [activeAnalysisObject.name, analysisMode, beamResults, frameResults, resultValidity, trussResults, workspace.beam, workspace.frame, workspace.truss]);
  const runLabel = isSolving ? solvingRunLabel(analysisMode) : analysisVocabulary(analysisMode).runLabel;

  const blockedDiagnosticsMessage = useCallback((diagnostics: ModelDiagnostics): string | null => {
    if (diagnostics.status !== "blocked") return null;
    const firstBlockingIssue = diagnostics.issues.find((issue) => issue.severity === "error");
    if (!firstBlockingIssue) return diagnostics.summary;
    return `${firstBlockingIssue.title}：${firstBlockingIssue.detail}${firstBlockingIssue.suggestion ? ` ${firstBlockingIssue.suggestion}` : ""}`;
  }, []);

  const blockIfDiagnosticsFailed = useCallback((diagnostics: ModelDiagnostics): boolean => {
    const message = blockedDiagnosticsMessage(diagnostics);
    if (!message) return false;
    setOperationNotice(validationNotice(message));
    return true;
  }, [blockedDiagnosticsMessage, setOperationNotice]);

  const handleRunCurrentModule = useCallback(() => {
    if (blockIfDiagnosticsFailed(modelDiagnostics)) {
      return Promise.resolve(null);
    }
    return runCurrentModule();
  }, [blockIfDiagnosticsFailed, modelDiagnostics, runCurrentModule]);

  const handleSensitivity = useCallback((config: Parameters<typeof runSensitivity>[0]) => {
    if (blockIfDiagnosticsFailed(modelDiagnostics)) {
      return;
    }
    return runSensitivity(config);
  }, [blockIfDiagnosticsFailed, modelDiagnostics, runSensitivity]);

  const handleRunAndReview = () => {
    setWorkbenchView("results");
    handleRunCurrentModule();
  };

  const handleRunWorkspace = useCallback((nextWorkspace: WorkspaceState) => {
    const nextDiagnostics = buildModelDiagnostics(nextWorkspace);
    if (blockIfDiagnosticsFailed(nextDiagnostics)) {
      return Promise.resolve(null);
    }
    const nextMode = nextWorkspace.analysisMode;
    const payload =
      nextMode === "beam"
        ? buildBeamPayload(nextWorkspace.beam, projectName)
        : nextMode === "frame"
          ? buildFramePayload(nextWorkspace.frame, projectName)
          : buildTrussPayload(nextWorkspace.truss, projectName);
    if (!payload) {
      return Promise.resolve(null);
    }
    setWorkbenchView("results");
    return handleRunPayload(payload);
  }, [blockIfDiagnosticsFailed, handleRunPayload, projectName]);

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
    handleRunWorkspace,
    handleSensitivity,
    isScanning,
    isSolving,
    markRuntimePersisted,
    operationNotice,
    resultProvenance,
    resultValidity,
    resetRuntimeForNewAnalysisObject,
    runLabel,
    sensitivityData,
    syncRuntimeFromAnalysisObject,
    trussResults,
    workbenchView,
    setWorkbenchView,
  };
}
