import { PREDEFINED_MATERIALS, type BeamLinearLoadConfig, type BeamPointLoadConfig, type BeamSpanConfig, type BeamSupportConfig, type BeamSupportDof, type BeamSupportType, type BeamWorkspaceState, type ComparisonScenario, type Material } from "../types/beam.ts";
import type {
  AnalysisMode,
  FrameLoad,
  FrameLoadCase,
  FrameLoadCombination,
  FrameLoadDirection,
  FrameSpring,
  FrameWorkspaceState,
  StructureMember,
  StructureNode,
  SupportType,
  TrussLoad,
  TrussMember,
  TrussWorkspaceState,
} from "../types/structure.ts";
import { MAX_BEAM_SPANS, MAX_FRAME_MEMBERS, MAX_FRAME_NODES, MAX_TRUSS_MEMBERS, MAX_TRUSS_NODES } from "./solver-limits.ts";

export interface WorkspaceState {
  analysisMode: AnalysisMode;
  beam: BeamWorkspaceState;
  frame: FrameWorkspaceState;
  truss: TrussWorkspaceState;
}

export const DEFAULT_BEAM_SPAN: BeamSpanConfig = {
  id: "(1)",
  length: 4,
  E: 210,
  I: 4500,
  materialId: "q345",
};

const DEFAULT_BEAM_MATERIALS: Material[] = PREDEFINED_MATERIALS.map((material) => ({ ...material }));

export const DEFAULT_FRAME_MODE: FrameWorkspaceState["frameMode"] = "custom";

interface TrussCollections {
  nodes: TrussWorkspaceState["customNodes"];
  members: TrussWorkspaceState["customMembers"];
  loads: TrussWorkspaceState["customLoads"];
}

interface PortalFrameConfig {
  span: number;
  height: number;
  leftSupport: SupportType;
  rightSupport: SupportType;
  beamLoadKnPerM: number;
  lateralLoadKn: number;
  topVerticalLoadKn: number;
  columnE: number;
  beamE: number;
  columnA: number;
  beamA: number;
  columnI: number;
  beamI: number;
}

interface FrameCollections {
  nodes: StructureNode[];
  members: StructureMember[];
  loads: FrameLoad[];
  loadCases?: FrameLoadCase[];
  loadCombinations?: FrameLoadCombination[];
}

function createPortalFrameCollections(config: PortalFrameConfig): FrameCollections {
  const nodes: StructureNode[] = [
    { id: "N1", x: 0, y: 0, supportType: config.leftSupport },
    { id: "N2", x: config.span, y: 0, supportType: config.rightSupport },
    { id: "N3", x: 0, y: config.height, supportType: "free" },
    { id: "N4", x: config.span, y: config.height, supportType: "free" },
  ];
  const members: StructureMember[] = [
    { id: "C1", start: "N1", end: "N3", elementType: "frame", E_GPa: config.columnE, A_cm2: config.columnA, I_cm4: config.columnI, kind: "column" },
    { id: "B1", start: "N3", end: "N4", elementType: "frame", E_GPa: config.beamE, A_cm2: config.beamA, I_cm4: config.beamI, kind: "beam" },
    { id: "C2", start: "N2", end: "N4", elementType: "frame", E_GPa: config.columnE, A_cm2: config.columnA, I_cm4: config.columnI, kind: "column" },
  ];
  const loads: FrameLoad[] = [
    { type: "distributed", member: "B1", wyKnPerM: -config.beamLoadKnPerM },
    { type: "nodal", node: "N4", fxKn: config.lateralLoadKn, fyKn: -config.topVerticalLoadKn, mzKnM: 0 },
  ];
  return { nodes, members, loads };
}

function cloneSprings(springs: FrameSpring[] | undefined): FrameSpring[] | undefined {
  return springs?.map((spring) => ({ ...spring }));
}

