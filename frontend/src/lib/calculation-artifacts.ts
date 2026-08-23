import type {
  AnalysisMode,
  CalculationCriticalPoint,
  CalculationGoverningEnvelopeItem,
  CalculationReviewPoint,
  CalculationSnapshot,
  CalculationSnapshotComparison,
  CalculationSnapshotComparisonRow,
  CalculationTraceEntry,
} from "../types/structure.ts";

const DEFAULT_TEXT = "—";
export const MAX_CALCULATION_TRACE_ENTRIES = 48;
export const MAX_CRITICAL_POINTS = 48;
export const MAX_REVIEW_POINTS = 32;
export const MAX_GOVERNING_ENVELOPE_ITEMS = 48;
export const MAX_SNAPSHOTS_PER_OBJECT = 12;
export const MAX_SNAPSHOT_BYTES = 180_000;
export const MAX_SNAPSHOT_COLLECTION_BYTES = 600_000;

type RecordLike = Record<string, unknown>;
type SnapshotLike = Partial<CalculationSnapshot> & RecordLike;
const COLLECTION_KEYS = ["entries", "items", "trace", "stages", "steps", "timeline", "records", "events", "points"] as const;

const TRACE_STAGE_TITLES: Record<string, string> = {
  input_normalized: "输入规范化",
  dof_mapping: "自由度映射",
  element_process: "单元过程",
  global_assembly: "整体装配",
  boundary_reduction: "边界约化",
  solver_diagnostics: "求解诊断",
  result_recovery: "结果恢复",
  equilibrium_check: "平衡校核",
  evidence_projection: "审查证据投影",
};

const CRITICAL_POINT_TITLES: Record<string, string> = {
  endpoint: "端点",
  support: "支座",
  jump: "跳变",
  zero: "零点",
  local_max: "局部最大值",
  local_min: "局部最小值",
  absolute: "绝对控制值",
  control: "控制值",
  node: "节点值",
  query: "查询点",
  review: "用户复核点",
};

const METRIC_TITLES: Record<string, string> = {
  deflection: "挠度",
  moment: "弯矩",
  shear: "剪力",
  axial: "轴力",
  ux: "X 向位移",
  uy: "Y 向位移",
  resultant: "合位移",
  reactionFx: "X 向反力",
  reactionFy: "Y 向反力",
  reactionMz: "约束弯矩",
};

function isRecord(value: unknown): value is RecordLike {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function collectionFrom(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of COLLECTION_KEYS) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }
  return [];
}

function normalizeId(value: unknown, fallback: string): string {
  const candidate = String(value ?? "").trim();
  return candidate || fallback;
}

function normalizeText(value: unknown, fallback = DEFAULT_TEXT): string {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function safeNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function textEncoderLength(value: string): number {
  try {
    return new globalThis.TextEncoder().encode(value).length;
  } catch {
    return value.length;
  }
}

function serializedByteSize(value: unknown): number {
  try {
    return textEncoderLength(JSON.stringify(value));
  } catch {
    return 0;
  }
}

function summarizeTracePayload(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value)
    .filter(([, item]) => item !== null && item !== undefined && item !== "")
    .slice(0, 8)
    .map(([key, item]) => {
      if (Array.isArray(item)) return `${key}=${item.length} 项`;
      if (isRecord(item)) {
        const nested = Object.entries(item)
          .filter(([, nestedItem]) => nestedItem !== null && nestedItem !== undefined && nestedItem !== "")
          .slice(0, 4)
          .map(([nestedKey, nestedItem]) => `${nestedKey}:${String(nestedItem)}`)
          .join(", ");
        return nested ? `${key}={${nested}}` : "";
      }
      return `${key}=${String(item)}`;
    })
    .filter(Boolean);
  return entries.length > 0 ? entries.join(" · ") : undefined;
}

