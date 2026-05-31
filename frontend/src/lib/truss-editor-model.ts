import type { TrussLoad, TrussMember, TrussNode } from "../types/structure.ts";
import { materialIdForYoungModulus } from "./material-presets.ts";
import { modelObjectLoadLabel } from "./model-object-vocabulary.ts";

export const TRUSS_MEMBER_KIND_OPTIONS = [
  { value: "upper_chord", label: "上弦杆" },
  { value: "lower_chord", label: "下弦杆" },
  { value: "diagonal", label: "腹杆" },
  { value: "generic", label: "通用" },
];

export const TRUSS_LOAD_TYPE_OPTIONS = [
  { value: "nodal", label: modelObjectLoadLabel("truss", "node") },
  { value: "distributed", label: modelObjectLoadLabel("truss", "member") },
];

export const TRUSS_MEMBER_LOAD_DIRECTION_OPTIONS = [
  { value: "global_y", label: "全局 Y" },
  { value: "global_x", label: "全局 X" },
];

export function nextTrussDraftId(prefix: string, existingIds: string[]): string {
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

export function createTrussNodeDraft(index: number, existingIds: string[]): TrussNode {
  const isSupportNode = index < 2;
  return {
    id: nextTrussDraftId("N", existingIds),
    x: (index + 1) * 2,
    y: isSupportNode ? 0 : 3,
    supportType: isSupportNode ? (index === 0 ? "pinned" : "roller") : "free",
  };
}

export function createTrussMemberDraft(index: number, nodes: TrussNode[], existingIds: string[], defaultYoungModulusGPa = 210, defaultMaterialId = materialIdForYoungModulus(defaultYoungModulusGPa)): TrussMember {
  const start = nodes[index]?.id ?? nodes[0]?.id ?? "N1";
  const end = nodes[index + 1]?.id ?? nodes[nodes.length - 1]?.id ?? start;
  return {
    id: nextTrussDraftId("M", existingIds),
    start,
    end,
    elementType: "truss",
    materialId: defaultMaterialId,
    E_GPa: defaultYoungModulusGPa,
    A_cm2: 24,
    kind: "generic",
  };
}

function memberKindBetween(start: TrussNode | undefined, end: TrussNode | undefined): TrussMember["kind"] {
  if (!start || !end) return "generic";
  if (Math.abs(start.y - end.y) < 1e-9) return start.y <= 0 && end.y <= 0 ? "lower_chord" : "upper_chord";
  return "diagonal";
}

function templateForKind(members: TrussMember[], kind: TrussMember["kind"]): Pick<TrussMember, "materialId" | "E_GPa" | "A_cm2" | "kind"> {
  const template = members.find((member) => member.kind === kind) ?? members[0];
  return {
    materialId: template?.materialId ?? materialIdForYoungModulus(template?.E_GPa ?? 210),
    E_GPa: template?.E_GPa ?? 210,
    A_cm2: template?.A_cm2 ?? 24,
    kind: template?.kind ?? kind ?? "generic",
  };
}

export function trussMemberExists(members: TrussMember[], start: string, end: string): boolean {
  return members.some((member) => (member.start === start && member.end === end) || (member.start === end && member.end === start));
}

export function createConnectedTrussMember(
  start: TrussNode,
  end: TrussNode,
  members: TrussMember[],
  existingIds: string[],
  defaultYoungModulusGPa = 210,
  defaultMaterialId = materialIdForYoungModulus(defaultYoungModulusGPa),
): TrussMember {
  const kind = memberKindBetween(start, end);
  const template = templateForKind(members, kind);
  return {
    id: nextTrussDraftId("M", existingIds),
    start: start.id,
    end: end.id,
    elementType: "truss",
    ...template,
    materialId: defaultMaterialId,
    E_GPa: defaultYoungModulusGPa,
    kind,
  };
}

export function createConnectedTrussMemberByNodeId(
  startNodeId: string,
  endNodeId: string,
  nodes: TrussNode[],
  members: TrussMember[],
  defaultYoungModulusGPa = 210,
  defaultMaterialId = materialIdForYoungModulus(defaultYoungModulusGPa),
): TrussMember | undefined {
  if (!startNodeId || !endNodeId || startNodeId === endNodeId || trussMemberExists(members, startNodeId, endNodeId)) {
    return undefined;
  }
  const start = nodes.find((node) => node.id === startNodeId);
  const end = nodes.find((node) => node.id === endNodeId);
  if (!start || !end) {
    return undefined;
  }
  return createConnectedTrussMember(
    start,
    end,
    members,
    members.map((member) => member.id),
    defaultYoungModulusGPa,
    defaultMaterialId,
  );
}

export function createTrussNodalLoadDraft(nodes: TrussNode[]): TrussLoad {
  return {
    type: "nodal",
    node: nodes[0]?.id ?? "N1",
    fxKn: 0,
    fyKn: -10,
  };
}

export function createTrussMemberLoadDraft(members: TrussMember[], preferredMemberId?: string): TrussLoad {
  const memberIds = new Set(members.map((member) => member.id));
  return {
    type: "distributed",
    member: preferredMemberId && memberIds.has(preferredMemberId) ? preferredMemberId : members[0]?.id ?? "M1",
    direction: "global_y",
    qStartKnPerM: -1,
    qEndKnPerM: -1,
  };
}
