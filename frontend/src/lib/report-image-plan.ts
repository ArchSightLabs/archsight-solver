import type { BeamCalculationResults, SensitivityResults } from "../types/beam.ts";
import type { AnalysisMode, FrameCalculationResults, ModelLabelOffsets, ResultViewSettings, TrussCalculationResults } from "../types/structure.ts";
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
import { frameDataCurveOptions, trussDataCurveOptions, type DataCurveOption } from "../components/workbench-result-metrics.ts";

export interface ReportImagePlanInput {
  analysisMode: AnalysisMode;
  beamResults: BeamCalculationResults | null;
  frameResults: FrameCalculationResults | null;
  trussResults: TrussCalculationResults | null;
  sensitivityData: SensitivityResults | null;
  reportOptions?: ReportExportOptions;
  viewSettings?: ResultViewSettings | null;
  modelLabelOffsets?: ModelLabelOffsets | null;
}

type ReportImagePlanVisualOptions = {
  viewSettings?: ResultViewSettings | null;
  modelLabelOffsets?: ModelLabelOffsets | null;
};

export type ReportImagePlanItem =
  | ({ key: "beam.preview"; label: string; kind: "beamPreview" } & ReportImagePlanVisualOptions)
  | ({ key: string; label: string; kind: "beamOverlay"; figure: BeamReportFigure } & ReportImagePlanVisualOptions)
  | ({ key: string; label: string; kind: "beamTraditional"; figure: BeamReportFigure } & ReportImagePlanVisualOptions)
  | ({ key: "frame.preview"; label: string; kind: "framePreview" } & ReportImagePlanVisualOptions)
  | ({ key: string; label: string; kind: "frameOverlay"; figure: FrameMemberReportFigure } & ReportImagePlanVisualOptions)
  | { key: string; label: string; kind: "frameDataCurve"; curve: DataCurveOption }
  | ({ key: "truss.preview"; label: string; kind: "trussPreview" } & ReportImagePlanVisualOptions)
  | ({ key: string; label: string; kind: "trussOverlay"; figure: TrussReportFigure } & ReportImagePlanVisualOptions)
  | { key: string; label: string; kind: "trussDataCurve"; curve: DataCurveOption }
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

function reportViewSettings(viewSettings?: ResultViewSettings | null): ResultViewSettings | null | undefined {
  if (!viewSettings) return viewSettings;
  return { ...viewSettings, showExtremeLabel: true };
}

export function buildReportImagePlan(input: ReportImagePlanInput): ReportImagePlanItem[] {
  const options = reportExportOptionsForMode(input.analysisMode, input.reportOptions ?? DEFAULT_REPORT_EXPORT_OPTIONS);
  const { includeFigures, includeOverlay, includeTraditional, includeAll } = reportFigureFlags(options);
  const plan: ReportImagePlanItem[] = [];
  const visualOptions: ReportImagePlanVisualOptions = {
    viewSettings: reportViewSettings(input.viewSettings),
    modelLabelOffsets: input.modelLabelOffsets,
  };

  if (includeFigures && input.analysisMode === "beam" && input.beamResults) {
    plan.push({ key: "beam.preview", label: analysisVocabulary("beam").previewFigureLabel, kind: "beamPreview", ...visualOptions });
    if (includeOverlay) {
      plan.push(...reportFiguresForScope(BEAM_REPORT_OVERLAY_FIGURES, includeAll).map((figure) => ({
        key: figure.imageKey,
        label: `梁系${figure.title}`,
        kind: "beamOverlay" as const,
        figure,
        ...visualOptions,
      })));
    }
    if (includeTraditional) {
      plan.push(...reportFiguresForScope(BEAM_REPORT_TRADITIONAL_FIGURES, includeAll).map((figure) => ({
        key: figure.imageKey,
        label: figure.title,
        kind: "beamTraditional" as const,
        figure,
        ...visualOptions,
      })));
    }
  }

  if (includeFigures && input.analysisMode === "frame" && input.frameResults) {
    plan.push({ key: "frame.preview", label: analysisVocabulary("frame").previewFigureLabel, kind: "framePreview", ...visualOptions });
    if (includeOverlay) {
      plan.push(...reportFiguresForScope(FRAME_REPORT_MEMBER_FIGURES, includeAll).map((figure) => ({
        key: figure.overlayImageKey,
        label: `${modelObjectMemberTerm("frame")}${figure.title}`,
        kind: "frameOverlay" as const,
        figure,
        ...visualOptions,
      })));
    }
    if (includeTraditional) {
      plan.push(...frameDataCurveOptions(input.frameResults).map((curve) => ({
        key: `frame.curve.${curve.id}`,
        label: curve.title,
        kind: "frameDataCurve" as const,
        curve,
      })));
    }
  }

  if (includeFigures && input.analysisMode === "truss" && input.trussResults) {
    plan.push({ key: "truss.preview", label: analysisVocabulary("truss").previewFigureLabel, kind: "trussPreview", ...visualOptions });
    if (includeOverlay) {
      plan.push(...reportFiguresForScope(TRUSS_REPORT_OVERLAY_FIGURES, includeAll).map((figure) => ({
        key: figure.imageKey,
        label: `平面桁架${figure.title}`,
        kind: "trussOverlay" as const,
        figure,
        ...visualOptions,
      })));
    }
    if (includeTraditional) {
      plan.push(...trussDataCurveOptions(input.trussResults).map((curve) => ({
        key: `truss.curve.${curve.id}`,
        label: curve.title,
        kind: "trussDataCurve" as const,
        curve,
      })));
    }
  }

  if (input.sensitivityData) {
    plan.push({ key: "sensitivity.response", label: "参数扰动响应曲线", kind: "sensitivity" });
  }

  return plan;
}
