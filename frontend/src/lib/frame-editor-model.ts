import type {
  FrameLoad,
  FrameLoadCase,
  FrameLoadCombination,
  FrameLoadDirection,
  FrameSpring,
  StructureMember,
  StructureNode,
} from "../types/structure.ts";

export const FRAME_MEMBER_KIND_OPTIONS = [
  { value: "column", label: "柱" },
  { value: "beam", label: "梁" },
  { value: "brace", label: "斜撑构件" },
  { value: "generic", label: "通用" },
];

export const FRAME_LOAD_TYPE_OPTIONS = [
  { value: "nodal", label: "节点荷载" },
  { value: "distributed", label: "分布荷载" },
  { value: "member_point", label: "集中荷载" },
];

export const FRAME_LOAD_DIRECTION_OPTIONS: Array<{ value: FrameLoadDirection; label: string }> = [
  { value: "local_y", label: "局部 y" },
  { value: "global_y", label: "全局 Y" },
];

export const FRAME_SPRING_DOF_OPTIONS = [
  { value: "uy", label: "竖向平动 uy" },
  { value: "ux", label: "水平平动 ux" },
  { value: "rz", label: "转角 rz" },
];

export function frameDistributedLoadKindLabel(load: Extract<FrameLoad, { type: "distributed" }>): string {
  const qStart = Number(load.qStartKnPerM ?? load.wyKnPerM ?? 0);
  const qEnd = Number(load.qEndKnPerM ?? load.qStartKnPerM ?? load.wyKnPerM ?? qStart);
  return Math.abs(qStart - qEnd) < 1e-9 ? "均布荷载" : "线性分布荷载";
}

export function nextFrameDraftId(prefix: string, existingIds: string[]): string {
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

export function createFrameNodeDraft(index: number, existingIds: string[]): StructureNode {
  const isBase = index < 2;
  return {
    id: nextFrameDraftId("N", existingIds),
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

export function inferFrameNodeDraft(nodes: StructureNode[], existingIds: string[]): StructureNode {
  if (nodes.length === 0) {
    return createFrameNodeDraft(0, existingIds);
  }

  const maxY = Math.max(...nodes.map((node) => node.y));
  const topNodes = nodes.filter((node) => Math.abs(node.y - maxY) < 1e-9);
  const reference = topNodes.reduce((rightMost, node) => (node.x > rightMost.x ? node : rightMost), topNodes[0]);
  const dx = positiveStep(nodes.map((node) => node.x), 3);
  return {
    id: nextFrameDraftId("N", existingIds),
    x: Number((reference.x + dx).toFixed(3)),
    y: reference.y,
    supportType: reference.y === 0 ? "roller" : "free",
  };
}

export function distanceBetweenFrameNodes(a: StructureNode, b: StructureNode): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function memberKindBetween(start: StructureNode | undefined, end: StructureNode | undefined): string {
  if (!start || !end) return "generic";
  if (Math.abs(start.x - end.x) < 1e-9) return "column";
  if (Math.abs(start.y - end.y) < 1e-9) return "beam";
  return "brace";
}

export function frameMemberExists(members: StructureMember[], start: string, end: string): boolean {
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

export function createConnectedFrameMember(
  start: StructureNode,
  end: StructureNode,
  members: StructureMember[],
  existingIds: string[],
  defaultYoungModulusGPa = 210,
): StructureMember {
  const kind = memberKindBetween(start, end);
  const template = templateForKind(members, kind);
  return {
    id: nextFrameDraftId(kind === "beam" ? "B" : kind === "column" ? "C" : "M", existingIds),
    start: start.id,
    end: end.id,
    elementType: "frame",
    ...template,
    E_GPa: defaultYoungModulusGPa,
    kind,
  };
}

export function createFrameMemberDraft(index: number, nodes: StructureNode[], existingIds: string[], defaultYoungModulusGPa = 210): StructureMember {
  const start = nodes[index]?.id ?? nodes[0]?.id ?? "N1";
  const end = nodes[index + 1]?.id ?? nodes[nodes.length - 1]?.id ?? start;
  return {
    id: nextFrameDraftId("M", existingIds),
    start,
    end,
    elementType: "frame",
    E_GPa: defaultYoungModulusGPa,
    A_cm2: 120,
    I_cm4: 8000,
    kind: "generic",
  };
}

export function createFrameLoadDraft(index: number, nodes: StructureNode[], members: StructureMember[]): FrameLoad {
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

export function createFrameLoadCaseDraft(index: number, nodes: StructureNode[], members: StructureMember[], existingIds: string[]): FrameLoadCase {
  const id = nextFrameDraftId("LC", existingIds);
  return {
    id,
    title: `工况 ${index + 1}`,
    loads: [createFrameLoadDraft(0, nodes, members)],
  };
}

export function createFrameCombinationDraft(index: number, loadCases: FrameLoadCase[], existingIds: string[]): FrameLoadCombination {
  const id = nextFrameDraftId("COMB", existingIds);
  return {
    id,
    title: `组合 ${index + 1}`,
    factors: Object.fromEntries(loadCases.map((loadCase) => [loadCase.id, 1.0])),
    tags: [],
  };
}

export function updateFrameSpringValue(spring: FrameSpring, patch: Partial<FrameSpring>): FrameSpring {
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
