import type {
  FrameLoad,
  FrameLoadCase,
  FrameLoadCombination,
  FrameLoadDirection,
  FrameSpring,
  FrameSupportDisplacement,
  FrameWorkspaceState,
  StructureMember,
  StructureNode,
  SupportType,
} from "../types/structure.ts";
import {
  DEFAULT_FRAME_MODE,
  createDefaultFrameWorkspaceState,
  createPortalFrameCollections,
} from "./workspace-defaults.ts";
import type { FrameCollections } from "./workspace-defaults.ts";
import { MAX_FRAME_MEMBERS, MAX_FRAME_NODES } from "./solver-limits.ts";
import { normalizeTextId, pickExistingId } from "./workspace-normalizer-utils.ts";
import { materialIdForYoungModulus } from "./material-presets.ts";

function normalizeSupportType(value: unknown, fallback: SupportType = "free"): SupportType {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (normalized === "fixed" || normalized === "pinned" || normalized === "roller" || normalized === "free") {
    return normalized;
  }
  return fallback;
}

function normalizeLoadDirection(value: unknown, fallback: FrameLoadDirection = "local_y"): FrameLoadDirection {
  return value === "global_y" ? "global_y" : fallback;
}

function normalizeSprings(rawSprings: unknown): FrameSpring[] | undefined {
  if (!Array.isArray(rawSprings)) {
    return undefined;
  }
  const springs = rawSprings
    .slice(0, 6)
    .map((spring) => {
      const candidate = spring && typeof spring === "object" ? (spring as Record<string, unknown>) : {};
      const dof = candidate.dof === "ux" || candidate.dof === "uy" || candidate.dof === "rz" ? candidate.dof : null;
      if (!dof) {
        return null;
      }
      if (dof === "rz") {
        const stiffness = Number(candidate.stiffnessKnMPerRad ?? candidate.stiffness ?? candidate.k);
        return Number.isFinite(stiffness) && stiffness > 0 ? { dof, stiffnessKnMPerRad: stiffness } : null;
      }
      const stiffness = Number(candidate.stiffnessKnPerM ?? candidate.stiffness ?? candidate.k);
      return Number.isFinite(stiffness) && stiffness > 0 ? { dof, stiffnessKnPerM: stiffness } : null;
    })
    .filter((spring): spring is FrameSpring => Boolean(spring));
  return springs.length ? springs : undefined;
}

function normalizeSupportDisplacements(rawDisplacements: unknown): FrameSupportDisplacement[] | undefined {
  if (!Array.isArray(rawDisplacements)) {
    return undefined;
  }
  const displacements = rawDisplacements
    .slice(0, 6)
    .map((displacement) => {
      const candidate = displacement && typeof displacement === "object" ? (displacement as Record<string, unknown>) : {};
      const dof = candidate.dof === "ux" || candidate.dof === "uy" || candidate.dof === "rz" || candidate.dof === "n" ? candidate.dof : null;
      if (!dof) {
        return null;
      }
      if (dof === "rz") {
        const rotationDeg = Number(candidate.rotationDeg ?? candidate.valueDeg ?? candidate.value);
        return Number.isFinite(rotationDeg) ? { dof, rotationDeg } : null;
      }
      const displacementMm = Number(candidate.displacementMm ?? candidate.settlementMm ?? candidate.valueMm ?? candidate.value);
      return Number.isFinite(displacementMm) ? { dof, displacementMm } : null;
    })
    .filter((displacement): displacement is FrameSupportDisplacement => Boolean(displacement));
  return displacements.length ? displacements : undefined;
}

function normalizeEndReleases(rawReleases: unknown): StructureMember["endReleases"] {
  if (!rawReleases || typeof rawReleases !== "object") {
    return undefined;
  }
  const candidate = rawReleases as StructureMember["endReleases"];
  const start = Array.isArray(candidate?.start) && candidate.start.includes("rz") ? ["rz" as const] : undefined;
  const end = Array.isArray(candidate?.end) && candidate.end.includes("rz") ? ["rz" as const] : undefined;
  return start || end ? { start, end } : undefined;
}

