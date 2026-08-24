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

export function calculationTechnicalText(value: string): string {
  return value
    .replace(/Euler-Bernoulli 梁理论/gu, "欧拉–伯努利梁理论")
    .replace(/Timoshenko 梁理论/gu, "铁木辛柯梁理论")
    .replace(/共回转全 Newton/gu, "共回转全量牛顿法")
    .replace(/共回转 Newton/gu, "共回转牛顿法")
    .replace(/Euler-Bernoulli/gu, "欧拉–伯努利")
    .replace(/Timoshenko/gu, "铁木辛柯")
    .replace(/P-Delta/gu, "P-Δ")
    .replace(/Newton/gu, "牛顿");
}

function readableChineseValue(value: string, fallback: string): string {
  const localized = calculationTechnicalText(value);
  return /[\u3400-\u9fff]/u.test(localized) ? localized : fallback;
}

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
  allowableMm: "允许位移",
  allowableRatio: "允许挠跨比",
  deflection: "挠度",
  deflectionMm: "挠度",
  maxDeflectionMm: "最大挠度",
  maxDeflectionPositionM: "最大挠度位置",
  moment: "弯矩",
  momentKnM: "弯矩",
  maxMomentKnM: "最大弯矩",
  shear: "剪力",
  shearKn: "剪力",
  maxShearKn: "最大剪力",
  axial: "轴力",
  axialKn: "轴力",
  axialForceKn: "轴力",
  maxAxialKn: "最大轴力",
  maxAxialForceKn: "最大轴力",
  displacement: "位移",
  displacementMm: "位移",
  maxDisplacementMm: "最大位移",
  max_displacement_mm: "最大位移",
  maxVerticalMm: "最大竖向位移",
  rotationDeg: "转角",
  maxRotationDeg: "最大转角",
  ux: "X 向位移",
  uxMm: "X 向位移",
  uy: "Y 向位移",
  uyMm: "Y 向位移",
  resultant: "合位移",
  resultantMm: "合位移",
  reactionFx: "X 向反力",
  reactionFxKn: "X 向反力",
  reactionFy: "Y 向反力",
  reactionFyKn: "Y 向反力",
  reactionMz: "约束弯矩",
  reactionMzKnM: "约束弯矩",
  criticalLoadFactor: "临界荷载因子",
  critical_load_factor: "临界荷载因子",
  secondOrderAmplificationFactor: "二阶放大系数",
  second_order_amplification_factor: "二阶放大系数",
};

const METRIC_UNITS: Record<string, string> = {
  allowableMm: "mm",
  deflectionMm: "mm",
  maxDeflectionMm: "mm",
  maxDeflectionPositionM: "m",
  displacementMm: "mm",
  maxDisplacementMm: "mm",
  max_displacement_mm: "mm",
  maxVerticalMm: "mm",
  momentKnM: "kN·m",
  maxMomentKnM: "kN·m",
  shearKn: "kN",
  maxShearKn: "kN",
  axialKn: "kN",
  axialForceKn: "kN",
  maxAxialKn: "kN",
  maxAxialForceKn: "kN",
  rotationDeg: "°",
  maxRotationDeg: "°",
};

const CRITICAL_POINT_KIND_TITLES: Record<string, string> = {
  ...CRITICAL_POINT_TITLES,
  critical: "关键点",
  end: "端点",
  local_extreme: "局部极值",
  "local-extreme": "局部极值",
  global_extreme: "全局极值",
  "global-extreme": "全局极值",
  zero_crossing: "过零点",
  "zero-crossing": "过零点",
  jump_left: "跳变左侧",
  "jump-left": "跳变左侧",
  jump_right: "跳变右侧",
  "jump-right": "跳变右侧",
  "station-check": "截面复核点",
  "node-check": "节点复核点",
  "member-check": "构件复核点",
  member: "构件结果",
};

const SOURCE_TYPE_TITLES: Record<string, string> = {
  main: "主结果",
  primary: "主结果",
  beam: "梁系",
  frame: "平面框架",
  truss: "平面桁架",
  member: "构件",
  node: "节点",
  station: "截面",
  case: "荷载工况",
  "load-case": "荷载工况",
  combination: "荷载组合",
  "load-combination": "荷载组合",
  system: "系统识别",
  request: "用户复核",
  legacy: "历史结果",
};

