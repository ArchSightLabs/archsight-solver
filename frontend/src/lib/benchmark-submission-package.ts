import type { AnalysisMode } from "../types/structure.ts";

export type BenchmarkSubmissionCategory = Extract<AnalysisMode, "beam" | "frame" | "truss">;
export type BenchmarkMetricValueType = "number" | "text";

export interface BenchmarkMetricFormRow {
  key: string;
  label: string;
  valueType: BenchmarkMetricValueType;
  expectedValue: string;
  expectedUnit: string;
  expectedCanonicalUnit: string;
  expectedReadonly?: boolean;
  expectedSourceLabel?: string;
  toleranceKey?: string;
  toleranceValue: string;
  toleranceUnit: string;
  toleranceCanonicalUnit?: string;
  unitOptions: string[];
}

export interface BenchmarkMetricDefinition {
  key: string;
  label: string;
  valueType: BenchmarkMetricValueType;
  unit: string;
  toleranceKey?: string;
  toleranceUnit?: string;
}

export interface BenchmarkSubmissionFormState {
  caseId: string;
  title: string;
  purpose: string;
  metrics: BenchmarkMetricFormRow[];
  sourceType: string;
  reference: string;
  method: string;
  sourceLinksText: string;
  contributorName: string;
  contributorOrganization: string;
  contributorContact: string;
  contributorNote: string;
}

export interface BenchmarkSubmissionPackageRequest {
  case: {
    id: string;
    category: BenchmarkSubmissionCategory;
    title: string;
    purpose: string;
    payload: Record<string, unknown>;
    expected: Record<string, unknown>;
    tolerances: Record<string, unknown>;
    metricDefinitions: BenchmarkMetricDefinition[];
    verification: {
      sourceType: string;
      reference: string;
      method: string;
      sourceLinks?: string[];
      checkedMetrics: string[];
    };
  };
  contributor: {
    name: string;
    organization: string;
    contact: string;
    note: string;
  };
}

export interface BenchmarkSubmissionChannelDraftInput {
  repositoryUrl: string;
  officialEmail: string;
  submissionId: string;
  filename: string;
  caseId: string;
  caseTitle: string;
  category: BenchmarkSubmissionCategory;
  reviewStatus?: string;
}

export interface BenchmarkSubmissionChannelDraft {
  officialEmail: string;
  issueTitle: string;
  issueBody: string;
  issueUrl: string;
  emailSubject: string;
  emailBody: string;
  mailtoUrl: string;
}

const SOURCE_TYPES = [
  { value: "textbook-analytical", label: "教材解析解" },
  { value: "independent-stiffness-baseline", label: "独立刚度法基线" },
  { value: "engineering-software", label: "工程软件复核" },
  { value: "internal-regression", label: "内部回归" },
];

export const BENCHMARK_SOURCE_TYPE_OPTIONS = SOURCE_TYPES;

export function createDefaultBenchmarkSubmissionForm(
  category: BenchmarkSubmissionCategory,
  payload: unknown,
  objectName?: string,
  calculationResult?: unknown
): BenchmarkSubmissionFormState {
  const title = objectName?.trim() || defaultTitle(category);
  return {
    caseId: createBenchmarkCaseId(category, title),
    title,
    purpose: defaultPurpose(category),
    metrics: defaultMetricRows(category, payload, calculationResult),
    sourceType: "textbook-analytical",
    reference: "",
    method: "",
    sourceLinksText: "",
    contributorName: "",
    contributorOrganization: "",
    contributorContact: "",
    contributorNote: "",
  };
}

export function buildBenchmarkSubmissionPackageRequest(
  category: BenchmarkSubmissionCategory,
  payload: unknown,
  form: BenchmarkSubmissionFormState
): BenchmarkSubmissionPackageRequest {
  const normalizedPayload = parseObjectPayload(payload, "当前结构模型");
  const { expected, tolerances, checkedMetrics, metricDefinitions } = buildMetricPayload(form.metrics);
  const sourceLinks = splitMultivalueText(form.sourceLinksText);

  if (!form.caseId.trim()) {
    throw new Error("无法生成算例 ID，请填写对象名称。");
  }
  if (!form.title.trim()) {
    throw new Error("请填写对象名称。");
  }
  if (!form.purpose.trim()) {
    throw new Error("请填写验证目的。");
  }
  if (!form.method.trim()) {
    throw new Error("请填写复核方法。");
  }
  if (checkedMetrics.length === 0) {
    throw new Error("请至少填写一个校核指标。");
  }

  return {
    case: {
      id: form.caseId.trim(),
      category,
      title: form.title.trim(),
      purpose: form.purpose.trim(),
      payload: normalizedPayload,
      expected,
      tolerances,
      metricDefinitions,
      verification: {
        sourceType: form.sourceType,
        reference: form.reference.trim(),
        method: form.method.trim(),
        ...(sourceLinks.length ? { sourceLinks } : {}),
        checkedMetrics,
      },
    },
    contributor: {
      name: form.contributorName.trim(),
      organization: form.contributorOrganization.trim(),
      contact: form.contributorContact.trim(),
      note: form.contributorNote.trim(),
    },
  };
}

