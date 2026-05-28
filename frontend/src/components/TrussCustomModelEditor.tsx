import { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { DropdownSelect } from "./ui/DropdownSelect";
import { Plus, Trash2, Triangle, Link2, MapPin, RotateCw, Sparkles, FileText } from "lucide-react";
import { TextModelCheckPanel, type TextModelPreviewMetric } from "./TextModelCheckPanel";
import { TRUSS_MODEL_TEMPLATES, cloneTrussModelTemplate } from "../lib/workbench-model-templates.ts";
import { parseTrussTextModel, serializeTrussTextModel } from "../lib/truss-text-model.ts";
import type { TrussLoad, TrussMember, TrussNode } from "../types/structure.ts";
import type { TrussWorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";

interface TrussCollections {
  nodes: TrussNode[];
  members: TrussMember[];
  loads: TrussLoad[];
}

interface TrussCustomModelEditorProps {
  value: TrussCollections;
  onChange: (next: TrussCollections) => void;
  onResetToBenchmark: () => void;
  activeSectionId?: string;
  selection?: TrussWorkbenchSelection | null;
  onSelectionChange?: (next: TrussWorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
}

type TrussSelectedObject =
  | { type: "node"; id: string }
  | { type: "member"; id: string }
  | { type: "load"; id: string };
type TrussAdvancedSection = "nodes" | "members" | "loads";

const SUPPORT_OPTIONS = [
  { value: "pinned", label: "铰支座" },
  { value: "roller", label: "滚动支座" },
  { value: "free", label: "自由节点" },
];

const MEMBER_KIND_OPTIONS = [
  { value: "upper_chord", label: "上弦杆" },
  { value: "lower_chord", label: "下弦杆" },
  { value: "diagonal", label: "腹杆" },
  { value: "generic", label: "通用" },
];

const LOAD_TYPE_OPTIONS = [
  { value: "nodal", label: "节点荷载" },
  { value: "distributed", label: "杆件荷载" },
];

const MEMBER_LOAD_DIRECTION_OPTIONS = [
  { value: "global_y", label: "全局 Y" },
  { value: "global_x", label: "全局 X" },
];

function nextDraftId(prefix: string, existingIds: string[]): string {
  const used = new Set(existingIds);
  let maxSuffix = 0;
  for (const id of existingIds) {
    const match = new RegExp(`^${prefix}(\\d+)$`).exec(id);
    if (!match) continue;
    maxSuffix = Math.max(maxSuffix, Number(match[1]) || 0);
  }
  let candidate = `${prefix}${maxSuffix + 1}`;
  while (used.has(candidate)) {
    maxSuffix += 1;
    candidate = `${prefix}${maxSuffix + 1}`;
  }
  return candidate;
}

function createNodeDraft(index: number, existingIds: string[]): TrussNode {
  const isSupportNode = index < 2;
  return {
    id: nextDraftId("N", existingIds),
    x: (index + 1) * 2,
    y: isSupportNode ? 0 : 3,
    supportType: isSupportNode ? (index === 0 ? "pinned" : "roller") : "free",
  };
}

function createMemberDraft(index: number, nodes: TrussNode[], existingIds: string[]): TrussMember {
  const start = nodes[index]?.id ?? nodes[0]?.id ?? "N1";
  const end = nodes[index + 1]?.id ?? nodes[nodes.length - 1]?.id ?? start;
  return {
    id: nextDraftId("M", existingIds),
    start,
    end,
    elementType: "truss",
    E_GPa: 210,
    A_cm2: 24,
    kind: "generic",
  };
}

function createNodalLoadDraft(nodes: TrussNode[]): TrussLoad {
  return {
    type: "nodal",
    node: nodes[0]?.id ?? "N1",
    fxKn: 0,
    fyKn: -10,
  };
}

function createMemberLoadDraft(members: TrussMember[], preferredMemberId?: string): TrussLoad {
  const memberIds = new Set(members.map((member) => member.id));
  return {
    type: "distributed",
    member: preferredMemberId && memberIds.has(preferredMemberId) ? preferredMemberId : members[0]?.id ?? "M1",
    direction: "global_y",
    qStartKnPerM: -1,
    qEndKnPerM: -1,
  };
}

function canonicalId(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export function TrussCustomModelEditor({
  value,
  onChange,
  onResetToBenchmark,
  activeSectionId,
  selection,
  onSelectionChange,
}: TrussCustomModelEditorProps) {
  const [selectedObject, setSelectedObject] = useState<TrussSelectedObject>({ type: "node", id: value.nodes[0]?.id ?? "" });
  const [advancedSectionId, setAdvancedSectionId] = useState<TrussAdvancedSection>("nodes");
  const [textModelDraft, setTextModelDraft] = useState("");
  const [textModelMessage, setTextModelMessage] = useState<string | null>(null);
  const [textModelDiagnostics, setTextModelDiagnostics] = useState<string[]>([]);
  const [textModelPreviewMetrics, setTextModelPreviewMetrics] = useState<TextModelPreviewMetric[]>([]);
  const visibleSectionId = activeSectionId ?? "truss-custom-overview";
  const isSectionVisible = (sectionId: string) => visibleSectionId === sectionId;

  const nodeOptions = useMemo(
    () => value.nodes.map((node) => ({ value: node.id, label: node.id })),
    [value.nodes]
  );
  const memberOptions = useMemo(
    () => value.members.map((member) => ({ value: member.id, label: member.id })),
    [value.members]
  );
  const loadOptions = useMemo(
    () => value.loads.map((load, index) => ({
      value: `load-${index}`,
      label: load.type === "nodal" ? `节点荷载 ${index + 1}（${load.node}）` : `杆件荷载 ${index + 1}（${load.member}）`,
    })),
    [value.loads]
  );

  const exportTextModel = () => {
    setTextModelDraft(serializeTrussTextModel(value));
    setTextModelDiagnostics([]);
    setTextModelPreviewMetrics([]);
    setTextModelMessage("已按当前节点、杆件与节点荷载生成桁架文本模型，可编辑后先检查再应用。");
  };

  const previewTextModelDraft = (draft: string) => {
    setTextModelDraft(draft);
    if (draft.trim().length === 0) {
      setTextModelDiagnostics([]);
      setTextModelPreviewMetrics([]);
      setTextModelMessage(null);
      return;
    }

    const result = parseTrussTextModel(draft);
    setTextModelDiagnostics(result.diagnostics);
    if (!result.collections || result.diagnostics.length > 0) {
      setTextModelPreviewMetrics([]);
      setTextModelMessage(null);
      return;
    }

    setTextModelPreviewMetrics([
      { label: "节点", value: `${result.collections.nodes.length}` },
      { label: "杆件", value: `${result.collections.members.length}` },
      { label: "节点荷载", value: `${result.collections.loads.length}` },
      { label: "分析假定", value: "轴力杆系" },
    ]);
    setTextModelMessage(`检查通过：将导入 ${result.collections.nodes.length} 个节点、${result.collections.members.length} 根杆件、${result.collections.loads.length} 条节点荷载。点击“应用文本模型”后写入正式模型。`);
  };

  const checkTextModelDraft = () => {
    if (!textModelDraft.trim()) {
      setTextModelDiagnostics(["请先生成或输入文本模型。"]);
      setTextModelPreviewMetrics([]);
      setTextModelMessage(null);
      return;
    }
    previewTextModelDraft(textModelDraft);
  };

  const importTextModel = () => {
    const result = parseTrussTextModel(textModelDraft);
    setTextModelDiagnostics(result.diagnostics);
    if (result.diagnostics.length > 0) {
      setTextModelDiagnostics(["存在诊断，未写入正式模型。", ...result.diagnostics]);
      setTextModelPreviewMetrics([]);
      setTextModelMessage(null);
      return;
    }
    if (!result.collections) {
      setTextModelMessage("文本模型未导入。");
      return;
    }
    onChange(result.collections);
    setTextModelPreviewMetrics([
      { label: "节点", value: `${result.collections.nodes.length}` },
      { label: "杆件", value: `${result.collections.members.length}` },
      { label: "节点荷载", value: `${result.collections.loads.length}` },
      { label: "分析假定", value: "轴力杆系" },
    ]);
    setTextModelMessage(`已导入 ${result.collections.nodes.length} 个节点、${result.collections.members.length} 根杆件、${result.collections.loads.length} 条荷载。`);
    setSelectedObject({ type: "node", id: result.collections.nodes[0]?.id ?? "" });
  };
  const resolvedSelectedObject = useMemo<TrussSelectedObject>(() => {
    const current = selection ? { type: selection.type, id: selection.id } : selectedObject;
    if (current.type === "node" && value.nodes.some((node) => node.id === current.id)) return current;
    if (current.type === "member" && value.members.some((member) => member.id === current.id)) return current;
    if (current.type === "load" && value.loads[Number(current.id.replace("load-", ""))]) return current;
    if (value.nodes[0]) return { type: "node", id: value.nodes[0].id };
    if (value.members[0]) return { type: "member", id: value.members[0].id };
    return { type: "load", id: "load-0" };
  }, [selectedObject, selection, value.loads, value.members, value.nodes]);
  const supportCount = value.nodes.filter((node) => (node.supportType ?? "free") !== "free").length;
  const modelWarnings = useMemo(() => {
    const warnings: string[] = [];
    const nodeIds = new Set(value.nodes.map((node) => node.id));
    const memberIds = new Set(value.members.map((member) => member.id));
    if (supportCount === 0) warnings.push("尚未设置支座约束。");
    if (value.members.some((member) => !nodeIds.has(member.start) || !nodeIds.has(member.end))) warnings.push("存在引用缺失节点的杆件。");
    if (value.loads.some((load) => load.type === "nodal" ? !nodeIds.has(load.node) : !memberIds.has(load.member))) warnings.push("存在引用缺失对象的荷载。");
    if (value.loads.length === 0) warnings.push("尚未设置节点荷载或杆件荷载。");
    return warnings;
  }, [supportCount, value.loads, value.members, value.nodes]);

  const commit = (next: TrussCollections) => onChange(next);

  const selectObject = (next: TrussSelectedObject, options?: WorkbenchSelectionOptions) => {
    setSelectedObject(next);
    onSelectionChange?.({ mode: "truss", type: next.type, id: next.id }, options);
  };

  const applyTypicalCase = (templateId: string) => {
    const template = TRUSS_MODEL_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const collections = cloneTrussModelTemplate(template);
    commit(collections);
    selectObject({ type: "node", id: collections.nodes[0]?.id ?? "" }, { openEditor: false });
  };

  const updateNode = (index: number, patch: Partial<TrussNode>) => {
    const current = value.nodes[index];
    if (!current) return;
    const nextId = patch.id !== undefined ? canonicalId(patch.id, current.id) : current.id;
    const nextPatch = patch.id !== undefined ? { ...patch, id: nextId } : patch;
    const isRenaming = nextId !== current.id;
    const nextNodes = value.nodes.map((node, nodeIndex) => (nodeIndex === index ? { ...node, ...nextPatch } : node));
    const nextMembers = value.members.map((member) => {
      if (isRenaming && current.id === member.start) {
        return { ...member, start: nextId };
      }
      if (isRenaming && current.id === member.end) {
        return { ...member, end: nextId };
      }
      return member;
    });
    const nextLoads = value.loads.map((load) => (isRenaming && load.type === "nodal" && load.node === current.id ? { ...load, node: nextId } : load));
    commit({ nodes: nextNodes, members: nextMembers, loads: nextLoads });
    if (isRenaming && resolvedSelectedObject.type === "node" && resolvedSelectedObject.id === current.id) {
      selectObject({ type: "node", id: nextId }, { openEditor: false });
    }
  };

  const addNode = () => {
    const nextNodes = [...value.nodes, createNodeDraft(value.nodes.length, value.nodes.map((node) => node.id))];
    commit({ nodes: nextNodes, members: value.members, loads: value.loads });
  };

  const removeNode = (index: number) => {
    const removed = value.nodes[index];
    if (!removed) return;
    commit({
      nodes: value.nodes.filter((_, nodeIndex) => nodeIndex !== index),
      members: value.members.filter((member) => member.start !== removed.id && member.end !== removed.id),
      loads: value.loads.filter((load) => load.type !== "nodal" || load.node !== removed.id),
    });
  };

  const addMember = () => {
    if (value.nodes.length < 2) {
      return;
    }
    const nextMembers = [...value.members, createMemberDraft(value.members.length, value.nodes, value.members.map((member) => member.id))];
    commit({ nodes: value.nodes, members: nextMembers, loads: value.loads });
  };

  const updateMember = (index: number, patch: Partial<TrussMember>) => {
    const current = value.members[index];
    if (!current) return;
    const nextId = patch.id !== undefined ? canonicalId(patch.id, current.id) : current.id;
    const nextPatch = patch.id !== undefined ? { ...patch, id: nextId } : patch;
    const isRenaming = nextId !== current.id;
    const nextMembers = value.members.map((member, memberIndex) => (memberIndex === index ? { ...member, ...nextPatch } : member));
    const nextLoads = value.loads.map((load) => {
      if (isRenaming && load.type !== "nodal" && load.member === current.id) {
        return { ...load, member: nextId } as TrussLoad;
      }
      return load;
    });
    commit({ nodes: value.nodes, members: nextMembers, loads: nextLoads });
    if (isRenaming && resolvedSelectedObject.type === "member" && resolvedSelectedObject.id === current.id) {
      selectObject({ type: "member", id: nextId }, { openEditor: false });
    }
  };

  const removeMember = (index: number) => {
    const removed = value.members[index];
    if (!removed) return;
    commit({
      nodes: value.nodes,
      members: value.members.filter((_, memberIndex) => memberIndex !== index),
      loads: value.loads.filter((load) => load.type === "nodal" || load.member !== removed.id),
    });
  };

  const addNodalLoad = () => {
    const nextLoads = [...value.loads, createNodalLoadDraft(value.nodes)];
    commit({ nodes: value.nodes, members: value.members, loads: nextLoads });
    selectObject({ type: "load", id: `load-${nextLoads.length - 1}` });
  };

  const addMemberLoad = () => {
    if (value.members.length === 0) {
      return;
    }
    const preferredMemberId = resolvedSelectedObject.type === "member" ? resolvedSelectedObject.id : undefined;
    const nextLoads = [...value.loads, createMemberLoadDraft(value.members, preferredMemberId)];
    commit({ nodes: value.nodes, members: value.members, loads: nextLoads });
    selectObject({ type: "load", id: `load-${nextLoads.length - 1}` });
  };

  const updateLoad = (index: number, patch: Partial<TrussLoad>) => {
    const current = value.loads[index];
    if (!current) return;
    const nextLoads = value.loads.map((load, loadIndex) => (loadIndex === index ? ({ ...load, ...patch } as TrussLoad) : load));
    commit({ nodes: value.nodes, members: value.members, loads: nextLoads });
  };

  const removeLoad = (index: number) => {
    commit({
      nodes: value.nodes,
      members: value.members,
      loads: value.loads.filter((_, loadIndex) => loadIndex !== index),
    });
  };

  const fieldLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
  const advancedSections: Array<{ id: TrussAdvancedSection; label: string; count: number }> = [
    { id: "nodes", label: "节点", count: value.nodes.length },
    { id: "members", label: "杆件", count: value.members.length },
    { id: "loads", label: "荷载", count: value.loads.length },
  ];

  const renderSelectedEditor = () => {
    if (resolvedSelectedObject.type === "node") {
      const index = value.nodes.findIndex((node) => node.id === resolvedSelectedObject.id);
      const node = value.nodes[index];
      if (!node) return null;
      return (
        <div className="space-y-3 rounded-xl border border-white/8 bg-slate-950/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={fieldLabelClass}>当前节点</div>
              <div className="mt-1 text-sm font-bold">{node.id}</div>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeNode(index)} disabled={value.nodes.length <= 1} aria-label="删除当前节点">
              <Trash2 className="h-4 w-4 text-rose-300" />
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <div className={fieldLabelClass}>节点编号</div>
              <Input aria-label="节点编号" value={node.id} onChange={(e) => updateNode(index, { id: e.target.value })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>支座约束</div>
              <DropdownSelect value={node.supportType ?? "free"} onChange={(nextValue) => updateNode(index, { supportType: nextValue as TrussNode["supportType"] })} options={SUPPORT_OPTIONS} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel="支座约束" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>横坐标（m）</div>
              <Input aria-label="节点横坐标（m）" type="number" step="0.1" value={node.x} onChange={(e) => updateNode(index, { x: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>纵坐标（m）</div>
              <Input aria-label="节点纵坐标（m）" type="number" step="0.1" value={node.y} onChange={(e) => updateNode(index, { y: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
          </div>
        </div>
      );
    }

    if (resolvedSelectedObject.type === "member") {
      const index = value.members.findIndex((member) => member.id === resolvedSelectedObject.id);
      const member = value.members[index];
      if (!member) return null;
      return (
        <div className="space-y-3 rounded-xl border border-white/8 bg-slate-950/20 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className={fieldLabelClass}>当前杆件</div>
              <div className="mt-1 text-sm font-bold">{member.id}</div>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeMember(index)} aria-label="删除当前杆件">
              <Trash2 className="h-4 w-4 text-rose-300" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <div className={fieldLabelClass}>杆件编号</div>
              <Input aria-label="杆件编号" value={member.id} onChange={(e) => updateMember(index, { id: e.target.value })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>杆件类型</div>
              <DropdownSelect value={member.kind ?? "generic"} onChange={(nextValue) => updateMember(index, { kind: nextValue })} options={MEMBER_KIND_OPTIONS} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel="杆件类型" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>起点节点</div>
              <DropdownSelect value={member.start} onChange={(nextValue) => updateMember(index, { start: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel="起点节点" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>终点节点</div>
              <DropdownSelect value={member.end} onChange={(nextValue) => updateMember(index, { end: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel="终点节点" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>弹性模量（GPa）</div>
              <Input aria-label="杆件弹性模量（GPa）" type="number" value={member.E_GPa} onChange={(e) => updateMember(index, { E_GPa: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>截面面积（cm²）</div>
              <Input aria-label="杆件截面面积（cm²）" type="number" value={member.A_cm2} onChange={(e) => updateMember(index, { A_cm2: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
          </div>
        </div>
      );
    }

    const index = Number(resolvedSelectedObject.id.replace("load-", ""));
    const load = value.loads[index];
    if (!load) return null;
    const isMemberLoad = load.type !== "nodal";
    return (
      <div className="space-y-3 rounded-xl border border-white/8 bg-slate-950/20 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <div className="space-y-1">
            <div className={fieldLabelClass}>荷载类型</div>
            <DropdownSelect
              value={isMemberLoad ? "distributed" : "nodal"}
              onChange={(nextValue) => {
                if (nextValue === "distributed") {
                  updateLoad(index, createMemberLoadDraft(value.members, isMemberLoad ? load.member : undefined));
                  return;
                }
                updateLoad(index, createNodalLoadDraft(value.nodes));
              }}
              options={LOAD_TYPE_OPTIONS}
              className="text-xs font-mono"
              menuClassName="text-xs font-mono"
              ariaLabel={`第 ${index + 1} 条荷载类型`}
            />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>{isMemberLoad ? "作用杆件" : "作用节点"}</div>
            {isMemberLoad ? (
              <DropdownSelect value={load.member} onChange={(nextValue) => updateLoad(index, { member: nextValue } as Partial<TrussLoad>)} options={memberOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${index + 1} 条荷载作用杆件`} />
            ) : (
              <DropdownSelect value={load.node} onChange={(nextValue) => updateLoad(index, { node: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${index + 1} 条荷载作用节点`} />
            )}
          </div>
          <Button variant="ghost" size="icon" className="h-10 w-10 self-end" onClick={() => removeLoad(index)} aria-label="删除当前荷载">
            <Trash2 className="h-4 w-4 text-rose-300" />
          </Button>
        </div>
        {isMemberLoad ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <div className={fieldLabelClass}>荷载方向</div>
              <DropdownSelect value={load.direction ?? "global_y"} onChange={(nextValue) => updateLoad(index, { direction: nextValue as "global_x" | "global_y" } as Partial<TrussLoad>)} options={MEMBER_LOAD_DIRECTION_OPTIONS} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${index + 1} 条荷载方向`} />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>起点线荷载（kN/m）</div>
              <Input aria-label={`第 ${index + 1} 条荷载起点线荷载（kN/m）`} type="number" step="0.1" value={load.qStartKnPerM ?? load.wyKnPerM ?? 0} onChange={(e) => updateLoad(index, { qStartKnPerM: Number(e.target.value) || 0 } as Partial<TrussLoad>)} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>终点线荷载（kN/m）</div>
              <Input aria-label={`第 ${index + 1} 条荷载终点线荷载（kN/m）`} type="number" step="0.1" value={load.qEndKnPerM ?? load.wyKnPerM ?? 0} onChange={(e) => updateLoad(index, { qEndKnPerM: Number(e.target.value) || 0 } as Partial<TrussLoad>)} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>自重强度（可选，kN/m）</div>
              <Input aria-label={`第 ${index + 1} 条荷载自重强度（可选，kN/m）`} type="number" step="0.1" value={load.selfWeightKnPerM ?? ""} onChange={(e) => updateLoad(index, { selfWeightKnPerM: e.target.value === "" ? undefined : Number(e.target.value) || 0 } as Partial<TrussLoad>)} className="h-10 min-w-0 font-mono text-xs" placeholder="留空则按起终点线荷载" />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <div className={fieldLabelClass}>X 向力（kN）</div>
              <Input aria-label={`第 ${index + 1} 条荷载 X 向力（kN）`} type="number" step="0.1" value={load.fxKn ?? 0} onChange={(e) => updateLoad(index, { fxKn: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>Y 向力（kN）</div>
              <Input aria-label={`第 ${index + 1} 条荷载 Y 向力（kN）`} type="number" step="0.1" value={load.fyKn ?? 0} onChange={(e) => updateLoad(index, { fyKn: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {isSectionVisible("truss-custom-overview") ? (
      <>
      <div id="truss-custom-overview" className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="eyebrow flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              自定义桁架建模
            </div>
            <p className="text-xs text-muted-foreground">
              先套用桁架参数模板，再选择节点、杆件或荷载进行属性修改；批量表格保留为高级编辑。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onResetToBenchmark} className="h-8 rounded-xl">
              <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              恢复默认屋架
            </Button>
            <Button size="sm" onClick={addNode} className="h-8 rounded-xl">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              新增节点
            </Button>
          </div>
        </div>
      </div>

      <section className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "节点", value: value.nodes.length },
            { label: "杆件", value: value.members.length },
            { label: "支座", value: supportCount },
            { label: "荷载", value: value.loads.length },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-white/8 bg-slate-950/20 p-3">
              <div className="text-[10px] font-black tracking-widest text-muted-foreground">{item.label}</div>
              <div className="mt-1 font-mono text-lg font-black">{item.value}</div>
            </div>
          ))}
        </div>
        {modelWarnings.length === 0 ? (
          <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/8 p-3 text-xs text-emerald-700 dark:text-emerald-200">
            当前桁架节点、杆件、荷载引用完整，可继续复核节点位移、杆件轴力与支座反力。
          </div>
        ) : (
          <div className="space-y-1 rounded-xl border border-amber-400/15 bg-amber-500/8 p-3 text-xs text-amber-700 dark:text-amber-200">
            {modelWarnings.map((warning) => (
              <div key={warning}>{warning}</div>
            ))}
          </div>
        )}
      </section>
      </>
      ) : null}

      {isSectionVisible("truss-text-model") ? (
      <section id="truss-text-model" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="eyebrow flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-primary" />
            文本模型
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportTextModel} className="h-7 rounded-lg px-2 text-[10px]">
              生成当前模型文本
            </Button>
            <Button variant="outline" size="sm" onClick={checkTextModelDraft} className="h-7 rounded-lg px-2 text-[10px]" disabled={!textModelDraft.trim()}>
              检查文本模型
            </Button>
            <Button size="sm" onClick={importTextModel} className="h-7 rounded-lg px-2 text-[10px]" disabled={!textModelDraft.trim()}>
              应用文本模型
            </Button>
          </div>
        </div>
        <textarea
          value={textModelDraft}
          onChange={(event) => previewTextModelDraft(event.target.value)}
          spellCheck={false}
          wrap="off"
          className="min-h-[32rem] w-full resize-y rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] leading-5 text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary/60 dark:border-white/10 dark:bg-slate-950/70 dark:text-slate-100 dark:placeholder:text-slate-500"
          placeholder={"NODE,N1,0,0,pinned\nNODE,N2,6,0,roller\nNODE,N3,3,3,free\nMEMBER,M1,N1,N3,210,24,upper_chord\nMEMBER,M2,N3,N2,210,24,upper_chord\nLOAD,N3,0,-50"}
        />
        <TextModelCheckPanel
          message={textModelMessage}
          diagnostics={textModelDiagnostics}
          metrics={textModelPreviewMetrics}
        />
      </section>
      ) : null}

      {isSectionVisible("truss-typical-cases") ? (
      <section id="truss-typical-cases" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            模板
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {TRUSS_MODEL_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => applyTypicalCase(template.id)}
              className="rounded-xl border border-white/8 bg-slate-950/20 p-3 text-left transition-colors hover:border-primary/35 hover:bg-primary/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-bold">{template.title}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
                    {template.members.length} 杆件
                  </span>
                  <span className="rounded border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                    套用
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>
      ) : null}

      {isSectionVisible("truss-object-navigator") ? (
      <section id="truss-object-navigator" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="eyebrow flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          对象
        </div>
        <div className="space-y-3">
          <div className="space-y-2">
            <div className={fieldLabelClass}>节点</div>
            <div className="flex flex-wrap gap-2">
              {value.nodes.map((node) => (
                <button key={node.id} type="button" onClick={() => selectObject({ type: "node", id: node.id })} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${resolvedSelectedObject.type === "node" && resolvedSelectedObject.id === node.id ? "border-primary/40 bg-primary/10 text-primary" : "border-white/8 bg-slate-950/20 text-muted-foreground hover:text-foreground"}`}>
                  {node.id}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className={fieldLabelClass}>杆件</div>
            <div className="flex flex-wrap gap-2">
              {value.members.map((member) => (
                <button key={member.id} type="button" onClick={() => selectObject({ type: "member", id: member.id })} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${resolvedSelectedObject.type === "member" && resolvedSelectedObject.id === member.id ? "border-primary/40 bg-primary/10 text-primary" : "border-white/8 bg-slate-950/20 text-muted-foreground hover:text-foreground"}`}>
                  {member.id}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className={fieldLabelClass}>荷载</div>
            <div className="flex flex-wrap gap-2">
              {loadOptions.map((option) => (
                <button key={option.value} type="button" onClick={() => selectObject({ type: "load", id: option.value })} className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold ${resolvedSelectedObject.type === "load" && resolvedSelectedObject.id === option.value ? "border-primary/40 bg-primary/10 text-primary" : "border-white/8 bg-slate-950/20 text-muted-foreground hover:text-foreground"}`}>
                  {option.label}
                </button>
              ))}
              <Button variant="outline" size="sm" onClick={addNodalLoad} className="h-8 rounded-lg px-2 text-[10px]">
                <Plus className="mr-1 h-3 w-3" />
                新增节点荷载
              </Button>
              <Button variant="outline" size="sm" onClick={addMemberLoad} disabled={value.members.length === 0} className="h-8 rounded-lg px-2 text-[10px]">
                <Plus className="mr-1 h-3 w-3" />
                新增杆件荷载
              </Button>
            </div>
          </div>
        </div>
      </section>
      ) : null}

      {isSectionVisible("truss-object-navigator") ? (
      <section id="truss-selected-editor" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <Triangle className="h-3.5 w-3.5 text-primary" />
            属性
          </div>
          <Button size="sm" onClick={addNode} className="h-8 rounded-xl">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新增节点
          </Button>
        </div>
        {renderSelectedEditor()}
      </section>
      ) : null}

      {isSectionVisible("truss-advanced-tables") ? (
      <section id="truss-advanced-tables" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="桁架高级表格分组">
          {advancedSections.map((section) => {
            const active = advancedSectionId === section.id;
            return (
              <button
                key={section.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setAdvancedSectionId(section.id)}
                className={`inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-xs font-bold transition-colors ${
                  active
                    ? "border-primary/50 bg-primary/12 text-primary"
                    : "border-white/8 bg-slate-950/20 text-muted-foreground hover:border-white/18 hover:text-foreground"
                }`}
              >
                <span>{section.label}</span>
                <span className="font-mono text-[10px] opacity-70">{section.count}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-4 space-y-5">

      {advancedSectionId === "nodes" ? (
      <section id="truss-custom-nodes" className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            节点
          </div>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">节点编号 / 坐标 / 支座约束</span>
        </div>
        <div className="space-y-3">
          {value.nodes.map((node, index) => (
            <div
              key={`truss-node-${index}`}
              className="grid grid-cols-1 gap-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,1fr)_auto]"
            >
              <div className="space-y-1">
                <div className={fieldLabelClass}>节点编号</div>
                <Input aria-label={`第 ${index + 1} 个节点编号`} value={node.id} onChange={(e) => updateNode(index, { id: e.target.value })} className="h-10 min-w-0 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className={fieldLabelClass}>横坐标</div>
                <Input aria-label={`第 ${index + 1} 个节点横坐标`} type="number" step="0.1" value={node.x} onChange={(e) => updateNode(index, { x: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
              </div>
              <div className="space-y-1">
                <div className={fieldLabelClass}>纵坐标</div>
                <Input aria-label={`第 ${index + 1} 个节点纵坐标`} type="number" step="0.1" value={node.y} onChange={(e) => updateNode(index, { y: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
              </div>
              <div className="space-y-1 sm:col-span-2 xl:col-span-2">
                <div className={fieldLabelClass}>支座约束</div>
                <DropdownSelect
                  value={node.supportType ?? "free"}
                  onChange={(nextValue) => updateNode(index, { supportType: nextValue as TrussNode["supportType"] })}
                  options={SUPPORT_OPTIONS}
                  className="text-xs font-mono"
                  menuClassName="text-xs font-mono"
                  ariaLabel={`第 ${index + 1} 个节点支座约束`}
                />
              </div>
              <div className="flex items-end sm:col-span-2 xl:col-span-1">
                <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => removeNode(index)} disabled={value.nodes.length <= 1} aria-label={`删除第 ${index + 1} 个节点`}>
                  <Trash2 className="h-4 w-4 text-rose-300" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>
      ) : null}

      {advancedSectionId === "members" ? (
      <section id="truss-custom-members" className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <Triangle className="h-3.5 w-3.5 text-primary" />
            杆件
          </div>
          <Button variant="outline" size="sm" onClick={addMember} className="h-8 rounded-xl" disabled={value.nodes.length < 2}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新增杆件
          </Button>
        </div>
        <div className="space-y-3">
          {value.members.map((member, index) => (
            <div
              key={`truss-member-${index}`}
              className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3"
            >
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <div className="space-y-1">
                  <div className={fieldLabelClass}>杆件编号</div>
                  <Input aria-label={`第 ${index + 1} 个杆件编号`} value={member.id} onChange={(e) => updateMember(index, { id: e.target.value })} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>起点节点</div>
                  <DropdownSelect
                    value={member.start}
                    onChange={(nextValue) => updateMember(index, { start: nextValue })}
                    options={nodeOptions}
                    className="min-w-0 text-xs font-mono"
                    menuClassName="text-xs font-mono"
                    ariaLabel={`第 ${index + 1} 个杆件起点节点`}
                  />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>终点节点</div>
                  <DropdownSelect
                    value={member.end}
                    onChange={(nextValue) => updateMember(index, { end: nextValue })}
                    options={nodeOptions}
                    className="min-w-0 text-xs font-mono"
                    menuClassName="text-xs font-mono"
                    ariaLabel={`第 ${index + 1} 个杆件终点节点`}
                  />
                </div>
                <div className="flex items-end md:justify-end">
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => removeMember(index)} aria-label={`删除第 ${index + 1} 个杆件`}>
                    <Trash2 className="h-4 w-4 text-rose-300" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
                <div className="space-y-1">
                  <div className={fieldLabelClass}>弹性模量</div>
                  <Input aria-label={`第 ${index + 1} 个杆件弹性模量`} type="number" value={member.E_GPa} onChange={(e) => updateMember(index, { E_GPa: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>截面面积</div>
                  <Input aria-label={`第 ${index + 1} 个杆件截面面积`} type="number" value={member.A_cm2} onChange={(e) => updateMember(index, { A_cm2: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>杆件类型</div>
                  <DropdownSelect
                    value={member.kind ?? "generic"}
                    onChange={(nextValue) => updateMember(index, { kind: nextValue })}
                    options={MEMBER_KIND_OPTIONS}
                    className="min-w-0 text-xs font-mono"
                    menuClassName="text-xs font-mono"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      ) : null}

      {advancedSectionId === "loads" ? (
      <section id="truss-custom-loads" className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5 text-primary" />
            荷载
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={addNodalLoad} className="h-8 rounded-xl">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              新增节点荷载
            </Button>
            <Button variant="outline" size="sm" onClick={addMemberLoad} disabled={value.members.length === 0} className="h-8 rounded-xl">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              新增杆件荷载
            </Button>
          </div>
        </div>
        <div className="space-y-3">
          {value.loads.map((load, index) => {
            const isMemberLoad = load.type !== "nodal";
            return (
              <div key={index} className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <div className="space-y-1">
                    <div className={fieldLabelClass}>荷载类型</div>
                    <DropdownSelect
                      value={isMemberLoad ? "distributed" : "nodal"}
                      onChange={(nextValue) => {
                        if (nextValue === "distributed") {
                          updateLoad(index, createMemberLoadDraft(value.members, isMemberLoad ? load.member : undefined));
                          return;
                        }
                        updateLoad(index, createNodalLoadDraft(value.nodes));
                      }}
                      options={LOAD_TYPE_OPTIONS}
                      className="text-xs font-mono"
                      menuClassName="text-xs font-mono"
                      ariaLabel={`第 ${index + 1} 条荷载类型`}
                    />
                  </div>
                  <div className="space-y-1">
                    <div className={fieldLabelClass}>{isMemberLoad ? "作用杆件" : "作用节点"}</div>
                    {isMemberLoad ? (
                      <DropdownSelect value={load.member} onChange={(nextValue) => updateLoad(index, { member: nextValue } as Partial<TrussLoad>)} options={memberOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${index + 1} 条荷载作用杆件`} />
                    ) : (
                      <DropdownSelect value={load.node} onChange={(nextValue) => updateLoad(index, { node: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" ariaLabel={`第 ${index + 1} 条荷载作用节点`} />
                    )}
                  </div>
                  <div className="flex items-end">
                    <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => removeLoad(index)} aria-label={`删除第 ${index + 1} 条荷载`}>
                      <Trash2 className="h-4 w-4 text-rose-300" />
                    </Button>
                  </div>
                </div>
                {isMemberLoad ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <div className="space-y-1">
                      <div className={fieldLabelClass}>荷载方向</div>
                      <DropdownSelect
                        value={load.direction ?? "global_y"}
                        onChange={(nextValue) => updateLoad(index, { direction: nextValue as "global_x" | "global_y" } as Partial<TrussLoad>)}
                        options={MEMBER_LOAD_DIRECTION_OPTIONS}
                        className="text-xs font-mono"
                        menuClassName="text-xs font-mono"
                        ariaLabel={`第 ${index + 1} 条荷载方向`}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className={fieldLabelClass}>起点线荷载（kN/m）</div>
                      <Input aria-label={`第 ${index + 1} 条荷载起点线荷载（kN/m）`} type="number" step="0.1" value={load.qStartKnPerM ?? load.wyKnPerM ?? 0} onChange={(e) => updateLoad(index, { qStartKnPerM: Number(e.target.value) || 0 } as Partial<TrussLoad>)} className="h-10 min-w-0 font-mono text-xs" />
                    </div>
                    <div className="space-y-1">
                      <div className={fieldLabelClass}>终点线荷载（kN/m）</div>
                      <Input aria-label={`第 ${index + 1} 条荷载终点线荷载（kN/m）`} type="number" step="0.1" value={load.qEndKnPerM ?? load.wyKnPerM ?? 0} onChange={(e) => updateLoad(index, { qEndKnPerM: Number(e.target.value) || 0 } as Partial<TrussLoad>)} className="h-10 min-w-0 font-mono text-xs" />
                    </div>
                    <div className="space-y-1">
                      <div className={fieldLabelClass}>自重强度（可选，kN/m）</div>
                      <Input aria-label={`第 ${index + 1} 条荷载自重强度（可选，kN/m）`} type="number" step="0.1" value={load.selfWeightKnPerM ?? ""} onChange={(e) => updateLoad(index, { selfWeightKnPerM: e.target.value === "" ? undefined : Number(e.target.value) || 0 } as Partial<TrussLoad>)} className="h-10 min-w-0 font-mono text-xs" placeholder="优先按向下自重换算" />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <div className={fieldLabelClass}>X 向力</div>
                      <Input aria-label={`第 ${index + 1} 条荷载 X 向力`} type="number" step="0.1" value={load.fxKn ?? 0} onChange={(e) => updateLoad(index, { fxKn: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
                    </div>
                    <div className="space-y-1">
                      <div className={fieldLabelClass}>Y 向力</div>
                      <Input aria-label={`第 ${index + 1} 条荷载 Y 向力`} type="number" step="0.1" value={load.fyKn ?? 0} onChange={(e) => updateLoad(index, { fyKn: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>
      ) : null}
        </div>
      </section>
      ) : null}
    </div>
  );
}
