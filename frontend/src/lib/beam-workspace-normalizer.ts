import type {
  BeamLinearLoadConfig,
  BeamLoadCase,
  BeamLoadCombination,
  BeamLoadInput,
  BeamPointLoadConfig,
  BeamSpanConfig,
  BeamSupportConfig,
  BeamSupportDof,
  BeamSupportType,
  BeamWorkspaceState,
} from "../types/beam.ts";
import type { Material } from "../types/material.ts";
import {
  DEFAULT_BEAM_MATERIALS,
  DEFAULT_BEAM_SPAN,
  beamSpanBoundaries,
  createDefaultBeamWorkspaceState,
  defaultBeamSupports,
} from "./workspace-defaults.ts";
import { MAX_BEAM_SPANS } from "./solver-limits.ts";
import { normalizeModelLabelOffsets } from "./model-label-overrides.ts";
import { normalizeTextId } from "./workspace-normalizer-utils.ts";

function defaultBeamSupportId(index: number): string {
  return `S${index + 1}`;
}

function normalizeBeamSupportId(candidate: unknown, fallback: string, seen: Set<string>, index: number): string {
  const raw = String(candidate ?? "").trim();
  const normalizedFallback = fallback || defaultBeamSupportId(index);
  const shouldUseDefault = !raw || /^N\d+$/iu.test(raw);
  return normalizeTextId(shouldUseDefault ? normalizedFallback : raw, normalizedFallback, seen, "S", index);
}

function normalizeBeamSupportType(value: unknown, fallback: BeamSupportType = "pinned"): BeamSupportType {
  const normalized = String(value ?? fallback).trim().toLowerCase();
  if (normalized === "hinged") return "pinned";
  if (normalized === "pinned" || normalized === "roller" || normalized === "fixed" || normalized === "free") {
    return normalized;
  }
  return fallback;
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
      const sectionAreaCm2 = Number(candidate.sectionAreaCm2);
      const momentOfInertiaCm4 = Number(candidate.momentOfInertiaCm4);
      if (!id || !name || !Number.isFinite(youngModulus) || youngModulus <= 0 || !Number.isFinite(density) || density <= 0) {
        continue;
      }
      byId.set(id, {
        id,
        name,
        youngModulus,
        density,
        ...(Number.isFinite(sectionAreaCm2) && sectionAreaCm2 > 0 ? { sectionAreaCm2 } : {}),
        ...(Number.isFinite(momentOfInertiaCm4) && momentOfInertiaCm4 > 0 ? { momentOfInertiaCm4 } : {}),
      });
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

function normalizeBeamLoadPosition(value: unknown, fallback: number, totalLength: number): number {
  const position = Number(value);
  if (!Number.isFinite(position)) {
    return Math.min(Math.max(fallback, 0), totalLength);
  }
  return Math.min(Math.max(position, 0), totalLength);
}

function normalizeBeamCaseLoad(rawLoad: unknown, totalLength: number): BeamLoadInput {
  const load = rawLoad && typeof rawLoad === "object" ? rawLoad as Record<string, unknown> : {};
  const rawType = String(load.type ?? "uniform").trim().toLowerCase();
  if (rawType === "point") {
    return {
      type: "point",
      pointLoadKn: Number.isFinite(load.pointLoadKn) ? Number(load.pointLoadKn) : Number.isFinite(load.magnitudeKn) ? Number(load.magnitudeKn) : 0,
      x: normalizeBeamLoadPosition(load.x ?? load.position, 0.5 * totalLength, totalLength),
    };
  }
  if (rawType === "linear" || rawType === "distributed") {
    let start = normalizeBeamLoadPosition(load.start ?? load.startM, 0, totalLength);
    let end = normalizeBeamLoadPosition(load.end ?? load.endM, totalLength, totalLength);
    let qStartKnPerM = Number.isFinite(load.qStartKnPerM) ? Number(load.qStartKnPerM) : Number.isFinite(load.wyKnPerM) ? Number(load.wyKnPerM) : 0;
    let qEndKnPerM = Number.isFinite(load.qEndKnPerM) ? Number(load.qEndKnPerM) : Number.isFinite(load.wyKnPerM) ? Number(load.wyKnPerM) : qStartKnPerM;
    if (end < start) {
      [start, end] = [end, start];
      [qStartKnPerM, qEndKnPerM] = [qEndKnPerM, qStartKnPerM];
    }
    return { type: "linear", qStartKnPerM, qEndKnPerM, start, end };
  }
  const normalized: BeamLoadInput = {
    type: "uniform",
    qKnPerM: Number.isFinite(load.qKnPerM) ? Number(load.qKnPerM) : Number.isFinite(load.q) ? Number(load.q) : 0,
  };
  if (Number.isFinite(load.start) || Number.isFinite(load.end) || Number.isFinite(load.startM) || Number.isFinite(load.endM)) {
    let start = normalizeBeamLoadPosition(load.start ?? load.startM, 0, totalLength);
    let end = normalizeBeamLoadPosition(load.end ?? load.endM, totalLength, totalLength);
    if (end < start) {
      [start, end] = [end, start];
    }
    normalized.start = start;
    normalized.end = end;
  }
  return normalized;
}

function normalizeBeamLoadCases(rawLoadCases: unknown, totalLength: number): BeamLoadCase[] {
  if (!Array.isArray(rawLoadCases)) {
    return [];
  }
  const seen = new Set<string>();
  return rawLoadCases.slice(0, 12).map((loadCase, index) => {
    const candidate = loadCase && typeof loadCase === "object" ? loadCase as Partial<BeamLoadCase> : {};
    const id = normalizeTextId(String(candidate.id ?? "").trim(), `LC${index + 1}`, seen, "LC", index);
    const rawLoads = Array.isArray(candidate.loads) ? candidate.loads : [];
    return {
      id,
      title: String(candidate.title ?? id).trim() || id,
      loads: rawLoads.map((load) => normalizeBeamCaseLoad(load, totalLength)),
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

function normalizeBeamLoadCombinations(rawCombinations: unknown, loadCases: BeamLoadCase[]): BeamLoadCombination[] {
  if (!Array.isArray(rawCombinations) || loadCases.length === 0) {
    return [];
  }
  const caseIds = new Set(loadCases.map((loadCase) => loadCase.id));
  const seen = new Set<string>();
  return rawCombinations.slice(0, 12).map((combination, index) => {
    const candidate = combination && typeof combination === "object" ? combination as Partial<BeamLoadCombination> : {};
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
      I: Number.isFinite(span.I) && span.I > 0 ? Number(span.I) : material?.momentOfInertiaCm4 ?? DEFAULT_BEAM_SPAN.I,
      materialId: spanMaterialId,
    };
  });
  const beamType = value?.beamType === "simply_supported" || value?.beamType === "cantilever" || value?.beamType === "continuous" ? value.beamType : base.beamType;
  const totalLength = beamSpanBoundaries(normalizedSpans).at(-1) ?? DEFAULT_BEAM_SPAN.length;
  const customLoadCases = normalizeBeamLoadCases(value?.customLoadCases, totalLength);
  const customLoadCombinations = normalizeBeamLoadCombinations(value?.customLoadCombinations, customLoadCases);
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
    customLoadCases,
    customLoadCombinations,
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
    modelLabelOffsets: normalizeModelLabelOffsets(value?.modelLabelOffsets),
    viewSettings: value?.viewSettings ? { ...value.viewSettings } : base.viewSettings,
  };
}