export function createBenchmarkCaseId(category: BenchmarkSubmissionCategory, title: string): string {
  const normalizedTitle = title
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  return normalizedTitle ? `${category}-${normalizedTitle}` : `${category}-submission`;
}

export function parseJsonObject(text: string, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} 不是有效 JSON: ${error instanceof Error ? error.message : "解析失败"}`);
  }
  return parseObjectPayload(value, label);
}

export function buildMetricPayload(metrics: BenchmarkMetricFormRow[]): {
  expected: Record<string, unknown>;
  tolerances: Record<string, unknown>;
  checkedMetrics: string[];
  metricDefinitions: BenchmarkMetricDefinition[];
} {
  const expected: Record<string, unknown> = {};
  const tolerances: Record<string, unknown> = {};
  const checkedMetrics: string[] = [];
  const metricDefinitions: BenchmarkMetricDefinition[] = [];

  for (const metric of metrics) {
    const label = metric.label.trim() || metric.key;
    checkedMetrics.push(label);
    expected[metric.key] = normalizeMetricExpected(metric, label);
    if (metric.toleranceKey) {
      tolerances[metric.toleranceKey] = normalizeMetricTolerance(metric, label);
    }
    metricDefinitions.push({
      key: metric.key,
      label,
      valueType: metric.valueType,
      unit: metric.expectedUnit,
      ...(metric.toleranceKey ? { toleranceKey: metric.toleranceKey, toleranceUnit: metric.toleranceUnit } : {}),
    });
  }

  return { expected, tolerances, checkedMetrics, metricDefinitions };
}

export function splitMultivalueText(text: string): string[] {
  return text
    .split(/[\n,，]+/u)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildBenchmarkSubmissionChannelDraft(
  input: BenchmarkSubmissionChannelDraftInput
): BenchmarkSubmissionChannelDraft {
  const submissionId = input.submissionId.trim();
  const caseId = input.caseId.trim();
  const filename = input.filename.trim();
  const categoryLabel = benchmarkCategoryLabel(input.category);
  const titleToken = caseId || submissionId || "benchmark-submission";
  const issueTitle = `验证算例投稿：${titleToken}`;
  const statusText = reviewStatusLabel(input.reviewStatus);
  const attachmentNote = `请上传或附上下载得到的 JSON 投稿包：${filename || "benchmark-submission.json"}`;
  const issueBody = [
    "## 投稿摘要",
    "",
    `- 投稿编号：${submissionId || "待补充"}`,
    `- 算例 ID：${caseId || "待补充"}`,
    `- 算例标题：${input.caseTitle.trim() || "待补充"}`,
    `- 结构体系：${categoryLabel}`,
    `- 预检状态：${statusText}`,
    `- 投稿包文件：${filename || "待补充"}`,
    "",
    "## 投稿附件",
    "",
    attachmentNote,
    "",
    "## 补充说明",
    "",
    "请说明验证来源、标准值和容许误差的依据；如来源不便公开，请改用官方邮箱提交。",
  ].join("\n");
  const emailSubject = `ArchSight Solver 验证算例投稿：${submissionId || titleToken}`;
  const emailBody = [
    "您好，",
    "",
    "我提交一个 ArchSight Solver 公开验证算例，请查收 JSON 投稿包附件。",
    "",
    `投稿编号：${submissionId || "待补充"}`,
    `算例 ID：${caseId || "待补充"}`,
    `算例标题：${input.caseTitle.trim() || "待补充"}`,
    `结构体系：${categoryLabel}`,
    `预检状态：${statusText}`,
    `投稿包文件：${filename || "待补充"}`,
    "",
    "补充说明：",
    "",
    "请注意：浏览器无法自动把 JSON 文件加入邮件附件，请手动添加刚下载的投稿包。",
  ].join("\n");

  return {
    officialEmail: input.officialEmail,
    issueTitle,
    issueBody,
    issueUrl: githubIssueUrl(input.repositoryUrl, issueTitle, issueBody),
    emailSubject,
    emailBody,
    mailtoUrl: mailtoUrl(input.officialEmail, emailSubject, emailBody),
  };
}

function parseObjectPayload(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是 JSON 对象。`);
  }
  return value as Record<string, unknown>;
}

