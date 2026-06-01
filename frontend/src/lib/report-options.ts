import sharedReportOptions from "../../../shared/report-options.json" with { type: "json" };
import type { AnalysisMode } from "../types/structure.ts";

export type ReportTemplate = "standard" | "complete" | "brief";
export type ReportFigureMode = "overlay" | "traditional" | "both";
export type ReportFigureScope = "control" | "all" | "none";

export interface ReportExportOptions {
  template: ReportTemplate;
  figureMode: ReportFigureMode;
  figureScope: ReportFigureScope;
}

export interface ReportOptionItem<T extends string = string> {
  value: T;
  label: string;
}

interface SharedReportOptions {
  default: ReportExportOptions;
  legacyDefault: ReportExportOptions;
  templates: Array<ReportOptionItem<ReportTemplate>>;
  figureModes: Array<ReportOptionItem<ReportFigureMode>>;
  figureScopes: Array<ReportOptionItem<ReportFigureScope>>;
}

const REPORT_OPTIONS = sharedReportOptions as SharedReportOptions;

export const DEFAULT_REPORT_EXPORT_OPTIONS: ReportExportOptions = { ...REPORT_OPTIONS.default };

export const REPORT_TEMPLATE_OPTIONS: readonly ReportOptionItem<ReportTemplate>[] = REPORT_OPTIONS.templates.map((option) => ({ ...option }));
export const REPORT_FIGURE_MODE_OPTIONS: readonly ReportOptionItem<ReportFigureMode>[] = REPORT_OPTIONS.figureModes.map((option) => ({ ...option }));
export const REPORT_FIGURE_SCOPE_OPTIONS: readonly ReportOptionItem<ReportFigureScope>[] = REPORT_OPTIONS.figureScopes.map((option) => ({ ...option }));

const STRUCTURE_OVERLAY_ONLY_FIGURE_MODE_OPTIONS: readonly ReportOptionItem<ReportFigureMode>[] = [
  { value: "overlay", label: "不含数据曲线" },
];

const REPORT_TEMPLATE_VALUES = new Set(REPORT_TEMPLATE_OPTIONS.map((option) => option.value));
const REPORT_FIGURE_MODE_VALUES = new Set(REPORT_FIGURE_MODE_OPTIONS.map((option) => option.value));
function isReportTemplate(value: unknown): value is ReportTemplate {
  return typeof value === "string" && REPORT_TEMPLATE_VALUES.has(value as ReportTemplate);
}

function isReportFigureMode(value: unknown): value is ReportFigureMode {
  return typeof value === "string" && REPORT_FIGURE_MODE_VALUES.has(value as ReportFigureMode);
}

export function normalizeReportExportOptions(raw: Partial<ReportExportOptions> | null | undefined): ReportExportOptions {
  let figureMode = isReportFigureMode(raw?.figureMode) ? raw.figureMode : DEFAULT_REPORT_EXPORT_OPTIONS.figureMode;

  if (figureMode === "traditional") {
    figureMode = "overlay";
  }

  return {
    template: isReportTemplate(raw?.template) ? raw.template : DEFAULT_REPORT_EXPORT_OPTIONS.template,
    figureMode,
    figureScope: "all",
  };
}

export function reportFigureModeOptionsForMode(mode: AnalysisMode): readonly ReportOptionItem<ReportFigureMode>[] {
  return mode === "beam" ? REPORT_FIGURE_MODE_OPTIONS : STRUCTURE_OVERLAY_ONLY_FIGURE_MODE_OPTIONS;
}

export function reportFigureModeValueForMode(mode: AnalysisMode, value: ReportFigureMode): ReportFigureMode {
  if (value === "traditional") return "overlay";
  return mode === "beam" ? value : "overlay";
}

export function reportExportOptionsForMode(mode: AnalysisMode, options: ReportExportOptions): ReportExportOptions {
  const normalizedOptions = normalizeReportExportOptions(options);
  return {
    ...normalizedOptions,
    figureMode: reportFigureModeValueForMode(mode, normalizedOptions.figureMode),
    figureScope: "all",
  };
}
