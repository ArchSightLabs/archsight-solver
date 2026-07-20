import { useCallback, useMemo, type Dispatch, type SetStateAction } from "react";
import type { SensitivityResults } from "../types/beam";
import type { WorkspaceState } from "../lib/workspace-state";
import { buildModelDiagnostics, type ModelDiagnostics } from "../lib/model-diagnostics";
import { type AnalysisObject, type WorkbenchView } from "../lib/solver-project";
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
  clearAnalysisResults: (objectId: string) => boolean;
  commitAnalysisResult: (objectId: string, result: Exclude<AnalysisResults, null>, provenance: ResultProvenance) => boolean;
  commitSensitivityResult: (objectId: string, result: SensitivityResults, provenance: ResultProvenance) => boolean;
  getProjectRevision: () => number;
  modelDiagnostics: ModelDiagnostics;
  projectName: string;
  reportExportOptions: ReportExportOptions;
  resetWorkbenchContext: () => void;
  setWorkbenchView: Dispatch<SetStateAction<WorkbenchView>>;
  updateWorkspace: Dispatch<SetStateAction<WorkspaceState>>;
  workbenchView: WorkbenchView;
  workspace: WorkspaceState;
}

export function useWorkbenchRuntime({
  activeAnalysisObject,
  clientId,
  clearAnalysisResults,
  commitAnalysisResult,
  commitSensitivityResult,
  getProjectRevision,
  modelDiagnostics,
  projectName,
  reportExportOptions,
  resetWorkbenchContext,
  setWorkbenchView,
  updateWorkspace,
  workbenchView,
  workspace,
}: UseWorkbenchRuntimeOptions) {
  const analysisData = activeAnalysisObject.results;
  const sensitivityData = activeAnalysisObject.sensitivityResults;
  const resultProvenance = activeAnalysisObject.resultProvenance;
  const setCompactWorkbenchView = useCallback((view: "parameters" | "results") => {
    setWorkbenchView(view === "results" ? "results" : "model");
  }, [setWorkbenchView]);

  const {
    resultValidity,
    isSolving,
    isScanning,
    exportingFormat,
    operationNotice,
    setOperationNotice,
    handleRunCurrentModule: runCurrentModule,
    handleRunPayload,
    handleSensitivity: runSensitivity,
    handleExport,
  } = useWorkbenchActions({
    activeAnalysisObjectId: activeAnalysisObject.id,
    activeBenchmark: activeAnalysisObject.benchmark,
    analysisData,
    clientId,
    getProjectRevision,
    onCommitAnalysisResult: commitAnalysisResult,
    onCommitSensitivityResult: commitSensitivityResult,
    projectName,
    reportExportOptions,
    resultProvenance,
    sensitivityData,
    setCompactWorkbenchView,
    setWorkspace: updateWorkspace,
    workspace,
  });

  const resetRuntimeForNewAnalysisObject = useCallback(() => {
    setOperationNotice(null);
    setWorkbenchView("model");
    resetWorkbenchContext();
  }, [resetWorkbenchContext, setOperationNotice, setWorkbenchView]);

  const handleAnalysisObjectChanged = useCallback(() => {
    setOperationNotice(null);
    resetWorkbenchContext();
  }, [resetWorkbenchContext, setOperationNotice]);

  const clearCurrentAnalysisRuntime = useCallback(() => {
    clearAnalysisResults(activeAnalysisObject.id);
    setOperationNotice(null);
    setWorkbenchView("model");
    resetWorkbenchContext();
  }, [activeAnalysisObject.id, clearAnalysisResults, resetWorkbenchContext, setOperationNotice, setWorkbenchView]);

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
  }, [blockIfDiagnosticsFailed, handleRunPayload, projectName, setWorkbenchView]);

  return {
    analysisData,
    beamResults,
    benchmarkSubmissionContext,
    clearCurrentAnalysisRuntime,
    exportingFormat,
    frameResults,
    handleExport,
    handleAnalysisObjectChanged,
    handleRunAndReview,
    handleRunCurrentModule,
    handleRunWorkspace,
    handleSensitivity,
    isScanning,
    isSolving,
    operationNotice,
    resultProvenance,
    resultValidity,
    resetRuntimeForNewAnalysisObject,
    runLabel,
    sensitivityData,
    trussResults,
    workbenchView,
    setWorkbenchView,
  };
}