function defaultTitle(category: BenchmarkSubmissionCategory): string {
  if (category === "frame") return "投稿平面框架验证算例";
  if (category === "truss") return "投稿平面桁架验证算例";
  return "投稿梁系验证算例";
}

function defaultPurpose(category: BenchmarkSubmissionCategory): string {
  if (category === "frame") return "复核平面框架节点位移、构件弯矩和支座反力。";
  if (category === "truss") return "复核平面桁架节点位移、杆件轴力和支座反力。";
  return "复核梁系挠度、支座反力和控制位置。";
}

function benchmarkCategoryLabel(category: BenchmarkSubmissionCategory): string {
  if (category === "frame") return "二维平面框架";
  if (category === "truss") return "二维平面桁架";
  return "梁系";
}

function reviewStatusLabel(status: string | undefined): string {
  if (status === "ready_for_review") return "自动校核通过，待人工复核";
  if (status === "needs_correction") return "自动校核未通过，需修正";
  return status?.trim() || "待补充";
}

function githubIssueUrl(repositoryUrl: string, title: string, body: string): string {
  const baseUrl = repositoryUrl.trim().replace(/\/+$/u, "") || "https://github.com/ArchSightLabs/archsight-solver";
  const params = queryString({
    template: "benchmark_submission.md",
    title,
    body,
  });
  return `${baseUrl}/issues/new?${params}`;
}

function mailtoUrl(email: string, subject: string, body: string): string {
  return `mailto:${email}?${queryString({ subject, body })}`;
}

function queryString(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
}

function defaultMetricRows(category: BenchmarkSubmissionCategory, payload: unknown, calculationResult: unknown): BenchmarkMetricFormRow[] {
  const model = parsePayloadForDefaults(payload);
  const result = parsePayloadForDefaults(calculationResult);
  const summary = parsePayloadForDefaults(result.summary);
  if (category === "frame") {
    const structure = parsePayloadForDefaults(model.structure);
    const nodeCount = arrayLength(result.nodeIds, structure.nodes);
    const memberCount = arrayLength(result.memberIds, structure.members);
    return [
      textMetric("statusCode", "计算状态码", stringValue(summary.statusCode, "PASS"), "计算结果"),
      countMetric("nodeCount", "节点数量", nodeCount, "当前模型"),
      countMetric("memberCount", "构件数量", memberCount, "当前模型"),
      numericMetric("maxDisplacementMm", "最大节点位移", numberValue(summary.maxDisplacementMm), "mm", "maxDisplacementMm", 0.01, "mm", ["mm", "m"]),
      numericMetric("maxMomentKnM", "最大构件弯矩", numberValue(summary.maxMomentKnM), "kN·m", "maxMomentKnM", 0.01, "kN·m", ["kN·m", "N·m"]),
    ];
  }
  if (category === "truss") {
    const structure = parsePayloadForDefaults(model.structure);
    const nodes = Array.isArray(structure.nodes) ? structure.nodes : [];
    const members = Array.isArray(structure.members) ? structure.members : [];
    const nodeCount = arrayLength(result.nodeIds, nodes);
    const memberCount = arrayLength(result.memberIds, members);
    return [
      textMetric("statusCode", "计算状态码", stringValue(summary.statusCode, "PASS"), "计算结果"),
      countMetric("nodeCount", "节点数量", nodeCount, "当前模型"),
      countMetric("memberCount", "杆件数量", memberCount, "当前模型"),
      numericMetric("maxDisplacementMm", "最大节点位移", numberValue(summary.maxDisplacementMm), "mm", "maxDisplacementMm", 0.01, "mm", ["mm", "m"]),
      numericMetric("maxAxialForceKn", "最大杆件轴力", numberValue(summary.maxAxialForceKn), "kN", "maxAxialForceKn", 0.01, "kN", ["kN", "N"]),
      textMetric("maxDisplacementNodeId", "控制节点", stringValue(summary.maxDisplacementNodeId, firstObjectId(nodes)), "计算结果"),
      textMetric("maxAxialForceMemberId", "控制杆件", stringValue(summary.maxAxialForceMemberId, firstObjectId(members)), "计算结果"),
    ];
  }
  const beam = parsePayloadForDefaults(result.beam);
  const maxDeflection = parsePayloadForDefaults(beam.maxDeflection);
  return [
    countMetric("supportCount", "支座数量", arrayLength(beam.supports, model.supports), "当前模型"),
    numericMetric("maxDeflectionMm", "最大挠度", numberValue(maxDeflection.valueMm, numberValue(summary.maxDeflectionMm)), "mm", "maxDeflectionMm", 0.01, "mm", ["mm", "m"]),
    numericMetric("maxDeflectionXM", "最大挠度位置", numberValue(maxDeflection.xM, numberValue(summary.maxDeflectionPositionM)), "m", "maxDeflectionXM", 0.01, "m", ["m", "mm"]),
  ];
}

