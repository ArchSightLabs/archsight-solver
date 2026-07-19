import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { AnalysisMode, FrameFormPayload, TrussFormPayload } from "../types/structure";
import type { BeamApiPayload, BeamCalculationResults, SensitivityResults } from "../types/beam";
import type { FrameCalculationResults, TrussCalculationResults } from "../types/structure";
import { buildBeamPayload, buildFramePayload, buildTrussPayload, validateCustomFrameWorkspace, validateCustomTrussWorkspace } from "../solver-payload";
import type { WorkspaceState } from "../lib/workspace-state";
import { analysisVocabulary } from "../lib/analysis-vocabulary";
import { analysisRequestFromResult, apiErrorDetails, beamResultForView, frameResultForView, normalizeAnalysisResponse, trussResultForView, type ApiErrorDetails } from "../lib/api-envelope";
import type { SolverDiagnosticIssue } from "../lib/diagnostic-contract";
import { buildReportImages } from "../lib/report-images";
import { reportExportOptionsForMode, type ReportExportOptions } from "../lib/report-options";
import type { BenchmarkCaseSource } from "../lib/solver-project";
import {
  buildDisplayedBeamResults,
  buildDisplayedFrameResults,
  buildDisplayedTrussResults,
  buildResultDisplayOptions,
  type ResultDisplayOption,
} from "../components/workbench-result-model";
import {
  createResultProvenance,
  evaluateResultValidity,
  type ResultProvenance,
} from "../lib/result-provenance";
import {
  exportOperationForFormat,
  operationCompletedNotice,
  operationFailedNotice,
  operationRunningNotice,
  validationNotice,
  type WorkbenchOperationNotice,
} from "../lib/workbench-operation-status";

export type AnalysisResults = BeamCalculationResults | FrameCalculationResults | TrussCalculationResults | null;
export type ExportFormat = "docx" | "xlsx";
type CalculationPayload = BeamApiPayload | FrameFormPayload | TrussFormPayload;

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;
type ApiErrorResponse = {
  headers: {
    get(name: string): string | null;
  };
  json(): Promise<unknown>;
  text(): Promise<string>;
};

class WorkbenchApiError extends Error {
  readonly diagnostics: SolverDiagnosticIssue[];

  constructor(details: ApiErrorDetails) {
    super(details.message);
    this.name = "WorkbenchApiError";
    this.diagnostics = details.diagnostics;
  }
}

async function readApiError(response: ApiErrorResponse, fallback: string): Promise<ApiErrorDetails> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return apiErrorDetails(await response.json(), fallback);
  }
  return { message: (await response.text()) || fallback, diagnostics: [] };
}

