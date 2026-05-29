export interface BeamForm {
  analysisType: 'beam';
  q: number;
  E: number;
  I: number;
  spans: number[];
  beamType: 'continuous' | 'simply_supported' | 'cantilever';
  loadType: 'none' | 'uniform' | 'point' | 'linear' | 'combined';
  loadValue: number;
  loadPosition: number;
  loadEnd: number;
  freq: number;
  duration: number;
  materialId: string;
  projectName?: string;
  format?: 'xlsx' | 'docx';
}

export interface BeamSpanConfig {
  id?: string;
  length: number;
  E: number;
  I: number;
  materialId?: string;
}

export type BeamSupportType = 'pinned' | 'roller' | 'fixed' | 'free';
export type BeamSupportDof = 'v' | 'rz';

export type BeamSupportSpring =
  | { dof: 'v'; stiffnessKnPerM: number }
  | { dof: 'rz'; stiffnessKnMPerRad: number };

export interface BeamSupportConfig {
  id: string;
  x: number;
  type: BeamSupportType;
  constraints?: BeamSupportDof[];
  springs?: BeamSupportSpring[];
}

export interface BeamPointLoadConfig {
  id: string;
  magnitudeKn: number;
  positionRatio: number;
}

export interface BeamLinearLoadConfig {
  id: string;
  qStartKnPerM: number;
  qEndKnPerM: number;
  startRatio: number;
  endRatio: number;
}

export type BeamPreviewStyle = 'simple' | 'color';

export type BeamLoadInput =
  | { type: 'uniform'; qKnPerM: number; start?: number; end?: number; enabled?: boolean }
  | { type: 'point'; pointLoadKn: number; x: number; enabled?: boolean }
  | { type: 'linear'; qStartKnPerM: number; qEndKnPerM: number; start: number; end: number; enabled?: boolean };

export interface BeamWorkspaceState {
  projectName: string;
  materialId: string;
  materials: Material[];
  beamType: BeamForm['beamType'];
  loadType: BeamForm['loadType'];
  uniformLoadEnabled: boolean;
  linearLoadEnabled: boolean;
  linearLoads: BeamLinearLoadConfig[];
  pointLoads: BeamPointLoadConfig[];
  q: number;
  uniformLoadStartRatio: number;
  uniformLoadEndRatio: number;
  pointLoad: number;
  pointLoadPositionRatio: number;
  distributedLoadStart: number;
  distributedLoadEnd: number;
  distributedLoadStartRatio: number;
  distributedLoadEndRatio: number;
  freq: number;
  duration: number;
  spans: BeamSpanConfig[];
  supports: BeamSupportConfig[];
  compareEnabled: boolean;
  scenarios: ComparisonScenario[];
}

export interface BeamApiPayload extends BeamForm {
  loads?: BeamLoadInput[];
  pointLoad?: number;
  pointLoadKn?: number;
  pointLoadPositionRatio?: number;
  pointPositionRatio?: number;
  uniformLoadStartRatio?: number;
  uniformLoadEndRatio?: number;
  distributedLoadStart?: number;
  distributedLoadEnd?: number;
  distributedLoadStartRatio?: number;
  distributedLoadEndRatio?: number;
  spanProperties?: Array<{
      E: number;
      I: number;
      id?: string;
      memberId?: string;
      materialId?: string;
  }>;
  supports?: BeamSupportConfig[];
}

export interface Material {
  id: string;
  name: string;
  youngModulus: number; // in GPa
  density: number;      // in kg/m3
}

export const PREDEFINED_MATERIALS: Material[] = [
  { id: 'custom', name: '自定义 (手动输入)', youngModulus: 206, density: 7850 },
  { id: 'q235', name: 'Q235 碳素结构钢', youngModulus: 206, density: 7850 },
  { id: 'q345', name: 'Q345 低合金高强度结构钢', youngModulus: 210, density: 7850 },
  { id: 'c30', name: 'C30 混凝土', youngModulus: 30, density: 2500 },
  { id: 'c35', name: 'C35 混凝土', youngModulus: 31.5, density: 2500 },
  { id: 'c40', name: 'C40 混凝土', youngModulus: 32.5, density: 2500 },
  { id: 'c50', name: 'C50 混凝土', youngModulus: 34.5, density: 2500 },
];

