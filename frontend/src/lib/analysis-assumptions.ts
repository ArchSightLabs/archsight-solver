import type { AnalysisMode } from "../types/structure.ts";
import sharedAssumptions from "../../../shared/analysis-assumptions.json" with { type: "json" };

export interface AnalysisAssumptionRow {
  label: string;
  value: string;
}

const ANALYSIS_ASSUMPTIONS = sharedAssumptions as Record<AnalysisMode, AnalysisAssumptionRow[]>;

export function analysisAssumptionRows(mode: AnalysisMode): AnalysisAssumptionRow[] {
  return ANALYSIS_ASSUMPTIONS[mode];
}
