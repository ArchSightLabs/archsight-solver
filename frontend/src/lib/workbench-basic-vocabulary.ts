import { analysisVocabulary } from "./analysis-vocabulary.ts";
import { materialLabelForId } from "./material-presets.ts";
import { modelObjectMemberTerm } from "./model-object-vocabulary.ts";
import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";
import type { AnalysisMode } from "../types/structure.ts";

function shortSystemLabel(mode: AnalysisMode): string {
  return analysisVocabulary(mode).systemLabel.replace(/^平面/u, "");
}

export function workbenchBasicDescription(mode: AnalysisMode): string {
  if (mode === "beam") return "模板定型；默认材料用于新增跨段。";
  return `默认材料用于新增${modelObjectMemberTerm(mode)}；对象页维护模型。`;
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
  const materialLabel = materialLabelForId(materialId, materials);
  if (materialLabel === "自定义") {
    return `手动 E；已有${memberTerm}不变。`;
  }
  return `新增${memberTerm}使用 ${materialLabel}；已有不变。`;
}
