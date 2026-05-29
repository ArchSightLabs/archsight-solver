import type { AnalysisMode } from "../types/structure.ts";
import sharedResultMetrics from "../../../shared/result-metrics.json" with { type: "json" };

export interface ResultMetricSpec {
  value: string;
  label: string;
  unit: string;
  unitLabel: string;
  description: string;
}

interface ResultMetricGroup {
  defaultSensitivityMetric: string;
  summaryMetrics: ResultMetricSpec[];
  sensitivityResponses: ResultMetricSpec[];
}

const RESULT_METRICS = sharedResultMetrics as Record<AnalysisMode, ResultMetricGroup>;

function metricFrom(rows: ResultMetricSpec[], value: string): ResultMetricSpec | undefined {
  return rows.find((row) => row.value === value);
}

export function summaryMetricLabel(mode: AnalysisMode, value: string, fallback: string): string {
  return metricFrom(RESULT_METRICS[mode].summaryMetrics, value)?.label ?? fallback;
}

export function sensitivityResponseMetricLabel(mode: AnalysisMode, value: string, fallback: string): string {
  return metricFrom(RESULT_METRICS[mode].sensitivityResponses, value)?.label ?? fallback;
}

export function sensitivityResponseMetrics(mode: AnalysisMode): ResultMetricSpec[] {
  return RESULT_METRICS[mode].sensitivityResponses;
}

export function defaultSensitivityMetricForMode(mode: AnalysisMode): string {
  return RESULT_METRICS[mode].defaultSensitivityMetric;
}
