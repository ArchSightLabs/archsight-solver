import { materialLabelForId } from "./material-presets.ts";
import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";
import type { AnalysisMode } from "../types/structure.ts";

interface WorkbenchBasicCopy {
  description: string;
  successMessage: string;
  memberTerm: string;
  stiffnessInputs: string;
  materialFieldLabel: string;
  materialAriaLabel: string;
  materialSectionDetail: string;
}

const WORKBENCH_BASIC_COPY: Record<AnalysisMode, WorkbenchBasicCopy> = {
  beam: {
    description: "先定梁型和默认材料；杆件、支座、荷载在对象页维护，批量参数在表格页复核。",
    successMessage: "当前梁系杆件、支座与荷载完整，可复核挠度、弯矩、剪力和支座反力。",
    memberTerm: "杆件",
    stiffnessInputs: "E/I",
    materialFieldLabel: "默认材料编号（新增杆件 E）",
    materialAriaLabel: "梁系默认材料编号（新增杆件 E）",
    materialSectionDetail: "材料编号保留工程语义；截面惯性矩 I 按杆件维护。",
  },
  frame: {
    description: "先定默认材料；节点、构件、支座、荷载在对象页维护，批量参数在表格页复核。",
    successMessage: "当前框架节点、构件、支座与荷载完整，可复核节点位移、构件内力和支座反力。",
    memberTerm: "构件",
    stiffnessInputs: "E/A/I",
    materialFieldLabel: "默认材料编号（新增构件 E）",
    materialAriaLabel: "框架默认材料编号（新增构件 E）",
    materialSectionDetail: "材料编号保留工程语义；截面面积 A 和截面惯性矩 I 按构件维护。",
  },
  truss: {
    description: "先定默认材料；节点、杆件、支座、荷载在对象页维护，批量参数在表格页复核。",
    successMessage: "当前桁架节点、杆件、支座与荷载完整，可复核节点位移、杆件轴力和支座反力。",
    memberTerm: "杆件",
    stiffnessInputs: "E/A",
    materialFieldLabel: "默认材料编号（新增杆件 E）",
    materialAriaLabel: "桁架默认材料编号（新增杆件 E）",
    materialSectionDetail: "材料编号保留工程语义；截面面积 A 按杆件维护。",
  },
};

export function workbenchBasicDescription(mode: AnalysisMode): string {
  return WORKBENCH_BASIC_COPY[mode].description;
}

export function workbenchBasicSuccessMessage(mode: AnalysisMode): string {
  return WORKBENCH_BASIC_COPY[mode].successMessage;
}

export function defaultMaterialFieldLabel(mode: AnalysisMode): string {
  return WORKBENCH_BASIC_COPY[mode].materialFieldLabel;
}

export function defaultMaterialAriaLabel(mode: AnalysisMode): string {
  return WORKBENCH_BASIC_COPY[mode].materialAriaLabel;
}

export function defaultMaterialBasicDetail(
  mode: AnalysisMode,
  materialId: string | undefined,
  materials: Material[] = PREDEFINED_MATERIALS,
): string {
  const copy = WORKBENCH_BASIC_COPY[mode];
  const materialLabel = materialLabelForId(materialId, materials);
  if (materialLabel === "自定义") {
    return `新增${copy.memberTerm}使用自定义 E；刚度仍按 ${copy.stiffnessInputs} 输入计算。`;
  }
  return `新增${copy.memberTerm}回填 ${materialLabel} 的 E；刚度仍按 ${copy.stiffnessInputs} 输入计算。`;
}

export function materialSectionBasicDetail(mode: AnalysisMode): string {
  return WORKBENCH_BASIC_COPY[mode].materialSectionDetail;
}

export function defaultMaterialControlHint(
  mode: AnalysisMode,
  materialId: string | undefined,
  materials: Material[] = PREDEFINED_MATERIALS,
): string {
  const copy = WORKBENCH_BASIC_COPY[mode];
  const materialLabel = materialLabelForId(materialId, materials);
  if (materialLabel === "自定义") {
    return `自定义材料不回填预设；已有${copy.memberTerm}的 E 需在对象或表格页复核。`;
  }
  return `${materialLabel} 仅回填新增${copy.memberTerm}的 E；已有${copy.memberTerm}不自动改写。`;
}
