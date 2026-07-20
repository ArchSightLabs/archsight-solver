import type { AnalysisMode } from "../types/structure.ts";

import type { SolverDiagnosticSeverity } from "./generated/solver-contract.ts";

export type { SolverDiagnosticSeverity } from "./generated/solver-contract.ts";
export type SolverDiagnosticCategory = "input" | "reference" | "constraint" | "solver" | "result" | "system";

export interface SolverDiagnosticObjectRef {
  kind: string;
  id: string;
}

export interface SolverDiagnosticAction {
  id: string;
  label: string;
}

export interface SolverDiagnosticIssue {
  code: string;
  severity: SolverDiagnosticSeverity;
  category: SolverDiagnosticCategory;
  title: string;
  detail: string;
  suggestions: string[];
  analysisType: AnalysisMode | null;
  objectRefs: SolverDiagnosticObjectRef[];
  actions: SolverDiagnosticAction[];
}

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item ?? "").trim()).filter(Boolean)
    : [];
}

function normalizeAnalysisType(value: unknown): AnalysisMode | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (normalized === "beam" || normalized === "frame" || normalized === "truss") return normalized;
  return null;
}

export function normalizeSolverDiagnosticIssue(value: unknown): SolverDiagnosticIssue | null {
  const raw = recordOf(value);
  if (!raw) return null;
  const title = String(raw.title ?? raw.message ?? "").trim();
  const detail = String(raw.detail ?? raw.message ?? "").trim();
  if (!title && !detail) return null;
  const rawSeverity = String(raw.severity ?? "error");
  const severity: SolverDiagnosticSeverity = rawSeverity === "warning" || rawSeverity === "info" ? rawSeverity : "error";
  const rawCategory = String(raw.category ?? "input");
  const category: SolverDiagnosticCategory = ["reference", "constraint", "solver", "result", "system"].includes(rawCategory)
    ? rawCategory as SolverDiagnosticCategory
    : "input";
  const suggestions = stringList(raw.suggestions);
  const legacySuggestion = String(raw.suggestion ?? "").trim();
  if (!suggestions.length && legacySuggestion) suggestions.push(legacySuggestion);
  const objectRefs = Array.isArray(raw.objectRefs)
    ? raw.objectRefs.flatMap((item) => {
        const ref = recordOf(item);
        const kind = String(ref?.kind ?? "").trim();
        const id = String(ref?.id ?? "").trim();
        return kind && id ? [{ kind, id }] : [];
      })
    : [];
  const actions = Array.isArray(raw.actions)
    ? raw.actions.flatMap((item) => {
        const action = recordOf(item);
        const id = String(action?.id ?? "").trim();
        const label = String(action?.label ?? "").trim();
        return id && label ? [{ id, label }] : [];
      })
    : [];
  return {
    code: String(raw.code ?? "COMMON_DIAGNOSTIC").trim() || "COMMON_DIAGNOSTIC",
    severity,
    category,
    title: title || detail,
    detail: detail || title,
    suggestions,
    analysisType: normalizeAnalysisType(raw.analysisType),
    objectRefs,
    actions,
  };
}

export function normalizeSolverDiagnosticIssues(value: unknown): SolverDiagnosticIssue[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const issue = normalizeSolverDiagnosticIssue(item);
    return issue ? [issue] : [];
  });
}

export function solverDiagnosticIssueMessage(issue: SolverDiagnosticIssue): string {
  const suggestion = issue.suggestions[0];
  return `${issue.title}：${issue.detail}${suggestion ? ` 建议：${suggestion}` : ""}`;
}