function cloneSnapshot(snapshot: CalculationSnapshot): CalculationSnapshot {
  const next: CalculationSnapshot = {
    ...snapshot,
    summary: { ...snapshot.summary },
    trace: snapshot.trace.map((entry) => ({ ...entry })),
    criticalPoints: snapshot.criticalPoints.map((point) => ({ ...point })),
    reviewPoints: snapshot.reviewPoints.map((point) => ({ ...point })),
    governingEnvelope: snapshot.governingEnvelope.map((item) => ({ ...item })),
    meta: snapshot.meta ? { ...snapshot.meta } : undefined,
    sourceMeta: snapshot.sourceMeta ? { ...snapshot.sourceMeta } : undefined,
  };
  next.byteSize = serializedByteSize(next);
  return next;
}

function normalizeTraceEntries(rawTrace: unknown): CalculationTraceEntry[] {
  return collectionFrom(rawTrace).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const stage = normalizeText(item.stage ?? item.phase ?? item.kind, "步骤");
    const summary = isRecord(item.summary) ? item.summary : undefined;
    return [{
      stage,
      title: normalizeText(item.title ?? item.label, TRACE_STAGE_TITLES[stage] ?? `步骤 ${index + 1}`),
      detail: String(item.detail ?? item.message ?? item.note ?? "").trim() || summarizeTracePayload(summary),
      status: String(item.status ?? summary?.status ?? summary?.availability ?? "").trim() || undefined,
      step: safeNumber(item.step),
      iteration: safeNumber(item.iteration),
      residual: safeNumber(item.residual ?? item.residualNorm ?? item.equilibriumResidual ?? summary?.maxResidualN ?? summary?.rmsRelativeError),
      value: safeNumber(item.value ?? item.displacementMm ?? item.maxDisplacementMm),
      unit: String(item.unit ?? "").trim() || undefined,
      sourceId: String(item.sourceId ?? item.memberId ?? item.nodeId ?? "").trim() || undefined,
    }];
  });
}

function normalizeCriticalPointEntries(rawPoints: unknown): CalculationCriticalPoint[] {
  return collectionFrom(rawPoints).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const kind = normalizeText(item.kind ?? item.type, "critical");
    const metricKey = String(item.metricKey ?? item.metric ?? "").trim() || undefined;
    return [{
      id: normalizeId(item.id ?? item.key ?? item.sourceId, `critical-${index + 1}`),
      kind,
      label: normalizeText(item.label ?? item.title, CRITICAL_POINT_TITLES[kind] ?? `关键点 ${index + 1}`),
      metricKey,
      value: safeNumber(item.value ?? item.magnitude ?? item.extremeValue),
      unit: String(item.unit ?? "").trim() || undefined,
      station: safeNumber(item.station ?? item.stationM ?? item.positionM ?? item.x),
      sourceType: String(item.sourceType ?? "").trim() || undefined,
      sourceId: String(item.sourceId ?? item.memberId ?? item.nodeId ?? "").trim() || undefined,
      objectId: String(item.objectId ?? item.memberId ?? item.nodeId ?? "").trim() || undefined,
      side: String(item.side ?? "").trim() || undefined,
    }];
  });
}

function normalizeReviewPointEntries(rawPoints: unknown): CalculationReviewPoint[] {
  return collectionFrom(rawPoints).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const targetType = String(item.targetType ?? item.object ?? item.scope ?? "").trim();
    return [{
      id: normalizeId(item.id ?? item.key ?? item.sourceId, `review-${index + 1}`),
      kind: normalizeText(item.kind ?? item.type, "custom"),
      targetType: targetType === "member" ? "member" : targetType === "station" ? "station" : "node",
      label: normalizeText(item.label ?? item.title ?? item.kind, `复核点 ${index + 1}`),
      targetId: String(item.targetId ?? item.objectId ?? item.memberId ?? item.nodeId ?? "").trim() || undefined,
      metricKey: String(item.metricKey ?? item.metric ?? "").trim() || undefined,
      station: safeNumber(item.station ?? item.stationM ?? item.positionM),
      side: String(item.side ?? "").trim() || undefined,
      note: String(item.note ?? item.description ?? "").trim() || undefined,
    }];
  });
}

