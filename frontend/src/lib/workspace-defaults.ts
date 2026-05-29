import type { BeamSpanConfig, BeamSupportConfig, BeamWorkspaceState, ComparisonScenario } from "../types/beam.ts";
import { PREDEFINED_MATERIALS, type Material } from "../types/material.ts";
import type {
  AnalysisMode,
  FrameLoad,
  FrameLoadCase,
  FrameLoadCombination,
  FrameSpring,
  FrameWorkspaceState,
  StructureMember,
  StructureNode,
  SupportType,
  TrussWorkspaceState,
} from "../types/structure.ts";

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

export const DEFAULT_BEAM_MATERIALS: Material[] = PREDEFINED_MATERIALS.map((material) => ({ ...material }));
export const DEFAULT_FRAME_MODE: FrameWorkspaceState["frameMode"] = "custom";
export const DEFAULT_SCENARIOS: ComparisonScenario[] = [];

export interface TrussCollections {
  nodes: TrussWorkspaceState["customNodes"];
  members: TrussWorkspaceState["customMembers"];
  loads: TrussWorkspaceState["customLoads"];
}

export interface PortalFrameConfig {
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

export interface FrameCollections {
  nodes: StructureNode[];
  members: StructureMember[];
  loads: FrameLoad[];
  loadCases?: FrameLoadCase[];
  loadCombinations?: FrameLoadCombination[];
}

export function createPortalFrameCollections(config: PortalFrameConfig): FrameCollections {
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

export function cloneNodes(nodes: StructureNode[]): StructureNode[] {
  return nodes.map((node) => ({
    ...node,
    springs: cloneSprings(node.springs),
    condensedDofs: node.condensedDofs ? [...node.condensedDofs] : undefined,
  }));
}

export function cloneMembers(members: StructureMember[]): StructureMember[] {
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

export function cloneLoads(loads: FrameLoad[]): FrameLoad[] {
  return loads.map((load) => ({ ...load })) as FrameLoad[];
}

export function cloneFrameLoadCases(loadCases: FrameLoadCase[]): FrameLoadCase[] {
  return loadCases.map((loadCase) => ({
    ...loadCase,
    loads: cloneLoads(loadCase.loads),
  }));
}

export function cloneFrameLoadCombinations(combinations: FrameLoadCombination[]): FrameLoadCombination[] {
  return combinations.map((combination) => ({
    ...combination,
    factors: { ...combination.factors },
    tags: [...(combination.tags ?? [])],
  }));
}

export function cloneTrussNodes(nodes: TrussWorkspaceState["customNodes"]): TrussWorkspaceState["customNodes"] {
  return nodes.map((node) => ({ ...node }));
}

export function cloneTrussMembers(members: TrussWorkspaceState["customMembers"]): TrussWorkspaceState["customMembers"] {
  return members.map((member) => ({ ...member }));
}

export function cloneTrussLoads(loads: TrussWorkspaceState["customLoads"]): TrussWorkspaceState["customLoads"] {
  return loads.map((load) => ({ ...load }));
}

export function createDefaultFrameCollections(): FrameCollections {
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

export function createDefaultTrussCollections(): TrussCollections {
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

export function beamSpanBoundaries(spans: BeamSpanConfig[]): number[] {
  const boundaries = [0];
  for (const span of spans) {
    boundaries.push(Number(((boundaries[boundaries.length - 1] ?? 0) + span.length).toFixed(9)));
  }
  return boundaries;
}

export function defaultBeamSupports(beamType: BeamWorkspaceState["beamType"], spans: BeamSpanConfig[]): BeamSupportConfig[] {
  const boundaries = beamSpanBoundaries(spans);
  const totalLength = boundaries[boundaries.length - 1] ?? 0;
  if (beamType === "cantilever") {
    return [
      { id: "S1", x: 0, type: "fixed", constraints: ["v", "rz"] },
    ];
  }
  if (beamType === "simply_supported") {
    return [
      { id: "S1", x: 0, type: "pinned", constraints: ["v"] },
      { id: "S2", x: totalLength, type: "roller", constraints: ["v"] },
    ];
  }
  return boundaries.map((x, index) => ({
    id: `S${index + 1}`,
    x,
    type: index === 0 ? "pinned" : index === boundaries.length - 1 ? "roller" : "pinned",
    constraints: ["v"],
  }));
}

export { defaultBeamSupports as createDefaultBeamSupports };

export function cloneBeamSupports(supports: BeamSupportConfig[]): BeamSupportConfig[] {
  return supports.map((support) => ({
    ...support,
    constraints: support.constraints ? [...support.constraints] : undefined,
    springs: support.springs?.map((spring) => ({ ...spring })),
  }));
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
