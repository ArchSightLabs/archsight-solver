import type { FrameSupportDof, FrameSupportType, TrussSupportType } from "./supports.ts";

export type { FrameSupportDof, FrameSupportType, TrussSupportDof, TrussSupportType } from "./supports.ts";

export type AnalysisType = "beam" | "frame" | "truss";
export type AnalysisMode = "beam" | "frame" | "truss";
export type FrameModelMode = "portal_frame" | "custom";

export interface CalculationTraceEntry {
  stage: string;
  title: string;
  detail?: string;
  status?: string;
  step?: number | null;
  iteration?: number | null;
  residual?: number | null;
  value?: number | null;
  unit?: string;
  sourceId?: string;
}

export interface CalculationCriticalPoint {
  id: string;
  kind: string;
  label: string;
  metricKey?: string;
  value?: number | null;
  unit?: string;
  station?: number | null;
  sourceType?: string;
  sourceId?: string;
  objectId?: string;
  side?: string;
}

export interface CalculationReviewPoint {
  id: string;
  kind: string;
  targetType: "node" | "member" | "station";
  label: string;
  targetId?: string;
  metricKey?: string;
  station?: number | null;
  side?: string;
  note?: string;
}

export interface CalculationGoverningEnvelopeItem {
  id: string;
  metricKey: string;
  label: string;
  value?: number | null;
  absoluteValue?: number | null;
  relativeValue?: number | null;
  unit?: string;
  sourceType?: string;
  sourceId?: string;
  sourceLabel?: string;
  side?: string;
  sourceHash?: string;
  objectId?: string;
  station?: number | null;
  scope?: string;
  kind?: string;
}

export interface CalculationSnapshot {
  id: string;
  name: string;
  analysisMode: AnalysisMode;
  createdAt: string;
  schemaVersion?: string;
  canonicalHash?: string;
  requestHash?: string;
  modelHash?: string;
  resultHash?: string;
  summary: Record<string, number | string | boolean | null>;
  trace: CalculationTraceEntry[];
  criticalPoints: CalculationCriticalPoint[];
  reviewPoints: CalculationReviewPoint[];
  governingEnvelope: CalculationGoverningEnvelopeItem[];
  byteSize: number;
  meta?: Record<string, unknown>;
  sourceMeta?: Record<string, unknown>;
  note?: string;
}

export interface CalculationSnapshotComparisonRow {
  key: string;
  label: string;
  left: number | null;
  right: number | null;
  absDiff: number | null;
  relDiff: number | null;
  unit?: string;
  reason?: string;
  leftText?: string;
  rightText?: string;
  kind?: "number" | "text";
}

export interface CalculationSnapshotComparison {
  left: CalculationSnapshot;
  right: CalculationSnapshot;
  rows: CalculationSnapshotComparisonRow[];
  notes: string[];
  comparable: boolean;
}

export interface ResultViewSettings {
  showLoads: boolean;
  showDisplacement: boolean;
  showExtremeLabel: boolean;
  displacementScale: number | null;
}

export interface ModelLabelOffset {
  dx: number;
  dy: number;
}

export type ModelLabelOffsets = Record<string, ModelLabelOffset>;

export type SupportType = FrameSupportType;
export type FrameLoadDirection = "local_y" | "global_y";
export type FrameSupportDisplacementDof = FrameSupportDof | "n";

export type FrameSpring =
  | { dof: "ux" | "uy"; stiffnessKnPerM: number }
  | { dof: "rz"; stiffnessKnMPerRad: number };

export type FrameSupportDisplacement =
  | { dof: "ux" | "uy" | "n"; displacementMm: number }
  | { dof: "rz"; rotationDeg: number };

export interface StructureNode {
  id: string;
  x: number;
  y: number;
  supportType?: SupportType;
  supportAngleDeg?: number;
  condensedDofs?: FrameSupportDof[];
  springs?: FrameSpring[];
  supportDisplacements?: FrameSupportDisplacement[];
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
  pathRole?: "fixed" | "variable";
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
  pathRole?: "fixed" | "variable";
}

export interface FrameMemberPointLoad {
  type: "member_point";
  member: string;
  direction?: FrameLoadDirection;
  forceKn?: number;
  positionRatio?: number;
  pathRole?: "fixed" | "variable";
}

