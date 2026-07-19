import { frameSupportStabilityWarning, trussSupportStabilityWarning } from "../solver-payload.ts";
import type { BeamLoadCombination, BeamSupportConfig, BeamWorkspaceState } from "../types/beam.ts";
import type {
  FrameLoad,
  FrameLoadCombination,
  FrameWorkspaceState,
  StructureMember,
  StructureNode,
  TrussLoad,
  TrussLoadCombination,
  TrussMember,
  TrussNode,
  TrussWorkspaceState,
} from "../types/structure.ts";
import { beamSupportConstraints } from "./support-vocabulary.ts";
import type { ModuleSectionKey } from "./workbench-navigation.ts";
import { createPortalFrameModelFromState, type WorkspaceState } from "./workspace-state.ts";

export type ModelDiagnosticSeverity = "error" | "warning" | "info";
export type ModelDiagnosticStatus = "blocked" | "review" | "ready";
export type ModelDiagnosticObjectKind = "node" | "member" | "span" | "support" | "loadCase" | "loadCombination";

export interface ModelDiagnosticObjectRef {
  kind: ModelDiagnosticObjectKind;
  id: string;
}

export interface ModelDiagnosticAction {
  label: string;
  targetSection: ModuleSectionKey;
}

export interface ModelDiagnosticIssue {
  code: string;
  severity: ModelDiagnosticSeverity;
  title: string;
  detail: string;
  suggestion: string;
  objectRefs?: ModelDiagnosticObjectRef[];
  action?: ModelDiagnosticAction;
}

export interface ModelDiagnostics {
  status: ModelDiagnosticStatus;
  summary: string;
  issues: ModelDiagnosticIssue[];
}

function issue(
  code: string,
  severity: ModelDiagnosticSeverity,
  title: string,
  detail: string,
  suggestion: string,
  metadata: Pick<ModelDiagnosticIssue, "objectRefs" | "action"> = {},
): ModelDiagnosticIssue {
  return { code, severity, title, detail, suggestion, ...metadata };
}

function refs(kind: ModelDiagnosticObjectKind, ids: readonly string[]): ModelDiagnosticObjectRef[] {
  return ids.map((id) => ({ kind, id }));
}

function navigate(label: string, targetSection: ModuleSectionKey): ModelDiagnosticAction {
  return { label, targetSection };
}

function statusForIssues(issues: ModelDiagnosticIssue[]): ModelDiagnosticStatus {
  if (issues.some((item) => item.severity === "error")) return "blocked";
  if (issues.some((item) => item.severity === "warning")) return "review";
  return "ready";
}

function diagnosticsFromIssues(issues: ModelDiagnosticIssue[], readySummary: string): ModelDiagnostics {
  const status = statusForIssues(issues);
  const summary =
    status === "blocked"
      ? `存在 ${issues.filter((item) => item.severity === "error").length} 项阻断诊断，需修正后再求解。`
      : status === "review"
        ? `存在 ${issues.filter((item) => item.severity === "warning").length} 项复核提示，建议确认后求解。`
        : readySummary;
  return { status, summary, issues };
}

