import type { AnalysisMode } from "../types/structure";
import { analysisVocabulary } from "./analysis-vocabulary.ts";

export type ModuleSectionItem = {
  id: string;
  label: string;
};

export type ModuleSectionKey = "template" | "basic" | "object" | "text" | "table";

const SECTION_LABELS: Record<ModuleSectionKey, string> = {
  template: "模板",
  basic: "基本",
  object: "对象",
  text: "文本",
  table: "表格",
};

const SECTION_ORDER: ModuleSectionKey[] = ["template", "basic", "object", "text", "table"];

const LEGACY_SECTION_ID_ALIASES: Partial<Record<string, ModuleSectionKey>> = {
  "beam-typical-cases": "template",
  "beam-object-navigator": "object",
  "beam-text-model": "text",
  "beam-advanced-tables": "table",
  "frame-typical-cases": "template",
  "frame-custom-overview": "basic",
  "frame-object-navigator": "object",
  "frame-text-model": "text",
  "frame-advanced-tables": "table",
  "truss-typical-cases": "template",
  "truss-custom-overview": "basic",
  "truss-object-navigator": "object",
  "truss-text-model": "text",
  "truss-advanced-tables": "table",
};

export function moduleSectionId(mode: AnalysisMode, section: ModuleSectionKey): string {
  return `${mode}-${section}`;
}

function buildModuleSections(mode: AnalysisMode): ModuleSectionItem[] {
  return SECTION_ORDER.map((section) => ({
    id: moduleSectionId(mode, section),
    label: SECTION_LABELS[section],
  }));
}

const MODULE_SECTIONS_BY_MODE: Record<AnalysisMode, ModuleSectionItem[]> = {
  beam: buildModuleSections("beam"),
  frame: buildModuleSections("frame"),
  truss: buildModuleSections("truss"),
};

const MODULE_TITLES: Record<AnalysisMode, string> = {
  beam: analysisVocabulary("beam").parameterTitle,
  frame: analysisVocabulary("frame").parameterTitle,
  truss: analysisVocabulary("truss").parameterTitle,
};

const OBJECT_NAVIGATOR_SECTION_IDS: Record<AnalysisMode, string> = {
  beam: moduleSectionId("beam", "object"),
  frame: moduleSectionId("frame", "object"),
  truss: moduleSectionId("truss", "object"),
};

export function moduleSectionsForMode(mode: AnalysisMode): ModuleSectionItem[] {
  return MODULE_SECTIONS_BY_MODE[mode];
}

export function normalizeModuleSectionId(mode: AnalysisMode, sectionId: string | undefined): string | null {
  if (!sectionId) return null;
  if (MODULE_SECTIONS_BY_MODE[mode].some((item) => item.id === sectionId)) {
    return sectionId;
  }
  const legacyKey = LEGACY_SECTION_ID_ALIASES[sectionId];
  if (!legacyKey) return null;
  return moduleSectionId(mode, legacyKey);
}

export function moduleTitleForMode(mode: AnalysisMode): string {
  return MODULE_TITLES[mode];
}

export function objectNavigatorSectionId(mode: AnalysisMode): string {
  return OBJECT_NAVIGATOR_SECTION_IDS[mode];
}