function normalizeInternalHinges(rawHinges: unknown): StructureMember["internalHinges"] {
  if (!Array.isArray(rawHinges)) {
    return undefined;
  }
  const hinges = rawHinges
    .slice(0, 8)
    .map((hinge) => {
      const ratio = typeof hinge === "number" ? hinge : Number((hinge as { ratio?: unknown } | null)?.ratio);
      return Number.isFinite(ratio) && ratio > 0 && ratio < 1 ? { ratio } : null;
    })
    .filter((hinge): hinge is { ratio: number } => Boolean(hinge));
  return hinges.length ? hinges : undefined;
}

function normalizeStructureNodes(rawNodes: unknown, fallbackNodes: StructureNode[]): StructureNode[] {
  const source = Array.isArray(rawNodes) ? rawNodes : fallbackNodes;
  const seen = new Set<string>();
  return source.slice(0, MAX_FRAME_NODES).map((node, index) => {
    const fallback = fallbackNodes[index] ?? fallbackNodes[fallbackNodes.length - 1] ?? { id: `N${index + 1}`, x: 0, y: 0, supportType: "free" };
    const candidate = node && typeof node === "object" ? (node as Partial<StructureNode>) : {};
    const id = normalizeTextId(candidate.id, fallback.id || `N${index + 1}`, seen, "N", index);
    return {
      id,
      x: Number.isFinite(candidate.x) ? Number(candidate.x) : fallback.x,
      y: Number.isFinite(candidate.y) ? Number(candidate.y) : fallback.y,
      supportType: normalizeSupportType(candidate.supportType, fallback.supportType ?? "free"),
      supportAngleDeg: Number.isFinite(candidate.supportAngleDeg) ? Number(candidate.supportAngleDeg) : undefined,
      condensedDofs: Array.isArray(candidate.condensedDofs)
        ? candidate.condensedDofs.filter((dof): dof is "ux" | "uy" | "rz" => dof === "ux" || dof === "uy" || dof === "rz")
        : undefined,
      springs: normalizeSprings(candidate.springs),
      supportDisplacements: normalizeSupportDisplacements(candidate.supportDisplacements),
    };
  });
}

function normalizeStructureMembers(rawMembers: unknown, nodes: StructureNode[], fallbackMembers: StructureMember[]): StructureMember[] {
  const source = Array.isArray(rawMembers) ? rawMembers : fallbackMembers;
  const nodeIds = nodes.map((node) => node.id);
  const seen = new Set<string>();
  return source.slice(0, MAX_FRAME_MEMBERS).map((member, index) => {
    const fallback = fallbackMembers[index] ?? fallbackMembers[fallbackMembers.length - 1] ?? {
      id: `M${index + 1}`,
      start: nodeIds[0] ?? "N1",
      end: nodeIds[1] ?? nodeIds[0] ?? "N2",
      E_GPa: 210,
      A_cm2: 120,
      I_cm4: 8000,
      kind: "generic",
    };
    const candidate = member && typeof member === "object" ? (member as Partial<StructureMember>) : {};
    const id = normalizeTextId(candidate.id, fallback.id || `M${index + 1}`, seen, "M", index);
    const start = pickExistingId(candidate.start, nodeIds, fallback.start);
    const end = pickExistingId(candidate.end, nodeIds, fallback.end);
    const E_GPa = Number.isFinite(candidate.E_GPa) ? Number(candidate.E_GPa) : fallback.E_GPa;
    const materialId = String(candidate.materialId ?? fallback.materialId ?? materialIdForYoungModulus(E_GPa)).trim().toLowerCase() || "custom";
    return {
      id,
      start,
      end,
      materialId,
      E_GPa,
      A_cm2: Number.isFinite(candidate.A_cm2) ? Number(candidate.A_cm2) : fallback.A_cm2,
      I_cm4: Number.isFinite(candidate.I_cm4) ? Number(candidate.I_cm4) : fallback.I_cm4,
      elementType: "frame",
      kind: String(candidate.kind ?? fallback.kind ?? "generic") || "generic",
      endReleases: normalizeEndReleases(candidate.endReleases),
      internalHinges: normalizeInternalHinges(candidate.internalHinges),
    };
  });
}