function normalizeEnvelopeEntries(rawEnvelope: unknown): CalculationGoverningEnvelopeItem[] {
  return collectionFrom(rawEnvelope).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const metricKey = normalizeText(item.metricKey ?? item.metric ?? item.name, `metric-${index + 1}`);
    const kind = String(item.kind ?? "").trim() || undefined;
    return [{
      id: normalizeId(item.id ?? item.key ?? item.metricKey, `envelope-${index + 1}`),
      metricKey,
      label: normalizeText(item.label ?? item.title, `${METRIC_TITLES[metricKey] ?? metricKey} ${kind ?? "控制值"}`),
      value: safeNumber(item.value ?? item.governingValue ?? item.controlValue),
      absoluteValue: safeNumber(item.absoluteValue ?? item.absValue ?? item.absolute),
      relativeValue: safeNumber(item.relativeValue ?? item.relValue ?? item.ratio),
      unit: String(item.unit ?? "").trim() || undefined,
      sourceType: String(item.sourceType ?? "").trim() || undefined,
      sourceId: String(item.sourceId ?? item.memberId ?? item.nodeId ?? "").trim() || undefined,
      sourceLabel: String(item.sourceLabel ?? item.sourceName ?? "").trim() || undefined,
      side: String(item.side ?? "").trim() || undefined,
      sourceHash: String(item.sourceHash ?? item.resultHash ?? "").trim() || undefined,
      objectId: String(item.objectId ?? item.memberId ?? item.nodeId ?? "").trim() || undefined,
      station: safeNumber(item.station ?? item.stationM ?? item.positionM),
      scope: String(item.scope ?? "").trim() || undefined,
      kind,
    }];
  });
}

export function normalizeCalculationTrace(rawTrace: unknown): CalculationTraceEntry[] {
  return normalizeTraceEntries(rawTrace);
}

export function normalizeCriticalPoints(rawPoints: unknown): CalculationCriticalPoint[] {
  return normalizeCriticalPointEntries(rawPoints);
}

export function normalizeReviewPoints(rawPoints: unknown): CalculationReviewPoint[] {
  return normalizeReviewPointEntries(rawPoints);
}

export function normalizeGoverningEnvelope(rawEnvelope: unknown): CalculationGoverningEnvelopeItem[] {
  return normalizeEnvelopeEntries(rawEnvelope);
}

export function normalizeCalculationSnapshot(rawSnapshot: unknown, analysisMode: AnalysisMode, fallbackName = "最新结果"): CalculationSnapshot {
  const raw = isRecord(rawSnapshot) ? (rawSnapshot as SnapshotLike) : {};
  const trace = normalizeCalculationTrace(raw.trace ?? raw.calculationTrace ?? raw.steps ?? raw.timeline);
  const criticalPoints = normalizeCriticalPoints(raw.criticalPoints ?? raw.keyPoints ?? raw.calculationPoints);
  const reviewPoints = normalizeReviewPoints(raw.reviewPoints ?? raw.reviewPointsSnapshot);
  const governingEnvelope = normalizeGoverningEnvelope(raw.governingEnvelope ?? raw.envelope ?? raw.controlEnvelope);
  const summary = isRecord(raw.summary) ? { ...raw.summary } : {};
  const sourceMeta = isRecord(raw.sourceMeta) ? { ...raw.sourceMeta } : undefined;
  const createdAt = normalizeText(raw.createdAt, "1970-01-01T00:00:00.000Z");
  const requestHash = normalizeText(raw.requestHash ?? sourceMeta?.requestHash, "");
  const modelHash = normalizeText(raw.modelHash ?? sourceMeta?.modelHash, "");
  const resultHash = normalizeText(raw.resultHash ?? sourceMeta?.resultHash, "");
  const snapshot: CalculationSnapshot = {
    id: normalizeId(raw.id ?? raw.snapshotId ?? raw.key ?? resultHash, `snapshot-${createdAt}`),
    name: normalizeText(raw.name ?? raw.title, fallbackName),
    analysisMode: raw.analysisMode === "frame" || raw.analysisMode === "truss" || raw.analysisMode === "beam" ? raw.analysisMode : analysisMode,
    createdAt,
    schemaVersion: normalizeText(raw.schema ?? raw.schemaVersion, "CalculationSnapshot@1"),
    canonicalHash: resultHash || undefined,
    requestHash: requestHash || undefined,
    modelHash: modelHash || undefined,
    resultHash: resultHash || undefined,
    summary,
    trace,
    criticalPoints,
    reviewPoints,
    governingEnvelope,
    byteSize: 0,
    ...(isRecord(raw.meta) ? { meta: { ...raw.meta } } : {}),
    ...(sourceMeta ? { sourceMeta } : {}),
    ...(raw.note ? { note: String(raw.note) } : {}),
  };
  snapshot.byteSize = serializedByteSize(snapshot);
  return snapshot;
}

