export type ReportFigureScope = "control" | "all";

export interface ScopedReportFigure {
  scope: ReportFigureScope;
}

export interface BeamReportFigure extends ScopedReportFigure {
  imageKey: string;
  metric: "moment" | "shear" | "deflection";
  title: string;
  unit: string;
}

export interface FrameMemberReportFigure extends ScopedReportFigure {
  overlayImageKey: string;
  traditionalImageKey: string;
  metric: "momentKnM" | "shearKn" | "deflectionMm" | "axialKn";
  title: string;
  unit: string;
}

export interface TrussReportFigure extends ScopedReportFigure {
  imageKey: string;
  metric: "axial" | "displacement";
  title: string;
  unit: string;
}

export const BEAM_REPORT_OVERLAY_FIGURES: readonly BeamReportFigure[] = [
  { imageKey: "beam.overlay.moment", metric: "moment", title: "弯矩图", unit: "kN·m", scope: "control" },
  { imageKey: "beam.overlay.shear", metric: "shear", title: "剪力图", unit: "kN", scope: "all" },
  { imageKey: "beam.overlay.deflection", metric: "deflection", title: "挠度图", unit: "mm", scope: "all" },
] as const;

export const BEAM_REPORT_TRADITIONAL_FIGURES: readonly BeamReportFigure[] = [
  { imageKey: "beam.deflection", metric: "deflection", title: "挠度曲线", unit: "mm", scope: "all" },
  { imageKey: "beam.moment", metric: "moment", title: "弯矩曲线", unit: "kN·m", scope: "control" },
  { imageKey: "beam.shear", metric: "shear", title: "剪力曲线", unit: "kN", scope: "all" },
] as const;

export const FRAME_REPORT_MEMBER_FIGURES: readonly FrameMemberReportFigure[] = [
  { overlayImageKey: "frame.overlay.moment", traditionalImageKey: "frame.moment", metric: "momentKnM", title: "弯矩图", unit: "kN·m", scope: "control" },
  { overlayImageKey: "frame.overlay.shear", traditionalImageKey: "frame.shear", metric: "shearKn", title: "剪力图", unit: "kN", scope: "all" },
  { overlayImageKey: "frame.overlay.memberDeflection", traditionalImageKey: "frame.memberDeflection", metric: "deflectionMm", title: "局部 y 向挠度图", unit: "mm", scope: "all" },
  { overlayImageKey: "frame.overlay.axial", traditionalImageKey: "frame.axial", metric: "axialKn", title: "轴力图", unit: "kN", scope: "all" },
] as const;

export const TRUSS_REPORT_OVERLAY_FIGURES: readonly TrussReportFigure[] = [
  { imageKey: "truss.overlay.axial", metric: "axial", title: "杆件轴力图", unit: "kN", scope: "control" },
  { imageKey: "truss.overlay.displacement", metric: "displacement", title: "节点位移图", unit: "mm", scope: "all" },
] as const;

export const TRUSS_REPORT_TRADITIONAL_FIGURES: readonly TrussReportFigure[] = [
  { imageKey: "truss.axial", metric: "axial", title: "杆件轴力曲线", unit: "kN", scope: "control" },
] as const;

export function reportFiguresForScope<T extends ScopedReportFigure>(figures: readonly T[], includeAll: boolean): T[] {
  return figures.filter((figure) => includeAll || figure.scope === "control");
}
