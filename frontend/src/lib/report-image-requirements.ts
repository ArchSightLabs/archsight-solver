import { DEFAULT_REPORT_EXPORT_OPTIONS, reportExportOptionsForMode, type ReportExportOptions } from "./report-options.ts";
import { activeResultMissingLabel, buildReportImagePlan, type ReportImagePlanInput } from "./report-image-plan.ts";

export interface ReportImageRequirementInput extends ReportImagePlanInput {
  reportOptions?: Partial<ReportExportOptions>;
}

export interface ReportImageRequirement {
  key: string;
  label: string;
}

export function reportImageRequirements(input: ReportImageRequirementInput): ReportImageRequirement[] {
  return buildReportImagePlan(input).map(({ key, label }) => ({ key, label }));
}

export function assertReportImagesReady(images: Record<string, string>, input: ReportImageRequirementInput) {
  const options = reportExportOptionsForMode(input.analysisMode, input.reportOptions ?? DEFAULT_REPORT_EXPORT_OPTIONS);
  const missingResult = activeResultMissingLabel(input, options);
  if (missingResult) {
    throw new Error(`无法生成计算书图形：缺少${missingResult}，请先完成当前结构对象计算后再导出 DOCX。`);
  }

  const missing = reportImageRequirements(input).filter((requirement) => !images[requirement.key]);
  if (missing.length) {
    throw new Error(`计算书图片生成失败，未生成：${missing.map((item) => item.label).join("、")}。请保持页面打开并重新导出。`);
  }
}