function cloneNodes(nodes: StructureNode[]): StructureNode[] {
  return nodes.map((node) => ({
    ...node,
    springs: cloneSprings(node.springs),
    condensedDofs: node.condensedDofs ? [...node.condensedDofs] : undefined,
  }));
}

function cloneMembers(members: StructureMember[]): StructureMember[] {
  return members.map((member) => ({
    ...member,
    endReleases: member.endReleases
      ? {
          start: member.endReleases.start ? [...member.endReleases.start] : undefined,
          end: member.endReleases.end ? [...member.endReleases.end] : undefined,
        }
      : undefined,
    internalHinges: member.internalHinges?.map((hinge) => ({ ...hinge })),
  }));
}

function cloneLoads(loads: FrameLoad[]): FrameLoad[] {
  return loads.map((load) => ({ ...load })) as FrameLoad[];
}

function cloneFrameLoadCases(loadCases: FrameLoadCase[]): FrameLoadCase[] {
  return loadCases.map((loadCase) => ({
    ...loadCase,
    loads: cloneLoads(loadCase.loads),
  }));
}

function cloneFrameLoadCombinations(combinations: FrameLoadCombination[]): FrameLoadCombination[] {
  return combinations.map((combination) => ({
    ...combination,
    factors: { ...combination.factors },
    tags: [...(combination.tags ?? [])],
  }));
}

function cloneTrussNodes(nodes: TrussWorkspaceState["customNodes"]): TrussWorkspaceState["customNodes"] {
  return nodes.map((node) => ({ ...node }));
}

function cloneTrussMembers(members: TrussWorkspaceState["customMembers"]): TrussWorkspaceState["customMembers"] {
  return members.map((member) => ({ ...member }));
}

function cloneTrussLoads(loads: TrussWorkspaceState["customLoads"]): TrussWorkspaceState["customLoads"] {
  return loads.map((load) => ({ ...load }));
}

function createDefaultFrameCollections(): FrameCollections {
  return createPortalFrameCollections({
    span: 6,
    height: 4,
    leftSupport: "fixed",
    rightSupport: "fixed",
    beamLoadKnPerM: 18,
    lateralLoadKn: 0,
    topVerticalLoadKn: 24,
    columnE: 210,
    beamE: 210,
    columnA: 240,
    beamA: 220,
    columnI: 12000,
    beamI: 15000,
  });
}

function createDefaultTrussCollections(): TrussCollections {
  return {
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "pinned" },
      { id: "N2", x: 6, y: 0, supportType: "roller" },
      { id: "N3", x: 2, y: 3, supportType: "free" },
      { id: "N4", x: 4, y: 3, supportType: "free" },
    ],
    members: [
      { id: "M1", start: "N1", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "upper_chord" },
      { id: "M2", start: "N3", end: "N4", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "upper_chord" },
      { id: "M3", start: "N4", end: "N2", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "upper_chord" },
      { id: "M4", start: "N3", end: "N2", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "diagonal" },
      { id: "M5", start: "N1", end: "N4", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "diagonal" },
    ],
    loads: [
      { type: "nodal", node: "N3", fxKn: 0, fyKn: -50 },
      { type: "nodal", node: "N4", fxKn: 0, fyKn: -50 },
    ],
  };
}

function normalizeSupportType(value: unknown, fallback: SupportType = "free"): SupportType {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (normalized === "fixed" || normalized === "pinned" || normalized === "roller" || normalized === "free") {
    return normalized;
  }
  return fallback;
}

