import { useMemo, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { DropdownSelect } from "./ui/DropdownSelect";
import { Plus, Trash2, Layers3, Link2, MapPin, RotateCw, Sparkles, GitBranch, Waypoints, FileText, CheckCircle2, AlertTriangle, Wand2 } from "lucide-react";
import { TextModelCheckPanel, type TextModelPreviewMetric } from "./TextModelCheckPanel";
import { parseFrameTextModel, serializeFrameTextModel } from "../lib/frame-text-model.ts";
import { FRAME_MODEL_TEMPLATES, cloneFrameModelTemplate } from "../lib/workbench-model-templates.ts";
import type {
  FrameLoad,
  FrameLoadCase,
  FrameLoadCombination,
  FrameLoadDirection,
  FrameSpring,
  StructureMember,
  StructureNode,
} from "../types/structure.ts";
import type { FrameWorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection.ts";

interface FrameCollections {
  nodes: StructureNode[];
  members: StructureMember[];
  loads: FrameLoad[];
  loadCases: FrameLoadCase[];
  loadCombinations: FrameLoadCombination[];
}

interface FrameCustomModelEditorProps {
  value: FrameCollections;
  onChange: (next: FrameCollections) => void;
  onResetToPortal: () => void;
  activeSectionId?: string;
  selection?: FrameWorkbenchSelection | null;
  onSelectionChange?: (next: FrameWorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
}

type FrameSelectedObject =
  | { type: "node"; id: string }
  | { type: "member"; id: string }
  | { type: "load"; id: string };
type FrameAdvancedSection = "nodes" | "members" | "loads" | "loadCases" | "loadCombinations";

const SUPPORT_OPTIONS = [
  { value: "fixed", label: "固定" },
  { value: "pinned", label: "铰接" },
  { value: "roller", label: "滚动" },
  { value: "free", label: "自由" },
];

const MEMBER_KIND_OPTIONS = [
  { value: "column", label: "柱" },
  { value: "beam", label: "梁" },
  { value: "brace", label: "支撑" },
  { value: "generic", label: "通用" },
];

const LOAD_TYPE_OPTIONS = [
  { value: "nodal", label: "节点荷载" },
  { value: "distributed", label: "构件分布荷载" },
  { value: "member_point", label: "构件集中荷载" },
];

const LOAD_DIRECTION_OPTIONS: Array<{ value: FrameLoadDirection; label: string }> = [
  { value: "local_y", label: "构件局部 y" },
  { value: "global_y", label: "全局 Y" },
];

const SPRING_DOF_OPTIONS = [
  { value: "uy", label: "竖向平动 uy" },
  { value: "ux", label: "水平平动 ux" },
  { value: "rz", label: "转角 rz" },
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

function createNodeDraft(index: number, existingIds: string[]): StructureNode {
  const isBase = index < 2;
  return {
    id: nextDraftId("N", existingIds),
    x: (index + 1) * 3,
    y: isBase ? 0 : 4,
    supportType: isBase ? "fixed" : "free",
  };
}

function positiveStep(values: number[], fallback: number): number {
  const sorted = [...new Set(values.map((value) => Number(value.toFixed(6))))].sort((a, b) => a - b);
  const steps = sorted
    .slice(1)
    .map((value, index) => value - sorted[index])
    .filter((value) => Number.isFinite(value) && value > 1e-9);
  return steps[0] ?? fallback;
}

function inferNodeDraft(nodes: StructureNode[], existingIds: string[]): StructureNode {
  if (nodes.length === 0) {
    return createNodeDraft(0, existingIds);
  }

  const maxY = Math.max(...nodes.map((node) => node.y));
  const topNodes = nodes.filter((node) => Math.abs(node.y - maxY) < 1e-9);
  const reference = topNodes.reduce((rightMost, node) => (node.x > rightMost.x ? node : rightMost), topNodes[0]);
  const dx = positiveStep(nodes.map((node) => node.x), 3);
  return {
    id: nextDraftId("N", existingIds),
    x: Number((reference.x + dx).toFixed(3)),
    y: reference.y,
    supportType: reference.y === 0 ? "roller" : "free",
  };
}

function distanceBetween(a: StructureNode, b: StructureNode): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function memberKindBetween(start: StructureNode | undefined, end: StructureNode | undefined): string {
  if (!start || !end) return "generic";
  if (Math.abs(start.x - end.x) < 1e-9) return "column";
  if (Math.abs(start.y - end.y) < 1e-9) return "beam";
  return "brace";
}

function memberExists(members: StructureMember[], start: string, end: string): boolean {
  return members.some((member) => (member.start === start && member.end === end) || (member.start === end && member.end === start));
}

function templateForKind(members: StructureMember[], kind: string): Pick<StructureMember, "E_GPa" | "A_cm2" | "I_cm4" | "kind"> {
  const template = members.find((member) => member.kind === kind) ?? members[0];
  return {
    E_GPa: template?.E_GPa ?? 210,
    A_cm2: template?.A_cm2 ?? 120,
    I_cm4: template?.I_cm4 ?? 8000,
    kind: template?.kind ?? kind,
  };
}

function createConnectedMember(
  start: StructureNode,
  end: StructureNode,
  members: StructureMember[],
  existingIds: string[]
): StructureMember {
  const kind = memberKindBetween(start, end);
  return {
    id: nextDraftId(kind === "beam" ? "B" : kind === "column" ? "C" : "M", existingIds),
    start: start.id,
    end: end.id,
    elementType: "frame",
    ...templateForKind(members, kind),
    kind,
  };
}

function createMemberDraft(index: number, nodes: StructureNode[], existingIds: string[]): StructureMember {
  const start = nodes[index]?.id ?? nodes[0]?.id ?? "N1";
  const end = nodes[index + 1]?.id ?? nodes[nodes.length - 1]?.id ?? start;
  return {
    id: nextDraftId("M", existingIds),
    start,
    end,
    elementType: "frame",
    E_GPa: 210,
    A_cm2: 120,
    I_cm4: 8000,
    kind: "generic",
  };
}

function createLoadDraft(index: number, nodes: StructureNode[], members: StructureMember[]): FrameLoad {
  const fallbackNodeId = nodes[0]?.id ?? "N1";
  const fallbackMemberId = members[0]?.id ?? "M1";

  if (index % 3 === 1 && members.length > 0) {
    return {
      type: "distributed",
      member: members[index % members.length]?.id ?? fallbackMemberId,
      direction: "local_y",
      qStartKnPerM: -10,
      qEndKnPerM: -10,
      startRatio: 0,
      endRatio: 1,
    };
  }

  if (index % 3 === 2 && members.length > 0) {
    return {
      type: "member_point",
      member: members[index % members.length]?.id ?? fallbackMemberId,
      direction: "local_y",
      forceKn: -10,
      positionRatio: 0.5,
    };
  }

  return {
    type: "nodal",
    node: fallbackNodeId,
    fxKn: 0,
    fyKn: -10,
    mzKnM: 0,
  };
}

function createLoadCaseDraft(index: number, nodes: StructureNode[], members: StructureMember[], existingIds: string[]): FrameLoadCase {
  const id = nextDraftId("LC", existingIds);
  return {
    id,
    title: `工况 ${index + 1}`,
    loads: [createLoadDraft(0, nodes, members)],
  };
}

function createCombinationDraft(index: number, loadCases: FrameLoadCase[], existingIds: string[]): FrameLoadCombination {
  const id = nextDraftId("COMB", existingIds);
  return {
    id,
    title: `组合 ${index + 1}`,
    factors: Object.fromEntries(loadCases.map((loadCase) => [loadCase.id, 1.0])),
    tags: [],
  };
}

function updateSpringValue(spring: FrameSpring, patch: Partial<FrameSpring>): FrameSpring {
  const dof = patch.dof ?? spring.dof;
  if (dof === "rz") {
    const previous = spring.dof === "rz" ? spring.stiffnessKnMPerRad : spring.stiffnessKnPerM;
    const next = "stiffnessKnMPerRad" in patch ? patch.stiffnessKnMPerRad : previous;
    return { dof, stiffnessKnMPerRad: Number(next) || 0 };
  }
  const previous = spring.dof === "rz" ? spring.stiffnessKnMPerRad : spring.stiffnessKnPerM;
  const next = "stiffnessKnPerM" in patch ? patch.stiffnessKnPerM : previous;
  return { dof, stiffnessKnPerM: Number(next) || 0 };
}

function canonicalId(value: string | undefined, fallback: string): string {
  return value?.trim() || fallback;
}

export function FrameCustomModelEditor({
  value,
  onChange,
  onResetToPortal,
  activeSectionId,
  selection,
  onSelectionChange,
}: FrameCustomModelEditorProps) {
  const [textModelDraft, setTextModelDraft] = useState("");
  const [textModelMessage, setTextModelMessage] = useState<string | null>(null);
  const [textModelDiagnostics, setTextModelDiagnostics] = useState<string[]>([]);
  const [textModelPreviewMetrics, setTextModelPreviewMetrics] = useState<TextModelPreviewMetric[]>([]);
  const [selectedObject, setSelectedObject] = useState<FrameSelectedObject>({ type: "node", id: value.nodes[0]?.id ?? "" });
  const [advancedSectionId, setAdvancedSectionId] = useState<FrameAdvancedSection>("nodes");
  const visibleSectionId = activeSectionId ?? "frame-custom-overview";
  const isSectionVisible = (sectionId: string) => visibleSectionId === sectionId;

  const nodeOptions = useMemo(
    () => value.nodes.map((node, index) => ({ value: node.id, label: `节点 ${index + 1}（${node.id}）` })),
    [value.nodes]
  );
  const memberOptions = useMemo(
    () => value.members.map((member, index) => ({ value: member.id, label: `构件 ${index + 1}（${member.id}）` })),
    [value.members]
  );
  const loadOptions = useMemo(
    () => value.loads.map((load, index) => ({
      value: `load-${index}`,
      label: load.type === "nodal"
        ? `节点荷载 ${index + 1}（${load.node}）`
        : load.type === "member_point"
          ? `构件集中荷载 ${index + 1}（${load.member}）`
          : `构件分布荷载 ${index + 1}（${load.member}）`,
    })),
    [value.loads]
  );
  const resolvedSelectedObject = useMemo<FrameSelectedObject>(() => {
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
    if (supportCount === 0) warnings.push("尚未设置支座约束。");
    if (value.members.some((member) => !nodeIds.has(member.start) || !nodeIds.has(member.end))) warnings.push("存在引用缺失节点的构件。");
    if (value.loads.length === 0) warnings.push("尚未设置基本荷载。");
    if (value.members.length === 0) warnings.push("尚未设置构件。");
    return warnings;
  }, [supportCount, value.loads.length, value.members, value.nodes]);

  const commit = (next: FrameCollections) => onChange(next);

  const selectObject = (next: FrameSelectedObject, options?: WorkbenchSelectionOptions) => {
    setSelectedObject(next);
    onSelectionChange?.({ mode: "frame", type: next.type, id: next.id }, options);
  };

  const keep = (patch: Partial<FrameCollections> = {}): FrameCollections => ({
    nodes: patch.nodes ?? value.nodes,
    members: patch.members ?? value.members,
    loads: patch.loads ?? value.loads,
    loadCases: patch.loadCases ?? value.loadCases,
    loadCombinations: patch.loadCombinations ?? value.loadCombinations,
  });

  const buildTextModelCollections = (collections: { nodes: StructureNode[]; members: StructureMember[]; loads: FrameLoad[] }) => {
    let nextMembers = collections.members;
    if (nextMembers.length === 0 && collections.nodes.length >= 2) {
      const generatedMembers: StructureMember[] = [];
      collections.nodes.slice(1).forEach((node, index) => {
        generatedMembers.push(createConnectedMember(
          collections.nodes[index],
          node,
          generatedMembers,
          generatedMembers.map((member) => member.id)
        ));
      });
      nextMembers = generatedMembers;
    }

    return {
      nodes: collections.nodes,
      members: nextMembers,
      loads: collections.loads,
    };
  };

  const applyTypicalCase = (templateId: string) => {
    const template = FRAME_MODEL_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    const collections = cloneFrameModelTemplate(template);
    commit({
      nodes: collections.nodes,
      members: collections.members,
      loads: collections.loads,
      loadCases: [],
      loadCombinations: [],
    });
    selectObject({ type: "node", id: collections.nodes[0]?.id ?? "" }, { openEditor: false });
    setTextModelMessage(`已套用参数模板「${template.title}」。`);
    setTextModelDiagnostics([]);
  };

  const updateNode = (index: number, patch: Partial<StructureNode>) => {
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
    const nextLoads = value.loads.map((load) => {
      if (isRenaming && load.type === "nodal" && load.node === current.id) {
        return { ...load, node: nextId };
      }
      return load;
    });
    const nextLoadCases = value.loadCases.map((loadCase) => ({
      ...loadCase,
      loads: loadCase.loads.map((load) => {
        if (isRenaming && load.type === "nodal" && load.node === current.id) {
          return { ...load, node: nextId };
        }
        return load;
      }),
    }));
    commit(keep({ nodes: nextNodes, members: nextMembers, loads: nextLoads, loadCases: nextLoadCases }));
    if (isRenaming && resolvedSelectedObject.type === "node" && resolvedSelectedObject.id === current.id) {
      selectObject({ type: "node", id: nextId }, { openEditor: false });
    }
  };

  const addNodeSpring = (nodeIndex: number) => {
    const node = value.nodes[nodeIndex];
    if (!node) return;
    updateNode(nodeIndex, { springs: [...(node.springs ?? []), { dof: "uy", stiffnessKnPerM: 10000 }] });
  };

  const updateNodeSpring = (nodeIndex: number, springIndex: number, patch: Partial<FrameSpring>) => {
    const node = value.nodes[nodeIndex];
    if (!node) return;
    updateNode(nodeIndex, {
      springs: (node.springs ?? []).map((spring, index) => (index === springIndex ? updateSpringValue(spring, patch) : spring)),
    });
  };

  const removeNodeSpring = (nodeIndex: number, springIndex: number) => {
    const node = value.nodes[nodeIndex];
    if (!node) return;
    updateNode(nodeIndex, { springs: (node.springs ?? []).filter((_, index) => index !== springIndex) });
  };

  const addNode = () => {
    const nextNode = inferNodeDraft(value.nodes, value.nodes.map((node) => node.id));
    const nextNodes = [...value.nodes, nextNode];
    const nearest = value.nodes.reduce<StructureNode | null>((candidate, node) => {
      if (!candidate) return node;
      return distanceBetween(node, nextNode) < distanceBetween(candidate, nextNode) ? node : candidate;
    }, null);
    const nextMembers = nearest && !memberExists(value.members, nearest.id, nextNode.id)
      ? [...value.members, createConnectedMember(nearest, nextNode, value.members, value.members.map((member) => member.id))]
      : value.members;
    commit(keep({ nodes: nextNodes, members: nextMembers }));
  };

  const completeAxisMembers = () => {
    const nodeById = new Map(value.nodes.map((node) => [node.id, node]));
    const candidates: Array<[StructureNode, StructureNode]> = [];
    const sameXGroups = new Map<number, StructureNode[]>();
    const sameYGroups = new Map<number, StructureNode[]>();
    for (const node of value.nodes) {
      const xKey = Number(node.x.toFixed(6));
      const yKey = Number(node.y.toFixed(6));
      sameXGroups.set(xKey, [...(sameXGroups.get(xKey) ?? []), node]);
      sameYGroups.set(yKey, [...(sameYGroups.get(yKey) ?? []), node]);
    }
    for (const group of sameXGroups.values()) {
      group.sort((a, b) => a.y - b.y).slice(1).forEach((node, index) => candidates.push([group[index], node]));
    }
    for (const group of sameYGroups.values()) {
      group.sort((a, b) => a.x - b.x).slice(1).forEach((node, index) => candidates.push([group[index], node]));
    }

    let nextMembers = [...value.members];
    for (const [start, end] of candidates) {
      if (!nodeById.has(start.id) || !nodeById.has(end.id) || memberExists(nextMembers, start.id, end.id)) {
        continue;
      }
      nextMembers = [...nextMembers, createConnectedMember(start, end, nextMembers, nextMembers.map((member) => member.id))];
    }
    commit(keep({ members: nextMembers }));
  };

  const removeNode = (index: number) => {
    const removed = value.nodes[index];
    if (!removed) return;
    const nextNodes = value.nodes.filter((_, nodeIndex) => nodeIndex !== index);
    const nextMembers = value.members.filter((member) => member.start !== removed.id && member.end !== removed.id);
    const nextLoads = value.loads.filter((load) => load.type !== "nodal" || load.node !== removed.id);
    const nextLoadCases = value.loadCases.map((loadCase) => ({
      ...loadCase,
      loads: loadCase.loads.filter((load) => load.type !== "nodal" || load.node !== removed.id),
    }));
    commit(keep({ nodes: nextNodes, members: nextMembers, loads: nextLoads, loadCases: nextLoadCases }));
  };

  const addMember = () => {
    if (value.nodes.length < 2) {
      return;
    }
    const nextMembers = [...value.members, createMemberDraft(value.members.length, value.nodes, value.members.map((member) => member.id))];
    commit(keep({ members: nextMembers }));
  };

  const updateMember = (index: number, patch: Partial<StructureMember>) => {
    const current = value.members[index];
    if (!current) return;
    const nextId = patch.id !== undefined ? canonicalId(patch.id, current.id) : current.id;
    const nextPatch = patch.id !== undefined ? { ...patch, id: nextId } : patch;
    const isRenaming = nextId !== current.id;
    const nextMembers = value.members.map((member, memberIndex) => (memberIndex === index ? { ...member, ...nextPatch } : member));
    const nextLoads = value.loads.map((load) => {
      if (isRenaming && (load.type === "distributed" || load.type === "member_point") && load.member === current.id) {
        return { ...load, member: nextId };
      }
      return load;
    });
    const nextLoadCases = value.loadCases.map((loadCase) => ({
      ...loadCase,
      loads: loadCase.loads.map((load) => {
        if (isRenaming && (load.type === "distributed" || load.type === "member_point") && load.member === current.id) {
          return { ...load, member: nextId };
        }
        return load;
      }),
    }));
    commit(keep({ members: nextMembers, loads: nextLoads, loadCases: nextLoadCases }));
    if (isRenaming && resolvedSelectedObject.type === "member" && resolvedSelectedObject.id === current.id) {
      selectObject({ type: "member", id: nextId }, { openEditor: false });
    }
  };

  const removeMember = (index: number) => {
    const removed = value.members[index];
    if (!removed) return;
    const nextMembers = value.members.filter((_, memberIndex) => memberIndex !== index);
    const nextLoads = value.loads.filter((load) => load.type === "nodal" || load.member !== removed.id);
    const nextLoadCases = value.loadCases.map((loadCase) => ({
      ...loadCase,
      loads: loadCase.loads.filter((load) => load.type === "nodal" || load.member !== removed.id),
    }));
    commit(keep({ members: nextMembers, loads: nextLoads, loadCases: nextLoadCases }));
  };

  const addLoad = () => {
    const nextLoads = [...value.loads, createLoadDraft(value.loads.length, value.nodes, value.members)];
    commit(keep({ loads: nextLoads }));
  };

  const updateLoad = (index: number, patch: Partial<FrameLoad>) => {
    const current = value.loads[index];
    if (!current) return;
    const nextLoads = value.loads.map((load, loadIndex) => (loadIndex === index ? { ...load, ...patch } as FrameLoad : load));
    commit(keep({ loads: nextLoads }));
  };

  const removeLoad = (index: number) => {
    commit(keep({ loads: value.loads.filter((_, loadIndex) => loadIndex !== index) }));
  };

  const addLoadCase = () => {
    const nextLoadCases = [
      ...value.loadCases,
      createLoadCaseDraft(value.loadCases.length, value.nodes, value.members, value.loadCases.map((loadCase) => loadCase.id)),
    ];
    commit(keep({ loadCases: nextLoadCases }));
  };

  const updateLoadCase = (index: number, patch: Partial<FrameLoadCase>) => {
    const current = value.loadCases[index];
    if (!current) return;
    const nextId = canonicalId(patch.id, current.id);
    const nextPatch = patch.id !== undefined ? { ...patch, id: nextId } : patch;
    const nextLoadCases = value.loadCases.map((loadCase, loadCaseIndex) => (loadCaseIndex === index ? { ...loadCase, ...nextPatch } : loadCase));
    const nextLoadCombinations =
      patch.id !== undefined && nextId !== current.id
        ? value.loadCombinations.map((combination) => {
            if (!(current.id in combination.factors)) return combination;
            const { [current.id]: factor, ...rest } = combination.factors;
            return { ...combination, factors: { ...rest, [nextId]: factor } };
          })
        : value.loadCombinations;
    commit(keep({ loadCases: nextLoadCases, loadCombinations: nextLoadCombinations }));
  };

  const removeLoadCase = (index: number) => {
    const removed = value.loadCases[index];
    if (!removed) return;
    commit(keep({
      loadCases: value.loadCases.filter((_, loadCaseIndex) => loadCaseIndex !== index),
      loadCombinations: value.loadCombinations.map((combination) => {
        const factors = { ...combination.factors };
        delete factors[removed.id];
        return { ...combination, factors };
      }).filter((combination) => Object.keys(combination.factors).length > 0),
    }));
  };

  const addLoadToCase = (loadCaseIndex: number) => {
    const loadCase = value.loadCases[loadCaseIndex];
    if (!loadCase) return;
    updateLoadCase(loadCaseIndex, { loads: [...loadCase.loads, createLoadDraft(loadCase.loads.length, value.nodes, value.members)] });
  };

  const updateLoadInCase = (loadCaseIndex: number, loadIndex: number, patch: Partial<FrameLoad>) => {
    const loadCase = value.loadCases[loadCaseIndex];
    if (!loadCase) return;
    updateLoadCase(loadCaseIndex, {
      loads: loadCase.loads.map((load, index) => (index === loadIndex ? { ...load, ...patch } as FrameLoad : load)),
    });
  };

  const removeLoadFromCase = (loadCaseIndex: number, loadIndex: number) => {
    const loadCase = value.loadCases[loadCaseIndex];
    if (!loadCase) return;
    updateLoadCase(loadCaseIndex, { loads: loadCase.loads.filter((_, index) => index !== loadIndex) });
  };

  const addLoadCombination = () => {
    const nextCombinations = [
      ...value.loadCombinations,
      createCombinationDraft(value.loadCombinations.length, value.loadCases, value.loadCombinations.map((combination) => combination.id)),
    ];
    commit(keep({ loadCombinations: nextCombinations }));
  };

  const updateLoadCombination = (index: number, patch: Partial<FrameLoadCombination>) => {
    const combination = value.loadCombinations[index];
    if (!combination) return;
    const nextPatch = patch.id !== undefined ? { ...patch, id: canonicalId(patch.id, combination.id) } : patch;
    const nextCombinations = value.loadCombinations.map((item, itemIndex) => (itemIndex === index ? { ...item, ...nextPatch } : item));
    commit(keep({ loadCombinations: nextCombinations }));
  };

  const fieldLabelClass = "text-[10px] font-black tracking-widest text-muted-foreground";
  const advancedSections: Array<{ id: FrameAdvancedSection; label: string; count: number }> = [
    { id: "nodes", label: "节点", count: value.nodes.length },
    { id: "members", label: "构件", count: value.members.length },
    { id: "loads", label: "荷载", count: value.loads.length },
    { id: "loadCases", label: "工况", count: value.loadCases.length },
    { id: "loadCombinations", label: "组合", count: value.loadCombinations.length },
  ];

  const exportTextModel = () => {
    setTextModelDraft(serializeFrameTextModel({ nodes: value.nodes, members: value.members, loads: value.loads }));
    setTextModelDiagnostics([]);
    setTextModelPreviewMetrics([]);
    setTextModelMessage("已按当前节点、构件与基本荷载生成文本模型，可编辑后先检查再应用。");
  };

  const previewTextModelDraft = (draft: string) => {
    setTextModelDraft(draft);
    if (draft.trim().length === 0) {
      setTextModelDiagnostics([]);
      setTextModelPreviewMetrics([]);
      setTextModelMessage(null);
      return;
    }

    const result = parseFrameTextModel(draft);
    setTextModelDiagnostics(result.diagnostics);
    if (!result.collections || result.diagnostics.length > 0) {
      setTextModelPreviewMetrics([]);
      setTextModelMessage(null);
      return;
    }

    const next = buildTextModelCollections(result.collections);
    setTextModelPreviewMetrics([
      { label: "节点", value: `${next.nodes.length}` },
      { label: "构件", value: `${next.members.length}` },
      { label: "基本荷载", value: `${next.loads.length}` },
      { label: "工况/组合", value: value.loadCases.length > 0 || value.loadCombinations.length > 0 ? "应用时重置" : "无影响" },
    ]);
    const resetNotice = value.loadCases.length > 0 || value.loadCombinations.length > 0 ? "；现有工况与组合将在应用时重置" : "";
    setTextModelMessage(`检查通过：将导入 ${next.nodes.length} 个节点、${next.members.length} 个构件、${next.loads.length} 条基本荷载${resetNotice}。点击“应用文本模型”后写入正式模型。`);
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
    const result = parseFrameTextModel(textModelDraft);
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

    const next = buildTextModelCollections(result.collections);
    commit(keep({
      nodes: next.nodes,
      members: next.members,
      loads: next.loads,
      loadCases: [],
      loadCombinations: [],
    }));
    setTextModelPreviewMetrics([
      { label: "节点", value: `${next.nodes.length}` },
      { label: "构件", value: `${next.members.length}` },
      { label: "基本荷载", value: `${next.loads.length}` },
      { label: "工况/组合", value: "已重置" },
    ]);
    setTextModelMessage(`已导入 ${next.nodes.length} 个节点、${next.members.length} 个构件、${next.loads.length} 条基本荷载。`);
  };

  const renderLoadEditor = (
    load: FrameLoad,
    index: number,
    onUpdate: (patch: Partial<FrameLoad>) => void,
    onRemove: () => void
  ) => (
    <div key={index} className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_auto]">
        <div className="space-y-1">
          <div className={fieldLabelClass}>荷载类型</div>
          <DropdownSelect
            value={load.type}
            onChange={(nextValue) => {
              if (nextValue === "distributed") {
                onUpdate({
                  type: "distributed",
                  member: value.members[0]?.id ?? "M1",
                  direction: "local_y",
                  qStartKnPerM: "qStartKnPerM" in load ? load.qStartKnPerM ?? 0 : -10,
                  qEndKnPerM: "qEndKnPerM" in load ? load.qEndKnPerM ?? 0 : -10,
                  startRatio: "startRatio" in load ? load.startRatio ?? 0 : 0,
                  endRatio: "endRatio" in load ? load.endRatio ?? 1 : 1,
                } as FrameLoad);
                return;
              }
              if (nextValue === "member_point") {
                onUpdate({
                  type: "member_point",
                  member: "member" in load ? load.member : value.members[0]?.id ?? "M1",
                  direction: "direction" in load ? load.direction ?? "local_y" : "local_y",
                  forceKn: "forceKn" in load ? load.forceKn ?? -10 : -10,
                  positionRatio: "positionRatio" in load ? load.positionRatio ?? 0.5 : 0.5,
                } as FrameLoad);
                return;
              }
              onUpdate({
                type: "nodal",
                node: value.nodes[0]?.id ?? "N1",
                fxKn: "fxKn" in load ? load.fxKn ?? 0 : 0,
                fyKn: "fyKn" in load ? load.fyKn ?? -10 : -10,
                mzKnM: "mzKnM" in load ? load.mzKnM ?? 0 : 0,
              } as FrameLoad);
            }}
            options={LOAD_TYPE_OPTIONS}
            className="text-xs font-mono"
            menuClassName="text-xs font-mono"
          />
        </div>
        {load.type === "nodal" ? (
          <div className="space-y-1">
            <div className={fieldLabelClass}>作用节点</div>
            <DropdownSelect value={load.node} onChange={(nextValue) => onUpdate({ node: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" />
          </div>
        ) : (
          <div className="space-y-1">
            <div className={fieldLabelClass}>作用构件</div>
            <DropdownSelect value={load.member} onChange={(nextValue) => onUpdate({ member: nextValue })} options={memberOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" />
          </div>
        )}
        <div className="flex items-end">
          <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-rose-300" />
          </Button>
        </div>
      </div>
      {load.type === "nodal" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <div className={fieldLabelClass}>X 向力（kN）</div>
            <Input type="number" step="0.1" value={load.fxKn ?? 0} onChange={(e) => onUpdate({ fxKn: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>Y 向力（kN）</div>
            <Input type="number" step="0.1" value={load.fyKn ?? 0} onChange={(e) => onUpdate({ fyKn: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>节点弯矩（kN·m）</div>
            <Input type="number" step="0.1" value={load.mzKnM ?? 0} onChange={(e) => onUpdate({ mzKnM: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
        </div>
      ) : load.type === "distributed" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <div className={fieldLabelClass}>荷载方向</div>
            <DropdownSelect
              value={load.direction ?? "local_y"}
              onChange={(nextValue) => onUpdate({ direction: nextValue as FrameLoadDirection })}
              options={LOAD_DIRECTION_OPTIONS}
              className="text-xs font-mono"
              menuClassName="text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>起点强度（kN/m）</div>
            <Input type="number" step="0.1" value={load.qStartKnPerM ?? load.wyKnPerM ?? 0} onChange={(e) => onUpdate({ qStartKnPerM: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>终点强度（kN/m）</div>
            <Input type="number" step="0.1" value={load.qEndKnPerM ?? load.wyKnPerM ?? 0} onChange={(e) => onUpdate({ qEndKnPerM: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>起点位置 x/L</div>
            <Input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={load.startRatio ?? 0}
              onChange={(e) => onUpdate({ startRatio: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
              className="h-10 min-w-0 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>终点位置 x/L</div>
            <Input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={load.endRatio ?? 1}
              onChange={(e) => onUpdate({ endRatio: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
              className="h-10 min-w-0 font-mono text-xs"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-1">
            <div className={fieldLabelClass}>荷载方向</div>
            <DropdownSelect
              value={load.direction ?? "local_y"}
              onChange={(nextValue) => onUpdate({ direction: nextValue as FrameLoadDirection })}
              options={LOAD_DIRECTION_OPTIONS}
              className="text-xs font-mono"
              menuClassName="text-xs font-mono"
            />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>位置比 x/L</div>
            <Input
              type="number"
              step="0.05"
              min="0"
              max="1"
              value={load.positionRatio ?? 0.5}
              onChange={(e) => onUpdate({ positionRatio: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })}
              className="h-10 min-w-0 font-mono text-xs"
            />
          </div>
          <div className="space-y-1">
            <div className={fieldLabelClass}>集中力（kN）</div>
            <Input type="number" step="0.1" value={load.forceKn ?? 0} onChange={(e) => onUpdate({ forceKn: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
          </div>
        </div>
      )}
    </div>
  );

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
              <Input value={node.id} onChange={(e) => updateNode(index, { id: e.target.value })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>支座类型</div>
              <DropdownSelect value={node.supportType ?? "free"} onChange={(nextValue) => updateNode(index, { supportType: nextValue as StructureNode["supportType"] })} options={SUPPORT_OPTIONS} className="text-xs font-mono" menuClassName="text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>横坐标（m）</div>
              <Input type="number" step="0.1" value={node.x} onChange={(e) => updateNode(index, { x: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>纵坐标（m）</div>
              <Input type="number" step="0.1" value={node.y} onChange={(e) => updateNode(index, { y: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>滚动约束角（deg）</div>
              <Input type="number" step="1" value={node.supportAngleDeg ?? ""} onChange={(e) => updateNode(index, { supportAngleDeg: e.target.value === "" ? undefined : Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" placeholder="90" />
            </div>
          </div>
          <div className="rounded-lg border border-white/8 bg-white/[0.02] p-3">
            <div className="flex items-center justify-between gap-3">
              <div className={fieldLabelClass}>弹性支座</div>
              <Button variant="outline" size="sm" onClick={() => addNodeSpring(index)} className="h-7 rounded-lg px-2 text-[10px]">
                <Plus className="mr-1 h-3 w-3" />
                新增弹簧
              </Button>
            </div>
            {(node.springs ?? []).length === 0 ? <div className="mt-2 text-xs text-muted-foreground">未设置节点弹簧</div> : null}
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
              <div className={fieldLabelClass}>当前构件</div>
              <div className="mt-1 text-sm font-bold">{member.id}</div>
            </div>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeMember(index)} aria-label="删除当前构件">
              <Trash2 className="h-4 w-4 text-rose-300" />
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <div className={fieldLabelClass}>构件编号</div>
              <Input value={member.id} onChange={(e) => updateMember(index, { id: e.target.value })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>构件类型</div>
              <DropdownSelect value={member.kind ?? "generic"} onChange={(nextValue) => updateMember(index, { kind: nextValue })} options={MEMBER_KIND_OPTIONS} className="text-xs font-mono" menuClassName="text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>起点节点</div>
              <DropdownSelect value={member.start} onChange={(nextValue) => updateMember(index, { start: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>终点节点</div>
              <DropdownSelect value={member.end} onChange={(nextValue) => updateMember(index, { end: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>弹性模量（GPa）</div>
              <Input type="number" value={member.E_GPa} onChange={(e) => updateMember(index, { E_GPa: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>截面面积（cm²）</div>
              <Input type="number" value={member.A_cm2} onChange={(e) => updateMember(index, { A_cm2: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
            <div className="space-y-1">
              <div className={fieldLabelClass}>惯性矩（cm⁴）</div>
              <Input type="number" value={member.I_cm4} onChange={(e) => updateMember(index, { I_cm4: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
            </div>
          </div>
        </div>
      );
    }

    const loadIndex = Number(resolvedSelectedObject.id.replace("load-", ""));
    const load = value.loads[loadIndex];
    if (!load) return null;
    return renderLoadEditor(load, loadIndex, (patch) => updateLoad(loadIndex, patch), () => removeLoad(loadIndex));
  };

  return (
    <div className="space-y-5">
      {isSectionVisible("frame-custom-overview") ? (
      <>
      <div id="frame-custom-overview" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="eyebrow flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              自定义节点建模
            </div>
            <p className="text-xs text-muted-foreground">
              先套用参数模板或选择当前对象，再在属性检查器中修改；批量字段保留在高级表格中。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onResetToPortal} className="h-8 rounded-xl">
              <RotateCw className="mr-1.5 h-3.5 w-3.5" />
              恢复单跨刚架
            </Button>
            <Button variant="outline" size="sm" onClick={completeAxisMembers} className="h-8 rounded-xl">
              <Wand2 className="mr-1.5 h-3.5 w-3.5" />
              补全同轴构件
            </Button>
            <Button size="sm" onClick={addNode} className="h-8 rounded-xl">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              新增节点并连接
            </Button>
          </div>
        </div>
      </div>

      <section className="space-y-4 rounded-2xl border border-white/8 bg-white/[0.03] p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "节点", value: value.nodes.length },
            { label: "构件", value: value.members.length },
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
          <div className="flex items-start gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/8 p-3 text-xs text-emerald-700 dark:text-emerald-200">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            当前模型对象引用完整，可继续复核截面、支座与荷载参数。
          </div>
        ) : (
          <div className="space-y-1 rounded-xl border border-amber-400/15 bg-amber-500/8 p-3 text-xs text-amber-700 dark:text-amber-200">
            {modelWarnings.map((warning) => (
              <div key={warning} className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        )}
      </section>
      </>
      ) : null}

      {isSectionVisible("frame-text-model") ? (
      <section id="frame-text-model" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
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
          placeholder={"N,1,0,0\nN,2,6,0\nN,3,0,4\nN,4,6,4\nNSUPT,1,6,0\nNSUPT,2,6,0\nE,1,3,1,1,1,1,1,1\nE,3,4,1,1,1,1,1,1\nE,2,4,1,1,1,1,1,1\nDLOAD,2,-18,-18,global_y,0.15,0.85\nPLOAD,2,-12,0.5,global_y\nNLOAD,4,-1,24,90"}
        />
        <TextModelCheckPanel
          message={textModelMessage}
          diagnostics={textModelDiagnostics}
          metrics={textModelPreviewMetrics}
          maxDiagnostics={4}
        />
      </section>
      ) : null}

      {isSectionVisible("frame-typical-cases") ? (
      <section id="frame-typical-cases" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            模板
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2">
          {FRAME_MODEL_TEMPLATES.map((template) => (
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
                    {template.nodes.length} 节点
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

      {isSectionVisible("frame-object-navigator") ? (
      <section id="frame-object-navigator" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="eyebrow flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          对象
        </div>
        <div className="grid grid-cols-1 gap-3">
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
            <div className={fieldLabelClass}>构件</div>
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
              <Button variant="outline" size="sm" onClick={addLoad} className="h-8 rounded-lg px-2 text-[10px]">
                <Plus className="mr-1 h-3 w-3" />
                新增荷载
              </Button>
            </div>
          </div>
        </div>
      </section>
      ) : null}

      {isSectionVisible("frame-object-navigator") ? (
      <section id="frame-selected-editor" className="space-y-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <Layers3 className="h-3.5 w-3.5 text-primary" />
            属性
          </div>
          <Button variant="outline" size="sm" onClick={addNode} className="h-8 rounded-xl">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新增节点并连接
          </Button>
        </div>
        {renderSelectedEditor()}
      </section>
      ) : null}

      {isSectionVisible("frame-advanced-tables") ? (
      <section id="frame-advanced-tables" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 scroll-mt-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="框架高级表格分组">
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
      <section id="frame-custom-nodes" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 text-primary" />
            节点
          </div>
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">支持编号 / 横坐标 / 纵坐标 / 支座类型</span>
        </div>
        <div className="space-y-3">
          {value.nodes.map((node, index) => (
            <div key={`frame-node-${index}`} className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className={fieldLabelClass}>节点编号</div>
                  <Input value={node.id} onChange={(e) => updateNode(index, { id: e.target.value })} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>横坐标</div>
                  <Input type="number" step="0.1" value={node.x} onChange={(e) => updateNode(index, { x: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>纵坐标</div>
                  <Input type="number" step="0.1" value={node.y} onChange={(e) => updateNode(index, { y: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>支座类型</div>
                  <DropdownSelect
                    value={node.supportType ?? "free"}
                    onChange={(nextValue) => updateNode(index, { supportType: nextValue as StructureNode["supportType"] })}
                    options={SUPPORT_OPTIONS}
                    className="text-xs font-mono"
                    menuClassName="text-xs font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>滚动约束角</div>
                  <Input
                    type="number"
                    step="1"
                    value={node.supportAngleDeg ?? ""}
                    onChange={(e) => updateNode(index, { supportAngleDeg: e.target.value === "" ? undefined : Number(e.target.value) || 0 })}
                    className="h-10 min-w-0 font-mono text-xs"
                    placeholder="90"
                  />
                </div>
                <div className="col-span-2 flex justify-end">
                  <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => removeNode(index)} disabled={value.nodes.length <= 1}>
                    <Trash2 className="h-4 w-4 text-rose-300" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2 rounded-xl border border-white/8 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className={fieldLabelClass}>弹性支座</div>
                  <Button variant="outline" size="sm" onClick={() => addNodeSpring(index)} className="h-7 rounded-lg px-2 text-[10px]">
                    <Plus className="mr-1 h-3 w-3" />
                    新增弹簧
                  </Button>
                </div>
                {(node.springs ?? []).length === 0 ? (
                  <div className="text-xs text-muted-foreground">未设置节点弹簧</div>
                ) : (
                  <div className="space-y-2">
                    {(node.springs ?? []).map((spring, springIndex) => (
                      <div key={`frame-node-${index}-spring-${springIndex}`} className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                        <DropdownSelect
                          value={spring.dof}
                          onChange={(nextValue) => updateNodeSpring(index, springIndex, { dof: nextValue as FrameSpring["dof"] })}
                          options={SPRING_DOF_OPTIONS}
                          className="text-xs font-mono"
                          menuClassName="text-xs font-mono"
                        />
                        <Input
                          type="number"
                          step="100"
                          value={spring.dof === "rz" ? spring.stiffnessKnMPerRad : spring.stiffnessKnPerM}
                          onChange={(e) =>
                            updateNodeSpring(
                              index,
                              springIndex,
                              spring.dof === "rz"
                                ? { stiffnessKnMPerRad: Number(e.target.value) || 0 } as Partial<FrameSpring>
                                : { stiffnessKnPerM: Number(e.target.value) || 0 } as Partial<FrameSpring>
                            )
                          }
                          className="h-10 min-w-0 font-mono text-xs"
                        />
                        <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => removeNodeSpring(index, springIndex)}>
                          <Trash2 className="h-4 w-4 text-rose-300" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
      ) : null}

      {advancedSectionId === "members" ? (
      <section id="frame-custom-members" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <Layers3 className="h-3.5 w-3.5 text-primary" />
            构件
          </div>
          <Button variant="outline" size="sm" onClick={addMember} className="h-8 rounded-xl" disabled={value.nodes.length < 2}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新增构件
          </Button>
        </div>
        <div className="space-y-3">
          {value.members.map((member, index) => (
            <div key={`frame-member-${index}`} className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
                <div className="space-y-1">
                  <div className={fieldLabelClass}>构件编号</div>
                  <Input value={member.id} onChange={(e) => updateMember(index, { id: e.target.value })} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>起点节点</div>
                  <DropdownSelect value={member.start} onChange={(nextValue) => updateMember(index, { start: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>终点节点</div>
                  <DropdownSelect value={member.end} onChange={(nextValue) => updateMember(index, { end: nextValue })} options={nodeOptions} className="text-xs font-mono" menuClassName="text-xs font-mono" />
                </div>
                <div className="flex items-end">
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => removeMember(index)}>
                    <Trash2 className="h-4 w-4 text-rose-300" />
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-1">
                  <div className={fieldLabelClass}>弹性模量</div>
                  <Input type="number" value={member.E_GPa} onChange={(e) => updateMember(index, { E_GPa: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>截面面积</div>
                  <Input type="number" value={member.A_cm2} onChange={(e) => updateMember(index, { A_cm2: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>惯性矩</div>
                  <Input type="number" value={member.I_cm4} onChange={(e) => updateMember(index, { I_cm4: Number(e.target.value) || 0 })} className="h-10 min-w-0 font-mono text-xs" />
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>构件类型</div>
                  <DropdownSelect
                    value={member.kind ?? "generic"}
                    onChange={(nextValue) => updateMember(index, { kind: nextValue })}
                    options={MEMBER_KIND_OPTIONS}
                    className="text-xs font-mono"
                    menuClassName="text-xs font-mono"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-3 lg:grid-cols-2">
                <div className="space-y-2">
                  <div className={fieldLabelClass}>端部转角释放</div>
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(member.endReleases?.start?.includes("rz"))}
                        onChange={(e) =>
                          updateMember(index, {
                            endReleases: {
                              ...member.endReleases,
                              start: e.target.checked ? ["rz"] : undefined,
                            },
                          })
                        }
                      />
                      起端 rz 释放
                    </label>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(member.endReleases?.end?.includes("rz"))}
                        onChange={(e) =>
                          updateMember(index, {
                            endReleases: {
                              ...member.endReleases,
                              end: e.target.checked ? ["rz"] : undefined,
                            },
                          })
                        }
                      />
                      终端 rz 释放
                    </label>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className={fieldLabelClass}>构件内部铰</div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateMember(index, { internalHinges: [...(member.internalHinges ?? []), { ratio: 0.5 }] })}
                      className="h-7 rounded-lg px-2 text-[10px]"
                    >
                      <Plus className="mr-1 h-3 w-3" />
                      新增铰点
                    </Button>
                  </div>
                  {(member.internalHinges ?? []).length === 0 ? (
                    <div className="text-xs text-muted-foreground">未设置内部铰</div>
                  ) : (
                    <div className="space-y-2">
                      {(member.internalHinges ?? []).map((hinge, hingeIndex) => (
                        <div key={`frame-member-${index}-hinge-${hingeIndex}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                          <Input
                            type="number"
                            step="0.05"
                            min="0.01"
                            max="0.99"
                            value={hinge.ratio}
                            onChange={(e) =>
                              updateMember(index, {
                                internalHinges: (member.internalHinges ?? []).map((item, itemIndex) =>
                                  itemIndex === hingeIndex ? { ratio: Number(e.target.value) || 0.5 } : item
                                ),
                              })
                            }
                            className="h-10 min-w-0 font-mono text-xs"
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10"
                            onClick={() =>
                              updateMember(index, {
                                internalHinges: (member.internalHinges ?? []).filter((_, itemIndex) => itemIndex !== hingeIndex),
                              })
                            }
                          >
                            <Trash2 className="h-4 w-4 text-rose-300" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
      ) : null}

      {advancedSectionId === "loads" ? (
      <section id="frame-custom-loads" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <Link2 className="h-3.5 w-3.5 text-primary" />
            荷载
          </div>
          <Button variant="outline" size="sm" onClick={addLoad} className="h-8 rounded-xl">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新增荷载
          </Button>
        </div>
        <div className="space-y-3">
          {value.loads.map((load, index) => renderLoadEditor(load, index, (patch) => updateLoad(index, patch), () => removeLoad(index)))}
        </div>
      </section>
      ) : null}

      {advancedSectionId === "loadCases" ? (
      <section id="frame-custom-load-cases" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <GitBranch className="h-3.5 w-3.5 text-primary" />
            荷载工况
          </div>
          <Button variant="outline" size="sm" onClick={addLoadCase} className="h-8 rounded-xl">
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新增工况
          </Button>
        </div>
        {value.loadCases.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-muted-foreground">未设置独立荷载工况，求解器将使用上方基本荷载。</div>
        ) : (
          <div className="space-y-3">
            {value.loadCases.map((loadCase, loadCaseIndex) => (
              <div key={loadCase.id} className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
                  <div className="space-y-1">
                    <div className={fieldLabelClass}>工况编号</div>
                    <Input value={loadCase.id} onChange={(e) => updateLoadCase(loadCaseIndex, { id: e.target.value })} className="h-10 min-w-0 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <div className={fieldLabelClass}>工况名称</div>
                    <Input value={loadCase.title} onChange={(e) => updateLoadCase(loadCaseIndex, { title: e.target.value })} className="h-10 min-w-0 text-xs" />
                  </div>
                  <div className="flex items-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => addLoadToCase(loadCaseIndex)} className="h-10 rounded-xl">
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      荷载
                    </Button>
                    <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => removeLoadCase(loadCaseIndex)}>
                      <Trash2 className="h-4 w-4 text-rose-300" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {loadCase.loads.map((load, loadIndex) =>
                    renderLoadEditor(load, loadIndex, (patch) => updateLoadInCase(loadCaseIndex, loadIndex, patch), () => removeLoadFromCase(loadCaseIndex, loadIndex))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      ) : null}

      {advancedSectionId === "loadCombinations" ? (
      <section id="frame-custom-load-combinations" className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 space-y-4 scroll-mt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="eyebrow flex items-center gap-2">
            <Waypoints className="h-3.5 w-3.5 text-primary" />
            荷载组合
          </div>
          <Button variant="outline" size="sm" onClick={addLoadCombination} className="h-8 rounded-xl" disabled={value.loadCases.length === 0}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            新增组合
          </Button>
        </div>
        {value.loadCases.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-muted-foreground">先定义荷载工况后可编辑组合系数。</div>
        ) : value.loadCombinations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-4 text-xs text-muted-foreground">未设置荷载组合。</div>
        ) : (
          <div className="space-y-3">
            {value.loadCombinations.map((combination, combinationIndex) => (
              <div key={combination.id} className="space-y-3 rounded-2xl border border-white/8 bg-slate-950/20 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
                  <div className="space-y-1">
                    <div className={fieldLabelClass}>组合编号</div>
                    <Input value={combination.id} onChange={(e) => updateLoadCombination(combinationIndex, { id: e.target.value })} className="h-10 min-w-0 font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <div className={fieldLabelClass}>组合名称</div>
                    <Input value={combination.title} onChange={(e) => updateLoadCombination(combinationIndex, { title: e.target.value })} className="h-10 min-w-0 text-xs" />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10"
                      onClick={() => commit(keep({ loadCombinations: value.loadCombinations.filter((_, index) => index !== combinationIndex) }))}
                    >
                      <Trash2 className="h-4 w-4 text-rose-300" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className={fieldLabelClass}>组合标签</div>
                  <Input
                    value={(combination.tags ?? []).join(", ")}
                    onChange={(e) =>
                      updateLoadCombination(combinationIndex, {
                        tags: e.target.value
                          .split(",")
                          .map((tag) => tag.trim())
                          .filter(Boolean),
                      })
                    }
                    className="h-10 min-w-0 text-xs"
                    placeholder="ULS, 包络"
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {value.loadCases.map((loadCase) => (
                    <div key={`${combination.id}-${loadCase.id}`} className="space-y-1">
                      <div className={fieldLabelClass}>{loadCase.id} 系数</div>
                      <Input
                        type="number"
                        step="0.1"
                        value={combination.factors[loadCase.id] ?? 0}
                        onChange={(e) =>
                          updateLoadCombination(combinationIndex, {
                            factors: { ...combination.factors, [loadCase.id]: Number(e.target.value) || 0 },
                          })
                        }
                        className="h-10 min-w-0 font-mono text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      ) : null}
        </div>
      </section>
      ) : null}
    </div>
  );
}
