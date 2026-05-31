import type { TrussLoad, TrussMember, TrussSupportType, TrussWorkspaceState } from "../types/structure.ts";
import {
  createDefaultTrussCollections,
  createDefaultTrussWorkspaceState,
} from "./workspace-defaults.ts";
import { MAX_TRUSS_MEMBERS, MAX_TRUSS_NODES } from "./solver-limits.ts";
import { normalizeTextId, pickExistingId } from "./workspace-normalizer-utils.ts";
import { materialIdForYoungModulus } from "./material-presets.ts";

type LegacyTrussSupportType = TrussSupportType | "fixed";

function normalizeSupportType(value: unknown, fallback: LegacyTrussSupportType = "free"): LegacyTrussSupportType {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (normalized === "fixed" || normalized === "pinned" || normalized === "roller" || normalized === "free") {
    return normalized;
  }
  return fallback;
}

function normalizeTrussSupportType(value: unknown, fallback: TrussSupportType = "free"): TrussSupportType {
  const normalized = normalizeSupportType(value, fallback);
  if (normalized === "fixed") {
    return "pinned";
  }
  return normalized;
}

function normalizeTrussNodes(rawNodes: unknown, fallbackNodes: TrussWorkspaceState["customNodes"]): TrussWorkspaceState["customNodes"] {
  const source = Array.isArray(rawNodes) ? rawNodes : fallbackNodes;
  const seen = new Set<string>();
  return source.slice(0, MAX_TRUSS_NODES).map((node, index) => {
    const fallback = fallbackNodes[index] ?? fallbackNodes[fallbackNodes.length - 1] ?? { id: `N${index + 1}`, x: 0, y: 0, supportType: "free" };
    const candidate = node && typeof node === "object" ? (node as Partial<TrussWorkspaceState["customNodes"][number]>) : {};
    const id = normalizeTextId(candidate.id, fallback.id || `N${index + 1}`, seen, "N", index);
    return {
      id,
      x: Number.isFinite(candidate.x) ? Number(candidate.x) : fallback.x,
      y: Number.isFinite(candidate.y) ? Number(candidate.y) : fallback.y,
      supportType: normalizeTrussSupportType(candidate.supportType, fallback.supportType ?? "free"),
    };
  });
}

function normalizeTrussMembers(
  rawMembers: unknown,
  nodes: TrussWorkspaceState["customNodes"],
  fallbackMembers: TrussWorkspaceState["customMembers"]
): TrussWorkspaceState["customMembers"] {
  const source = Array.isArray(rawMembers) ? rawMembers : fallbackMembers;
  const nodeIds = nodes.map((node) => node.id);
  const seen = new Set<string>();
  return source.slice(0, MAX_TRUSS_MEMBERS).map((member, index) => {
    const fallback = fallbackMembers[index] ?? fallbackMembers[fallbackMembers.length - 1] ?? {
      id: `M${index + 1}`,
      start: nodeIds[0] ?? "N1",
      end: nodeIds[1] ?? nodeIds[0] ?? "N2",
      E_GPa: 210,
      A_cm2: 24,
      kind: "generic",
    };
    const candidate = member && typeof member === "object" ? (member as Partial<TrussMember>) : {};
    const id = normalizeTextId(candidate.id, fallback.id || `M${index + 1}`, seen, "M", index);
    const start = pickExistingId(candidate.start, nodeIds, fallback.start);
    const end = pickExistingId(candidate.end, nodeIds, fallback.end);
    const E_GPa = Number.isFinite(candidate.E_GPa) ? Number(candidate.E_GPa) : fallback.E_GPa;
    const materialId = String(candidate.materialId ?? fallback.materialId ?? materialIdForYoungModulus(E_GPa)).trim().toLowerCase() || "custom";
    return {
      id,
      start,
      end,
      elementType: "truss",
      materialId,
      E_GPa,
      A_cm2: Number.isFinite(candidate.A_cm2) ? Number(candidate.A_cm2) : fallback.A_cm2,
      kind: String(candidate.kind ?? fallback.kind ?? "generic") || "generic",
    };
  });
}

function normalizeTrussLoads(
  rawLoads: unknown,
  nodes: TrussWorkspaceState["customNodes"],
  fallbackLoads: TrussWorkspaceState["customLoads"]
): TrussWorkspaceState["customLoads"] {
  const source = Array.isArray(rawLoads) ? rawLoads : fallbackLoads;
  const nodeIds = nodes.map((node) => node.id);
  return source.slice(0, 80).map((load, index) => {
    const fallback = fallbackLoads[index] ?? fallbackLoads[fallbackLoads.length - 1];
    const candidate = load && typeof load === "object" ? (load as TrussLoad) : fallback;
    if (candidate?.type === "distributed" || candidate?.type === "member_load" || candidate?.type === "member") {
      return {
        type: candidate.type,
        member: String(candidate.member ?? "M1").trim() || "M1",
        direction: candidate.direction === "global_x" ? "global_x" : "global_y",
        wyKnPerM: Number.isFinite(candidate.wyKnPerM) ? Number(candidate.wyKnPerM) : undefined,
        qStartKnPerM: Number.isFinite(candidate.qStartKnPerM) ? Number(candidate.qStartKnPerM) : undefined,
        qEndKnPerM: Number.isFinite(candidate.qEndKnPerM) ? Number(candidate.qEndKnPerM) : undefined,
        selfWeightKnPerM: Number.isFinite(candidate.selfWeightKnPerM) ? Number(candidate.selfWeightKnPerM) : undefined,
      };
    }
    const nodalCandidate = candidate?.type === "nodal" ? candidate : null;
    const nodalFallback = fallback && fallback.type === "nodal" ? fallback : fallbackLoads[0] && fallbackLoads[0].type === "nodal" ? fallbackLoads[0] : null;
    return {
      type: "nodal" as const,
      node: pickExistingId(nodalCandidate?.node, nodeIds, nodalFallback?.node ?? nodeIds[0] ?? "N1"),
      fxKn: Number.isFinite(nodalCandidate?.fxKn) ? Number(nodalCandidate?.fxKn) : nodalFallback?.fxKn ?? 0,
      fyKn: Number.isFinite(nodalCandidate?.fyKn) ? Number(nodalCandidate?.fyKn) : nodalFallback?.fyKn ?? 0,
    };
  });
}

export function normalizeTrussWorkspaceState(value: Partial<TrussWorkspaceState> | null | undefined): TrussWorkspaceState {
  const base = createDefaultTrussWorkspaceState();
  const collections = createDefaultTrussCollections();
  const customNodesRaw = value?.customNodes ?? collections.nodes;
  const customNodes = normalizeTrussNodes(customNodesRaw, collections.nodes);
  const customMembersRaw = value?.customMembers ?? collections.members;
  const customMembers = normalizeTrussMembers(customMembersRaw, customNodes, collections.members);
  const customLoadsRaw = value?.customLoads ?? collections.loads;
  const customLoads = normalizeTrussLoads(customLoadsRaw, customNodes, collections.loads);

  return {
    ...base,
    ...value,
    projectName: String(value?.projectName ?? base.projectName),
    materialId: String(value?.materialId ?? base.materialId),
    customNodes,
    customMembers,
    customLoads,
  };
}
