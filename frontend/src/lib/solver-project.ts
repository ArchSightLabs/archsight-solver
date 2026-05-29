import type { AnalysisResults } from "../hooks/useWorkbenchActions.ts";
import type { BeamWorkspaceState, ModelPreviewStyle, SensitivityResults } from "../types/beam.ts";
import type { AnalysisMode, FrameWorkspaceState, TrussWorkspaceState } from "../types/structure.ts";
import { defaultAnalysisObjectNameForMode } from "./analysis-vocabulary.ts";
import { normalizeReportExportOptions, type ReportExportOptions } from "./report-options.ts";
import {
  createDefaultBeamWorkspaceState,
  createDefaultFrameWorkspaceState,
  createDefaultTrussWorkspaceState,
  normalizeBeamWorkspaceState,
  normalizeFrameWorkspaceState,
  normalizeTrussWorkspaceState,
  normalizeWorkspaceState,
  type WorkspaceState,
} from "./workspace-state.ts";

export type AnalysisObjectType = AnalysisMode;
export type WorkbenchView = "model" | "results" | "sensitivity";
export type AnalysisObjectState = BeamWorkspaceState | FrameWorkspaceState | TrussWorkspaceState;

export interface ProjectInfo {
  name: string;
  address: string;
  projectType: string;
  scale: string;
  projectManager: string;
  constructionUnit: string;
  developerUnit: string;
  supervisionUnit: string;
}

export interface BenchmarkCaseSource {
  caseId: string;
  category: string;
  title: string;
  purpose: string;
  sourceType: string;
  sourceLabel: string;
  reference: string;
  method: string;
  sourceLinks: string[];
  checkedMetrics: string[];
  metricSummary: string;
  expectedSummary: string;
  toleranceSummary: string;
  expected: Record<string, unknown>;
  tolerances: Record<string, unknown>;
}

export interface AnalysisObject {
  id: string;
  name: string;
  type: AnalysisObjectType;
  state: AnalysisObjectState;
  results: AnalysisResults;
  sensitivityResults: SensitivityResults | null;
  workbenchView: WorkbenchView;
  benchmark?: BenchmarkCaseSource;
  createdAt: string;
  updatedAt: string;
}

export function getAnalysisObjectDisplayName(object: Pick<AnalysisObject, "name" | "benchmark">, index: number): string {
  const name = object.name.trim();
  if (!object.benchmark || /^\d{2}\s/.test(name)) return name;
  return `${String(index + 1).padStart(2, "0")} ${name}`;
}

export interface ProjectSettings {
  activeModuleSection: string;
  modelPreviewStyle: ModelPreviewStyle;
  reportExportOptions: ReportExportOptions;
  projectInfo: ProjectInfo;
}

export interface SolverProject {
  id: string;
  name: string;
  activeObjectId: string;
  objects: AnalysisObject[];
  settings: ProjectSettings;
  createdAt: string;
  updatedAt: string;
}