function normalizeFrameLoads(rawLoads: unknown, nodes: StructureNode[], members: StructureMember[], fallbackLoads: FrameLoad[]): FrameLoad[] {
  const source = Array.isArray(rawLoads) ? rawLoads : fallbackLoads;
  const nodeIds = nodes.map((node) => node.id);
  const memberIds = members.map((member) => member.id);
  return source.slice(0, 80).map((load, index) => {
    const fallback = fallbackLoads[index] ?? fallbackLoads[fallbackLoads.length - 1];
    const candidate = load && typeof load === "object" ? (load as FrameLoad) : fallback;
    if (candidate?.type === "distributed") {
      let qStartKnPerM = Number.isFinite(candidate.qStartKnPerM)
        ? Number(candidate.qStartKnPerM)
        : Number.isFinite(candidate.wyKnPerM)
          ? Number(candidate.wyKnPerM)
          : fallback && fallback.type === "distributed"
            ? Number(fallback.qStartKnPerM ?? fallback.wyKnPerM ?? 0)
            : 0;
      let qEndKnPerM = Number.isFinite(candidate.qEndKnPerM)
        ? Number(candidate.qEndKnPerM)
        : Number.isFinite(candidate.wyKnPerM)
          ? Number(candidate.wyKnPerM)
          : fallback && fallback.type === "distributed"
            ? Number(fallback.qEndKnPerM ?? fallback.wyKnPerM ?? 0)
            : 0;
      let startRatio = Number(candidate.startRatio ?? (fallback && fallback.type === "distributed" ? fallback.startRatio : 0));
      let endRatio = Number(candidate.endRatio ?? (fallback && fallback.type === "distributed" ? fallback.endRatio : 1));
      startRatio = Number.isFinite(startRatio) ? Math.min(Math.max(startRatio, 0), 1) : 0;
      endRatio = Number.isFinite(endRatio) ? Math.min(Math.max(endRatio, 0), 1) : 1;
      if (endRatio < startRatio) {
        [startRatio, endRatio] = [endRatio, startRatio];
        [qStartKnPerM, qEndKnPerM] = [qEndKnPerM, qStartKnPerM];
      }
      if (Math.abs(endRatio - startRatio) < 1e-9) {
        if (endRatio < 1) {
          endRatio = Math.min(1, endRatio + 0.01);
        } else {
          startRatio = Math.max(0, startRatio - 0.01);
        }
      }
      return {
        type: "distributed" as const,
        member: pickExistingId(candidate.member, memberIds, fallback && fallback.type === "distributed" ? fallback.member : memberIds[0] ?? "M1"),
        wyKnPerM: Number.isFinite(candidate.wyKnPerM)
          ? Number(candidate.wyKnPerM)
          : fallback && fallback.type === "distributed" && Number.isFinite(fallback.wyKnPerM)
            ? Number(fallback.wyKnPerM)
            : undefined,
        direction: normalizeLoadDirection(candidate.direction, fallback && fallback.type === "distributed" ? fallback.direction : "local_y"),
        qStartKnPerM,
        qEndKnPerM,
        startRatio,
        endRatio,
      };
    }
    if (candidate?.type === "member_point") {
      const memberFallback = fallback && fallback.type === "member_point" ? fallback : fallbackLoads.find((item) => item.type === "member_point") ?? null;
      const ratio = Number(candidate.positionRatio ?? memberFallback?.positionRatio ?? 0.5);
      return {
        type: "member_point" as const,
        member: pickExistingId(candidate.member, memberIds, memberFallback?.member ?? memberIds[0] ?? "M1"),
        direction: normalizeLoadDirection(candidate.direction, memberFallback?.direction ?? "local_y"),
        forceKn: Number.isFinite(candidate.forceKn) ? Number(candidate.forceKn) : memberFallback?.forceKn ?? -10,
        positionRatio: Number.isFinite(ratio) ? Math.min(Math.max(ratio, 0), 1) : 0.5,
      };
    }
    const nodalCandidate = candidate?.type === "nodal" ? candidate : null;
    const nodalFallback = fallback && fallback.type === "nodal" ? fallback : fallbackLoads[0] && fallbackLoads[0].type === "nodal" ? fallbackLoads[0] : null;
    const fxKn = nodalCandidate?.fxKn;
    const fyKn = nodalCandidate?.fyKn;
    const mzKnM = nodalCandidate?.mzKnM;
    return {
      type: "nodal" as const,
      node: pickExistingId(nodalCandidate?.node, nodeIds, nodalFallback?.node ?? nodeIds[0] ?? "N1"),
      fxKn: Number.isFinite(fxKn) ? Number(fxKn) : nodalFallback?.fxKn ?? 0,
      fyKn: Number.isFinite(fyKn) ? Number(fyKn) : nodalFallback?.fyKn ?? 0,
      mzKnM: Number.isFinite(mzKnM) ? Number(mzKnM) : nodalFallback?.mzKnM ?? 0,
    };
  });
}