function numericMetric(
  key: string,
  label: string,
  expectedValue: number,
  expectedUnit: string,
  toleranceKey: string,
  toleranceValue: number,
  toleranceUnit: string,
  unitOptions: string[]
): BenchmarkMetricFormRow {
  return {
    key,
    label,
    valueType: "number",
    expectedValue: String(expectedValue),
    expectedUnit,
    expectedCanonicalUnit: expectedUnit,
    toleranceKey,
    toleranceValue: String(toleranceValue),
    toleranceUnit,
    toleranceCanonicalUnit: toleranceUnit,
    unitOptions,
  };
}

function countMetric(key: string, label: string, expectedValue: number, expectedSourceLabel: string): BenchmarkMetricFormRow {
  return {
    key,
    label,
    valueType: "number",
    expectedValue: String(expectedValue),
    expectedUnit: "个",
    expectedCanonicalUnit: "个",
    expectedReadonly: true,
    expectedSourceLabel,
    toleranceValue: "",
    toleranceUnit: "",
    unitOptions: ["个"],
  };
}

function textMetric(key: string, label: string, expectedValue: string, expectedSourceLabel?: string): BenchmarkMetricFormRow {
  return {
    key,
    label,
    valueType: "text",
    expectedValue,
    expectedUnit: "",
    expectedCanonicalUnit: "",
    expectedReadonly: Boolean(expectedSourceLabel),
    expectedSourceLabel,
    toleranceValue: "",
    toleranceUnit: "",
    unitOptions: [],
  };
}

function parsePayloadForDefaults(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }
  return payload as Record<string, unknown>;
}

function firstObjectId(items: unknown[]): string {
  const first = items[0];
  if (!first || typeof first !== "object" || Array.isArray(first)) {
    return "";
  }
  const id = (first as Record<string, unknown>).id;
  return typeof id === "string" ? id : "";
}

function arrayLength(primary: unknown, fallback: unknown): number {
  if (Array.isArray(primary)) return primary.length;
  if (Array.isArray(fallback)) return fallback.length;
  return 0;
}

function numberValue(value: unknown, fallback = 0): number {
  const numericValue = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numericValue) ? numericValue : fallback;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeMetricExpected(metric: BenchmarkMetricFormRow, label: string): unknown {
  if (metric.valueType === "text") {
    if (!metric.expectedValue.trim()) {
      throw new Error(`请填写「${label}」的标准值。`);
    }
    return metric.expectedValue.trim();
  }
  const value = parseMetricNumber(metric.expectedValue, `${label} 标准值`);
  return convertMetricValue(value, metric.expectedUnit, metric.expectedCanonicalUnit, `${label} 标准值`);
}

function normalizeMetricTolerance(metric: BenchmarkMetricFormRow, label: string): number {
  if (!metric.toleranceKey) {
    throw new Error(`「${label}」不需要容许误差。`);
  }
  const value = parseMetricNumber(metric.toleranceValue, `${label} 容许误差`);
  if (value < 0) {
    throw new Error(`「${label}」的容许误差不能为负值。`);
  }
  return convertMetricValue(value, metric.toleranceUnit, metric.toleranceCanonicalUnit ?? metric.expectedCanonicalUnit, `${label} 容许误差`);
}

function parseMetricNumber(value: string, label: string): number {
  if (!value.trim()) {
    throw new Error(`请填写${label}。`);
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    throw new Error(`${label}必须是数值。`);
  }
  return numericValue;
}

function convertMetricValue(value: number, unit: string, canonicalUnit: string, label: string): number {
  const factor = unitConversionFactor(unit, canonicalUnit, label);
  return Number((value * factor).toPrecision(12));
}

function unitConversionFactor(unit: string, canonicalUnit: string, label: string): number {
  if (unit === canonicalUnit || (!unit && !canonicalUnit)) return 1;
  if (canonicalUnit === "mm" && unit === "m") return 1000;
  if (canonicalUnit === "m" && unit === "mm") return 0.001;
  if (canonicalUnit === "kN" && unit === "N") return 0.001;
  if (canonicalUnit === "N" && unit === "kN") return 1000;
  if (canonicalUnit === "kN·m" && unit === "N·m") return 0.001;
  if (canonicalUnit === "N·m" && unit === "kN·m") return 1000;
  if (canonicalUnit === "个" && unit === "个") return 1;
  throw new Error(`${label}不支持从「${unit || "无单位"}」换算到「${canonicalUnit || "无单位"}」。`);
}
