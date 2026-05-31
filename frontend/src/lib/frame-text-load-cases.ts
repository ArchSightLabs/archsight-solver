import type { FrameLoad, FrameLoadCase, FrameLoadCombination } from "../types/structure.ts";
import { parseTextModelNumber, uniqueTextModelId } from "./text-model-utils.ts";

export interface FrameTextLoadCaseState {
  loadCases: FrameLoadCase[];
  loadCombinations: FrameLoadCombination[];
  seenLoadCases: Set<string>;
  seenLoadCombinations: Set<string>;
}

export interface FrameTextLoadCaseCommandContext {
  command: string;
  tokens: string[];
  lineNumber: number;
  state: FrameTextLoadCaseState;
  parseLoadTokens: (tokens: string[]) => FrameLoad | null;
  diagnostics: string[];
}

export interface FrameTextLoadCaseReferenceFilterResult {
  loadCases: FrameLoadCase[];
  loadCombinations: FrameLoadCombination[];
  hasIgnoredLoadCaseLoads: boolean;
  hasIgnoredCombinationFactors: boolean;
}

export function createFrameTextLoadCaseState(): FrameTextLoadCaseState {
  return {
    loadCases: [],
    loadCombinations: [],
    seenLoadCases: new Set(),
    seenLoadCombinations: new Set(),
  };
}

const toNumber = (value: string | undefined) => parseTextModelNumber(value, { stripParentheses: true });

export function applyFrameTextLoadCaseCommand(context: FrameTextLoadCaseCommandContext): boolean {
  const { command, tokens, lineNumber, state, parseLoadTokens, diagnostics } = context;

  if (command === "CASE" || command === "LCASE" || command === "LOADCASE") {
    const fallback = `LC${state.loadCases.length + 1}`;
    const id = uniqueTextModelId(String(tokens[1] ?? fallback).trim() || fallback, state.seenLoadCases);
    state.loadCases.push({
      id,
      title: tokens.slice(2).join(" ") || id,
      loads: [],
    });
    return true;
  }

  if (command === "CASELOAD" || command === "LCLOAD") {
    const caseId = String(tokens[1] ?? "").trim();
    const loadCase = state.loadCases.find((item) => item.id === caseId);
    if (!loadCase) {
      diagnostics.push(`第 ${lineNumber} 行：CASELOAD 引用了不存在的工况 ${caseId || "（空）"}。`);
      return true;
    }
    const load = parseLoadTokens(tokens.slice(2));
    if (!load) {
      diagnostics.push(`第 ${lineNumber} 行：CASELOAD 缺少有效的荷载定义。`);
      return true;
    }
    loadCase.loads = [...loadCase.loads, load];
    return true;
  }

  if (command === "COMB" || command === "COMBINATION") {
    const fallback = `COMB${state.loadCombinations.length + 1}`;
    const id = uniqueTextModelId(String(tokens[1] ?? fallback).trim() || fallback, state.seenLoadCombinations);
    const tagsToken = tokens.length >= 4 ? tokens[tokens.length - 1] : "";
    const tags = tagsToken
      ? tagsToken.split(/[|/；;]+/u).map((tag) => tag.trim()).filter(Boolean)
      : undefined;
    state.loadCombinations.push({
      id,
      title: tokens.length >= 4 ? tokens.slice(2, -1).join(" ") || id : tokens.slice(2).join(" ") || id,
      factors: {},
      tags,
    });
    return true;
  }

  if (command === "FACTOR" || command === "COMBFACTOR") {
    const combinationId = String(tokens[1] ?? "").trim();
    const loadCaseId = String(tokens[2] ?? "").trim();
    const combination = state.loadCombinations.find((item) => item.id === combinationId);
    if (!combination) {
      diagnostics.push(`第 ${lineNumber} 行：组合系数引用了不存在的组合 ${combinationId || "（空）"}。`);
      return true;
    }
    if (!loadCaseId) {
      diagnostics.push(`第 ${lineNumber} 行：组合系数缺少工况编号。`);
      return true;
    }
    combination.factors = {
      ...combination.factors,
      [loadCaseId]: toNumber(tokens[3]) ?? 0,
    };
    return true;
  }

  return false;
}

export function filterFrameTextLoadCaseReferences(
  loadCases: FrameLoadCase[],
  loadCombinations: FrameLoadCombination[],
  isLoadReferenceValid: (load: FrameLoad) => boolean,
): FrameTextLoadCaseReferenceFilterResult {
  const validLoadCases = loadCases.map((loadCase) => ({
    ...loadCase,
    loads: loadCase.loads.filter(isLoadReferenceValid),
  }));
  const validLoadCaseIds = new Set(validLoadCases.map((loadCase) => loadCase.id));
  const validLoadCombinations = loadCombinations.map((combination) => ({
    ...combination,
    factors: Object.fromEntries(
      Object.entries(combination.factors).filter(([caseId]) => validLoadCaseIds.has(caseId)),
    ),
  }));

  return {
    loadCases: validLoadCases,
    loadCombinations: validLoadCombinations,
    hasIgnoredLoadCaseLoads: validLoadCases.some((loadCase, index) => loadCase.loads.length !== loadCases[index]?.loads.length),
    hasIgnoredCombinationFactors: validLoadCombinations.some((combination, index) => Object.keys(combination.factors).length !== Object.keys(loadCombinations[index]?.factors ?? {}).length),
  };
}

export function frameTextLoadCaseLines(loadCases: FrameLoadCase[], serializeLoad: (load: FrameLoad) => string[]): string[] {
  return loadCases.flatMap((loadCase) => [
    `CASE,${loadCase.id},${loadCase.title}`,
    ...loadCase.loads.flatMap((load) => serializeLoad(load).map((line) => `CASELOAD,${loadCase.id},${line}`)),
  ]);
}

export function frameTextLoadCombinationLines(loadCombinations: FrameLoadCombination[]): string[] {
  return loadCombinations.flatMap((combination) => [
    `COMB,${combination.id},${combination.title},${(combination.tags ?? []).join("/")}`,
    ...Object.entries(combination.factors).map(([caseId, factor]) => `FACTOR,${combination.id},${caseId},${factor}`),
  ]);
}