export interface FrameTemperatureLoad {
  type: "temperature";
  member: string;
  deltaTempC?: number;
  alphaPerC?: number;
  pathRole?: "fixed" | "variable";
}

export type FrameLoad = FrameNodalLoad | FrameDistributedLoad | FrameMemberPointLoad | FrameTemperatureLoad;

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
  schemaVersion?: string;
  projectName: string;
  materialId: string;
  analysisOptions?: FrameAnalysisOptions;
  reviewPoints?: CalculationReviewPoint[];
  structure: FrameStructure;
  format?: "xlsx" | "docx";
}

export interface FramePDeltaOptions {
  algorithm: "initial_stress_v1" | "corotational_newton_v1";
  loadSteps: number;
  maxIterations: number;
  tolerance: number;
  initialStep: number;
  minStep: number;
  maxStep: number;
  maxCutbacks: number;
  relativeResidualTolerance: number;
  absoluteResidualToleranceN: number;
  relativeDisplacementTolerance: number;
  absoluteDisplacementToleranceM: number;
  relativeEnergyTolerance: number;
  absoluteEnergyToleranceJ: number;
  lineSearchMaxTrials: number;
  memberSubdivisions: number;
  maxRefinedDofs: number;
  maxAcceptedSteps: number;
  includeMethodComparison: boolean;
  initialImperfection: FrameInitialImperfection;
}

export interface FrameInitialImperfection {
  type: "none" | "explicit" | "buckling_mode";
  nodeOffsets: Array<{ nodeId: string; uxMm: number; uyMm: number }>;
  modeNumber: number;
  amplitudeMm: number;
  direction: -1 | 1;
}

export interface FrameBucklingOptions {
  modeCount: number;
}

export interface FrameAnalysisOptions {
  pDelta: boolean;
  buckling: boolean;
  pDeltaOptions: FramePDeltaOptions;
  bucklingOptions: FrameBucklingOptions;
}

