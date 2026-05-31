import sharedReportOptions from "../../../shared/report-options.json" with { type: "json" };
import { modelObjectMemberTerm } from "./model-object-vocabulary.ts";
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
  { value: "overlay", label: "模型叠加工程图" },
];

const REPORT_TEMPLATE_VALUES = new Set(REPORT_TEMPLATE_OPTIONS.map((option) => option.value));
const REPORT_FIGURE_MODE_VALUES = new Set(REPORT_FIGURE_MODE_OPTIONS.map((option) => option.value));
const REPORT_FIGURE_SCOPE_VALUES = new Set(REPORT_FIGURE_SCOPE_OPTIONS.map((option) => option.value));

function isReportTemplate(value: unknown): value is ReportTemplate {
  return typeof value === "string" && REPORT_TEMPLATE_VALUES.has(value as ReportTemplate);
}

function isReportFigureMode(value: unknown): value is ReportFigureMode {
  return typeof value === "string" && REPORT_FIGURE_MODE_VALUES.has(value as ReportFigureMode);
}

function isReportFigureScope(value: unknown): value is ReportFigureScope {
  return typeof value === "string" && REPORT_FIGURE_SCOPE_VALUES.has(value as ReportFigureScope);
}

export function normalizeReportExportOptions(raw: Partial<ReportExportOptions> | null | undefined): ReportExportOptions {
  return {
    template: isReportTemplate(raw?.template) ? raw.template : DEFAULT_REPORT_EXPORT_OPTIONS.template,
    figureMode: isReportFigureMode(raw?.figureMode) ? raw.figureMode : DEFAULT_REPORT_EXPORT_OPTIONS.figureMode,
    figureScope: isReportFigureScope(raw?.figureScope) ? raw.figureScope : DEFAULT_REPORT_EXPORT_OPTIONS.figureScope,
  };
}

export function reportFigureModeOptionsForMode(mode: AnalysisMode): readonly ReportOptionItem<ReportFigureMode>[] {
  return mode === "beam" ? REPORT_FIGURE_MODE_OPTIONS : STRUCTURE_OVERLAY_ONLY_FIGURE_MODE_OPTIONS;
}

export function reportFigureModeValueForMode(mode: AnalysisMode, value: ReportFigureMode): ReportFigureMode {
  return mode === "beam" ? value : "overlay";
}

export function reportExportOptionsForMode(mode: AnalysisMode, options: ReportExportOptions): ReportExportOptions {
  return {
    ...options,
    figureMode: reportFigureModeValueForMode(mode, options.figureMode),
  };
}

export function reportFigureModeHintForMode(mode: AnalysisMode): string {
  if (mode === "beam") {
    return "梁系可导出计算简图叠加图，也可附加传统单项曲线。";
  }
  if (mode === "frame") {
    return "平面框架计算书仅导出与结果页同源的模型叠加工程图。";
  }
  return "平面桁架计算书仅导出与结果页同源的模型叠加工程图。";
}

export function reportFigureScopeHintForMode(mode: AnalysisMode, scope: ReportFigureScope): string {
  if (scope === "none") {
    return "不插入结构预览图和结果工程图，仅导出输入、结果表格与校核摘要。";
  }
  if (mode === "beam") {
    return scope === "control"
      ? "插入结构预览图和控制弯矩图；如需剪力、挠度图，选择“全部结果图”。"
      : "插入结构预览图，并按图形模式导出弯矩、剪力、挠度图。";
  }
  if (mode === "frame") {
    const memberTerm = modelObjectMemberTerm("frame");
    return scope === "control"
      ? `插入结构预览图和控制${memberTerm}弯矩图；如需剪力、轴力和局部 y 向挠度图，选择“全部结果图”。`
      : `插入结果页工程图廊中的${memberTerm}弯矩、剪力、局部 y 向挠度和轴力模型叠加图。`;
  }
  const memberTerm = modelObjectMemberTerm("truss");
  return scope === "control"
    ? `插入结构预览图和控制${memberTerm}轴力图；如需节点位移图，选择“全部结果图”。`
    : `插入结果页工程图廊中的${memberTerm}轴力和节点位移模型叠加图。`;
}
