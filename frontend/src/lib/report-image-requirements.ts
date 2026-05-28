import type { BeamCalculationResults, SensitivityResults } from "../types/beam.ts";
import type { AnalysisMode, FrameCalculationResults, TrussCalculationResults } from "../types/structure.ts";
import {
  BEAM_REPORT_OVERLAY_FIGURES,
  BEAM_REPORT_TRADITIONAL_FIGURES,
  FRAME_REPORT_MEMBER_FIGURES,
  TRUSS_REPORT_OVERLAY_FIGURES,
  TRUSS_REPORT_TRADITIONAL_FIGURES,
  reportFiguresForScope,
} from "./report-figure-catalog.ts";
import { DEFAULT_REPORT_EXPORT_OPTIONS, type ReportExportOptions } from "./report-options.ts";

export interface ReportImageRequirementInput {
  analysisMode: AnalysisMode;
  beamResults: BeamCalculationResults | null;
  frameResults: FrameCalculationResults | null;
  trussResults: TrussCalculationResults | null;
  sensitivityData: SensitivityResults | null;
  reportOptions?: ReportExportOptions;
}

export interface ReportImageRequirement {
  key: string;
  label: string;
}

function reportFigureFlags(options: ReportExportOptions) {
  const includeFigures = options.figureScope !== "none";
  return {
    includeFigures,
    includeOverlay: includeFigures && (options.figureMode === "overlay" || options.figureMode === "both"),
    includeTraditional: includeFigures && (options.figureMode === "traditional" || options.figureMode === "both"),
    includeAll: options.figureScope === "all",
  };
}

function activeResultMissingLabel(input: ReportImageRequirementInput, options: ReportExportOptions) {
  if (options.figureScope === "none") return null;
  if (input.analysisMode === "beam" && !input.beamResults) return "梁系计算结果";
  if (input.analysisMode === "frame" && !input.frameResults) return "平面框架计算结果";
  if (input.analysisMode === "truss" && !input.trussResults) return "平面桁架计算结果";
  return null;
}

export function reportImageRequirements(input: ReportImageRequirementInput): ReportImageRequirement[] {
  const options = input.reportOptions ?? DEFAULT_REPORT_EXPORT_OPTIONS;
  const { includeFigures, includeOverlay, includeTraditional, includeAll } = reportFigureFlags(options);
  const requirements: ReportImageRequirement[] = [];

  if (includeFigures && input.analysisMode === "beam" && input.beamResults) {
    requirements.push({ key: "beam.preview", label: "梁体结构预览图" });
    if (includeOverlay) {
      requirements.push(...reportFiguresForScope(BEAM_REPORT_OVERLAY_FIGURES, includeAll).map((figure) => ({ key: figure.imageKey, label: `梁系${figure.title}` })));
    }
    if (includeTraditional) {
      requirements.push(...reportFiguresForScope(BEAM_REPORT_TRADITIONAL_FIGURES, includeAll).map((figure) => ({ key: figure.imageKey, label: figure.title })));
    }
  }

  if (includeFigures && input.analysisMode === "frame" && input.frameResults) {
    requirements.push({ key: "frame.preview", label: "平面框架结构预览图" });
    if (includeOverlay) {
      requirements.push(...reportFiguresForScope(FRAME_REPORT_MEMBER_FIGURES, includeAll).map((figure) => ({ key: figure.overlayImageKey, label: `构件${figure.title}` })));
    }
    if (includeTraditional) {
      if (includeAll) {
        requirements.push({ key: "frame.ux", label: "节点 X 向水平位移图" }, { key: "frame.uy", label: "节点 Y 向竖向位移图" });
      }
      requirements.push(...reportFiguresForScope(FRAME_REPORT_MEMBER_FIGURES, includeAll).map((figure) => ({ key: figure.traditionalImageKey, label: `构件${figure.title}` })));
    }
  }

  if (includeFigures && input.analysisMode === "truss" && input.trussResults) {
    requirements.push({ key: "truss.preview", label: "平面桁架结构预览图" });
    if (includeOverlay) {
      requirements.push(...reportFiguresForScope(TRUSS_REPORT_OVERLAY_FIGURES, includeAll).map((figure) => ({ key: figure.imageKey, label: `平面桁架${figure.title}` })));
    }
    if (includeTraditional) {
      if (includeAll) {
        requirements.push({ key: "truss.ux", label: "节点 X 向水平位移图" }, { key: "truss.uy", label: "节点 Y 向竖向位移图" });
      }
      requirements.push(...reportFiguresForScope(TRUSS_REPORT_TRADITIONAL_FIGURES, includeAll).map((figure) => ({ key: figure.imageKey, label: figure.title })));
    }
  }

  if (input.sensitivityData) {
    requirements.push({ key: "sensitivity.response", label: "参数扰动响应曲线" });
  }

  return requirements;
}

export function assertReportImagesReady(images: Record<string, string>, input: ReportImageRequirementInput) {
  const options = input.reportOptions ?? DEFAULT_REPORT_EXPORT_OPTIONS;
  const missingResult = activeResultMissingLabel(input, options);
  if (missingResult) {
    throw new Error(`无法生成计算书图形：缺少${missingResult}，请先完成当前结构对象计算后再导出 DOCX。`);
  }

  const missing = reportImageRequirements(input).filter((requirement) => !images[requirement.key]);
  if (missing.length) {
    throw new Error(`计算书图片生成失败，未生成：${missing.map((item) => item.label).join("、")}。请保持页面打开并重新导出。`);
  }
}