function normalizeTrussSupportType(value: unknown, fallback: SupportType = "free"): SupportType {
  const normalized = normalizeSupportType(value, fallback);
  if (normalized === "fixed") {
    return "free";
  }
  return normalized;
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

function normalizeTextId(candidate: unknown, fallback: string, seen: Set<string>, prefix: string, index: number): string {
  const base = String(candidate ?? "").trim() || fallback || `${prefix}${index + 1}`;
  let next = base;
  let suffix = 2;
  while (seen.has(next)) {
    next = `${base}-${suffix}`;
    suffix += 1;
  }
  seen.add(next);
  return next;
}

function defaultBeamSupportId(index: number): string {
  return `S${index + 1}`;
}

function normalizeBeamSupportId(candidate: unknown, fallback: string, seen: Set<string>, index: number): string {
  const raw = String(candidate ?? "").trim();
  const normalizedFallback = fallback || defaultBeamSupportId(index);
  const shouldUseDefault = !raw || /^N\d+$/iu.test(raw);
  return normalizeTextId(shouldUseDefault ? normalizedFallback : raw, normalizedFallback, seen, "S", index);
}

function pickExistingId(candidate: unknown, available: string[], fallback: string): string {
  const normalized = String(candidate ?? "").trim();
  if (normalized && available.includes(normalized)) {
    return normalized;
  }
  if (available.includes(fallback)) {
    return fallback;
  }
  return available[0] ?? normalized ?? fallback;
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
    };
  });
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
    return {
      id,
      start,
      end,
      E_GPa: Number.isFinite(candidate.E_GPa) ? Number(candidate.E_GPa) : fallback.E_GPa,
      A_cm2: Number.isFinite(candidate.A_cm2) ? Number(candidate.A_cm2) : fallback.A_cm2,
      I_cm4: Number.isFinite(candidate.I_cm4) ? Number(candidate.I_cm4) : fallback.I_cm4,
      elementType: "frame",
      kind: String(candidate.kind ?? fallback.kind ?? "generic") || "generic",
      endReleases: normalizeEndReleases(candidate.endReleases),
      internalHinges: normalizeInternalHinges(candidate.internalHinges),
    };
  });
}

