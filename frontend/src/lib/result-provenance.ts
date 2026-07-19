import type { AnalysisMode } from "../types/structure.ts";

export const RESULT_PROVENANCE_SCHEMA_VERSION = "1.0.0";

export interface ResultProvenance {
  schemaVersion: typeof RESULT_PROVENANCE_SCHEMA_VERSION;
  analysisObjectId: string;
  analysisType: AnalysisMode;
  projectRevision: number;
  modelSignature: string;
  modelHash: string | null;
  requestHash: string | null;
  solvedAt: string;
  payload: Record<string, unknown>;
}

export type ResultValidityStatus = "missing" | "current" | "stale" | "unverifiable";
export type ResultInvalidReason = "no-results" | "missing-provenance" | "analysis-object-changed" | "analysis-mode-changed" | "model-changed" | "invalid-current-model" | null;

export interface ResultValidity {
  status: ResultValidityStatus;
  reason: ResultInvalidReason;
  message: string;
}

const ROOT_METADATA_KEYS = new Set([
  "projectName",
  "format",
  "jobId",
  "benchmark",
  "reportImages",
  "reportOptions",
  "resultProvenance",
  "resultSource",
  "sensitivityResults",
]);

function recordOf(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function canonicalize(value: unknown, depth = 0): unknown {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, depth + 1));
  const record = recordOf(value);
  if (!record) return value;
  return Object.fromEntries(
    Object.keys(record)
      .filter((key) => record[key] !== undefined && !(depth === 0 && ROOT_METADATA_KEYS.has(key)))
      .sort()
      .map((key) => [key, canonicalize(record[key], depth + 1)]),
  );
}

function fnv1a64(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function modelPayloadSignature(payload: Record<string, unknown>): string {
  return `fnv1a64:${fnv1a64(JSON.stringify(canonicalize(payload)))}`;
}

function resultMeta(result: unknown): Record<string, unknown> {
  const raw = recordOf(result);
  const envelope = recordOf(raw?.apiEnvelope);
  return recordOf(envelope?.meta) ?? recordOf(raw?.meta) ?? {};
}

export function createResultProvenance(input: {
  analysisObjectId: string;
  analysisType: AnalysisMode;
  payload: Record<string, unknown>;
  projectRevision: number;
  solvedAt?: string;
  result?: unknown;
}): ResultProvenance {
  const meta = resultMeta(input.result);
  return {
    schemaVersion: RESULT_PROVENANCE_SCHEMA_VERSION,
    analysisObjectId: input.analysisObjectId,
    analysisType: input.analysisType,
    projectRevision: Math.max(0, Math.trunc(input.projectRevision)),
    modelSignature: modelPayloadSignature(input.payload),
    modelHash: String(meta.modelHash ?? "").trim() || null,
    requestHash: String(meta.requestHash ?? "").trim() || null,
    solvedAt: input.solvedAt ?? new Date().toISOString(),
    payload: input.payload,
  };
}

export function normalizeResultProvenance(value: unknown): ResultProvenance | null {
  const raw = recordOf(value);
  const payload = recordOf(raw?.payload);
  const analysisObjectId = String(raw?.analysisObjectId ?? "").trim();
  const analysisType = raw?.analysisType;
  if (!payload || !analysisObjectId || (analysisType !== "beam" && analysisType !== "frame" && analysisType !== "truss")) return null;
  return {
    schemaVersion: RESULT_PROVENANCE_SCHEMA_VERSION,
    analysisObjectId,
    analysisType,
    projectRevision: Math.max(0, Math.trunc(Number(raw?.projectRevision) || 0)),
    modelSignature: modelPayloadSignature(payload),
    modelHash: String(raw?.modelHash ?? "").trim() || null,
    requestHash: String(raw?.requestHash ?? "").trim() || null,
    solvedAt: String(raw?.solvedAt ?? "").trim(),
    payload,
  };
}

export function evaluateResultValidity(input: {
  hasResults: boolean;
  analysisObjectId: string;
  analysisType: AnalysisMode;
  currentPayload: Record<string, unknown> | null;
  provenance: ResultProvenance | null;
}): ResultValidity {
  if (!input.hasResults) return { status: "missing", reason: "no-results", message: "当前分析对象尚无计算结果。" };
  if (!input.provenance) return { status: "unverifiable", reason: "missing-provenance", message: "现有结果缺少模型来源证据，请重新计算后再导出。" };
  if (input.provenance.analysisObjectId !== input.analysisObjectId) return { status: "stale", reason: "analysis-object-changed", message: "结果不属于当前分析对象，请重新计算。" };
  if (input.provenance.analysisType !== input.analysisType) return { status: "stale", reason: "analysis-mode-changed", message: "结果的结构体系与当前分析对象不一致，请重新计算。" };
  if (!input.currentPayload) return { status: "stale", reason: "invalid-current-model", message: "当前模型无法形成有效求解输入，旧结果已失效。" };
  if (input.provenance.modelSignature !== modelPayloadSignature(input.currentPayload)) return { status: "stale", reason: "model-changed", message: "影响计算的模型参数已修改，旧结果已失效，请重新计算。" };
  return { status: "current", reason: null, message: "结果与当前分析对象和模型签名一致。" };
}
