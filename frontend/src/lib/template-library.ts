import type { ProjectTemplate, TemplateLibraryState, TemplateSnapshot, BeamSpanConfig } from "../types/beam.ts";
import {
  createDefaultWorkspaceState,
  normalizeBeamWorkspaceState,
  normalizeFrameWorkspaceState,
  normalizeTrussWorkspaceState,
  normalizeWorkspaceState,
  type WorkspaceState,
} from "./workspace-state.ts";

export const TEMPLATE_LIBRARY_STORAGE_KEY = "archsight-solver.template-library";
export const LEGACY_TEMPLATE_LIBRARY_STORAGE_KEY = "beam-deflection.template-library";
export const TEMPLATE_LIBRARY_VERSION = "1.0" as const;
export const MAX_TEMPLATE_COUNT = 50;
export const MAX_TEMPLATE_NAME_LENGTH = 40;

export interface TemplateActionResult<T = void> {
  ok: boolean;
  error?: string;
  value?: T;
  state?: TemplateLibraryState;
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `tpl-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function cloneTemplates(templates: ProjectTemplate[]): ProjectTemplate[] {
  return templates.map((template) => ({
    ...template,
    snapshot: normalizeTemplateSnapshot(template.snapshot),
  }));
}

function sortTemplates(templates: ProjectTemplate[]): ProjectTemplate[] {
  return [...templates].sort((left, right) => {
    if (right.updatedAt !== left.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }
    return right.createdAt - left.createdAt;
  });
}

function normalizeComparisonScenarios(scenarios: TemplateSnapshot["scenarios"]) {
  return scenarios.slice(0, 2).map((scenario) => ({
    id: String(scenario.id),
    label: String(scenario.label),
    q: Number(scenario.q),
    E: Number(scenario.E),
    I: Number(scenario.I),
    freq: Number(scenario.freq),
    duration: Number(scenario.duration),
    color: String(scenario.color),
  }));
}

type BeamSnapshotLike = NonNullable<TemplateSnapshot["beam"]>;

interface LegacyBeamSnapshotForm {
  q?: number;
  E?: number;
  I?: number;
  spans?: number[];
  beamType?: BeamSnapshotLike["beamType"];
  loadType?: BeamSnapshotLike["loadType"];
  loadValue?: number;
  loadPosition?: number;
  loadEnd?: number;
  freq?: number;
  duration?: number;
  materialId?: string;
  projectName?: string;
  pointLoad?: number;
  pointLoadPositionRatio?: number;
  distributedLoadStart?: number;
  distributedLoadEnd?: number;
  distributedLoadStartRatio?: number;
  distributedLoadEndRatio?: number;
}

function normalizeBeamSnapshot(raw: Partial<TemplateSnapshot> & Record<string, unknown>): TemplateSnapshot {
  if (raw.beam) {
    const normalizedBeam = normalizeBeamWorkspaceState(raw.beam);
    return {
      analysisMode: "beam",
      beam: normalizedBeam,
      compareEnabled: Boolean(raw.compareEnabled ?? normalizedBeam.compareEnabled),
      scenarios: normalizeComparisonScenarios(raw.scenarios ?? normalizedBeam.scenarios),
    };
  }

  const legacyForm = typeof raw.form === "object" && raw.form ? (raw.form as LegacyBeamSnapshotForm) : null;
  const spans: BeamSpanConfig[] = Array.isArray(legacyForm?.spans) && legacyForm.spans.length > 0
    ? legacyForm.spans.map((spanLength) => ({
        length: Number(spanLength) > 0 ? Number(spanLength) : 4,
        E: Number(legacyForm?.E ?? 210) || 210,
        I: Number(legacyForm?.I ?? 4500) || 4500,
      }))
    : [];

  const beam = normalizeBeamWorkspaceState(
    legacyForm
      ? {
          projectName: String(legacyForm.projectName ?? "新建梁系项目"),
          materialId: String(legacyForm.materialId ?? "q235"),
          beamType: legacyForm.beamType ?? "continuous",
          loadType: legacyForm.loadType ?? "uniform",
          q: Number(legacyForm.q ?? 10),
          pointLoad: Number(legacyForm.pointLoad ?? 0),
          pointLoadPositionRatio: Number(legacyForm.pointLoadPositionRatio ?? 0.5),
          distributedLoadStart: Number(legacyForm.distributedLoadStart ?? 10),
          distributedLoadEnd: Number(legacyForm.distributedLoadEnd ?? 10),
          distributedLoadStartRatio: Number(legacyForm.distributedLoadStartRatio ?? 0),
          distributedLoadEndRatio: Number(legacyForm.distributedLoadEndRatio ?? 1),
          freq: Number(legacyForm.freq ?? 1),
          duration: Number(legacyForm.duration ?? 5),
          spans: spans.length > 0 ? spans : [{ length: 4, E: Number(legacyForm.E ?? 210), I: Number(legacyForm.I ?? 4500) }],
          compareEnabled: Boolean(raw.compareEnabled),
          scenarios: Array.isArray(raw.scenarios) ? raw.scenarios : [],
        }
      : undefined
  );

  return {
    analysisMode: "beam",
    beam,
    compareEnabled: Boolean(raw.compareEnabled ?? beam.compareEnabled),
    scenarios: normalizeComparisonScenarios(raw.scenarios ?? beam.scenarios),
  };
}

function normalizeFrameSnapshot(raw: Partial<TemplateSnapshot> & Record<string, unknown>): TemplateSnapshot {
  const frame = normalizeFrameWorkspaceState(raw.frame);
  return {
    analysisMode: "frame",
    frame,
    compareEnabled: false,
    scenarios: [],
  };
}

function normalizeTrussSnapshot(raw: Partial<TemplateSnapshot> & Record<string, unknown>): TemplateSnapshot {
  const truss = normalizeTrussWorkspaceState(raw.truss);
  return {
    analysisMode: "truss",
    truss,
    compareEnabled: false,
    scenarios: [],
  };
}

export function normalizeTemplateSnapshot(rawSnapshot: unknown): TemplateSnapshot {
  const raw = (rawSnapshot ?? {}) as Partial<TemplateSnapshot> & Record<string, unknown>;
  if (raw.analysisMode === "truss" || raw.truss) {
    return normalizeTrussSnapshot(raw);
  }
  if (raw.analysisMode === "frame" || raw.frame) {
    return normalizeFrameSnapshot(raw);
  }
  return normalizeBeamSnapshot(raw);
}

function normalizeTemplateLibraryState(rawState: unknown): TemplateLibraryState {
  const raw = (rawState ?? {}) as Partial<TemplateLibraryState> & Record<string, unknown>;
  const templates = Array.isArray(raw.templates) ? raw.templates : [];
  const normalizedTemplates = sortTemplates(
    cloneTemplates(
      templates.map((template) => ({
        id: String((template as ProjectTemplate).id ?? createId()),
        name: String((template as ProjectTemplate).name ?? "未命名模板").trim() || "未命名模板",
        createdAt: Number((template as ProjectTemplate).createdAt ?? Date.now()),
        updatedAt: Number((template as ProjectTemplate).updatedAt ?? Date.now()),
        snapshot: normalizeTemplateSnapshot((template as ProjectTemplate).snapshot),
      }))
    )
  );
  const baselineTemplateId = normalizedTemplates.some((template) => template.id === raw.baselineTemplateId)
    ? String(raw.baselineTemplateId)
    : null;

  return {
    version: TEMPLATE_LIBRARY_VERSION,
    baselineTemplateId,
    templates: normalizedTemplates,
  };
}

export function createEmptyTemplateLibraryState(): TemplateLibraryState {
  return {
    version: TEMPLATE_LIBRARY_VERSION,
    baselineTemplateId: null,
    templates: [],
  };
}

export function parseTemplateLibraryState(raw: string | null): TemplateLibraryState {
  if (!raw) {
    return createEmptyTemplateLibraryState();
  }

  try {
    return normalizeTemplateLibraryState(JSON.parse(raw));
  } catch {
    return createEmptyTemplateLibraryState();
  }
}

export function validateTemplateName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) {
    return "模板名称不能为空。";
  }
  if (trimmed.length > MAX_TEMPLATE_NAME_LENGTH) {
    return `模板名称不能超过 ${MAX_TEMPLATE_NAME_LENGTH} 个字符。`;
  }
  return null;
}

export function createWorkspaceSnapshot(workspace: WorkspaceState): TemplateSnapshot {
  if (workspace.analysisMode === "frame") {
    return {
      analysisMode: "frame",
      frame: normalizeFrameWorkspaceState(workspace.frame),
      compareEnabled: false,
      scenarios: [],
    };
  }

  if (workspace.analysisMode === "truss") {
    return {
      analysisMode: "truss",
      truss: normalizeTrussWorkspaceState(workspace.truss),
      compareEnabled: false,
      scenarios: [],
    };
  }

  const beam = normalizeBeamWorkspaceState(workspace.beam);
  return {
    analysisMode: "beam",
    beam,
    compareEnabled: beam.compareEnabled,
    scenarios: normalizeComparisonScenarios(beam.scenarios),
  };
}

export function restoreWorkspaceSnapshot(snapshot: TemplateSnapshot): WorkspaceState {
  const normalizedSnapshot = normalizeTemplateSnapshot(snapshot);
  if (normalizedSnapshot.analysisMode === "frame" && normalizedSnapshot.frame) {
    return normalizeWorkspaceState({
      analysisMode: "frame",
      beam: createDefaultWorkspaceState().beam,
      frame: normalizedSnapshot.frame,
    });
  }

  if (normalizedSnapshot.analysisMode === "truss" && normalizedSnapshot.truss) {
    return normalizeWorkspaceState({
      analysisMode: "truss",
      beam: createDefaultWorkspaceState().beam,
      frame: createDefaultWorkspaceState().frame,
      truss: normalizedSnapshot.truss,
    });
  }

  return normalizeWorkspaceState({
    analysisMode: "beam",
    beam: normalizedSnapshot.beam,
    frame: createDefaultWorkspaceState().frame,
    truss: createDefaultWorkspaceState().truss,
  });
}

function tryParseTemplateLibraryState(raw: string | null): TemplateLibraryState | null {
  if (!raw) {
    return null;
  }

  try {
    return normalizeTemplateLibraryState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function createTemplateLibraryStateFromStorage(raw: string | null, legacyRaw: string | null = null): TemplateLibraryState {
  return tryParseTemplateLibraryState(raw) ?? tryParseTemplateLibraryState(legacyRaw) ?? createEmptyTemplateLibraryState();
}

export function saveTemplateFromWorkspace(
  state: TemplateLibraryState,
  name: string,
  snapshot: TemplateSnapshot,
  now = Date.now(),
  idFactory: () => string = createId
): TemplateActionResult<ProjectTemplate> {
  const error = validateTemplateName(name);
  if (error) {
    return { ok: false, error, state };
  }
  if (state.templates.length >= MAX_TEMPLATE_COUNT) {
    return { ok: false, error: `模板数量已达上限（${MAX_TEMPLATE_COUNT} 个）。请先删除旧模板。`, state };
  }

  const template: ProjectTemplate = {
    id: idFactory(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    snapshot: normalizeTemplateSnapshot(snapshot),
  };

  const templates = sortTemplates([template, ...cloneTemplates(state.templates)]);
  const nextState: TemplateLibraryState = {
    version: TEMPLATE_LIBRARY_VERSION,
    baselineTemplateId: state.baselineTemplateId,
    templates,
  };

  return { ok: true, state: nextState, value: template };
}

export function duplicateTemplateEntry(
  state: TemplateLibraryState,
  templateId: string,
  now = Date.now(),
  idFactory: () => string = createId
): TemplateActionResult<ProjectTemplate> {
  const source = state.templates.find((template) => template.id === templateId);
  if (!source) {
    return { ok: false, error: "未找到要复制的模板。", state };
  }
  if (state.templates.length >= MAX_TEMPLATE_COUNT) {
    return { ok: false, error: `模板数量已达上限（${MAX_TEMPLATE_COUNT} 个）。请先删除旧模板。`, state };
  }

  const existingNames = new Set(state.templates.map((template) => template.name));
  let name = `${source.name} - 副本`;
  let suffix = 2;
  while (existingNames.has(name)) {
    name = `${source.name} - 副本 ${suffix}`;
    suffix += 1;
  }

  const template: ProjectTemplate = {
    id: idFactory(),
    name,
    createdAt: now,
    updatedAt: now,
    snapshot: normalizeTemplateSnapshot(source.snapshot),
  };

  const nextState: TemplateLibraryState = {
    version: TEMPLATE_LIBRARY_VERSION,
    baselineTemplateId: state.baselineTemplateId,
    templates: sortTemplates([template, ...cloneTemplates(state.templates)]),
  };

  return { ok: true, state: nextState, value: template };
}

export function deleteTemplateEntry(state: TemplateLibraryState, templateId: string): TemplateActionResult {
  if (!state.templates.some((template) => template.id === templateId)) {
    return { ok: false, error: "未找到要删除的模板。", state };
  }

  const templates = state.templates.filter((template) => template.id !== templateId);
  const baselineTemplateId = state.baselineTemplateId === templateId ? null : state.baselineTemplateId;
  const nextState: TemplateLibraryState = {
    version: TEMPLATE_LIBRARY_VERSION,
    baselineTemplateId,
    templates: sortTemplates(cloneTemplates(templates)),
  };

  return { ok: true, state: nextState };
}

export function setBaselineTemplateEntry(state: TemplateLibraryState, templateId: string | null): TemplateActionResult {
  if (templateId === null) {
    return {
      ok: true,
      state: {
        version: TEMPLATE_LIBRARY_VERSION,
        baselineTemplateId: null,
        templates: sortTemplates(cloneTemplates(state.templates)),
      },
    };
  }

  const found = state.templates.some((template) => template.id === templateId);
  if (!found) {
    return { ok: false, error: "未找到要设为基准的模板。", state };
  }

  return {
    ok: true,
    state: {
      version: TEMPLATE_LIBRARY_VERSION,
      baselineTemplateId: templateId,
      templates: sortTemplates(cloneTemplates(state.templates)),
    },
  };
}

export function findTemplate(state: TemplateLibraryState, templateId: string): ProjectTemplate | null {
  return state.templates.find((template) => template.id === templateId) ?? null;
}