function normalizeTrussMembers(rawMembers: unknown, nodes: TrussWorkspaceState["customNodes"], fallbackMembers: TrussWorkspaceState["customMembers"]): TrussWorkspaceState["customMembers"] {
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
    return {
      id,
      start,
      end,
      elementType: "truss",
      E_GPa: Number.isFinite(candidate.E_GPa) ? Number(candidate.E_GPa) : fallback.E_GPa,
      A_cm2: Number.isFinite(candidate.A_cm2) ? Number(candidate.A_cm2) : fallback.A_cm2,
      kind: String(candidate.kind ?? fallback.kind ?? "generic") || "generic",
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

function normalizeTrussLoads(rawLoads: unknown, nodes: TrussWorkspaceState["customNodes"], fallbackLoads: TrussWorkspaceState["customLoads"]): TrussWorkspaceState["customLoads"] {
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

const DEFAULT_SCENARIOS: ComparisonScenario[] = [];

function beamSpanBoundaries(spans: BeamSpanConfig[]): number[] {
  const boundaries = [0];
  for (const span of spans) {
    boundaries.push(Number((boundaries[boundaries.length - 1] + span.length).toFixed(9)));
  }
  return boundaries;
}

function defaultBeamSupports(beamType: BeamWorkspaceState["beamType"], spans: BeamSpanConfig[]): BeamSupportConfig[] {
  const boundaries = beamSpanBoundaries(spans);
  const totalLength = boundaries[boundaries.length - 1] ?? 0;
  if (beamType === "cantilever") {
    return [{ id: "S1", x: 0, type: "fixed", constraints: ["v", "rz"] }];
  }
  if (beamType === "simply_supported") {
    return [
      { id: "S1", x: 0, type: "pinned", constraints: ["v"] },
      { id: "S2", x: totalLength, type: "roller", constraints: ["v"] },
    ];
  }
  return boundaries.map((x, index) => ({
    id: defaultBeamSupportId(index),
    x,
    type: index === boundaries.length - 1 ? "roller" : "pinned",
    constraints: ["v"],
  }));
}

export { defaultBeamSupports as createDefaultBeamSupports };

function normalizeBeamSupportType(value: unknown, fallback: BeamSupportType = "pinned"): BeamSupportType {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (normalized === "hinged") return "pinned";
  if (normalized === "pinned" || normalized === "roller" || normalized === "fixed" || normalized === "free") {
    return normalized;
  }
  return fallback;
}

function cloneBeamSupports(supports: BeamSupportConfig[]): BeamSupportConfig[] {
  return supports.map((support) => ({
    ...support,
    constraints: support.constraints ? [...support.constraints] : undefined,
    springs: support.springs?.map((spring) => ({ ...spring })),
  }));
}

function normalizeBeamSupportConstraints(rawConstraints: unknown, fallback: BeamSupportDof[]): BeamSupportDof[] {
  if (!Array.isArray(rawConstraints)) {
    return [...fallback];
  }
  const constraints: BeamSupportDof[] = [];
  for (const raw of rawConstraints) {
    const dof = String(raw ?? "").trim().toLowerCase();
    const normalized = dof === "uy" || dof === "y" ? "v" : dof === "theta" || dof === "rotation" || dof === "m" ? "rz" : dof;
    if ((normalized === "v" || normalized === "rz") && !constraints.includes(normalized)) {
      constraints.push(normalized);
    }
  }
  return constraints;
}

function normalizeBeamSupports(rawSupports: unknown, fallbackSupports: BeamSupportConfig[], totalLength: number): BeamSupportConfig[] {
  const source = Array.isArray(rawSupports) && rawSupports.length > 0 ? rawSupports : fallbackSupports;
  const seen = new Set<string>();
  return source.slice(0, 32).map((support, index) => {
    const fallback = fallbackSupports[index] ?? fallbackSupports[fallbackSupports.length - 1] ?? { id: defaultBeamSupportId(index), x: 0, type: "pinned" as const };
    const candidate = support && typeof support === "object" ? (support as Partial<BeamSupportConfig>) : {};
    const id = normalizeBeamSupportId(candidate.id, fallback.id || defaultBeamSupportId(index), seen, index);
    const rawX = Number(candidate.x);
    const x = Number.isFinite(rawX) ? Math.min(Math.max(rawX, 0), totalLength) : fallback.x;
    const springs = Array.isArray(candidate.springs)
      ? candidate.springs
          .slice(0, 4)
          .map((spring) => {
            const springCandidate = spring && typeof spring === "object" ? spring as Record<string, unknown> : {};
            const dof = springCandidate.dof === "rz" ? "rz" : springCandidate.dof === "v" || springCandidate.dof === "uy" ? "v" : null;
            if (!dof) return null;
            if (dof === "rz") {
              const stiffness = Number(springCandidate.stiffnessKnMPerRad ?? springCandidate.stiffness ?? springCandidate.k);
              return Number.isFinite(stiffness) && stiffness > 0 ? { dof, stiffnessKnMPerRad: stiffness } : null;
            }
            const stiffness = Number(springCandidate.stiffnessKnPerM ?? springCandidate.stiffness ?? springCandidate.k);
            return Number.isFinite(stiffness) && stiffness > 0 ? { dof, stiffnessKnPerM: stiffness } : null;
          })
          .filter((spring): spring is NonNullable<BeamSupportConfig["springs"]>[number] => Boolean(spring))
      : undefined;
    return {
      id,
      x,
      type: normalizeBeamSupportType(candidate.type, fallback.type),
      constraints: normalizeBeamSupportConstraints(candidate.constraints, fallback.constraints ?? []),
      springs: springs?.length ? springs : undefined,
    };
  });
}

function normalizeBeamPointLoads(rawLoads: unknown, fallback: BeamPointLoadConfig[] = []): BeamPointLoadConfig[] {
  const source = Array.isArray(rawLoads) ? rawLoads : fallback;
  const seen = new Set<string>();
  return source.slice(0, 32).map((load, index) => {
    const candidate = load && typeof load === "object" ? load as Partial<BeamPointLoadConfig> : {};
    const id = normalizeTextId(candidate.id, `P${index + 1}`, seen, "P", index);
    const magnitudeKn = Number(candidate.magnitudeKn);
    const positionRatio = Number(candidate.positionRatio);
    return {
      id,
      magnitudeKn: Number.isFinite(magnitudeKn) ? magnitudeKn : 0,
      positionRatio: Number.isFinite(positionRatio) ? Math.min(Math.max(positionRatio, 0), 1) : 0.5,
    };
  });
}

function normalizeBeamRange(startValue: unknown, endValue: unknown, fallbackStart = 0, fallbackEnd = 1) {
  let startRatio = Number(startValue);
  let endRatio = Number(endValue);
  startRatio = Number.isFinite(startRatio) ? Math.min(Math.max(startRatio, 0), 1) : fallbackStart;
  endRatio = Number.isFinite(endRatio) ? Math.min(Math.max(endRatio, 0), 1) : fallbackEnd;
  if (endRatio < startRatio) {
    [startRatio, endRatio] = [endRatio, startRatio];
  }
  if (Math.abs(endRatio - startRatio) < 1e-9) {
    if (endRatio < 1) {
      endRatio = Math.min(1, endRatio + 0.01);
    } else {
      startRatio = Math.max(0, startRatio - 0.01);
    }
  }
  return { startRatio, endRatio };
}

function normalizeBeamLinearLoads(rawLoads: unknown, fallback: BeamLinearLoadConfig[] = []): BeamLinearLoadConfig[] {
  const source = Array.isArray(rawLoads) ? rawLoads : fallback;
  const seen = new Set<string>();
  return source.slice(0, 32).map((load, index) => {
    const candidate = load && typeof load === "object" ? load as Partial<BeamLinearLoadConfig> : {};
    const id = normalizeTextId(candidate.id, `L${index + 1}`, seen, "L", index);
    const qStartKnPerM = Number(candidate.qStartKnPerM);
    const qEndKnPerM = Number(candidate.qEndKnPerM);
    const { startRatio, endRatio } = normalizeBeamRange(candidate.startRatio, candidate.endRatio);
    return {
      id,
      qStartKnPerM: Number.isFinite(qStartKnPerM) ? qStartKnPerM : 0,
      qEndKnPerM: Number.isFinite(qEndKnPerM) ? qEndKnPerM : Number.isFinite(qStartKnPerM) ? qStartKnPerM : 0,
      startRatio,
      endRatio,
    };
  });
}

function normalizeBeamMaterials(rawMaterials: unknown): Material[] {
  const byId = new Map<string, Material>();
  for (const material of DEFAULT_BEAM_MATERIALS) {
    byId.set(material.id, { ...material });
  }
  if (Array.isArray(rawMaterials)) {
    for (const rawMaterial of rawMaterials) {
      const candidate = rawMaterial && typeof rawMaterial === "object" ? rawMaterial as Partial<Material> : {};
      const id = String(candidate.id ?? "").trim().toLowerCase();
      const name = String(candidate.name ?? id).trim();
      const youngModulus = Number(candidate.youngModulus);
      const density = Number(candidate.density);
      if (!id || !name || !Number.isFinite(youngModulus) || youngModulus <= 0 || !Number.isFinite(density) || density <= 0) {
        continue;
      }
      byId.set(id, { id, name, youngModulus, density });
    }
  }
  return Array.from(byId.values());
}

function pickBeamMaterialId(candidate: unknown, materials: Material[], fallback: string): string {
  const normalized = String(candidate ?? "").trim().toLowerCase();
  if (materials.some((material) => material.id === normalized)) {
    return normalized;
  }
  if (materials.some((material) => material.id === fallback)) {
    return fallback;
  }
  return materials[0]?.id ?? fallback;
}

function materialById(materials: Material[], id: string): Material | undefined {
  return materials.find((material) => material.id === id);
}

function inferBeamSpanMaterialId(span: Partial<BeamSpanConfig>, materials: Material[], fallback: string): string {
  const direct = String(span.materialId ?? "").trim().toLowerCase();
  if (direct && materials.some((material) => material.id === direct)) {
    return direct;
  }
  const youngModulus = Number(span.E);
  const inferred = materials.find((material) => Number.isFinite(youngModulus) && Math.abs(material.youngModulus - youngModulus) < 1e-9);
  return inferred?.id ?? fallback;
}

export function createDefaultBeamWorkspaceState(): BeamWorkspaceState {
  const spans = [
    { ...DEFAULT_BEAM_SPAN, id: "(1)" },
    { ...DEFAULT_BEAM_SPAN, id: "(2)" },
  ];
  return {
    projectName: "新建梁系项目",
    materialId: "q345",
    materials: DEFAULT_BEAM_MATERIALS.map((material) => ({ ...material })),
    beamType: "continuous",
    loadType: "uniform",
    uniformLoadEnabled: true,
    linearLoadEnabled: false,
    linearLoads: [],
    pointLoads: [],
    q: 10,
    uniformLoadStartRatio: 0,
    uniformLoadEndRatio: 1,
    pointLoad: 0,
    pointLoadPositionRatio: 0.5,
    distributedLoadStart: 10,
    distributedLoadEnd: 10,
    distributedLoadStartRatio: 0,
    distributedLoadEndRatio: 1,
    freq: 1,
    duration: 5,
    spans,
    supports: defaultBeamSupports("continuous", spans),
    compareEnabled: false,
    scenarios: [...DEFAULT_SCENARIOS],
  };
}

export function createDefaultFrameWorkspaceState(): FrameWorkspaceState {
  const collections = createDefaultFrameCollections();
  return {
    frameMode: DEFAULT_FRAME_MODE,
    projectName: "门式刚架研究",
    materialId: "q345",
    span: 6,
    height: 4,
    leftSupport: "fixed",
    rightSupport: "fixed",
    beamLoadKnPerM: 18,
    lateralLoadKn: 0,
    topVerticalLoadKn: 24,
    columnE: 210,
    beamE: 210,
    columnA: 240,
    beamA: 220,
    columnI: 12000,
    beamI: 15000,
    customNodes: cloneNodes(collections.nodes),
    customMembers: cloneMembers(collections.members),
    customLoads: cloneLoads(collections.loads),
    customLoadCases: [],
    customLoadCombinations: [],
  };
}

export function createDefaultTrussWorkspaceState(): TrussWorkspaceState {
  const collections = createDefaultTrussCollections();
  return {
    projectName: "简单屋架研究",
    materialId: "q345",
    customNodes: cloneTrussNodes(collections.nodes),
    customMembers: cloneTrussMembers(collections.members),
    customLoads: cloneTrussLoads(collections.loads),
  };
}

export function createDefaultWorkspaceState(): WorkspaceState {
  return {
    analysisMode: "beam",
    beam: createDefaultBeamWorkspaceState(),
    frame: createDefaultFrameWorkspaceState(),
    truss: createDefaultTrussWorkspaceState(),
  };
}

export function cloneBeamWorkspaceState(value: BeamWorkspaceState): BeamWorkspaceState {
  return {
    ...value,
    materials: (value.materials ?? DEFAULT_BEAM_MATERIALS).map((material) => ({ ...material })),
    spans: value.spans.map((span) => ({ ...span })),
    supports: cloneBeamSupports(value.supports ?? defaultBeamSupports(value.beamType, value.spans)),
    linearLoads: (value.linearLoads ?? []).map((load) => ({ ...load })),
    pointLoads: value.pointLoads.map((load) => ({ ...load })),
    scenarios: value.scenarios.map((scenario) => ({ ...scenario })),
  };
}

export function cloneFrameWorkspaceState(value: FrameWorkspaceState): FrameWorkspaceState {
  return {
    ...value,
    customNodes: cloneNodes(value.customNodes),
    customMembers: cloneMembers(value.customMembers),
    customLoads: cloneLoads(value.customLoads),
    customLoadCases: cloneFrameLoadCases(value.customLoadCases ?? []),
    customLoadCombinations: cloneFrameLoadCombinations(value.customLoadCombinations ?? []),
  };
}

export function cloneTrussWorkspaceState(value: TrussWorkspaceState): TrussWorkspaceState {
  return {
    ...value,
    customNodes: cloneTrussNodes(value.customNodes),
    customMembers: cloneTrussMembers(value.customMembers),
    customLoads: cloneTrussLoads(value.customLoads),
  };
}

export function cloneWorkspaceState(value: WorkspaceState): WorkspaceState {
  return {
    analysisMode: value.analysisMode,
    beam: cloneBeamWorkspaceState(value.beam),
    frame: cloneFrameWorkspaceState(value.frame),
    truss: cloneTrussWorkspaceState(value.truss),
  };
}

export function normalizeWorkspaceState(value: Partial<WorkspaceState> | null | undefined): WorkspaceState {
  if (!value) {
    return createDefaultWorkspaceState();
  }

  return {
    analysisMode: value.analysisMode === "frame" ? "frame" : value.analysisMode === "truss" ? "truss" : "beam",
    beam: normalizeBeamWorkspaceState(value.beam),
    frame: normalizeFrameWorkspaceState(value.frame),
    truss: normalizeTrussWorkspaceState(value.truss),
  };
}

export function normalizeBeamWorkspaceState(value: Partial<BeamWorkspaceState> | null | undefined): BeamWorkspaceState {
  const base = createDefaultBeamWorkspaceState();
  const materials = normalizeBeamMaterials(value?.materials);
  const materialId = pickBeamMaterialId(value?.materialId, materials, base.materialId);
  const spans = Array.isArray(value?.spans) && value.spans.length > 0 ? value.spans : base.spans;
  const seenSpanIds = new Set<string>();
  const normalizedSpans = spans.slice(0, MAX_BEAM_SPANS).map((span, index) => {
    const spanMaterialId = inferBeamSpanMaterialId(span, materials, materialId);
    const material = materialById(materials, spanMaterialId);
    return {
      id: normalizeTextId(span.id, `(${index + 1})`, seenSpanIds, "B", index),
      length: Number.isFinite(span.length) && span.length > 0 ? Number(span.length) : DEFAULT_BEAM_SPAN.length,
      E: Number.isFinite(span.E) && span.E > 0 ? Number(span.E) : material?.youngModulus ?? DEFAULT_BEAM_SPAN.E,
      I: Number.isFinite(span.I) && span.I > 0 ? Number(span.I) : DEFAULT_BEAM_SPAN.I,
      materialId: spanMaterialId,
    };
  });
  const beamType = value?.beamType === "simply_supported" || value?.beamType === "cantilever" || value?.beamType === "continuous" ? value.beamType : base.beamType;
  const totalLength = beamSpanBoundaries(normalizedSpans).at(-1) ?? DEFAULT_BEAM_SPAN.length;
  const fallbackSupports = defaultBeamSupports(beamType, normalizedSpans);
  const hasModernLoadFields =
    value?.uniformLoadEnabled !== undefined ||
    value?.uniformLoadStartRatio !== undefined ||
    value?.uniformLoadEndRatio !== undefined ||
    value?.linearLoadEnabled !== undefined ||
    Array.isArray(value?.pointLoads) ||
    Array.isArray(value?.linearLoads);
  const legacyPointLoads = value?.loadType === "point"
    ? [{
        id: "P1",
        magnitudeKn: Number.isFinite(value.pointLoad) ? Number(value.pointLoad) : base.pointLoad,
        positionRatio: Number.isFinite(value.pointLoadPositionRatio) ? Number(value.pointLoadPositionRatio) : base.pointLoadPositionRatio,
      }]
    : [];
  const legacyLinearLoads = value?.loadType === "linear" || value?.linearLoadEnabled
    ? [{
        id: "L1",
        qStartKnPerM: Number.isFinite(value?.distributedLoadStart) ? Number(value?.distributedLoadStart) : base.distributedLoadStart,
        qEndKnPerM: Number.isFinite(value?.distributedLoadEnd) ? Number(value?.distributedLoadEnd) : base.distributedLoadEnd,
        startRatio: Number.isFinite(value?.distributedLoadStartRatio) ? Number(value?.distributedLoadStartRatio) : base.distributedLoadStartRatio,
        endRatio: Number.isFinite(value?.distributedLoadEndRatio) ? Number(value?.distributedLoadEndRatio) : base.distributedLoadEndRatio,
      }]
    : [];
  const linearLoads = normalizeBeamLinearLoads(value?.linearLoads, legacyLinearLoads);
  const uniformLoadEnabled = hasModernLoadFields ? Boolean(value?.uniformLoadEnabled) : value?.loadType !== "point" && value?.loadType !== "linear";
  const linearLoadEnabled = hasModernLoadFields ? Boolean(value?.linearLoadEnabled) && linearLoads.length > 0 : value?.loadType === "linear";
  const pointLoads = normalizeBeamPointLoads(value?.pointLoads, legacyPointLoads);
  const uniformRange = normalizeBeamRange(value?.uniformLoadStartRatio, value?.uniformLoadEndRatio, base.uniformLoadStartRatio, base.uniformLoadEndRatio);
  const primaryLinearLoad = linearLoads[0];
  const activeTypeCount = (uniformLoadEnabled ? 1 : 0) + (linearLoadEnabled ? linearLoads.length : 0) + pointLoads.length;
  const loadType: BeamWorkspaceState["loadType"] =
    activeTypeCount === 0
      ? "none"
      : activeTypeCount > 1
        ? "combined"
        : uniformLoadEnabled
          ? "uniform"
          : linearLoadEnabled
            ? "linear"
            : "point";

  return {
    ...base,
    ...value,
    materials,
    materialId,
    beamType,
    loadType,
    uniformLoadEnabled,
    uniformLoadStartRatio: uniformRange.startRatio,
    uniformLoadEndRatio: uniformRange.endRatio,
    linearLoadEnabled,
    linearLoads,
    pointLoads,
    distributedLoadStart: primaryLinearLoad?.qStartKnPerM ?? base.distributedLoadStart,
    distributedLoadEnd: primaryLinearLoad?.qEndKnPerM ?? base.distributedLoadEnd,
    distributedLoadStartRatio: primaryLinearLoad?.startRatio ?? base.distributedLoadStartRatio,
    distributedLoadEndRatio: primaryLinearLoad?.endRatio ?? base.distributedLoadEndRatio,
    spans: normalizedSpans,
    supports: normalizeBeamSupports(value?.supports, fallbackSupports, totalLength),
    compareEnabled: Boolean(value?.compareEnabled),
    scenarios: Array.isArray(value?.scenarios)
      ? value.scenarios.slice(0, 2).map((scenario) => ({
          id: String(scenario.id ?? crypto.randomUUID()),
          label: String(scenario.label ?? "方案"),
          q: Number.isFinite(scenario.q) ? Number(scenario.q) : base.q,
          E: Number.isFinite(scenario.E) ? Number(scenario.E) : DEFAULT_BEAM_SPAN.E,
          I: Number.isFinite(scenario.I) ? Number(scenario.I) : DEFAULT_BEAM_SPAN.I,
          freq: Number.isFinite(scenario.freq) ? Number(scenario.freq) : base.freq,
          duration: Number.isFinite(scenario.duration) ? Number(scenario.duration) : base.duration,
          color: String(scenario.color ?? "#38bdf8"),
        }))
      : [],
  };
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
  };
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