const SOURCE_LABEL_TITLES: Record<string, string> = {
  main: "基本结果",
  primary: "基本结果",
  __primary__: "基本结果",
  envelope: "包络结果",
  comparison: "对比结果",
};

const SIDE_TITLES: Record<string, string> = {
  exact: "精确位置",
  absolute: "绝对控制位置",
  left: "左侧",
  right: "右侧",
  top: "上侧",
  bottom: "下侧",
  upper: "上侧",
  lower: "下侧",
  上: "上侧",
  下: "下侧",
  jump_left: "跳变左侧",
  jump_right: "跳变右侧",
};

const TRACE_SUMMARY_TITLES: Record<string, string> = {
  nodeCount: "节点数",
  globalDofCount: "总自由度数",
  freeDofCount: "未约束自由度数",
  fixedDofCount: "约束自由度数",
  constraintRank: "约束矩阵秩",
  elementCount: "单元数",
  memberResultCount: "构件结果数",
  diagramCount: "工程图数",
  nodeResultCount: "节点结果数",
  solverBackend: "求解方法",
  criticalPointCount: "关键点数",
  reviewPointCount: "复核点数",
  envelopeEntryCount: "控制来源数",
  maxResidualN: "最大平衡残差",
  rmsRelativeError: "均方根相对误差",
  equilibriumMaxResidualN: "最大平衡残差",
  equilibriumRmsRelativeError: "均方根相对误差",
  method: "计算方法",
};

const STATUS_TITLES: Record<string, string> = {
  available: "已提供完整信息",
  diagnostic_summary: "已提供诊断摘要",
  count_summary: "已提供数量摘要",
  unavailable: "暂未提供",
  completed: "已完成",
  done: "已完成",
  converged: "已收敛",
  not_converged: "未收敛",
  pass: "通过",
  fail: "未通过",
  failed: "未通过",
  iterating: "迭代中",
  cutback: "已切步重试",
  accepted: "已接受",
  rejected: "已拒绝",
  stable: "稳定",
  near_critical: "接近临界",
  unstable: "不稳定",
  terminated: "已终止",
  maximum_iterations_exhausted: "达到最大迭代次数",
  no_compression: "无受压构件",
  not_enabled: "未启用",
  review: "需复核",
  pending: "待计算",
  disabled: "未启用",
  enabled: "已启用",
};

export function calculationMetricTitle(metricKey: string | undefined) {
  if (!metricKey) return "—";
  return METRIC_TITLES[metricKey] ?? readableChineseValue(metricKey, "其他工程指标");
}

export function calculationCriticalPointKindTitle(kind: string) {
  return CRITICAL_POINT_KIND_TITLES[kind] ?? readableChineseValue(kind, "其他关键点");
}

export function calculationSourceTypeTitle(sourceType: string | undefined) {
  if (!sourceType) return "";
  return SOURCE_TYPE_TITLES[sourceType] ?? readableChineseValue(sourceType, "其他来源");
}

export function calculationSourceIdTitle(sourceId: string | undefined) {
  if (!sourceId) return "";
  return sourceId === "__primary__" ? "基本结果" : sourceId;
}

export function calculationSourceLabelTitle(sourceLabel: string | undefined) {
  if (!sourceLabel) return "";
  return SOURCE_LABEL_TITLES[sourceLabel.toLowerCase()] ?? readableChineseValue(sourceLabel, "其他结果来源");
}

export function calculationSideTitle(side: string | undefined) {
  if (!side) return "";
  return SIDE_TITLES[side] ?? readableChineseValue(side, "其他位置");
}

export function calculationStatusTitle(status: string | undefined) {
  if (!status) return "";
  return STATUS_TITLES[status.toLowerCase()] ?? readableChineseValue(status, "状态待确认");
}

export function calculationObjectTitle(kind: string, objectId: string | undefined) {
  if (!objectId) return "";
  const systemTitle = SOURCE_TYPE_TITLES[objectId.toLowerCase()];
  if (systemTitle) return `${systemTitle}对象`;
  if (kind === "node") return `节点 ${objectId}`;
  if (kind === "member") return `构件 ${objectId}`;
  return `对象 ${objectId}`;
}

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