export function normalizeCalculationSnapshotCollection(rawSnapshots: unknown, analysisMode: AnalysisMode): CalculationSnapshot[] {
  return collectionFrom(rawSnapshots)
    .flatMap((snapshot) => [cloneSnapshot(normalizeCalculationSnapshot(snapshot, analysisMode))])
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_SNAPSHOTS_PER_OBJECT);
}

export function createCalculationSnapshotFromResult(input: {
  analysisMode: AnalysisMode;
  result: RecordLike;
  name?: string;
  createdAt?: string;
}): CalculationSnapshot {
  const envelope = isRecord(input.result.apiEnvelope) ? input.result.apiEnvelope as RecordLike : null;
  const results = isRecord(envelope?.results) ? envelope.results : null;
  const snapshotSource = input.result.calculationSnapshot ?? results?.calculationSnapshot ?? envelope?.calculationSnapshot;
  if (snapshotSource) {
    const canonical = isRecord(snapshotSource) ? snapshotSource : {};
    const envelopeMeta = isRecord(envelope?.meta) ? envelope.meta : {};
    return normalizeCalculationSnapshot(
      {
        ...canonical,
        analysisMode: input.analysisMode,
        name: input.name ?? canonical.name,
        createdAt: input.createdAt ?? canonical.createdAt ?? envelopeMeta.generatedAt ?? input.result.createdAt ?? input.result.solvedAt,
        requestHash: canonical.requestHash ?? envelopeMeta.requestHash,
        modelHash: canonical.modelHash ?? envelopeMeta.modelHash,
        resultHash: canonical.resultHash ?? envelope?.resultHash ?? results?.resultHash,
        trace: Array.isArray(canonical.trace) && canonical.trace.length > 0
          ? canonical.trace
          : input.result.calculationTrace ?? results?.calculationTrace ?? envelope?.calculationTrace,
        criticalPoints: Array.isArray(canonical.criticalPoints) && canonical.criticalPoints.length > 0
          ? canonical.criticalPoints
          : input.result.criticalPoints ?? results?.criticalPoints ?? envelope?.criticalPoints,
        reviewPoints: Array.isArray(canonical.reviewPoints) && canonical.reviewPoints.length > 0
          ? canonical.reviewPoints
          : input.result.reviewPoints ?? results?.reviewPoints ?? envelope?.reviewPoints,
        governingEnvelope: Array.isArray(canonical.governingEnvelope) && canonical.governingEnvelope.length > 0
          ? canonical.governingEnvelope
          : input.result.governingEnvelope ?? results?.governingEnvelope ?? envelope?.governingEnvelope,
        sourceMeta: envelopeMeta,
        note: input.result.note,
      },
      input.analysisMode,
      input.name ?? "最新结果",
    );
  }

  const summary = isRecord(results?.summary) ? { ...results.summary } : isRecord(input.result.summary) ? { ...input.result.summary } : {};
  return normalizeCalculationSnapshot({
    id: input.result.id ?? input.result.snapshotId,
    name: input.name ?? input.result.name ?? input.result.title,
    createdAt: input.createdAt ?? String(input.result.createdAt ?? input.result.solvedAt ?? ""),
    analysisMode: input.analysisMode,
    summary,
    trace: input.result.calculationTrace ?? results?.calculationTrace ?? results?.trace,
    criticalPoints: input.result.criticalPoints ?? results?.criticalPoints,
    reviewPoints: input.result.reviewPoints ?? results?.reviewPoints,
    governingEnvelope: input.result.governingEnvelope ?? results?.governingEnvelope,
    meta: input.result.meta ?? results?.meta,
    sourceMeta: envelope?.meta ?? input.result.sourceMeta,
    note: input.result.note,
  }, input.analysisMode, input.name ?? "最新结果");
}

