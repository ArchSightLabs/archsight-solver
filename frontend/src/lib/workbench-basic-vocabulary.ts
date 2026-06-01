import { analysisVocabulary } from "./analysis-vocabulary.ts";
import { modelObjectMemberTerm } from "./model-object-vocabulary.ts";
import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";
import type { AnalysisMode } from "../types/structure.ts";

function shortSystemLabel(mode: AnalysisMode): string {
  return analysisVocabulary(mode).systemLabel.replace(/^平面/u, "");
}

export function workbenchBasicSuccessMessage(mode: AnalysisMode): string {
  return `${shortSystemLabel(mode)}输入完整，可计算。`;
}

export function defaultMaterialFieldLabel(mode: AnalysisMode): string {
  void mode;
  return "默认材料";
}

export function defaultMaterialAriaLabel(mode: AnalysisMode): string {
  return `${shortSystemLabel(mode)}默认材料（新增${modelObjectMemberTerm(mode)} E）`;
}

export function defaultMaterialControlHint(
  mode: AnalysisMode,
  materialId: string | undefined,
  materials: Material[] = PREDEFINED_MATERIALS,
): string {
  const memberTerm = modelObjectMemberTerm(mode);
  void materialId;
  void materials;
  return `仅影响新增${memberTerm}；已有不变。`;
}