export function useWorkbenchActions(
  workspace: WorkspaceState,
  setWorkspace: React.Dispatch<React.SetStateAction<WorkspaceState>>,
  setCompactWorkbenchView: (view: "parameters" | "results") => void,
  clientId: string,
  reportExportOptions: ReportExportOptions,
  projectName: string,
  activeAnalysisObjectId: string,
  getProjectRevision: () => number,
  activeBenchmark?: BenchmarkCaseSource
) {
  const [analysisData, setAnalysisData] = useState<AnalysisResults>(null);
  const [sensitivityData, setSensitivityData] = useState<SensitivityResults | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [operationNotice, setOperationNotice] = useState<WorkbenchOperationNotice | null>(null);
  const [resultProvenance, setResultProvenance] = useState<ResultProvenance | null>(null);
  const activeAnalysisObjectIdRef = useRef(activeAnalysisObjectId);
  const solveRequestSequenceRef = useRef(0);
  const sensitivityRequestSequenceRef = useRef(0);
  const { analysisMode, beam, frame, truss } = workspace;

  useEffect(() => {
    activeAnalysisObjectIdRef.current = activeAnalysisObjectId;
  }, [activeAnalysisObjectId]);

  const buildCurrentPayload = useCallback((options: { notifyOnValidationError?: boolean } = {}): CalculationPayload | null => {
    if (analysisMode === "truss") {
      const validationError = validateCustomTrussWorkspace(truss);
      if (validationError) {
        if (options.notifyOnValidationError) {
          setOperationNotice(validationNotice(validationError));
        }
        return null;
      }
      return buildTrussPayload(truss, projectName);
    }

    if (analysisMode === "frame") {
      const validationError = validateCustomFrameWorkspace(frame);
      if (validationError) {
        if (options.notifyOnValidationError) {
          setOperationNotice(validationNotice(validationError));
        }
        return null;
      }
      return buildFramePayload(frame, projectName);
    }

    return buildBeamPayload(beam, projectName);
  }, [analysisMode, beam, frame, projectName, truss]);

  const currentPayload = buildCurrentPayload();
  const hasResultData = analysisData !== null || sensitivityData !== null;
  const resultValidity = evaluateResultValidity({
    hasResults: hasResultData,
    analysisObjectId: activeAnalysisObjectId,
    analysisType: analysisMode,
    currentPayload: currentPayload as Record<string, unknown> | null,
    provenance: resultProvenance,
  });

  const handleSolve = async (data: CalculationPayload): Promise<AnalysisResults> => {
    const analysisType: AnalysisMode = data.analysisType === "frame" ? "frame" : data.analysisType === "truss" ? "truss" : "beam";
    const requestObjectId = activeAnalysisObjectId;
    const requestProjectRevision = getProjectRevision();
    const requestSequence = solveRequestSequenceRef.current + 1;
    solveRequestSequenceRef.current = requestSequence;
    setWorkspace((current) => ({ ...current, analysisMode: analysisType }));
    setIsSolving(true);
    setOperationNotice(operationRunningNotice("solve", analysisType));
    try {
      const response = await fetch(apiUrl("/api/calculate"), {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Client-ID": clientId 
        },
        mode: "cors",
        body: JSON.stringify({ ...data, analysisType }),
      });
      if (!response.ok) {
        throw new WorkbenchApiError(await readApiError(response, "后端连接失败"));
      }
      const result = normalizeAnalysisResponse(await response.json());
      if (activeAnalysisObjectIdRef.current !== requestObjectId || solveRequestSequenceRef.current !== requestSequence) {
        return null;
      }
      setAnalysisData(result);
      setResultProvenance(createResultProvenance({
        analysisObjectId: requestObjectId,
        analysisType,
        payload: data as unknown as Record<string, unknown>,
        projectRevision: requestProjectRevision,
        result,
      }));
      setSensitivityData(null); // Reset sensitivity on new solve
      setCompactWorkbenchView("results");
      setOperationNotice(operationCompletedNotice("solve", analysisType));
      return result;
    } catch (error) {
      console.error("求解失败：", error);
      if (activeAnalysisObjectIdRef.current !== requestObjectId || solveRequestSequenceRef.current !== requestSequence) {
        return null;
      }
      setOperationNotice(operationFailedNotice(
        "solve",
        error instanceof Error ? error.message : "未知错误",
        error instanceof WorkbenchApiError ? error.diagnostics : [],
      ));
      return null;
    } finally {
      if (solveRequestSequenceRef.current === requestSequence) setIsSolving(false);
    }
  };

  const handleRunCurrentModule = () => {
    const payload = buildCurrentPayload({ notifyOnValidationError: true });
    if (payload) {
      return handleSolve(payload);
    }
    return Promise.resolve(null);
  };

  const handleRunPayload = (payload: CalculationPayload) => handleSolve(payload);

  const handleSensitivity = async (config: { range: number; steps: number; targetSpanIndex: number; responseMetric: string }) => {
    const currentPayload = buildCurrentPayload({ notifyOnValidationError: true });
    if (!currentPayload) {
      return;
    }
    
    const requestObjectId = activeAnalysisObjectId;
    const requestProjectRevision = getProjectRevision();
    const requestSequence = sensitivityRequestSequenceRef.current + 1;
    sensitivityRequestSequenceRef.current = requestSequence;
    setIsScanning(true);
    setOperationNotice(operationRunningNotice("sensitivity", workspace.analysisMode));
    try {
      const requestBody =
        workspace.analysisMode === "beam"
          ? {
              ...currentPayload,
              targetSpanIndex: config.targetSpanIndex,
              config: { range: config.range, steps: config.steps, responseMetric: config.responseMetric },
            }
          : {
              ...currentPayload,
              config: { range: config.range, steps: config.steps, responseMetric: config.responseMetric },
            };

      const res = await fetch(apiUrl("/api/sensitivity"), {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Client-ID": clientId
        },
        mode: "cors",
        body: JSON.stringify(requestBody),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new WorkbenchApiError(apiErrorDetails(data, "敏感性分析失败"));
      }
      if (activeAnalysisObjectIdRef.current !== requestObjectId || sensitivityRequestSequenceRef.current !== requestSequence) {
        return;
      }
      setSensitivityData(data);
      setResultProvenance(createResultProvenance({
        analysisObjectId: requestObjectId,
        analysisType: workspace.analysisMode,
        payload: currentPayload as unknown as Record<string, unknown>,
        projectRevision: requestProjectRevision,
        result: data,
      }));
      setOperationNotice(operationCompletedNotice("sensitivity", workspace.analysisMode));
    } catch (error) {
      if (activeAnalysisObjectIdRef.current !== requestObjectId || sensitivityRequestSequenceRef.current !== requestSequence) {
        return;
      }
      setOperationNotice(operationFailedNotice(
        "sensitivity",
        error instanceof Error ? error.message : String(error),
        error instanceof WorkbenchApiError ? error.diagnostics : [],
      ));
    } finally {
      if (sensitivityRequestSequenceRef.current === requestSequence) setIsScanning(false);
    }
  };

  const handleExport = async (format: ExportFormat = "docx", resultSource?: ResultDisplayOption) => {
    if (resultValidity.status !== "current" || !resultProvenance) {
      setOperationNotice(validationNotice(resultValidity.message));
      return;
    }
    const payload = { ...resultProvenance.payload, projectName } as unknown as CalculationPayload;
    if (!analysisRequestFromResult(analysisData) && !sensitivityData) {
      setOperationNotice(validationNotice("请先完成当前分析对象的结构计算或敏感性分析，再导出计算书。"));
      return;
    }
    const exportOperation = exportOperationForFormat(format);
    const exportStartRevision = getProjectRevision();
    setExportingFormat(format);
    setOperationNotice(operationRunningNotice(exportOperation, workspace.analysisMode));
    try {
      const effectiveReportOptions = reportExportOptionsForMode(workspace.analysisMode, reportExportOptions);
      type ResultWithJobId = { jobId?: string; apiEnvelope?: { jobId?: string }; meta?: { jobId?: string } };
      const resultData = analysisData as unknown as ResultWithJobId | null;
      const jobId = resultData?.jobId || resultData?.apiEnvelope?.jobId || resultData?.meta?.jobId;
      const exportResultSource = resultSource ?? { source: "primary", id: "__primary__", label: "主结果", description: "基本荷载" };
      const availableResultSources = buildResultDisplayOptions(
        workspace.analysisMode === "beam" ? beamResultForView(analysisData) : workspace.analysisMode === "frame" ? frameResultForView(analysisData) : trussResultForView(analysisData),
      );
      if (!availableResultSources.length && sensitivityData) {
        availableResultSources.push({ source: "primary", id: "__primary__", label: "主结果", description: "敏感性分析基准模型" });
      }
      if (!availableResultSources.some((source) => source.source === exportResultSource.source && source.id === exportResultSource.id)) {
        setOperationNotice(validationNotice("所选工况或组合不属于当前计算结果，请重新选择结果来源。"));
        return;
      }
      const exportedProvenance = {
        ...resultProvenance,
        currentProjectRevision: getProjectRevision(),
        resultSource: exportResultSource,
      };
      const exportPayload =
        format === "docx" && sensitivityData
          ? { ...payload, format, sensitivityResults: sensitivityData, reportOptions: effectiveReportOptions, benchmark: activeBenchmark, jobId, resultSource: exportResultSource, resultProvenance: exportedProvenance }
          : { ...payload, format, benchmark: activeBenchmark, jobId, resultSource: exportResultSource, reportOptions: effectiveReportOptions, resultProvenance: exportedProvenance };
      const beamResultsForReport = buildDisplayedBeamResults(beamResultForView(analysisData), resultSource);
      const frameResultsForReport = buildDisplayedFrameResults(frameResultForView(analysisData), resultSource);
      const trussResultsForReport = buildDisplayedTrussResults(trussResultForView(analysisData), resultSource);
      const payloadWithReportImages =
        format === "docx"
          ? {
              ...exportPayload,
              reportImages: await buildReportImages({
                analysisMode: workspace.analysisMode,
                beamResults: workspace.analysisMode === "beam" ? beamResultsForReport : null,
                frameResults: workspace.analysisMode === "frame" ? frameResultsForReport : null,
                trussResults: workspace.analysisMode === "truss" ? trussResultsForReport : null,
                sensitivityData,
                reportOptions: effectiveReportOptions,
                viewSettings: workspace.analysisMode === "beam" ? workspace.beam.viewSettings : workspace.analysisMode === "frame" ? workspace.frame.viewSettings : workspace.truss.viewSettings,
                modelLabelOffsets: workspace.analysisMode === "beam" ? workspace.beam.modelLabelOffsets : workspace.analysisMode === "frame" ? workspace.frame.modelLabelOffsets : workspace.truss.modelLabelOffsets,
              }),
            }
          : exportPayload;
      if (getProjectRevision() !== exportStartRevision || activeAnalysisObjectIdRef.current !== resultProvenance.analysisObjectId) {
        setOperationNotice(validationNotice("导出准备期间工程或分析对象已变化，本次导出已取消，请确认当前结果后重试。"));
        return;
      }
      const response = await fetch(apiUrl("/api/export"), {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Client-ID": clientId
        },
        mode: "cors",
        body: JSON.stringify(payloadWithReportImages),
      });
      if (!response.ok) {
        throw new WorkbenchApiError(await readApiError(response, "导出失败"));
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const modeName = analysisVocabulary(workspace.analysisMode).systemLabel;
      anchor.download = `${modeName}-计算书.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setOperationNotice(operationCompletedNotice(exportOperation, workspace.analysisMode));
    } catch (error) {
      setOperationNotice(operationFailedNotice(
        exportOperation,
        error instanceof Error ? error.message : "未知错误",
        error instanceof WorkbenchApiError ? error.diagnostics : [],
      ));
    } finally {
      setExportingFormat(null);
    }
  };

  return {
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
    handleRunCurrentModule,
    handleRunPayload,
    handleSensitivity,
    handleExport,
  };
}