function preferredCollectionFrom(value: unknown, preferredKeys: readonly string[]): unknown[] {
  if (Array.isArray(value)) return value;
  if (isRecord(value)) {
    for (const key of preferredKeys) {
      const candidate = value[key];
      if (Array.isArray(candidate)) return candidate;
    }
  }
  return collectionFrom(value);
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

function summarizeTechnicalTracePayload(value: unknown): string | undefined {
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
          .map(([nestedKey, nestedItem]) => `${nestedKey}:${technicalValue(nestedItem)}`)
          .join(", ");
        return nested ? `${key}={${nested}}` : "";
      }
      return `${key}=${technicalValue(item)}`;
    })
    .filter(Boolean);
  return entries.length > 0 ? entries.join(" · ") : undefined;
}

function summarizeTracePayload(value: unknown): string | undefined {
  if (!isRecord(value)) return undefined;
  const entries: string[] = [];
  const append = (key: string, item: unknown) => {
    if (item === null || item === undefined || item === "") return;
    if (key === "analysisType") {
      const label = item === "frame" ? "平面框架" : item === "truss" ? "平面桁架" : item === "beam" ? "梁系" : String(item);
      entries.push(`分析类型：${label}`);
      return;
    }
    if (key === "availability") {
      entries.push(calculationStatusTitle(String(item)));
      return;
    }
    if (key === "status" || key === "statusCode") {
      entries.push(`状态：${calculationStatusTitle(String(item))}`);
      return;
    }
    if (key === "reason" && String(item).trim()) {
      const reason = String(item).trim();
      entries.push(/[\u3400-\u9fff]/u.test(reason) ? reason : calculationStatusTitle(reason));
      return;
    }
    if (key === "warnings" || key === "infos") {
      entries.push(`${key === "warnings" ? "警告" : "提示"}：${Array.isArray(item) ? item.length : 1} 项`);
      return;
    }
    const title = TRACE_SUMMARY_TITLES[key];
    if (title) entries.push(`${title}：${traceSummaryValue(key, item)}`);
  };

  Object.entries(value).forEach(([key, item]) => {
    if (isRecord(item)) {
      Object.entries(item).forEach(([nestedKey, nestedItem]) => append(nestedKey, nestedItem));
      return;
    }
    append(key, item);
  });
  return entries.length > 0 ? entries.slice(0, 8).join("；") : "已记录本阶段的可审查摘要。";
}

function traceSummaryValue(key: string, value: unknown) {
  if (key === "solverBackend" || key === "method") {
    if (value === "dense-corotational-newton") return "稠密矩阵共回转牛顿法";
    if (value === "dense") return "稠密矩阵求解";
    if (value === "corotational_newton_v1") return "共回转牛顿法";
    if (value === "initial_stress_v1") return "初始应力迭代法";
    if (value === "linear_buckling_v1") return "线性屈曲特征值法";
    return readableChineseValue(String(value), "其他求解方法");
  }
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : formatTraceNumber(value);
  return String(value);
}

function formatTraceNumber(value: number) {
  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute < 1e-3 || absolute >= 1e5)) return value.toExponential(3);
  return value.toFixed(6).replace(/\.?0+$/u, "");
}