function duplicateIds(items: ReadonlyArray<{ id?: string }>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const item of items) {
    const id = String(item.id ?? "").trim();
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

function finitePositive(value: unknown): boolean {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

function beamSupportHasVerticalRestraint(support: BeamSupportConfig): boolean {
  const constraints = support.constraints ?? beamSupportConstraints(support.type);
  return constraints.includes("v") || Boolean(support.springs?.some((spring) => spring.dof === "v" && spring.stiffnessKnPerM > 0));
}

function loadCombinationIssues(
  combinations: readonly (BeamLoadCombination | FrameLoadCombination | TrussLoadCombination)[],
  loadCaseIds: Set<string>,
  objectLabel: string,
): ModelDiagnosticIssue[] {
  const issues: ModelDiagnosticIssue[] = [];
  for (const combination of combinations) {
    const id = String(combination.id ?? "").trim() || "未命名组合";
    const factors = combination.factors ?? {};
    const factorEntries = Object.entries(factors);
    const metadata = {
      objectRefs: refs("loadCombination", [id]),
      action: navigate("检查荷载组合", "table"),
    };
    if (!factorEntries.length) {
      issues.push(issue("LOAD_COMBINATION_EMPTY_FACTORS", "error", "荷载组合 factors 为空", `${objectLabel} ${id} 没有定义任何工况系数。`, "至少为一个已存在荷载工况设置非零组合系数。", metadata));
      continue;
    }
    const unknown = factorEntries.map(([caseId]) => caseId.trim()).filter((caseId) => !loadCaseIds.has(caseId));
    if (unknown.length) {
      issues.push(issue("LOAD_COMBINATION_UNKNOWN_CASE", "error", "荷载组合引用不存在工况", `${objectLabel} ${id} 引用了不存在的荷载工况：${unknown.join("、")}。`, "检查组合系数中的工况 ID，或先在荷载工况表中补齐对应工况。", metadata));
    }
    if (factorEntries.every(([, factor]) => Math.abs(Number(factor) || 0) < 1e-12)) {
      issues.push(issue("LOAD_COMBINATION_ZERO_FACTORS", "error", "荷载组合系数全为 0", `${objectLabel} ${id} 的工况系数全部为 0。`, "至少保留一个非零组合系数，否则组合结果没有工程意义。", metadata));
    }
  }
  return issues;
}

export function buildBeamModelDiagnostics(value: BeamWorkspaceState): ModelDiagnostics {
  const issues: ModelDiagnosticIssue[] = [];
  if (!value.spans.length) {
    issues.push(issue("BEAM_NO_SPANS", "error", "梁系缺少跨段", "当前梁系没有可求解跨段。", "在对象页增加至少一个跨段，或从模板页生成连续梁模型。", { action: navigate("增加跨段", "object") }));
  }
  const invalidLengthSpanIds = value.spans.filter((span) => !finitePositive(span.length)).map((span) => String(span.id ?? "未命名跨段"));
  if (invalidLengthSpanIds.length) {
    issues.push(issue("BEAM_INVALID_SPAN_LENGTH", "error", "跨段长度异常", "存在长度小于或等于 0 的跨段。", "检查跨段长度，单位为 m。", { objectRefs: refs("span", invalidLengthSpanIds), action: navigate("定位跨段", "object") }));
  }
  const duplicateSpanIds = duplicateIds(value.spans);
  if (duplicateSpanIds.length) {
    issues.push(issue("BEAM_DUPLICATE_SPAN_ID", "warning", "跨段编号重复", `重复跨段编号：${duplicateSpanIds.join("、")}。`, "为每个跨段使用唯一编号，便于导出计算书和后续复核。", { objectRefs: refs("span", duplicateSpanIds), action: navigate("定位跨段", "object") }));
  }
  if (value.spans.some((span) => !finitePositive(span.E) || !finitePositive(span.I))) {
    issues.push(issue("BEAM_INVALID_STIFFNESS", "error", "跨段刚度输入异常", "存在弹性模量 E 或截面惯性矩 I 小于等于 0 的跨段。", "确认 E 使用 GPa、I 使用 cm4，且均为正值。"));
  }
  const hasVerticalSupport = value.supports.some(beamSupportHasVerticalRestraint);
  if (!hasVerticalSupport) {
    issues.push(issue("BEAM_NO_VERTICAL_RESTRAINT", "error", "梁系缺少竖向约束", "当前支座体系不能约束整体竖向刚体位移。", "至少设置一个铰支座、滚动支座、固结支座或竖向弹性约束。", { objectRefs: refs("support", value.supports.map((support) => support.id)), action: navigate("检查支座", "object") }));
  }
  if (value.customLoadCases.length && (value.uniformLoadEnabled || value.linearLoadEnabled || value.pointLoads.length)) {
    issues.push(issue("LOAD_CASE_PRIMARY_LOADS_PRESENT", "info", "主荷载与荷载工况并存", "当前模型同时存在主结果荷载与荷载工况。", "导出前确认结果来源选择为主结果、指定工况或指定组合，避免混用。"));
  }
  const loadCaseIds = new Set(value.customLoadCases.map((loadCase) => loadCase.id.trim()).filter(Boolean));
  if (duplicateIds(value.customLoadCases).length) {
    issues.push(issue("LOAD_CASE_DUPLICATE_ID", "error", "荷载工况编号重复", `重复工况编号：${duplicateIds(value.customLoadCases).join("、")}。`, "为每个工况使用唯一 ID。"));
  }
  issues.push(...loadCombinationIssues(value.customLoadCombinations, loadCaseIds, "梁系荷载组合"));
  return diagnosticsFromIssues(issues, "梁系模型求解前诊断未发现阻断项。");
}

function nodeIds(nodes: ReadonlyArray<{ id: string }>): Set<string> {
  return new Set(nodes.map((node) => String(node.id).trim()).filter(Boolean));
}

function memberIds(members: ReadonlyArray<{ id: string }>): Set<string> {
  return new Set(members.map((member) => String(member.id).trim()).filter(Boolean));
}

function connectedNodeIds(members: ReadonlyArray<{ start: string; end: string }>): Set<string> {
  const ids = new Set<string>();
  for (const member of members) {
    ids.add(String(member.start).trim());
    ids.add(String(member.end).trim());
  }
  return ids;
}

function zeroLengthMember(member: { start: string; end: string }, nodesById: Map<string, { x: number; y: number }>): boolean {
  const start = nodesById.get(String(member.start).trim());
  const end = nodesById.get(String(member.end).trim());
  if (!start || !end) return false;
  return Math.hypot(Number(end.x) - Number(start.x), Number(end.y) - Number(start.y)) < 1e-9;
}

function loadReferenceMissing(load: FrameLoad | TrussLoad, nodeSet: Set<string>, memberSet: Set<string>): boolean {
  if (load.type === "nodal") return !nodeSet.has(load.node);
  return !memberSet.has(load.member);
}

function baseFrameTrussIssues(
  nodes: ReadonlyArray<StructureNode | TrussNode>,
  members: ReadonlyArray<StructureMember | TrussMember>,
  loads: ReadonlyArray<FrameLoad | TrussLoad>,
  label: { node: string; member: string },
): ModelDiagnosticIssue[] {
  const issues: ModelDiagnosticIssue[] = [];
  const nIds = nodeIds(nodes);
  const mIds = memberIds(members);
  const nodesById = new Map(nodes.map((node) => [String(node.id).trim(), { x: Number(node.x), y: Number(node.y) }]));

  const duplicateNodeIds = duplicateIds(nodes);
  const duplicateMemberIds = duplicateIds(members);
  if (duplicateNodeIds.length) {
    issues.push(issue("STRUCTURE_DUPLICATE_NODE_ID", "error", `${label.node}编号重复`, `重复${label.node}编号：${duplicateNodeIds.join("、")}。`, `为每个${label.node}使用唯一编号。`, { objectRefs: refs("node", duplicateNodeIds), action: navigate(`定位${label.node}`, "object") }));
  }
  if (duplicateMemberIds.length) {
    issues.push(issue("STRUCTURE_DUPLICATE_MEMBER_ID", "error", `${label.member}编号重复`, `重复${label.member}编号：${duplicateMemberIds.join("、")}。`, `为每个${label.member}使用唯一编号。`, { objectRefs: refs("member", duplicateMemberIds), action: navigate(`定位${label.member}`, "object") }));
  }
  const invalidMemberRefs = members.filter((member) => !nIds.has(member.start) || !nIds.has(member.end)).map((member) => member.id);
  if (invalidMemberRefs.length) {
    issues.push(issue("STRUCTURE_INVALID_MEMBER_REFERENCE", "error", `${label.member}起止节点无效`, `以下${label.member}引用了不存在的${label.node}：${invalidMemberRefs.join("、")}。`, `检查${label.member} start/end 字段是否对应现有${label.node}。`, { objectRefs: refs("member", invalidMemberRefs), action: navigate(`定位${label.member}`, "object") }));
  }
  const zeroLength = members.filter((member) => zeroLengthMember(member, nodesById)).map((member) => member.id);
  if (zeroLength.length) {
    issues.push(issue("STRUCTURE_ZERO_LENGTH_MEMBER", "error", `${label.member}长度为 0`, `以下${label.member}起止坐标重合：${zeroLength.join("、")}。`, `调整${label.node}坐标或删除零长度${label.member}。`, { objectRefs: refs("member", zeroLength), action: navigate(`定位${label.member}`, "object") }));
  }
  const connected = connectedNodeIds(members);
  const isolated = nodes.filter((node) => !connected.has(String(node.id).trim()) && node.supportType === "free").map((node) => node.id);
  if (isolated.length) {
    issues.push(issue("STRUCTURE_ISOLATED_FREE_NODE", "warning", "存在自由孤立节点", `以下${label.node}未连接任何${label.member}且为自由节点：${isolated.join("、")}。`, `删除孤立${label.node}，或补齐与主体结构的${label.member}连接。`, { objectRefs: refs("node", isolated), action: navigate(`定位${label.node}`, "object") }));
  }
  const invalidLoads = loads.filter((load) => loadReferenceMissing(load, nIds, mIds));
  if (invalidLoads.length) {
    issues.push(issue("LOAD_INVALID_REFERENCE", "error", "荷载引用无效", `存在 ${invalidLoads.length} 个荷载引用了不存在的${label.node}或${label.member}。`, "检查节点荷载、构件/杆件荷载和温度荷载的目标对象。"));
  }
  return issues;
}

export function buildFrameModelDiagnostics(value: FrameWorkspaceState): ModelDiagnostics {
  const issues: ModelDiagnosticIssue[] = [];
  if (value.frameMode !== "custom") {
    if (value.span <= 0 || value.height <= 0) {
      issues.push(issue("FRAME_TEMPLATE_DIMENSION_INVALID", "error", "规则框架尺寸异常", "跨度或层高小于等于 0。", "检查规则框架模板的跨度和层高，单位为 m。"));
    }
    if (!finitePositive(value.columnE) || !finitePositive(value.columnA) || !finitePositive(value.columnI) || !finitePositive(value.beamE) || !finitePositive(value.beamA) || !finitePositive(value.beamI)) {
      issues.push(issue("FRAME_TEMPLATE_STIFFNESS_INVALID", "error", "规则框架刚度输入异常", "柱或梁的 E、A、I 存在小于等于 0 的输入。", "确认 E 使用 GPa、A 使用 cm2、I 使用 cm4，且均为正值。"));
    }
    const model = createPortalFrameModelFromState(value);
    const supportWarning = frameSupportStabilityWarning(model.nodes);
    if (supportWarning) {
      issues.push(issue("FRAME_UNSTABLE_SUPPORTS", "error", "平面框架支座约束不足", supportWarning, "至少形成可抵抗整体平移和转动的支座体系。"));
    }
    return diagnosticsFromIssues(issues, "规则框架模板求解前诊断未发现阻断项。");
  }
  if (value.customNodes.length < 2) {
    issues.push(issue("FRAME_TOO_FEW_NODES", "error", "平面框架节点不足", "自定义平面框架至少需要 2 个节点。", "增加节点并用构件连接。"));
  }
  if (value.customMembers.length < 1) {
    issues.push(issue("FRAME_NO_MEMBERS", "error", "平面框架缺少构件", "自定义平面框架至少需要 1 个构件。", "增加构件并确认起止节点。"));
  }
  issues.push(...baseFrameTrussIssues(value.customNodes, value.customMembers, value.customLoads, { node: "节点", member: "构件" }));
  if (value.customMembers.some((member) => !finitePositive(member.E_GPa) || !finitePositive(member.A_cm2) || !finitePositive(member.I_cm4))) {
    issues.push(issue("FRAME_INVALID_STIFFNESS", "error", "框架构件刚度输入异常", "存在 E、A 或 I 小于等于 0 的构件。", "确认 E 使用 GPa、A 使用 cm2、I 使用 cm4，且均为正值。"));
  }
  const supportWarning = frameSupportStabilityWarning(value.customNodes);
  if (supportWarning) {
    issues.push(issue("FRAME_UNSTABLE_SUPPORTS", "error", "平面框架支座约束不足", supportWarning, "至少形成可抵抗整体平移和转动的支座体系。"));
  }
  const loadCaseIds = new Set(value.customLoadCases.map((loadCase) => loadCase.id.trim()).filter(Boolean));
  if (duplicateIds(value.customLoadCases).length) {
    issues.push(issue("LOAD_CASE_DUPLICATE_ID", "error", "荷载工况编号重复", `重复工况编号：${duplicateIds(value.customLoadCases).join("、")}。`, "为每个工况使用唯一 ID。"));
  }
  for (const loadCase of value.customLoadCases) {
    if (loadCase.loads.some((load) => loadReferenceMissing(load, nodeIds(value.customNodes), memberIds(value.customMembers)))) {
      issues.push(issue("LOAD_CASE_INVALID_REFERENCE", "error", "荷载工况引用无效", `工况 ${loadCase.id} 存在无效荷载引用。`, "检查工况内节点荷载、构件荷载和温度荷载的目标对象。"));
    }
  }
  issues.push(...loadCombinationIssues(value.customLoadCombinations, loadCaseIds, "框架荷载组合"));
  return diagnosticsFromIssues(issues, "平面框架模型求解前诊断未发现阻断项。");
}

export function buildTrussModelDiagnostics(value: TrussWorkspaceState): ModelDiagnostics {
  const issues: ModelDiagnosticIssue[] = [];
  if (value.customNodes.length < 2) {
    issues.push(issue("TRUSS_TOO_FEW_NODES", "error", "平面桁架节点不足", "平面桁架至少需要 2 个节点。", "增加节点并用杆件连接。"));
  }
  if (value.customMembers.length < 1) {
    issues.push(issue("TRUSS_NO_MEMBERS", "error", "平面桁架缺少杆件", "平面桁架至少需要 1 个杆件。", "增加杆件并确认起止节点。"));
  }
  issues.push(...baseFrameTrussIssues(value.customNodes, value.customMembers, value.customLoads, { node: "节点", member: "杆件" }));
  if (value.customMembers.some((member) => !finitePositive(member.E_GPa) || !finitePositive(member.A_cm2))) {
    issues.push(issue("TRUSS_INVALID_STIFFNESS", "error", "桁架杆件刚度输入异常", "存在 E 或 A 小于等于 0 的杆件。", "确认 E 使用 GPa、A 使用 cm2，且均为正值。"));
  }
  const unsupportedNode = value.customNodes.find((node) => {
    const raw = node as unknown as Record<string, unknown>;
    return raw.supportAngleDeg !== undefined || raw.rollerAngleDeg !== undefined || raw.springs !== undefined || raw.supportDisplacements !== undefined || raw.condensedDofs !== undefined;
  });
  if (unsupportedNode) {
    issues.push(issue("TRUSS_UNSUPPORTED_NODE_FIELD", "error", "桁架节点包含不适用字段", `节点 ${unsupportedNode.id} 包含框架支座角、弹性约束、支座位移或凝聚自由度字段。`, "桁架节点仅保留 pinned、roller、free 平动支座口径。"));
  }
  const supportWarning = trussSupportStabilityWarning(value.customNodes);
  if (supportWarning) {
    issues.push(issue("TRUSS_UNSTABLE_SUPPORTS", "error", "平面桁架支座约束不足", supportWarning, "至少形成一个铰支座加一个滚动支座等稳定平动约束体系。"));
  }
  const loadCaseIds = new Set(value.customLoadCases.map((loadCase) => loadCase.id.trim()).filter(Boolean));
  if (duplicateIds(value.customLoadCases).length) {
    issues.push(issue("LOAD_CASE_DUPLICATE_ID", "error", "荷载工况编号重复", `重复工况编号：${duplicateIds(value.customLoadCases).join("、")}。`, "为每个工况使用唯一 ID。"));
  }
  for (const loadCase of value.customLoadCases) {
    if (loadCase.loads.some((load) => loadReferenceMissing(load, nodeIds(value.customNodes), memberIds(value.customMembers)))) {
      issues.push(issue("LOAD_CASE_INVALID_REFERENCE", "error", "荷载工况引用无效", `工况 ${loadCase.id} 存在无效荷载引用。`, "检查工况内节点荷载、杆件荷载和温度荷载的目标对象。"));
    }
  }
  issues.push(...loadCombinationIssues(value.customLoadCombinations, loadCaseIds, "桁架荷载组合"));
  return diagnosticsFromIssues(issues, "平面桁架模型求解前诊断未发现阻断项。");
}

export function buildModelDiagnostics(workspace: WorkspaceState): ModelDiagnostics {
  if (workspace.analysisMode === "frame") return buildFrameModelDiagnostics(workspace.frame);
  if (workspace.analysisMode === "truss") return buildTrussModelDiagnostics(workspace.truss);
  return buildBeamModelDiagnostics(workspace.beam);
}