export function measureCalculationSnapshotBytes(snapshot: CalculationSnapshot): number {
  return serializedByteSize(snapshot);
}

function summarizeEnvelopeItem(item: CalculationGoverningEnvelopeItem | undefined): string {
  if (!item) return DEFAULT_TEXT;
  const segments = [item.sourceType, item.sourceLabel, item.sourceId, item.side, item.sourceHash]
    .map((segment) => String(segment ?? "").trim())
    .filter(Boolean);
  return segments.length > 0 ? segments.join(" · ") : item.metricKey;
}

function comparisonRelativeDiff(leftValue: number | null, rightValue: number | null): { relDiff: number | null; reason?: string } {
  if (leftValue === null || rightValue === null) {
    return { relDiff: null, reason: "缺少一侧基线，无法计算相对差" };
  }
  if (Math.abs(leftValue) <= 1e-9) {
    return { relDiff: null, reason: "左侧基线为 0，无法计算相对差" };
  }
  return { relDiff: (rightValue - leftValue) / Math.abs(leftValue) };
}

function pushNumericRow(rows: CalculationSnapshotComparisonRow[], row: Omit<CalculationSnapshotComparisonRow, "kind">) {
  rows.push({ ...row, kind: "number" });
}

function pushTextRow(rows: CalculationSnapshotComparisonRow[], row: Omit<CalculationSnapshotComparisonRow, "kind">) {
  rows.push({ ...row, kind: "text" });
}

export function appendCalculationSnapshot(
  snapshots: CalculationSnapshot[] | undefined,
  snapshot: CalculationSnapshot,
  desiredName?: string,
): CalculationSnapshot[] {
  const clonedCandidate = cloneSnapshot(snapshot);
  if (!clonedCandidate.canonicalHash || clonedCandidate.byteSize > MAX_SNAPSHOT_BYTES) {
    return (snapshots ?? []).map((item) => cloneSnapshot(item));
  }
  const existing = (snapshots ?? [])
    .filter((item) => item.canonicalHash !== clonedCandidate.canonicalHash)
    .map((item) => cloneSnapshot(item));
  const baseName = normalizeText(desiredName ?? snapshot.name, snapshot.name);
  const existingNames = new Set(existing.map((item) => item.name));
  let name = baseName;
  let suffix = 2;
  while (existingNames.has(name)) {
    name = `${baseName} ${suffix}`;
    suffix += 1;
  }
  const nextSnapshot = cloneSnapshot({ ...clonedCandidate, name });
  const next = [nextSnapshot, ...existing]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, MAX_SNAPSHOTS_PER_OBJECT);
  let totalBytes = next.reduce((sum, item) => sum + item.byteSize, 0);
  while (totalBytes > MAX_SNAPSHOT_COLLECTION_BYTES && next.length > 1) {
    const removed = next.pop();
    totalBytes -= removed?.byteSize ?? 0;
  }
  return next;
}