function createId(prefix: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeProjectInfo(raw: Partial<ProjectInfo> | null | undefined, fallbackName = "新建结构分析项目"): ProjectInfo {
  return {
    name: String(raw?.name ?? fallbackName).trim() || fallbackName,
    address: String(raw?.address ?? ""),
    projectType: String(raw?.projectType ?? ""),
    scale: String(raw?.scale ?? ""),
    projectManager: String(raw?.projectManager ?? ""),
    constructionUnit: String(raw?.constructionUnit ?? ""),
    developerUnit: String(raw?.developerUnit ?? ""),
    supervisionUnit: String(raw?.supervisionUnit ?? ""),
  };
}

export function defaultAnalysisObjectName(type: AnalysisObjectType, index = 1): string {
  return defaultAnalysisObjectNameForMode(type, index);
}

function defaultStateForType(type: AnalysisObjectType): AnalysisObjectState {
  if (type === "frame") return createDefaultFrameWorkspaceState();
  if (type === "truss") return createDefaultTrussWorkspaceState();
  return createDefaultBeamWorkspaceState();
}

function normalizeModelPreviewStyle(value: unknown): ModelPreviewStyle {
  return value === "simple" ? "simple" : "color";
}

function legacyModelPreviewStyleFromObjects(objects: AnalysisObject[]): ModelPreviewStyle | undefined {
  for (const object of objects) {
    if (object.type !== "beam") continue;
    const state = object.state as unknown as Record<string, unknown>;
    if (state.previewStyle === "simple" || state.previewStyle === "color") {
      return state.previewStyle;
    }
  }
  return undefined;
}

function normalizeStateForType(type: AnalysisObjectType, state: unknown): AnalysisObjectState {
  if (type === "frame") return normalizeFrameWorkspaceState(state as Partial<FrameWorkspaceState> | null | undefined);
  if (type === "truss") return normalizeTrussWorkspaceState(state as Partial<TrussWorkspaceState> | null | undefined);
  return normalizeBeamWorkspaceState(state as Partial<BeamWorkspaceState> | null | undefined);
}

export function createAnalysisObject(type: AnalysisObjectType, name?: string, now = new Date()): AnalysisObject {
  const timestamp = now.toISOString();
  return {
    id: createId(type),
    name: name?.trim() || defaultAnalysisObjectName(type),
    type,
    state: defaultStateForType(type),
    results: null,
    sensitivityResults: null,
    workbenchView: "model",
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function createDefaultAnalysisObjects(now = new Date()): AnalysisObject[] {
  return [
    createAnalysisObject("beam", defaultAnalysisObjectName("beam"), now),
    createAnalysisObject("frame", defaultAnalysisObjectName("frame"), now),
    createAnalysisObject("truss", defaultAnalysisObjectName("truss"), now),
  ];
}

export function createDefaultSolverProject(
  nowOrProjectInfo: Date | Partial<ProjectInfo> | null = new Date(),
  rawProjectInfo?: Partial<ProjectInfo> | null
): SolverProject {
  const now = nowOrProjectInfo instanceof Date ? nowOrProjectInfo : new Date();
  const projectInfoSource = nowOrProjectInfo instanceof Date ? rawProjectInfo : nowOrProjectInfo;
  const timestamp = now.toISOString();
  const objects = createDefaultAnalysisObjects(now);
  const projectInfo = normalizeProjectInfo(projectInfoSource);
  return {
    id: createId("project"),
    name: projectInfo.name,
    activeObjectId: objects[0].id,
    objects,
    settings: {
      activeModuleSection: "",
      modelPreviewStyle: "color",
      reportExportOptions: normalizeReportExportOptions(null),
      projectInfo,
    },
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function normalizeObjectType(value: unknown): AnalysisObjectType {
  return value === "frame" || value === "truss" || value === "beam" ? value : "beam";
}

function normalizeAnalysisObject(rawObject: unknown, index: number): AnalysisObject {
  const raw = rawObject && typeof rawObject === "object" ? (rawObject as Partial<AnalysisObject>) : {};
  const type = normalizeObjectType(raw.type);
  const now = new Date().toISOString();
  return {
    id: String(raw.id ?? createId(type)),
    name: String(raw.name ?? defaultAnalysisObjectName(type, index + 1)).trim() || defaultAnalysisObjectName(type, index + 1),
    type,
    state: normalizeStateForType(type, raw.state),
    results: raw.results ?? null,
    sensitivityResults: raw.sensitivityResults ?? null,
    workbenchView: raw.workbenchView === "results" || raw.workbenchView === "sensitivity" || raw.workbenchView === "model" ? raw.workbenchView : "model",
    benchmark: normalizeBenchmarkCaseSource(raw.benchmark),
    createdAt: String(raw.createdAt ?? now),
    updatedAt: String(raw.updatedAt ?? now),
  };
}

function normalizeBenchmarkCaseSource(rawSource: unknown): BenchmarkCaseSource | undefined {
  if (!rawSource || typeof rawSource !== "object") {
    return undefined;
  }
  const source = rawSource as Partial<BenchmarkCaseSource>;
  const caseId = String(source.caseId ?? "").trim();
  if (!caseId) {
    return undefined;
  }
  return {
    caseId,
    category: String(source.category ?? ""),
    title: String(source.title ?? caseId),
    purpose: String(source.purpose ?? ""),
    sourceType: String(source.sourceType ?? "internal-regression"),
    sourceLabel: String(source.sourceLabel ?? source.sourceType ?? "验证来源"),
    reference: String(source.reference ?? ""),
    method: String(source.method ?? ""),
    sourceLinks: Array.isArray(source.sourceLinks) ? source.sourceLinks.map((link) => String(link)).filter(Boolean) : [],
    checkedMetrics: Array.isArray(source.checkedMetrics) ? source.checkedMetrics.map((metric) => String(metric)).filter(Boolean) : [],
    metricSummary: String(source.metricSummary ?? ""),
    expectedSummary: String(source.expectedSummary ?? ""),
    toleranceSummary: String(source.toleranceSummary ?? ""),
    expected: source.expected && typeof source.expected === "object" ? source.expected : {},
    tolerances: source.tolerances && typeof source.tolerances === "object" ? source.tolerances : {},
  };
}

export function normalizeSolverProject(rawProject: unknown): SolverProject {
  const raw = rawProject && typeof rawProject === "object" ? (rawProject as Partial<SolverProject>) : {};
  const now = new Date().toISOString();
  const projectInfo = normalizeProjectInfo(raw.settings?.projectInfo, String(raw.name ?? "新建结构分析项目"));
  const normalizedObjects = Array.isArray(raw.objects) && raw.objects.length > 0
    ? raw.objects.map(normalizeAnalysisObject)
    : createDefaultAnalysisObjects();
  const activeObjectId = normalizedObjects.some((object) => object.id === raw.activeObjectId)
    ? String(raw.activeObjectId)
    : normalizedObjects[0].id;
  const rawSettings = raw.settings as (Partial<ProjectSettings> & { beamPreviewStyle?: unknown }) | undefined;
  const legacyModelPreviewStyle = legacyModelPreviewStyleFromObjects(normalizedObjects);
  return {
    id: String(raw.id ?? createId("project")),
    name: projectInfo.name,
    activeObjectId,
    objects: normalizedObjects,
    settings: {
      activeModuleSection: String(rawSettings?.activeModuleSection ?? ""),
      modelPreviewStyle: normalizeModelPreviewStyle(rawSettings?.modelPreviewStyle ?? rawSettings?.beamPreviewStyle ?? legacyModelPreviewStyle),
      reportExportOptions: normalizeReportExportOptions(rawSettings?.reportExportOptions),
      projectInfo,
    },
    createdAt: String(raw.createdAt ?? now),
    updatedAt: String(raw.updatedAt ?? now),
  };
}

export function getActiveAnalysisObject(project: SolverProject): AnalysisObject {
  return project.objects.find((object) => object.id === project.activeObjectId) ?? project.objects[0];
}

export function createWorkspaceFromAnalysisObject(object: AnalysisObject): WorkspaceState {
  return normalizeWorkspaceState({
    analysisMode: object.type,
    beam: object.type === "beam" ? object.state as BeamWorkspaceState : createDefaultBeamWorkspaceState(),
    frame: object.type === "frame" ? object.state as FrameWorkspaceState : createDefaultFrameWorkspaceState(),
    truss: object.type === "truss" ? object.state as TrussWorkspaceState : createDefaultTrussWorkspaceState(),
  });
}

export function createWorkspaceFromProject(project: SolverProject): WorkspaceState {
  return createWorkspaceFromAnalysisObject(getActiveAnalysisObject(project));
}

function stateFromWorkspaceForType(type: AnalysisObjectType, workspace: WorkspaceState): AnalysisObjectState {
  if (type === "frame") return normalizeFrameWorkspaceState(workspace.frame);
  if (type === "truss") return normalizeTrussWorkspaceState(workspace.truss);
  return normalizeBeamWorkspaceState(workspace.beam);
}

export function updateActiveAnalysisObject(
  project: SolverProject,
  updater: (object: AnalysisObject) => AnalysisObject,
  now = new Date()
): SolverProject {
  const timestamp = now.toISOString();
  return normalizeSolverProject({
    ...project,
    updatedAt: timestamp,
    objects: project.objects.map((object) => object.id === project.activeObjectId ? updater(object) : object),
  });
}

export function updateActiveAnalysisObjectWorkspace(project: SolverProject, workspace: WorkspaceState): SolverProject {
  return updateActiveAnalysisObject(project, (object) => ({
    ...object,
    state: stateFromWorkspaceForType(object.type, workspace),
    updatedAt: new Date().toISOString(),
  }));
}

export function setActiveAnalysisObject(project: SolverProject, objectId: string): SolverProject {
  if (!project.objects.some((object) => object.id === objectId)) return project;
  return normalizeSolverProject({ ...project, activeObjectId: objectId });
}

export function addAnalysisObjectToProject(project: SolverProject, type: AnalysisObjectType, name?: string): SolverProject {
  const object = createAnalysisObject(type, name || defaultAnalysisObjectName(type, project.objects.filter((item) => item.type === type).length + 1));
  return normalizeSolverProject({
    ...project,
    activeObjectId: object.id,
    objects: [...project.objects, object],
    updatedAt: object.createdAt,
  });
}

export function removeAnalysisObjectFromProject(project: SolverProject, objectId: string): SolverProject {
  if (project.objects.length <= 1) return project;
  const remaining = project.objects.filter((object) => object.id !== objectId);
  if (remaining.length === project.objects.length) return project;
  return normalizeSolverProject({
    ...project,
    objects: remaining,
    activeObjectId: project.activeObjectId === objectId ? remaining[0].id : project.activeObjectId,
    updatedAt: new Date().toISOString(),
  });
}
