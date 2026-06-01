import type React from "react";
import { useState } from "react";
import type { AnalysisMode, FrameFormPayload, TrussFormPayload } from "../types/structure";
import type { BeamApiPayload, BeamCalculationResults, SensitivityResults } from "../types/beam";
import type { FrameCalculationResults, TrussCalculationResults } from "../types/structure";
import { buildBeamPayload, buildFramePayload, buildTrussPayload, validateCustomFrameWorkspace, validateCustomTrussWorkspace } from "../solver-payload";
import type { WorkspaceState } from "../lib/workspace-state";
import { analysisVocabulary } from "../lib/analysis-vocabulary";
import { analysisRequestFromResult, apiErrorMessage, beamResultForView, frameResultForView, normalizeAnalysisResponse, trussResultForView } from "../lib/api-envelope";
import { buildReportImages } from "../lib/report-images";
import { reportExportOptionsForMode, type ReportExportOptions } from "../lib/report-options";
import type { BenchmarkCaseSource } from "../lib/solver-project";
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

async function readApiError(response: ApiErrorResponse, fallback: string): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return apiErrorMessage(await response.json(), fallback);
  }
  return (await response.text()) || fallback;
}

export function useWorkbenchActions(
  workspace: WorkspaceState,
  setWorkspace: React.Dispatch<React.SetStateAction<WorkspaceState>>,
  setCompactWorkbenchView: (view: "parameters" | "results") => void,
  clientId: string,
  reportExportOptions: ReportExportOptions,
  projectName: string,
  activeBenchmark?: BenchmarkCaseSource
) {
  const [analysisData, setAnalysisData] = useState<AnalysisResults>(null);
  const [sensitivityData, setSensitivityData] = useState<SensitivityResults | null>(null);
  const [isSolving, setIsSolving] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(null);
  const [operationNotice, setOperationNotice] = useState<WorkbenchOperationNotice | null>(null);
  const [latestPayload, setLatestPayload] = useState<CalculationPayload | null>(null);
  const buildCurrentPayload = (): CalculationPayload | null => {
    const { analysisMode } = workspace;

    if (analysisMode === "truss") {
      const validationError = validateCustomTrussWorkspace(workspace.truss);
      if (validationError) {
        setOperationNotice(validationNotice(validationError));
        return null;
      }
      return buildTrussPayload(workspace.truss, projectName);
    }

    if (analysisMode === "frame") {
      const validationError = validateCustomFrameWorkspace(workspace.frame);
      if (validationError) {
        setOperationNotice(validationNotice(validationError));
        return null;
      }
      return buildFramePayload(workspace.frame, projectName);
    }

    return buildBeamPayload(workspace.beam, projectName);
  };

  const handleSolve = async (data: CalculationPayload): Promise<AnalysisResults> => {
    const analysisType: AnalysisMode = data.analysisType === "frame" ? "frame" : data.analysisType === "truss" ? "truss" : "beam";
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
        throw new Error(await readApiError(response, "后端连接失败"));
      }
      const result = normalizeAnalysisResponse(await response.json());
      setAnalysisData(result);
      setLatestPayload(data);
      setSensitivityData(null); // Reset sensitivity on new solve
      setCompactWorkbenchView("results");
      setOperationNotice(operationCompletedNotice("solve", analysisType));
      return result;
    } catch (error) {
      console.error("求解失败：", error);
      setOperationNotice(operationFailedNotice("solve", error instanceof Error ? error.message : "未知错误"));
      return null;
    } finally {
      setIsSolving(false);
    }
  };

  const handleRunCurrentModule = () => {
    const payload = buildCurrentPayload();
    if (payload) {
      return handleSolve(payload);
    }
    return Promise.resolve(null);
  };

  const handleSensitivity = async (config: { range: number; steps: number; targetSpanIndex: number; responseMetric: string }) => {
    const currentPayload = buildCurrentPayload();
    if (!currentPayload) {
      return;
    }
    
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
        throw new Error(apiErrorMessage(data, "敏感性分析失败"));
      }
      setSensitivityData(data);
      setLatestPayload(currentPayload);
      setOperationNotice(operationCompletedNotice("sensitivity", workspace.analysisMode));
    } catch (error) {
      setOperationNotice(operationFailedNotice("sensitivity", error instanceof Error ? error.message : String(error)));
    } finally {
      setIsScanning(false);
    }
  };

  const handleExport = async (format: ExportFormat = "docx") => {
    const payload = (analysisRequestFromResult(analysisData) as CalculationPayload | null) ?? latestPayload;
    if (!payload) {
      setOperationNotice(validationNotice("请先完成当前分析对象的结构计算或敏感性分析，再导出计算书。"));
      return;
    }
    const exportOperation = exportOperationForFormat(format);
    setExportingFormat(format);
    setOperationNotice(operationRunningNotice(exportOperation, workspace.analysisMode));
    try {
      const effectiveReportOptions = reportExportOptionsForMode(workspace.analysisMode, reportExportOptions);
      const exportPayload =
        format === "docx" && sensitivityData
          ? { ...payload, format, sensitivityResults: sensitivityData, reportOptions: effectiveReportOptions, benchmark: activeBenchmark }
          : { ...payload, format, benchmark: activeBenchmark, ...(format === "docx" ? { reportOptions: effectiveReportOptions } : {}) };
      const beamResultsForReport = beamResultForView(analysisData);
      const frameResultsForReport = frameResultForView(analysisData);
      const trussResultsForReport = trussResultForView(analysisData);
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
              }),
            }
          : exportPayload;
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
        throw new Error(await readApiError(response, "导出失败"));
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
      setOperationNotice(operationFailedNotice(exportOperation, error instanceof Error ? error.message : "未知错误"));
    } finally {
      setExportingFormat(null);
    }
  };

  return {
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
  };
}
