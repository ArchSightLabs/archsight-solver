import sharedReportFigures from "../../../shared/report-figures.json" with { type: "json" };

export type ReportFigureScope = "control" | "all";

export interface ScopedReportFigure {
  scope: ReportFigureScope;
}

export interface BeamReportFigure extends ScopedReportFigure {
  imageKey: string;
  metric: "moment" | "shear" | "deflection";
  title: string;
  seriesLabel: string;
  unit: string;
}

export interface FrameMemberReportFigure extends ScopedReportFigure {
  overlayImageKey: string;
  traditionalImageKey: string;
  metric: "momentKnM" | "shearKn" | "deflectionMm" | "axialKn";
  label: string;
  title: string;
  unit: string;
}

export interface TrussReportFigure extends ScopedReportFigure {
  imageKey: string;
  metric: "axial" | "displacement";
  title: string;
  seriesLabel: string;
  unit: string;
}

interface SharedReportFigureCatalog {
  beam: {
    overlay: BeamReportFigure[];
    traditional: BeamReportFigure[];
  };
  frame: {
    member: FrameMemberReportFigure[];
  };
  truss: {
    overlay: TrussReportFigure[];
    traditional: TrussReportFigure[];
  };
}

const REPORT_FIGURES = sharedReportFigures as SharedReportFigureCatalog;

export const BEAM_REPORT_OVERLAY_FIGURES: readonly BeamReportFigure[] = REPORT_FIGURES.beam.overlay;
export const BEAM_REPORT_TRADITIONAL_FIGURES: readonly BeamReportFigure[] = REPORT_FIGURES.beam.traditional;
export const FRAME_REPORT_MEMBER_FIGURES: readonly FrameMemberReportFigure[] = REPORT_FIGURES.frame.member;
export const TRUSS_REPORT_OVERLAY_FIGURES: readonly TrussReportFigure[] = REPORT_FIGURES.truss.overlay;
export const TRUSS_REPORT_TRADITIONAL_FIGURES: readonly TrussReportFigure[] = REPORT_FIGURES.truss.traditional;

export function reportFiguresForScope<T extends ScopedReportFigure>(figures: readonly T[], includeAll: boolean): T[] {
  return figures.filter((figure) => includeAll || figure.scope === "control");
}
