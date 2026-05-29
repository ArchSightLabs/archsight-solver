import type { SensitivityResponseOption } from "../types/beam";
import type { AnalysisMode } from "../types/structure";
import { defaultSensitivityMetricForMode as defaultMetricFromCatalog, sensitivityResponseMetrics } from "./result-metrics.ts";

export function sensitivityOptionsForMode(mode: AnalysisMode): SensitivityResponseOption[] {
  return sensitivityResponseMetrics(mode).map((metric) => ({
    value: metric.value,
    label: metric.label,
  }));
}

export function defaultSensitivityMetricForMode(mode: AnalysisMode): string {
  return defaultMetricFromCatalog(mode);
}
