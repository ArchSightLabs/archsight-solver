import { TRUSS_REPORT_OVERLAY_FIGURES, type TrussReportFigure } from "./report-figure-catalog.ts";
import { clamp } from "./result-diagram-geometry.ts";
import { STRUCTURE_VISUAL_STROKES } from "./structure-visual-tokens.ts";

export type TrussDiagramMetricKey = "axialForceKn" | "displacementMm";

export interface TrussDiagramMetric {
  key: TrussDiagramMetricKey;
  title: string;
  unit: string;
}

export interface TrussDisplacementDisplayScaleInput {
  maxDisplacementMm: number;
  layoutScalePxPerM: number;
  modelWidthPx: number;
  modelHeightPx: number;
  compact?: boolean;
}

const TRUSS_RESULT_KEY_BY_REPORT_METRIC: Record<TrussReportFigure["metric"], TrussDiagramMetricKey> = {
  axial: "axialForceKn",
  displacement: "displacementMm",
};

export const TRUSS_DIAGRAM_METRICS: TrussDiagramMetric[] = TRUSS_REPORT_OVERLAY_FIGURES.map((figure) => ({
  key: TRUSS_RESULT_KEY_BY_REPORT_METRIC[figure.metric],
  title: figure.title,
  unit: figure.unit,
}));

export const DEFAULT_TRUSS_DIAGRAM_METRIC_KEY: TrussDiagramMetricKey = TRUSS_DIAGRAM_METRICS[0]?.key ?? "axialForceKn";

export function getTrussDiagramMetric(key: TrussDiagramMetricKey): TrussDiagramMetric {
  return TRUSS_DIAGRAM_METRICS.find((metric) => metric.key === key) ?? TRUSS_DIAGRAM_METRICS[0];
}

export function trussAxialMemberStrokeWidth(axialForceKn: number, maxAbsAxialKn: number): number {
  const minStroke = STRUCTURE_VISUAL_STROKES.resultTrussAxialMin;
  const maxStroke = STRUCTURE_VISUAL_STROKES.resultTrussAxialMax;
  if (!Number.isFinite(axialForceKn) || !Number.isFinite(maxAbsAxialKn) || maxAbsAxialKn <= 1e-9) {
    return minStroke;
  }
  return minStroke + clamp(Math.abs(axialForceKn) / maxAbsAxialKn, 0, 1) * (maxStroke - minStroke);
}

function smoothStep(value: number) {
  return value * value * (3 - 2 * value);
}

export function autoTrussDisplacementDisplayScale({
  maxDisplacementMm,
  layoutScalePxPerM,
  modelWidthPx,
  modelHeightPx,
  compact = false,
}: TrussDisplacementDisplayScaleInput): number {
  const maxDisplacementM = maxDisplacementMm / 1000;
  const actualMaxOffsetPx = maxDisplacementM * layoutScalePxPerM;
  const modelCharacteristicPx = Math.hypot(modelWidthPx, modelHeightPx);
  if (
    !Number.isFinite(actualMaxOffsetPx) ||
    !Number.isFinite(modelCharacteristicPx) ||
    actualMaxOffsetPx <= 1e-9 ||
    modelCharacteristicPx <= 1e-9
  ) {
    return 0;
  }

  const actualDisplacementRatio = actualMaxOffsetPx / modelCharacteristicPx;
  const smallDisplacementRatio = 1 / 2000;
  const fullDisplayRatio = 1 / 250;
  const ratioProgress = clamp(
    (Math.log10(actualDisplacementRatio) - Math.log10(smallDisplacementRatio)) /
      (Math.log10(fullDisplayRatio) - Math.log10(smallDisplacementRatio)),
    0,
    1,
  );
  const easedProgress = smoothStep(ratioProgress);
  const minTargetFraction = compact ? 0.01 : 0.012;
  const maxTargetFraction = compact ? 0.038 : 0.05;
  const targetFraction = minTargetFraction + (maxTargetFraction - minTargetFraction) * easedProgress;
  const targetOffsetPx = clamp(modelCharacteristicPx * targetFraction, compact ? 8 : 10, compact ? 64 : 88);

  return clamp(targetOffsetPx / actualMaxOffsetPx, 1, 100000);
}
