import type { TrussLoad, TrussMember, TrussNode } from "../types/structure.ts";

export const TRUSS_MEMBER_KIND_OPTIONS = [
  { value: "upper_chord", label: "上弦杆" },
  { value: "lower_chord", label: "下弦杆" },
  { value: "diagonal", label: "腹杆" },
  { value: "generic", label: "通用" },
];

export const TRUSS_LOAD_TYPE_OPTIONS = [
  { value: "nodal", label: "节点荷载" },
  { value: "distributed", label: "杆件荷载" },
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

export function createTrussMemberDraft(index: number, nodes: TrussNode[], existingIds: string[]): TrussMember {
  const start = nodes[index]?.id ?? nodes[0]?.id ?? "N1";
  const end = nodes[index + 1]?.id ?? nodes[nodes.length - 1]?.id ?? start;
  return {
    id: nextTrussDraftId("M", existingIds),
    start,
    end,
    elementType: "truss",
    E_GPa: 210,
    A_cm2: 24,
    kind: "generic",
  };
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
