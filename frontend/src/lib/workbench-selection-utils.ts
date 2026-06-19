import type { AnalysisMode } from "../types/structure.ts";
import type { WorkbenchSelection } from "../types/workbench-selection.ts";

export function workbenchSelectionKey(selection: WorkbenchSelection): string {
  return `${selection.mode}:${selection.type}:${selection.id}`;
}

export function sameWorkbenchSelection(left: WorkbenchSelection | null | undefined, right: WorkbenchSelection | null | undefined): boolean {
  return Boolean(left && right && workbenchSelectionKey(left) === workbenchSelectionKey(right));
}

export function uniqueWorkbenchSelections(selections: WorkbenchSelection[]): WorkbenchSelection[] {
  const seen = new Set<string>();
  const next: WorkbenchSelection[] = [];
  for (const selection of selections) {
    const key = workbenchSelectionKey(selection);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(selection);
  }
  return next;
}

export function selectionSetContains(selections: WorkbenchSelection[] | null | undefined, selection: WorkbenchSelection): boolean {
  return Boolean(selections?.some((item) => sameWorkbenchSelection(item, selection)));
}

export function toggleWorkbenchSelection(selections: WorkbenchSelection[], selection: WorkbenchSelection): WorkbenchSelection[] {
  if (selectionSetContains(selections, selection)) {
    return selections.filter((item) => !sameWorkbenchSelection(item, selection));
  }
  return uniqueWorkbenchSelections([...selections, selection]);
}

export function filterSelectionSetForMode(selections: WorkbenchSelection[], mode: AnalysisMode): WorkbenchSelection[] {
  return selections.filter((selection) => selection.mode === mode);
}

export function replaceSelectionSetForMode(
  current: WorkbenchSelection[],
  mode: AnalysisMode,
  nextForMode: WorkbenchSelection[],
): WorkbenchSelection[] {
  return [
    ...current.filter((selection) => selection.mode !== mode),
    ...uniqueWorkbenchSelections(nextForMode.filter((selection) => selection.mode === mode)),
  ];
}

export function primarySelectionForMode(
  primary: WorkbenchSelection | null,
  selections: WorkbenchSelection[],
  mode: AnalysisMode,
): WorkbenchSelection | null {
  if (primary?.mode === mode) return primary;
  const scoped = filterSelectionSetForMode(selections, mode);
  return scoped.at(-1) ?? null;
}

export function workbenchSelectionFromCanvasDataset(dataset: globalThis.DOMStringMap): WorkbenchSelection | null {
  const mode = dataset.canvasMode;
  const type = dataset.canvasType;
  const id = dataset.canvasId;
  if (!mode || !type || !id) return null;

  if (mode === "beam") {
    if (type === "span" || type === "support" || type === "node") return { mode, type, id };
    if (type === "load" && id === "primary") return { mode, type, id };
    if ((type === "loadCases" || type === "loadCombinations") && id === "all") return { mode, type, id };
    if (type === "label") return { mode, type, id };
    return null;
  }
  if (mode === "frame") {
    if (type === "node" || type === "member" || type === "load") return { mode, type, id };
    if (type === "label") return { mode, type, id };
    if ((type === "loadCases" || type === "loadCombinations") && id === "all") return { mode, type, id };
    return null;
  }
  if (mode === "truss") {
    if (type === "node" || type === "member" || type === "load") return { mode, type, id };
    if ((type === "loadCases" || type === "loadCombinations") && id === "all") return { mode, type, id };
    if (type === "label") return { mode, type, id };
  }
  return null;
}
