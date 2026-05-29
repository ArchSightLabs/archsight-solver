import type { AnalysisMode } from "../types/structure.ts";
import { analysisVocabulary } from "./analysis-vocabulary.ts";

export type WorkbenchOperation = "solve" | "sensitivity" | "exportDocx" | "exportXlsx" | "validation";
export type WorkbenchOperationTone = "info" | "success" | "error";
export type WorkbenchOperationPhase = "running" | "complete" | "error";

export interface WorkbenchOperationNotice {
  phase: WorkbenchOperationPhase;
  tone: WorkbenchOperationTone;
  title: string;
  message: string;
}

const OPERATION_LABELS: Record<WorkbenchOperation, string> = {
  solve: "结构求解",
  sensitivity: "参数敏感性分析",
  exportDocx: "计算书导出",
  exportXlsx: "参数表导出",
  validation: "模型输入校核",
};

export function solvingRunLabel(mode: AnalysisMode): string {
  return `${analysisVocabulary(mode).systemLabel}计算中...`;
}

export function exportOperationForFormat(format: "docx" | "xlsx"): WorkbenchOperation {
  return format === "docx" ? "exportDocx" : "exportXlsx";
}

export function exportToolbarLabel(format: "docx" | "xlsx" | null): string {
  if (format === "docx") return "生成计算书...";
  if (format === "xlsx") return "生成参数表...";
  return "成果导出";
}

export function operationRunningNotice(operation: WorkbenchOperation, mode: AnalysisMode): WorkbenchOperationNotice {
  const systemLabel = analysisVocabulary(mode).systemLabel;
  if (operation === "solve") {
    return {
      phase: "running",
      tone: "info",
      title: `正在运行${systemLabel}线弹性静力分析`,
      message: "正在提交模型、组装刚度方程并恢复位移、内力和支座反力结果。",
    };
  }
  if (operation === "sensitivity") {
    return {
      phase: "running",
      tone: "info",
      title: "正在执行参数敏感性分析",
      message: "正在按扰动区间重复求解，并提取当前结构体系的控制响应指标。",
    };
  }
  if (operation === "exportDocx") {
    return {
      phase: "running",
      tone: "info",
      title: "正在生成 Word 计算书",
      message: "正在整理模型参数、结构预览、工程图、结果表和校核证据。",
    };
  }
  if (operation === "exportXlsx") {
    return {
      phase: "running",
      tone: "info",
      title: "正在生成 Excel 参数表",
      message: "正在写入输入参数、计算摘要和结构结果数据表。",
    };
  }
  return validationNotice("正在校核模型输入。");
}

export function operationCompletedNotice(operation: WorkbenchOperation, mode: AnalysisMode): WorkbenchOperationNotice {
  const systemLabel = analysisVocabulary(mode).systemLabel;
  if (operation === "solve") {
    return {
      phase: "complete",
      tone: "success",
      title: `${systemLabel}计算完成`,
      message: "结果已写入当前分析对象，可继续查看工程图、数据曲线或导出计算书。",
    };
  }
  if (operation === "sensitivity") {
    return {
      phase: "complete",
      tone: "success",
      title: "参数敏感性分析完成",
      message: "扰动曲线已更新，可用于判断参数变化对控制响应的影响。",
    };
  }
  if (operation === "exportDocx") {
    return {
      phase: "complete",
      tone: "success",
      title: "Word 计算书已生成",
      message: "文件已交给浏览器下载；请在下载目录中查看。",
    };
  }
  if (operation === "exportXlsx") {
    return {
      phase: "complete",
      tone: "success",
      title: "Excel 参数表已生成",
      message: "文件已交给浏览器下载；请在下载目录中查看。",
    };
  }
  return validationNotice("模型输入校核完成。");
}

export function operationFailedNotice(operation: WorkbenchOperation, message: string): WorkbenchOperationNotice {
  return {
    phase: "error",
    tone: "error",
    title: `${OPERATION_LABELS[operation]}失败`,
    message,
  };
}

export function validationNotice(message: string): WorkbenchOperationNotice {
  return {
    phase: "error",
    tone: "error",
    title: "模型输入未通过校核",
    message,
  };
}