function normalizeFrameLoadCases(rawLoadCases: unknown, nodes: StructureNode[], members: StructureMember[]): FrameLoadCase[] {
  if (!Array.isArray(rawLoadCases)) {
    return [];
  }
  const seen = new Set<string>();
  return rawLoadCases.slice(0, 12).map((loadCase, index) => {
    const candidate = loadCase && typeof loadCase === "object" ? (loadCase as Partial<FrameLoadCase>) : {};
    const id = normalizeTextId(String(candidate.id ?? "").trim(), `LC${index + 1}`, seen, "LC", index);
    return {
      id,
      title: String(candidate.title ?? id).trim() || id,
      loads: normalizeFrameLoads(candidate.loads, nodes, members, []),
    };
  });
}

function normalizeFrameLoadCombinations(rawCombinations: unknown, loadCases: FrameLoadCase[]): FrameLoadCombination[] {
  if (!Array.isArray(rawCombinations) || loadCases.length === 0) {
    return [];
  }
  const caseIds = new Set(loadCases.map((loadCase) => loadCase.id));
  const seen = new Set<string>();
  return rawCombinations.slice(0, 12).map((combination, index) => {
    const candidate = combination && typeof combination === "object" ? (combination as Partial<FrameLoadCombination>) : {};
    const id = normalizeTextId(String(candidate.id ?? "").trim(), `COMB${index + 1}`, seen, "COMB", index);
    const rawFactors = candidate.factors && typeof candidate.factors === "object" ? candidate.factors : {};
    const factors = Object.fromEntries(
      Object.entries(rawFactors)
        .map(([caseId, factor]) => [caseId.trim(), factor] as const)
        .filter(([caseId]) => caseIds.has(caseId))
        .map(([caseId, factor]) => [caseId, Number.isFinite(factor) ? Number(factor) : 0])
    );
    return {
      id,
      title: String(candidate.title ?? id).trim() || id,
      factors,
      tags: normalizeCombinationTags(candidate.tags),
    };
  });
}

function normalizeCombinationTags(rawTags: unknown): string[] {
  if (!Array.isArray(rawTags)) {
    return [];
  }
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const rawTag of rawTags) {
    const tag = String(rawTag).trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    tags.push(tag);
  }
  return tags;
}

