import { analysisVocabulary } from "./analysis-vocabulary.ts";
import { materialLabelForId } from "./material-presets.ts";
import { modelObjectMemberTerm, modelObjectVocabulary } from "./model-object-vocabulary.ts";
import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";
import type { AnalysisMode } from "../types/structure.ts";

interface WorkbenchBasicCopy {
  stiffnessInputs: string;
  sectionInputs: string;
}

const WORKBENCH_BASIC_COPY: Record<AnalysisMode, WorkbenchBasicCopy> = {
  beam: {
    stiffnessInputs: "E/I",
    sectionInputs: "截面惯性矩 I",
  },
  frame: {
    stiffnessInputs: "E/A/I",
    sectionInputs: "截面面积 A 和截面惯性矩 I",
  },
  truss: {
    stiffnessInputs: "E/A",
    sectionInputs: "截面面积 A",
  },
};

function shortSystemLabel(mode: AnalysisMode): string {
  return analysisVocabulary(mode).systemLabel.replace(/^平面/u, "");
}

function basicObjectList(mode: AnalysisMode): string {
  const vocabulary = modelObjectVocabulary(mode);
  if (mode === "beam") return `${vocabulary.memberGroupLabel}、${vocabulary.supportGroupLabel}、${vocabulary.loadGroupLabel}`;
  return `${vocabulary.nodeGroupLabel}、${vocabulary.memberGroupLabel}、${vocabulary.supportGroupLabel}、${vocabulary.loadGroupLabel}`;
}

function completionObjectList(mode: AnalysisMode): string {
  return basicObjectList(mode).replace(/、([^、]+)$/u, "与$1");
}

function resultReviewScope(mode: AnalysisMode): string {
  const memberTerm = modelObjectMemberTerm(mode);
  if (mode === "frame") return `节点位移、${memberTerm}内力和支座反力`;
  if (mode === "truss") return `节点位移、${memberTerm}轴力和支座反力`;
  return "挠度、弯矩、剪力和支座反力";
}

export function workbenchBasicDescription(mode: AnalysisMode): string {
  const prefix = mode === "beam" ? "先定梁型和默认材料" : "先定默认材料";
  return `${prefix}；${basicObjectList(mode)}在对象页维护，批量参数在表格页复核。`;
}

export function workbenchBasicSuccessMessage(mode: AnalysisMode): string {
  return `当前${shortSystemLabel(mode)}${completionObjectList(mode)}完整，可复核${resultReviewScope(mode)}。`;
}

export function defaultMaterialFieldLabel(mode: AnalysisMode): string {
  return `默认材料编号（新增${modelObjectMemberTerm(mode)} E）`;
}

export function defaultMaterialAriaLabel(mode: AnalysisMode): string {
  return `${shortSystemLabel(mode)}默认材料编号（新增${modelObjectMemberTerm(mode)} E）`;
}

export function defaultMaterialBasicDetail(
  mode: AnalysisMode,
  materialId: string | undefined,
  materials: Material[] = PREDEFINED_MATERIALS,
): string {
  const copy = WORKBENCH_BASIC_COPY[mode];
  const memberTerm = modelObjectMemberTerm(mode);
  const materialLabel = materialLabelForId(materialId, materials);
  if (materialLabel === "自定义") {
    return `新增${memberTerm}使用自定义 E；刚度仍按 ${copy.stiffnessInputs} 输入计算。`;
  }
  return `新增${memberTerm}回填 ${materialLabel} 的 E；刚度仍按 ${copy.stiffnessInputs} 输入计算。`;
}

export function materialSectionBasicDetail(mode: AnalysisMode): string {
  const copy = WORKBENCH_BASIC_COPY[mode];
  return `材料编号保留工程语义；${copy.sectionInputs} 按${modelObjectMemberTerm(mode)}维护。`;
}

export function defaultMaterialControlHint(
  mode: AnalysisMode,
  materialId: string | undefined,
  materials: Material[] = PREDEFINED_MATERIALS,
): string {
  const memberTerm = modelObjectMemberTerm(mode);
  const materialLabel = materialLabelForId(materialId, materials);
  if (materialLabel === "自定义") {
    return `自定义材料不回填预设；已有${memberTerm}的 E 需在对象或表格页复核。`;
  }
  return `${materialLabel} 仅回填新增${memberTerm}的 E；已有${memberTerm}不自动改写。`;
}
