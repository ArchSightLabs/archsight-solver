import { TRUSS_REPORT_OVERLAY_FIGURES, type TrussReportFigure } from "./report-figure-catalog.ts";

export type TrussDiagramMetricKey = "axialForceKn" | "displacementMm";

export interface TrussDiagramMetric {
  key: TrussDiagramMetricKey;
  title: string;
  unit: string;
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