export function normalizeFrameWorkspaceState(value: Partial<FrameWorkspaceState> | null | undefined): FrameWorkspaceState {
  const base = createDefaultFrameWorkspaceState();
  const collections = createPortalFrameCollections({
    span: Number.isFinite(value?.span) && (value?.span ?? 0) > 0 ? Number(value!.span) : base.span,
    height: Number.isFinite(value?.height) && (value?.height ?? 0) > 0 ? Number(value!.height) : base.height,
    leftSupport: normalizeSupportType(value?.leftSupport, base.leftSupport),
    rightSupport: normalizeSupportType(value?.rightSupport, base.rightSupport),
    beamLoadKnPerM: Number.isFinite(value?.beamLoadKnPerM) ? Number(value!.beamLoadKnPerM) : base.beamLoadKnPerM,
    lateralLoadKn: Number.isFinite(value?.lateralLoadKn) ? Number(value!.lateralLoadKn) : base.lateralLoadKn,
    topVerticalLoadKn: Number.isFinite(value?.topVerticalLoadKn) ? Number(value!.topVerticalLoadKn) : base.topVerticalLoadKn,
    columnE: Number.isFinite(value?.columnE) ? Number(value!.columnE) : base.columnE,
    beamE: Number.isFinite(value?.beamE) ? Number(value!.beamE) : base.beamE,
    columnA: Number.isFinite(value?.columnA) ? Number(value!.columnA) : base.columnA,
    beamA: Number.isFinite(value?.beamA) ? Number(value!.beamA) : base.beamA,
    columnI: Number.isFinite(value?.columnI) ? Number(value!.columnI) : base.columnI,
    beamI: Number.isFinite(value?.beamI) ? Number(value!.beamI) : base.beamI,
  });
  const customNodesRaw = value?.customNodes ?? collections.nodes;
  const customNodes = normalizeStructureNodes(customNodesRaw, collections.nodes);
  const customMembersRaw = value?.customMembers ?? collections.members;
  const customMembers = normalizeStructureMembers(customMembersRaw, customNodes, collections.members);
  const customLoadsRaw = value?.customLoads ?? collections.loads;
  const customLoads = normalizeFrameLoads(customLoadsRaw, customNodes, customMembers, collections.loads);
  const customLoadCases = normalizeFrameLoadCases(value?.customLoadCases, customNodes, customMembers);
  const customLoadCombinations = normalizeFrameLoadCombinations(value?.customLoadCombinations, customLoadCases);

  return {
    ...base,
    ...value,
    frameMode: value?.frameMode === "custom" ? "custom" : DEFAULT_FRAME_MODE,
    span: Number.isFinite(value?.span) && (value?.span ?? 0) > 0 ? Number(value!.span) : base.span,
    height: Number.isFinite(value?.height) && (value?.height ?? 0) > 0 ? Number(value!.height) : base.height,
    beamLoadKnPerM: Number.isFinite(value?.beamLoadKnPerM) ? Number(value!.beamLoadKnPerM) : base.beamLoadKnPerM,
    lateralLoadKn: Number.isFinite(value?.lateralLoadKn) ? Number(value!.lateralLoadKn) : base.lateralLoadKn,
    topVerticalLoadKn: Number.isFinite(value?.topVerticalLoadKn) ? Number(value!.topVerticalLoadKn) : base.topVerticalLoadKn,
    columnE: Number.isFinite(value?.columnE) ? Number(value!.columnE) : base.columnE,
    beamE: Number.isFinite(value?.beamE) ? Number(value!.beamE) : base.beamE,
    columnA: Number.isFinite(value?.columnA) ? Number(value!.columnA) : base.columnA,
    beamA: Number.isFinite(value?.beamA) ? Number(value!.beamA) : base.beamA,
    columnI: Number.isFinite(value?.columnI) ? Number(value!.columnI) : base.columnI,
    beamI: Number.isFinite(value?.beamI) ? Number(value!.beamI) : base.beamI,
    projectName: String(value?.projectName ?? base.projectName),
    materialId: String(value?.materialId ?? base.materialId),
    leftSupport: value?.leftSupport ?? base.leftSupport,
    rightSupport: value?.rightSupport ?? base.rightSupport,
    customNodes,
    customMembers,
    customLoads,
    customLoadCases,
    customLoadCombinations,
    viewSettings: value?.viewSettings ? { ...value.viewSettings } : base.viewSettings,
  };
}

export function createPortalFrameModelFromState(value: Pick<
  FrameWorkspaceState,
  | "span"
  | "height"
  | "leftSupport"
  | "rightSupport"
  | "beamLoadKnPerM"
  | "lateralLoadKn"
  | "topVerticalLoadKn"
  | "columnE"
  | "beamE"
  | "columnA"
  | "beamA"
  | "columnI"
  | "beamI"
>): FrameCollections {
  return createPortalFrameCollections({
    span: value.span,
    height: value.height,
    leftSupport: value.leftSupport,
    rightSupport: value.rightSupport,
    beamLoadKnPerM: value.beamLoadKnPerM,
    lateralLoadKn: value.lateralLoadKn,
    topVerticalLoadKn: value.topVerticalLoadKn,
    columnE: value.columnE,
    beamE: value.beamE,
    columnA: value.columnA,
    beamA: value.beamA,
    columnI: value.columnI,
    beamI: value.beamI,
  });
}
