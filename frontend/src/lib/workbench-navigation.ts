import type { AnalysisMode } from "../types/structure";

export type ModuleSectionItem = {
  id: string;
  label: string;
};

const MODULE_SECTIONS_BY_MODE: Record<AnalysisMode, ModuleSectionItem[]> = {
  beam: [
    { id: "beam-typical-cases", label: "模板" },
    { id: "beam-basic", label: "基本" },
    { id: "beam-object-navigator", label: "对象" },
    { id: "beam-text-model", label: "文本" },
    { id: "beam-advanced-tables", label: "表格" },
  ],
  frame: [
    { id: "frame-typical-cases", label: "模板" },
    { id: "frame-custom-overview", label: "基本" },
    { id: "frame-object-navigator", label: "对象" },
    { id: "frame-text-model", label: "文本" },
    { id: "frame-advanced-tables", label: "表格" },
  ],
  truss: [
    { id: "truss-typical-cases", label: "模板" },
    { id: "truss-custom-overview", label: "基本" },
    { id: "truss-object-navigator", label: "对象" },
    { id: "truss-text-model", label: "文本" },
    { id: "truss-advanced-tables", label: "表格" },
  ],
};

const MODULE_TITLES: Record<AnalysisMode, string> = {
  beam: "梁系参数",
  frame: "框架参数",
  truss: "桁架参数",
};

const OBJECT_NAVIGATOR_SECTION_IDS: Record<AnalysisMode, string> = {
  beam: "beam-object-navigator",
  frame: "frame-object-navigator",
  truss: "truss-object-navigator",
};

export function moduleSectionsForMode(mode: AnalysisMode): ModuleSectionItem[] {
  return MODULE_SECTIONS_BY_MODE[mode];
}

export function moduleTitleForMode(mode: AnalysisMode): string {
  return MODULE_TITLES[mode];
}

export function objectNavigatorSectionId(mode: AnalysisMode): string {
  return OBJECT_NAVIGATOR_SECTION_IDS[mode];
}
