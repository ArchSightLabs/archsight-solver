import type { BeamCalculationResults, SensitivityResults } from "../types/beam.ts";
import type { AnalysisMode, FrameCalculationResults, TrussCalculationResults } from "../types/structure.ts";
import {
  BEAM_REPORT_OVERLAY_FIGURES,
  BEAM_REPORT_TRADITIONAL_FIGURES,
  FRAME_REPORT_MEMBER_FIGURES,
  TRUSS_REPORT_OVERLAY_FIGURES,
  reportFiguresForScope,
  type BeamReportFigure,
  type FrameMemberReportFigure,
  type TrussReportFigure,
} from "./report-figure-catalog.ts";
import { analysisVocabulary } from "./analysis-vocabulary.ts";
import { modelObjectMemberTerm } from "./model-object-vocabulary.ts";
import { DEFAULT_REPORT_EXPORT_OPTIONS, reportExportOptionsForMode, type ReportExportOptions } from "./report-options.ts";

export interface ReportImagePlanInput {
  analysisMode: AnalysisMode;
  beamResults: BeamCalculationResults | null;
  frameResults: FrameCalculationResults | null;
  trussResults: TrussCalculationResults | null;
  sensitivityData: SensitivityResults | null;
  reportOptions?: ReportExportOptions;
  viewSettings?: import("../types/structure.ts").ResultViewSettings | null;
}

export type ReportImagePlanItem =
  | { key: "beam.preview"; label: string; kind: "beamPreview"; viewSettings?: import("../types/structure.ts").ResultViewSettings | null }
  | { key: string; label: string; kind: "beamOverlay"; figure: BeamReportFigure; viewSettings?: import("../types/structure.ts").ResultViewSettings | null }
  | { key: string; label: string; kind: "beamTraditional"; figure: BeamReportFigure; viewSettings?: import("../types/structure.ts").ResultViewSettings | null }
  | { key: "frame.preview"; label: string; kind: "framePreview"; viewSettings?: import("../types/structure.ts").ResultViewSettings | null }
  | { key: string; label: string; kind: "frameOverlay"; figure: FrameMemberReportFigure; viewSettings?: import("../types/structure.ts").ResultViewSettings | null }
  | { key: "truss.preview"; label: string; kind: "trussPreview"; viewSettings?: import("../types/structure.ts").ResultViewSettings | null }
  | { key: string; label: string; kind: "trussOverlay"; figure: TrussReportFigure; viewSettings?: import("../types/structure.ts").ResultViewSettings | null }
  | { key: "sensitivity.response"; label: string; kind: "sensitivity" };

export function reportFigureFlags(options: ReportExportOptions) {
  const includeFigures = options.figureScope !== "none";
  return {
    includeFigures,
    includeOverlay: includeFigures && (options.figureMode === "overlay" || options.figureMode === "both"),
    includeTraditional: includeFigures && (options.figureMode === "traditional" || options.figureMode === "both"),
    includeAll: options.figureScope === "all",
  };
}

export function activeResultMissingLabel(input: ReportImagePlanInput, options: ReportExportOptions) {
  if (options.figureScope === "none") return null;
  if (input.analysisMode === "beam" && !input.beamResults) return analysisVocabulary("beam").resultLabel;
  if (input.analysisMode === "frame" && !input.frameResults) return analysisVocabulary("frame").resultLabel;
  if (input.analysisMode === "truss" && !input.trussResults) return analysisVocabulary("truss").resultLabel;
  return null;
}

export function buildReportImagePlan(input: ReportImagePlanInput): ReportImagePlanItem[] {
  const options = reportExportOptionsForMode(input.analysisMode, input.reportOptions ?? DEFAULT_REPORT_EXPORT_OPTIONS);
  const { includeFigures, includeOverlay, includeTraditional, includeAll } = reportFigureFlags(options);
  const plan: ReportImagePlanItem[] = [];

  if (includeFigures && input.analysisMode === "beam" && input.beamResults) {
    plan.push({ key: "beam.preview", label: analysisVocabulary("beam").previewFigureLabel, kind: "beamPreview", viewSettings: input.viewSettings });
    if (includeOverlay) {
      plan.push(...reportFiguresForScope(BEAM_REPORT_OVERLAY_FIGURES, includeAll).map((figure) => ({
        key: figure.imageKey,
        label: `梁系${figure.title}`,
        kind: "beamOverlay" as const,
        figure,
        viewSettings: input.viewSettings,
      })));
    }
    if (includeTraditional) {
      plan.push(...reportFiguresForScope(BEAM_REPORT_TRADITIONAL_FIGURES, includeAll).map((figure) => ({
        key: figure.imageKey,
        label: figure.title,
        kind: "beamTraditional" as const,
        figure,
        viewSettings: input.viewSettings,
      })));
    }
  }

  if (includeFigures && input.analysisMode === "frame" && input.frameResults) {
    plan.push({ key: "frame.preview", label: analysisVocabulary("frame").previewFigureLabel, kind: "framePreview", viewSettings: input.viewSettings });
    if (includeOverlay || includeTraditional) {
      plan.push(...reportFiguresForScope(FRAME_REPORT_MEMBER_FIGURES, includeAll).map((figure) => ({
        key: figure.overlayImageKey,
        label: `${modelObjectMemberTerm("frame")}${figure.title}`,
        kind: "frameOverlay" as const,
        figure,
        viewSettings: input.viewSettings,
      })));
    }
  }

  if (includeFigures && input.analysisMode === "truss" && input.trussResults) {
    plan.push({ key: "truss.preview", label: analysisVocabulary("truss").previewFigureLabel, kind: "trussPreview", viewSettings: input.viewSettings });
    if (includeOverlay || includeTraditional) {
      plan.push(...reportFiguresForScope(TRUSS_REPORT_OVERLAY_FIGURES, includeAll).map((figure) => ({
        key: figure.imageKey,
        label: `平面桁架${figure.title}`,
        kind: "trussOverlay" as const,
        figure,
        viewSettings: input.viewSettings,
      })));
    }
  }

  if (input.sensitivityData) {
    plan.push({ key: "sensitivity.response", label: "参数扰动响应曲线", kind: "sensitivity" });
  }

  return plan;
}
