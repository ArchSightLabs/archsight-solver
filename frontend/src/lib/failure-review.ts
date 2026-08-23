import type { AnalysisMode } from "../types/structure.ts";
import type { WorkbenchOperationNotice } from "./workbench-operation-status.ts";

export type FailureReviewFormat = "docx" | "xlsx";

export interface FailureReviewExportPayload {
  readonly materialType: "failure-review";
  readonly format: FailureReviewFormat;
  readonly inputId: string;
  readonly completedStages: string[];
  readonly stableErrorCode: string;
  readonly objectRefs: Array<{ kind: string; id: string }>;
  readonly diagnostics: Array<{
    code: string;
    title: string;
    detail: string;
    severity: "error" | "warning" | "info";
  }>;
  readonly hashes: Record<string, string>;
  readonly suggestedActions: string[];
}

function uniqueBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = keyOf(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildFailureReviewExportPayload(input: {
  analysisMode: AnalysisMode;
  analysisObjectId: string;
  format: FailureReviewFormat;
  notice: WorkbenchOperationNotice;
}): FailureReviewExportPayload | null {
  if (input.notice.phase !== "error") return null;

  const sourceDiagnostics = input.notice.diagnostics ?? [];
  const stableErrorCode = sourceDiagnostics[0]?.code
    ?? (input.notice.title === "模型输入未通过校核" ? "STRUCTURE_INPUT_REVIEW_REQUIRED" : "COMMON_CALCULATION_FAILED");
  const diagnostics = sourceDiagnostics.length > 0
    ? sourceDiagnostics.map((issue) => ({
        code: issue.code,
        title: issue.title,
        detail: issue.detail,
        severity: issue.severity,
      }))
    : [{
        code: stableErrorCode,
        title: input.notice.title,
        detail: input.notice.message,
        severity: "error" as const,
      }];
  const objectRefs = uniqueBy(
    sourceDiagnostics.flatMap((issue) => issue.objectRefs),
    (item) => `${item.kind}:${item.id}`,
  );
  const suggestedActions = [...new Set(sourceDiagnostics.flatMap((issue) => issue.suggestions).filter(Boolean))];

  return {
    materialType: "failure-review",
    format: input.format,
    inputId: `${input.analysisMode}-${input.analysisObjectId}`,
    completedStages: input.notice.title === "模型输入未通过校核"
      ? ["客户端输入校核"]
      : ["计算请求已提交", "失败诊断已返回"],
    stableErrorCode,
    objectRefs,
    diagnostics,
    hashes: {},
    suggestedActions,
  };
}