export function compareCalculationSnapshots(left: CalculationSnapshot, right: CalculationSnapshot): CalculationSnapshotComparison {
  const rows: CalculationSnapshotComparisonRow[] = [];
  const leftSummary = left.summary ?? {};
  const rightSummary = right.summary ?? {};
  const summaryKeys = new Set<string>([
    ...Object.keys(leftSummary),
    ...Object.keys(rightSummary),
    "maxDeflectionMm",
    "maxDisplacementMm",
    "maxVerticalMm",
    "maxRotationDeg",
    "maxMomentKnM",
    "maxAxialForceKn",
    "allowableMm",
    "allowableRatio",
  ]);

  for (const key of summaryKeys) {
    const leftValue = safeNumber(leftSummary[key]);
    const rightValue = safeNumber(rightSummary[key]);
    if (leftValue === null && rightValue === null) {
      continue;
    }
    const absDiff = leftValue !== null && rightValue !== null ? rightValue - leftValue : null;
    const relative = comparisonRelativeDiff(leftValue, rightValue);
    pushNumericRow(rows, {
      key,
      label: String(key),
      left: leftValue,
      right: rightValue,
      absDiff,
      relDiff: relative.relDiff,
      reason: relative.reason,
    });
  }

  const countRows: Array<[string, string, number, number]> = [
    ["traceCount", "计算过程步数", left.trace.length, right.trace.length],
    ["criticalPointCount", "关键点数量", left.criticalPoints.length, right.criticalPoints.length],
    ["reviewPointCount", "复核点数量", left.reviewPoints.length, right.reviewPoints.length],
    ["governingEnvelopeCount", "控制来源数量", left.governingEnvelope.length, right.governingEnvelope.length],
  ];
  for (const [key, label, leftValue, rightValue] of countRows) {
    const relative = comparisonRelativeDiff(leftValue, rightValue);
    pushNumericRow(rows, {
      key,
      label,
      left: leftValue,
      right: rightValue,
      absDiff: rightValue - leftValue,
      relDiff: relative.relDiff,
      reason: relative.reason,
    });
  }

  const envelopeByKey = new Map<string, { left?: CalculationGoverningEnvelopeItem; right?: CalculationGoverningEnvelopeItem }>();
  for (const item of left.governingEnvelope) {
    const key = `${item.metricKey}::${item.sourceType ?? ""}::${item.sourceId ?? ""}::${item.side ?? ""}`;
    envelopeByKey.set(key, { ...(envelopeByKey.get(key) ?? {}), left: item });
  }
  for (const item of right.governingEnvelope) {
    const key = `${item.metricKey}::${item.sourceType ?? ""}::${item.sourceId ?? ""}::${item.side ?? ""}`;
    envelopeByKey.set(key, { ...(envelopeByKey.get(key) ?? {}), right: item });
  }

  for (const [key, pair] of envelopeByKey.entries()) {
    const leftItem = pair.left;
    const rightItem = pair.right;
    const leftValue = leftItem ? leftItem.value ?? leftItem.absoluteValue ?? null : null;
    const rightValue = rightItem ? rightItem.value ?? rightItem.absoluteValue ?? null : null;
    const relative = comparisonRelativeDiff(leftValue, rightValue);
    const sourceChanged =
      (leftItem?.sourceType ?? "") !== (rightItem?.sourceType ?? "") ||
      (leftItem?.sourceId ?? "") !== (rightItem?.sourceId ?? "") ||
      (leftItem?.sourceLabel ?? "") !== (rightItem?.sourceLabel ?? "") ||
      (leftItem?.side ?? "") !== (rightItem?.side ?? "");
    const hashChanged = (leftItem?.sourceHash ?? "") !== (rightItem?.sourceHash ?? "");
    const textChanged = summarizeEnvelopeItem(leftItem) !== summarizeEnvelopeItem(rightItem);
    const reasons = [
      !leftItem || !rightItem ? "控制来源缺失" : undefined,
      sourceChanged ? "控制来源变化" : undefined,
      hashChanged ? "控制哈希变化" : undefined,
      textChanged ? "控制文本变化" : undefined,
      relative.reason,
    ].filter(Boolean);
    pushTextRow(rows, {
      key: `governing:${key}`,
      label: rightItem?.label ?? leftItem?.label ?? key,
      left: leftValue,
      right: rightValue,
      absDiff: leftValue !== null && rightValue !== null ? rightValue - leftValue : null,
      relDiff: relative.relDiff,
      unit: rightItem?.unit ?? leftItem?.unit,
      reason: reasons.length > 0 ? reasons.join("；") : undefined,
      leftText: summarizeEnvelopeItem(leftItem),
      rightText: summarizeEnvelopeItem(rightItem),
    });
  }

  const notes: string[] = [];
  if (!rows.length) {
    notes.push("两个快照没有可比较的字段。");
  }
  if (left.byteSize > MAX_SNAPSHOT_BYTES || right.byteSize > MAX_SNAPSHOT_BYTES) {
    notes.push("至少一个快照已接近或超过建议体积上限，比较时应优先看摘要和控制来源差异。");
  }

  return {
    left,
    right,
    rows,
    notes,
    comparable: rows.length > 0,
  };
}