function technicalValue(value: unknown) {
  if (Array.isArray(value) || isRecord(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
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
    const fallbackTitle = TRACE_STAGE_TITLES[stage] ?? `步骤 ${index + 1}`;
    const rawTitle = normalizeText(item.title ?? item.label, fallbackTitle);
    const rawDetail = String(item.detail ?? item.message ?? item.note ?? "").trim();
    const fallbackDetail = summarizeTracePayload(summary) ?? "已记录本阶段的可审查摘要。";
    const technicalDetail = [
      summarizeTechnicalTracePayload(summary),
      rawTitle !== fallbackTitle && !/[\u3400-\u9fff]/u.test(rawTitle) ? `title=${rawTitle}` : "",
      rawDetail && !/[\u3400-\u9fff]/u.test(rawDetail) ? `detail=${rawDetail}` : "",
    ].filter(Boolean).join(" · ");
    return [{
      stage,
      title: readableChineseValue(rawTitle, fallbackTitle),
      detail: rawDetail ? readableChineseValue(rawDetail, fallbackDetail) : fallbackDetail,
      technicalDetail,
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
  return preferredCollectionFrom(rawPoints, ["displayPoints", "points"]).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const kind = normalizeText(item.kind ?? item.type, "critical");
    const metricKey = String(item.metricKey ?? item.metric ?? "").trim() || undefined;
    const fallbackLabel = CRITICAL_POINT_TITLES[kind] ?? `关键点 ${index + 1}`;
    const rawLabel = normalizeText(item.label ?? item.title, fallbackLabel);
    return [{
      id: normalizeId(item.id ?? item.key ?? item.sourceId, `critical-${index + 1}`),
      kind,
      label: readableChineseValue(rawLabel, fallbackLabel),
      metricKey,
      value: safeNumber(item.value ?? item.magnitude ?? item.extremeValue),
      unit: String(item.unit ?? "").trim() || undefined,
      station: safeNumber(item.station ?? item.stationM ?? item.positionM ?? item.x),
      sourceType: String(item.sourceType ?? "").trim() || undefined,
      sourceId: String(item.sourceId ?? item.memberId ?? item.nodeId ?? "").trim() || undefined,
      objectId: String(item.objectId ?? item.memberId ?? item.nodeId ?? "").trim() || undefined,
      side: String(item.side ?? "").trim() || undefined,
    }];
  }).slice(0, MAX_CRITICAL_POINTS);
}

function normalizeReviewPointEntries(rawPoints: unknown): CalculationReviewPoint[] {
  return preferredCollectionFrom(rawPoints, ["requestedPoints", "displayPoints", "points"]).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const targetType = String(item.targetType ?? item.object ?? item.scope ?? "").trim();
    const normalizedTargetType: CalculationReviewPoint["targetType"] =
      targetType === "member" ? "member" : targetType === "station" ? "station" : "node";
    const fallbackLabel = `复核点 ${index + 1}`;
    const rawLabel = normalizeText(item.label ?? item.title ?? item.kind, fallbackLabel);
    const rawNote = String(item.note ?? item.description ?? "").trim();
    return [{
      id: normalizeId(item.id ?? item.key ?? item.sourceId, `review-${index + 1}`),
      kind: normalizeText(item.kind ?? item.type, "custom"),
      targetType: normalizedTargetType,
      label: readableChineseValue(rawLabel, fallbackLabel),
      targetId: String(item.targetId ?? item.objectId ?? item.memberId ?? item.nodeId ?? "").trim() || undefined,
      metricKey: String(item.metricKey ?? item.metric ?? "").trim() || undefined,
      station: safeNumber(item.station ?? item.stationM ?? item.positionM),
      side: String(item.side ?? "").trim() || undefined,
      note: rawNote ? readableChineseValue(rawNote, "用户指定的工程复核位置") : undefined,
    }];
  }).slice(0, MAX_REVIEW_POINTS);
}

function normalizeEnvelopeEntries(rawEnvelope: unknown): CalculationGoverningEnvelopeItem[] {
  return preferredCollectionFrom(rawEnvelope, ["displayEntries", "entries"]).flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const metricKey = normalizeText(item.metricKey ?? item.metric ?? item.name, `metric-${index + 1}`);
    const kind = String(item.kind ?? "").trim() || undefined;
    const fallbackLabel = `${METRIC_TITLES[metricKey] ?? "工程指标"}控制值`;
    const rawLabel = normalizeText(item.label ?? item.title, fallbackLabel);
    return [{
      id: normalizeId(item.id ?? item.key ?? item.metricKey, `envelope-${index + 1}`),
      metricKey,
      label: readableChineseValue(rawLabel, fallbackLabel),
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
  }).slice(0, MAX_GOVERNING_ENVELOPE_ITEMS);
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
  const segments = [
    calculationSourceTypeTitle(item.sourceType),
    calculationSourceLabelTitle(item.sourceLabel),
    calculationSourceIdTitle(item.sourceId),
    calculationSideTitle(item.side),
  ]
    .map((segment) => String(segment ?? "").trim())
    .filter((segment, index, all) => Boolean(segment) && all.indexOf(segment) === index);
  return segments.length > 0 ? `来源：${segments.join(" · ")}` : "未提供控制来源";
}

function envelopeComparisonLabel(item: CalculationGoverningEnvelopeItem | undefined): string {
  if (!item) return "控制来源";
  const metric = calculationMetricTitle(item.metricKey);
  const kind = item.kind ? calculationCriticalPointKindTitle(item.kind) : "控制来源";
  return `${metric} · ${kind}`;
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
      label: calculationMetricTitle(key),
      left: leftValue,
      right: rightValue,
      absDiff,
      relDiff: relative.relDiff,
      unit: METRIC_UNITS[key],
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
      label: envelopeComparisonLabel(rightItem ?? leftItem),
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
