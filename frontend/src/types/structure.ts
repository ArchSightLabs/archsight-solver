import type { FrameSupportDof, FrameSupportType, TrussSupportType } from "./supports.ts";

export type { FrameSupportDof, FrameSupportType, TrussSupportDof, TrussSupportType } from "./supports.ts";

export type AnalysisType = "beam" | "frame" | "truss";
export type AnalysisMode = "beam" | "frame" | "truss";
export type FrameModelMode = "portal_frame" | "custom";

export type SupportType = FrameSupportType;
export type FrameLoadDirection = "local_y" | "global_y";

export type FrameSpring =
  | { dof: "ux" | "uy"; stiffnessKnPerM: number }
  | { dof: "rz"; stiffnessKnMPerRad: number };

export interface StructureNode {
  id: string;
  x: number;
  y: number;
  supportType?: SupportType;
  supportAngleDeg?: number;
  condensedDofs?: FrameSupportDof[];
  springs?: FrameSpring[];
}

export interface FrameInternalHinge {
  ratio: number;
}

export interface StructureMember {
  id: string;
  start: string;
  end: string;
  elementType?: "frame";
  materialId?: string;
  E_GPa: number;
  A_cm2: number;
  I_cm4: number;
  kind?: string;
  endReleases?: {
    start?: Array<"rz">;
    end?: Array<"rz">;
  };
  internalHinges?: FrameInternalHinge[];
}

export interface FrameNodalLoad {
  type: "nodal";
  node: string;
  fxKn?: number;
  fyKn?: number;
  mzKnM?: number;
}

export interface FrameDistributedLoad {
  type: "distributed";
  member: string;
  wyKnPerM?: number;
  direction?: FrameLoadDirection;
  qStartKnPerM?: number;
  qEndKnPerM?: number;
  startRatio?: number;
  endRatio?: number;
}

export interface FrameMemberPointLoad {
  type: "member_point";
  member: string;
  direction?: FrameLoadDirection;
  forceKn?: number;
  positionRatio?: number;
}

export type FrameLoad = FrameNodalLoad | FrameDistributedLoad | FrameMemberPointLoad;

export interface FrameLoadCase {
  id: string;
  title: string;
  loads: FrameLoad[];
}

export interface FrameLoadCombination {
  id: string;
  title: string;
  factors: Record<string, number>;
  tags?: string[];
}

export interface FrameStructure {
  template: "portal_frame" | "explicit";
  span?: number;
  height?: number;
  left_support?: SupportType;
  right_support?: SupportType;
  beam_load_kn_per_m?: number;
  lateral_load_kn?: number;
  top_vertical_load_kn?: number;
  nodes: StructureNode[];
  members: StructureMember[];
  loads: FrameLoad[];
  loadCases?: FrameLoadCase[];
  loadCombinations?: FrameLoadCombination[];
}

export interface FrameFormPayload {
  analysisType: "frame";
  projectName: string;
  materialId: string;
  structure: FrameStructure;
  format?: "xlsx" | "docx";
}

export interface FrameWorkspaceState {
  frameMode: FrameModelMode;
  projectName: string;
  materialId: string;
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
  customNodes: StructureNode[];
  customMembers: StructureMember[];
  customLoads: FrameLoad[];
  customLoadCases: FrameLoadCase[];
  customLoadCombinations: FrameLoadCombination[];
}

export interface FrameNodeResult {
  nodeId: string;
  x: number;
  y: number;
  supportType: SupportType;
  uxMm: number;
  uyMm: number;
  rotationDeg: number;
  resultantMm: number;
  reactionFxKn: number;
  reactionFyKn: number;
  reactionMzKnM: number;
}

export interface FrameMemberResult {
  memberId: string;
  kind: string;
  startNode: string;
  endNode: string;
  axialStartKn: number;
  shearStartKn: number;
  momentStartKnM: number;
  axialEndKn: number;
  shearEndKn: number;
  momentEndKnM: number;
  maxAbsAxialKn?: number;
  maxAbsShearKn?: number;
  maxAbsMomentKnM?: number;
  lengthM: number;
}

export interface FrameMemberDiagram {
  memberId: string;
  stationsM: number[];
  stations: number[];
  axialKn: number[];
  shearKn: number[];
  momentKnM: number[];
  deflectionMm: number[];
}

export interface FrameLoadCaseResult {
  id: string;
  title: string;
  summary: FrameSummary;
  diagnostics?: FrameDiagnostics;
  nodeResults: FrameNodeResult[];
  memberResults: FrameMemberResult[];
  memberDiagrams: FrameMemberDiagram[];
}

export interface FramePreviewData {
  analysisType: "frame";
  structureType: string;
  structureTypeLabel: string;
  nodes: StructureNode[];
  members: Array<Pick<StructureMember, "id" | "kind" | "start" | "end" | "endReleases">>;
  loads: FrameLoad[];
  nodeResults: FrameNodeResult[];
  memberResults: FrameMemberResult[];
  memberDiagrams?: FrameMemberDiagram[];
  deformedNodes: Array<{ nodeId: string; x: number; y: number }>;
  deformationScale: number;
  summary: {
    maxDisplacementMm: number;
    maxVerticalMm: number;
    maxRotationDeg: number;
    maxDisplacementNodeId?: string | null;
    status: string;
  };
  warnings: string[];
}

