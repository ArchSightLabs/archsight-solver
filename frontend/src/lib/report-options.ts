export type ReportTemplate = "standard" | "complete" | "brief";
export type ReportFigureMode = "overlay" | "traditional" | "both";
export type ReportFigureScope = "control" | "all" | "none";

export interface ReportExportOptions {
  template: ReportTemplate;
  figureMode: ReportFigureMode;
  figureScope: ReportFigureScope;
}

export const DEFAULT_REPORT_EXPORT_OPTIONS: ReportExportOptions = {
  template: "standard",
  figureMode: "overlay",
  figureScope: "control",
};

export function normalizeReportExportOptions(raw: Partial<ReportExportOptions> | null | undefined): ReportExportOptions {
  return {
    template: raw?.template === "brief" || raw?.template === "complete" || raw?.template === "standard" ? raw.template : DEFAULT_REPORT_EXPORT_OPTIONS.template,
    figureMode: raw?.figureMode === "traditional" || raw?.figureMode === "both" || raw?.figureMode === "overlay" ? raw.figureMode : DEFAULT_REPORT_EXPORT_OPTIONS.figureMode,
    figureScope: raw?.figureScope === "all" || raw?.figureScope === "none" || raw?.figureScope === "control" ? raw.figureScope : DEFAULT_REPORT_EXPORT_OPTIONS.figureScope,
  };
}

export const REPORT_TEMPLATE_OPTIONS = [
  { value: "standard", label: "标准计算书" },
  { value: "complete", label: "完整计算书" },
  { value: "brief", label: "精简报告" },
] as const;

export const REPORT_FIGURE_MODE_OPTIONS = [
  { value: "overlay", label: "模型叠加图" },
  { value: "traditional", label: "传统单项图" },
  { value: "both", label: "两者都插入" },
] as const;

export const REPORT_FIGURE_SCOPE_OPTIONS = [
  { value: "control", label: "仅控制图" },
  { value: "all", label: "全部结果图" },
  { value: "none", label: "不插入图形" },
] as const;