export interface FrameWorkspaceState {
  frameMode: FrameModelMode;
  projectName: string;
  materialId: string;
  analysisOptions: FrameAnalysisOptions;
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
  reviewPoints: CalculationReviewPoint[];
  calculationSnapshots: CalculationSnapshot[];
  modelLabelOffsets?: ModelLabelOffsets;
  viewSettings?: ResultViewSettings;
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
  initialImperfectionUxMm?: number;
  initialImperfectionUyMm?: number;
  totalUxMm?: number;
  totalUyMm?: number;
  totalResultantMm?: number;
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
  secondOrder?: FrameSecondOrderResult;
  buckling?: FrameBucklingResult;
  factors?: Record<string, number>;
  tags?: string[];
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

export interface FrameStabilityReferenceResults {
  summary: FrameSummary;
  nodeResults: FrameNodeResult[];
  memberResults: FrameMemberResult[];
  memberDiagrams: FrameMemberDiagram[];
}

export interface FrameStabilityIterationRecord {
  step: number;
  iteration: number;
  loadFactor: number;
  fixedLoadFactor?: number;
  pathPhase?: "fixed_preload" | "variable";
  residualNorm?: number;
  displacementMm?: number;
  displacementIncrementMm?: number;
  displacementIncrementNorm?: number;
  displacementIncrementRelative?: number;
  relativeDisplacementIncrement?: number;
  equilibriumRmsRelativeError?: number;
  equilibriumResidual?: number;
  equilibriumMaxResidualN?: number;
  equilibriumResidualNormN?: number;
  equilibriumResidualRelative?: number;
  displacementIncrementNormM?: number;
  displacementIncrementMaxM?: number;
  energyIncrementJ?: number;
  energyIncrementRelative?: number;
  lineSearchScale?: number;
  lineSearchTrials?: number;
  minimumTangentEigenvalue?: number;
  tangentInertia?: { positive: number; nearZero: number; negative: number };
  stabilityStatus?: "stable" | "near_critical" | "unstable";
  maxDisplacementMm?: number;
  status?: string;
}

export interface FrameBucklingModeNodeDisplacement {
  nodeId: string;
  ux: number;
  uy: number;
  rz: number;
}

export interface FrameBucklingModeShape {
  memberId: string;
  stationsM: number[];
  ratios?: number[];
  ux: number[];
  uy: number[];
  rz: number[];
}

export interface FrameBucklingMode {
  modeNumber: number;
  criticalLoadFactor: number;
  residualNorm: number;
  constraintResidual: number;
  normalizedResidual?: number;
  eigenResidualNorm?: number;
  constraintResidualNorm?: number;
  nodeDisplacements?: FrameBucklingModeNodeDisplacement[];
  memberModeShapes?: FrameBucklingModeShape[];
}

export interface FrameSecondOrderResult {
  enabled: boolean;
  status: string;
  statusLabel?: string;
  method: string;
  algorithm?: { id: "initial_stress_v1" | "corotational_newton_v1"; version: string };
  equilibriumStatus?: "not_enabled" | "converged" | "not_converged";
  stabilityStatus?: "not_evaluated" | "stable" | "near_critical" | "unstable";
  converged?: boolean;
  loadSteps?: number;
  totalIterations?: number;
  tolerance?: number | null;
  amplificationFactor: number | null;
  amplificationUnavailableReason?: string | null;
  maxHorizontalDisplacementMm?: number;
  maxVerticalDisplacementMm?: number;
  maxDisplacementMm?: number;
  firstOrder?: FrameStabilityReferenceResults;
  iterationHistory?: FrameStabilityIterationRecord[];
  nonlinearPathTrace?: FrameNonlinearPathTrace | null;
  methodComparison?: FrameMethodComparison | null;
  lastConverged?: { loadFactor: number; fixedLoadFactor?: number; maxDisplacementMm?: number; step?: number } | null;
  initialImperfection?: Record<string, unknown> | null;
  failureReason?: string | null;
  failureCode?: string | null;
  limitations?: string;
}

export interface FrameNonlinearPathStep {
  step: number;
  loadFactor: number;
  fixedLoadFactor?: number;
  pathPhase?: "fixed_preload" | "variable";
  stepSize: number;
  iterations: number;
  equilibriumStatus: string;
  stabilityStatus: "stable" | "near_critical" | "unstable";
  minimumTangentEigenvalue: number;
  maxDisplacementMm: number;
}

export interface FrameNonlinearPathKeyPoint {
  id: string;
  kind: "start" | "preload_end" | "response_turning" | "stability_change" | "minimum_stability" | "residual_peak" | "cutback" | "last_converged" | "failure";
  source: string;
  sourceIndex: number;
  step: number;
  pathPhase: "fixed_preload" | "variable";
  pathProgress: number;
  fixedLoadFactor: number;
  loadFactor: number;
  maxDisplacementMm?: number | null;
  minimumTangentEigenvalue?: number | null;
  equilibriumResidualRelative?: number | null;
  status?: string | null;
  stabilityStatus?: "stable" | "near_critical" | "unstable" | null;
}

export interface FrameNonlinearPathTrace {
  schema: "NonlinearPathTrace@1";
  algorithm: { id: string; version: string };
  control: Record<string, unknown>;
  convergence: Record<string, number>;
  mesh: Record<string, unknown>;
  representativeElementState?: Record<string, unknown> | null;
  steps: FrameNonlinearPathStep[];
  iterations: FrameStabilityIterationRecord[];
  attempts: Array<Record<string, unknown>>;
  keyPoints?: FrameNonlinearPathKeyPoint[];
  keyframes: Array<{
    step: number;
    loadFactor: number;
    fixedLoadFactor?: number;
    pathPhase?: string;
    nodeDisplacements: Array<{ nodeIndex: number; uxM: number; uyM: number; rzRad: number }>;
  }>;
  lastConverged: { loadFactor: number; fixedLoadFactor?: number; maxDisplacementMm: number; step: number };
  finalAttempt?: Record<string, unknown> | null;
  summary: Record<string, unknown>;
}

export interface FrameMethodComparison {
  schema: "MethodComparison@1";
  methods: Array<Record<string, unknown>>;
  metrics: Array<{
    id: string;
    unit: string;
    comparable: boolean;
    unavailableReason?: string | null;
    referenceOnly?: boolean;
    values: Record<string, number>;
  }>;
  limitations?: string[];
}

export interface FrameBucklingControlMember {
  memberId: string;
  compressionKn: number;
  eulerCriticalLoadKn: number;
  criticalLoadFactor: number;
  utilizationRatio: number;
  screeningMethod?: string;
  screeningOnly?: boolean;
}

export interface FrameBucklingResult {
  enabled: boolean;
  status: string;
  statusLabel?: string;
  method: string;
  criticalLoadFactor: number | null;
  memberEulerScreen?: FrameBucklingControlMember[];
  /** @deprecated 兼容旧结果；语义为构件 Euler K=1 初筛，不是整体屈曲控制构件。 */
  controllingMembers?: FrameBucklingControlMember[];
  modes?: FrameBucklingMode[];
  modeCount?: number;
  referenceSource?: { source: string; id: string; title: string };
  controlSource?: { source: string; id: string; title: string };
  meshDiagnostics?: Record<string, unknown>;
  limitations?: string;
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
  calculationTrace?: CalculationTraceEntry[];
  criticalPoints?: CalculationCriticalPoint[];
  reviewPoints?: CalculationReviewPoint[];
  governingEnvelope?: CalculationGoverningEnvelopeItem[];
  calculationSnapshot?: CalculationSnapshot;
  loadCaseResults?: FrameLoadCaseResult[];
  loadCombinationResults?: Array<FrameLoadCaseResult & { factors: Record<string, number>; tags?: string[] }>;
  secondOrder?: FrameSecondOrderResult;
  buckling?: FrameBucklingResult;
  nodeIds: string[];
  memberIds: string[];
  ux_data: number[];
  uy_data: number[];
  rz_data: number[];
  member_axial_data: number[];
  member_shear_data: number[];
  member_moment_data: number[];
  error?: string;
  meta?: {
    generatedAt?: string;
    modelHash?: string;
    requestHash?: string;
    jobId?: string;
  };
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

export interface TrussTemperatureLoad {
  type: "temperature";
  member: string;
  deltaTempC?: number;
  alphaPerC?: number;
}

export type TrussLoad = TrussNodalLoad | TrussMemberLoad | TrussTemperatureLoad;
export type TrussLoadPatch =
  | Partial<Omit<TrussNodalLoad, "type">>
  | Partial<Omit<TrussMemberLoad, "type">>
  | Partial<Omit<TrussTemperatureLoad, "type">>;

export interface TrussLoadCase {
  id: string;
  title: string;
  loads: TrussLoad[];
}

export interface TrussLoadCombination {
  id: string;
  title: string;
  factors: Record<string, number>;
  tags?: string[];
}

export interface TrussStructure {
  template: "explicit";
  nodes: TrussNode[];
  members: TrussMember[];
  loads: TrussLoad[];
  loadCases?: TrussLoadCase[];
  loadCombinations?: TrussLoadCombination[];
}

export interface TrussFormPayload {
  analysisType: "truss";
  schemaVersion?: string;
  projectName: string;
  materialId: string;
  reviewPoints?: CalculationReviewPoint[];
  structure: TrussStructure;
  format?: "xlsx" | "docx";
}

export interface TrussWorkspaceState {
  projectName: string;
  materialId: string;
  customNodes: TrussNode[];
  customMembers: TrussMember[];
  customLoads: TrussLoad[];
  customLoadCases: TrussLoadCase[];
  customLoadCombinations: TrussLoadCombination[];
  reviewPoints: CalculationReviewPoint[];
  calculationSnapshots: CalculationSnapshot[];
  modelLabelOffsets?: ModelLabelOffsets;
  viewSettings?: ResultViewSettings;
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
  diagnostics?: FrameDiagnostics;
  payload: TrussFormPayload;
  structure: TrussStructure;
  nodeResults: TrussNodeResult[];
  memberResults: TrussMemberResult[];
  calculationTrace?: CalculationTraceEntry[];
  criticalPoints?: CalculationCriticalPoint[];
  reviewPoints?: CalculationReviewPoint[];
  governingEnvelope?: CalculationGoverningEnvelopeItem[];
  calculationSnapshot?: CalculationSnapshot;
  loadCaseResults?: TrussLoadCaseResult[];
  loadCombinationResults?: Array<TrussLoadCaseResult & { factors: Record<string, number>; tags?: string[] }>;
  nodeIds: string[];
  memberIds: string[];
  ux_data: number[];
  uy_data: number[];
  member_axial_data: Array<{ memberId: string; axialForceKn: number }>;
  solution?: unknown;
  error?: string;
  meta?: {
    generatedAt?: string;
    modelHash?: string;
    requestHash?: string;
    jobId?: string;
  };
}

export interface TrussLoadCaseResult {
  id: string;
  title: string;
  summary: Partial<TrussSummary>;
  nodeResults: TrussNodeResult[];
  memberResults: TrussMemberResult[];
}