export interface FrameSummary {
  allowableMm: number;
  maxDisplacementMm: number;
  maxVerticalMm: number;
  maxRotationDeg: number;
  maxMomentKnM: number;
  maxDisplacementNodeId: string | null;
  status: string;
  statusCode: "PASS" | "REVIEW";
  method: string;
}

export interface FrameDiagnostics {
  equilibrium?: {
    rmsRelativeError: number;
    maxResidualN: number;
  };
  constraintRank?: number | null;
  freeDofCount?: number | null;
}

export interface FrameCalculationResults {
  analysisType: "frame";
  frame?: FramePreviewData;
  preview?: FramePreviewData;
  diagram?: unknown;
  summary: FrameSummary;
  diagnostics?: FrameDiagnostics;
  payload: FrameFormPayload;
  structure: FrameStructure;
  nodeResults: FrameNodeResult[];
  memberResults: FrameMemberResult[];
  memberDiagrams: FrameMemberDiagram[];
  loadCaseResults?: FrameLoadCaseResult[];
  loadCombinationResults?: Array<FrameLoadCaseResult & { factors: Record<string, number>; tags?: string[] }>;
  nodeIds: string[];
  memberIds: string[];
  ux_data: number[];
  uy_data: number[];
  rz_data: number[];
  member_axial_data: number[];
  member_shear_data: number[];
  member_moment_data: number[];
  error?: string;
}

export interface TrussNode {
  id: string;
  x: number;
  y: number;
  supportType?: TrussSupportType;
}

export interface TrussMember {
  id: string;
  start: string;
  end: string;
  elementType?: "truss";
  materialId?: string;
  E_GPa: number;
  A_cm2: number;
  kind?: string;
}

export interface TrussNodalLoad {
  type: "nodal";
  node: string;
  fxKn?: number;
  fyKn?: number;
}

export interface TrussMemberLoad {
  type: "distributed" | "member_load" | "member";
  member: string;
  direction?: "global_x" | "global_y";
  wyKnPerM?: number;
  qStartKnPerM?: number;
  qEndKnPerM?: number;
  selfWeightKnPerM?: number;
}

export type TrussLoad = TrussNodalLoad | TrussMemberLoad;

export interface TrussStructure {
  template: "explicit";
  nodes: TrussNode[];
  members: TrussMember[];
  loads: TrussLoad[];
}

export interface TrussFormPayload {
  analysisType: "truss";
  projectName: string;
  materialId: string;
  structure: TrussStructure;
  format?: "xlsx" | "docx";
}

export interface TrussWorkspaceState {
  projectName: string;
  materialId: string;
  customNodes: TrussNode[];
  customMembers: TrussMember[];
  customLoads: TrussLoad[];
}

export interface TrussNodeResult {
  nodeId: string;
  x: number;
  y: number;
  uxMm: number;
  uyMm: number;
  displacementMm: number;
  rxKn: number;
  ryKn: number;
  supportType: TrussSupportType;
}

export interface TrussMemberResult {
  memberId: string;
  kind: string;
  startNode: string;
  endNode: string;
  lengthM: number;
  axialForceKn: number;
  axialStressMpa: number;
  forceState: string;
}

export interface TrussPreviewData {
  analysisType: "truss";
  structureType: string;
  structureTypeLabel: string;
  nodes: Array<{ id: string; x: number; y: number; role: string; supportType?: TrussSupportType }>;
  members: Array<Pick<TrussMember, "id" | "start" | "end">>;
  loads: TrussLoad[];
  nodeResults: TrussNodeResult[];
  memberResults: TrussMemberResult[];
  deformedNodes: Array<{ id: string; x: number; y: number; uxMm: number; uyMm: number }>;
  deformationScale: number;
  summary: {
    allowableMm: number;
    allowableRatio: number;
    maxDisplacementMm: number;
    maxAxialForceKn: number;
    maxDisplacementNodeId?: string | null;
    maxAxialForceMemberId?: string | null;
    statusCode: "PASS" | "REVIEW";
    status: string;
    method: string;
  };
  warnings: string[];
}

export interface TrussSummary {
  allowableMm: number;
  allowableRatio: number;
  maxDisplacementMm: number;
  maxDisplacementNodeId: string | null;
  maxAxialForceKn: number;
  maxAxialForceMemberId: string | null;
  status: string;
  statusCode: "PASS" | "REVIEW";
  method: string;
}

export interface TrussCalculationResults {
  analysisType: "truss";
  truss?: TrussPreviewData;
  preview?: TrussPreviewData;
  diagram?: unknown;
  summary: TrussSummary;
  payload: TrussFormPayload;
  structure: TrussStructure;
  nodeResults: TrussNodeResult[];
  memberResults: TrussMemberResult[];
  nodeIds: string[];
  memberIds: string[];
  ux_data: number[];
  uy_data: number[];
  member_axial_data: Array<{ memberId: string; axialForceKn: number }>;
  solution?: unknown;
  error?: string;
}