export interface BeamCalculationResults {
  analysisType?: "beam";
  x_data: number[];
  v_data: number[];
  moment_data: number[];
  shear_data: number[];
  t_data: number[];
  q_t_data: number[];
  beam?: BeamPreviewData;
  summary?: BeamSummary;
  payload?: BeamApiPayload;
  error?: string;
}

export interface BeamSupport {
  label: string;
  x: number;
  type: BeamSupportType;
  constraints?: BeamSupportDof[];
  springs?: BeamSupportSpring[];
}

export interface BeamLoadMarker {
  type: 'uniform' | 'point' | 'linear';
  x: number;
  intensityKnPerM?: number;
  intensityKn?: number;
  startX?: number;
  endX?: number;
  length?: number;
}

export interface BeamCurvePoint {
  x: number;
  v: number;
  vMm: number;
}

export interface BeamSpanSummary {
  spanIndex: number;
  startX: number;
  endX: number;
  length: number;
  maxDeflectionMm: number;
  maxDeflectionPositionM: number;
}

export interface BeamPreviewData {
  beamType: 'continuous' | 'simply_supported' | 'cantilever';
  beamTypeLabel: string;
  loadType: 'none' | 'uniform' | 'point' | 'linear' | 'combined';
  loadTypeLabel: string;
  spans: number[];
  spanIds?: string[];
  totalLength: number;
  supports: BeamSupport[];
  nodes: Array<{ index: number; id?: string; x: number; support: boolean }>;
  loads: BeamLoadMarker[];
  curve: BeamCurvePoint[];
  spanSummaries: BeamSpanSummary[];
  maxDeflection: {
    valueM: number;
    valueMm: number;
    xM: number;
    spanIndex: number;
  };
  reactions: Array<{
    dof: number;
    supportId?: string;
    valueN: number;
    valueKn: number;
  }>;
  warnings: string[];
}

export interface BeamSummary {
  allowableMm: number;
  allowableRatio: number;
  maxDeflectionMm: number;
  maxDeflectionPositionM: number;
  status: string;
  statusCode: 'PASS' | 'REVIEW';
  method: string;
}

export interface ComparisonScenario {
  id: string;
  label: string;
  q: number;
  E: number;
  I: number;
  freq: number;
  duration: number;
  color: string;
}

export interface ComparisonSeries {
  id: string;
  label: string;
  color: string;
  payload: BeamForm;
  data: BeamCalculationResults;
}

export interface SensitivityConfig {
  range: number;
  steps: number;
  responseMetric?: string;
}

export interface SensitivityPayload extends BeamApiPayload {
  targetSpanIndex: number;
  config: SensitivityConfig;
}

export interface SensitivitySeries {
  key: string;
  label: string;
  values: number[];
  color?: string;
}

export interface SensitivityResults {
  variations: number[];
  responseLabel: string;
  responseUnit: string;
  series: SensitivitySeries[];
  responseMetric?: string;
  q?: number[];
  E?: number[];
  I?: number[];
  freq?: number[];
  beamLoad?: number[];
  lateralLoad?: number[];
  fx?: number[];
  fy?: number[];
  A?: number[];
  error?: string;
}

export interface SensitivityResponseOption {
  value: string;
  label: string;
}

export interface TemplateSnapshot {
  analysisMode: 'beam' | 'frame' | 'truss';
  beam?: BeamWorkspaceState;
  frame?: import('./structure').FrameWorkspaceState;
  truss?: import('./structure').TrussWorkspaceState;
  compareEnabled: boolean;
  scenarios: ComparisonScenario[];
}

export interface ProjectTemplate {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  snapshot: TemplateSnapshot;
}

export interface TemplateLibraryState {
  version: '1.0';
  baselineTemplateId: string | null;
  templates: ProjectTemplate[];
}
