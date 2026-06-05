import type { BeamCalculationResults } from "../types/beam";
import type { FrameCalculationResults, TrussCalculationResults } from "../types/structure";

export type LegacyAnalysisResults = BeamCalculationResults | FrameCalculationResults | TrussCalculationResults;

export type UnifiedAnalysisEnvelope = {
  analysisType?: "beam" | "frame" | "truss";
  version?: string;
  request?: Record<string, unknown>;
  model?: {
    analysisType?: "beam" | "frame" | "truss";
    structure?: unknown;
  };
  results?: {
    summary?: unknown;
    preview?: unknown;
    diagram?: unknown;
    nodeResults?: unknown[];
    memberResults?: unknown[];
    memberDiagrams?: unknown[];
    loadCaseResults?: unknown[];
    loadCombinationResults?: unknown[];
    nodeIds?: string[];
    memberIds?: string[];
    series?: Record<string, unknown>;
  };
  diagnostics?: unknown;
  meta?: {
    generatedAt?: string;
    modelHash?: string;
    requestHash?: string;
    compat?: { legacyFields?: string[] };
    jobId?: string;
  };
} & Record<string, unknown>;

export type EnvelopeBackedAnalysisResults = LegacyAnalysisResults & {
  apiEnvelope?: UnifiedAnalysisEnvelope;
};

type AnalysisType = "beam" | "frame" | "truss";

type ErrorEnvelope = {
  error?: string | { code?: string; message?: string };
  legacyError?: string;
  message?: string;
};

function isUnifiedEnvelope(value: unknown): value is UnifiedAnalysisEnvelope {
  return Boolean(value && typeof value === "object" && "version" in (value as Record<string, unknown>) && "results" in (value as Record<string, unknown>));
}

function envelopeOf(result: LegacyAnalysisResults | null): UnifiedAnalysisEnvelope | undefined {
  return result && typeof result === "object" ? (result as EnvelopeBackedAnalysisResults).apiEnvelope : undefined;
}

export function analysisTypeFromResult(result: LegacyAnalysisResults | null): AnalysisType | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const envelope = envelopeOf(result);
  const analysisType = envelope?.analysisType ?? envelope?.model?.analysisType ?? ("analysisType" in result ? result.analysisType : undefined);
  return analysisType === "frame" || analysisType === "truss" ? analysisType : "beam";
}

export function normalizeAnalysisResponse(raw: unknown): EnvelopeBackedAnalysisResults {
  if (!isUnifiedEnvelope(raw)) {
    return raw as EnvelopeBackedAnalysisResults;
  }

  const analysisType = raw.analysisType ?? raw.model?.analysisType ?? "beam";
  const summary = raw.results?.summary ?? raw.summary;
  const preview = raw.results?.preview ?? raw.preview;
  const diagram = raw.results?.diagram ?? raw.diagram;
  const nodeResults = (raw.results?.nodeResults ?? raw.nodeResults ?? []) as unknown[];
  const memberResults = (raw.results?.memberResults ?? raw.memberResults ?? []) as unknown[];
  const memberDiagrams = (raw.results?.memberDiagrams ?? raw.memberDiagrams ?? []) as unknown[];
  const loadCaseResults = (raw.results?.loadCaseResults ?? raw.loadCaseResults ?? []) as unknown[];
  const loadCombinationResults = (raw.results?.loadCombinationResults ?? raw.loadCombinationResults ?? []) as unknown[];
  const nodeIds = (raw.results?.nodeIds ?? raw.nodeIds ?? []) as string[];
  const memberIds = (raw.results?.memberIds ?? raw.memberIds ?? []) as string[];
  const series = raw.results?.series ?? {};

  if (analysisType === "frame") {
    return {
      ...(raw as Record<string, unknown>),
      apiEnvelope: raw,
      analysisType: "frame",
      frame: (raw.frame ?? preview) as FrameCalculationResults["frame"],
      preview: preview as FrameCalculationResults["preview"],
      diagram: diagram as FrameCalculationResults["diagram"],
      summary: summary as FrameCalculationResults["summary"],
      payload: (raw.request ?? raw.payload) as FrameCalculationResults["payload"],
      structure: (raw.model?.structure ?? raw.structure) as FrameCalculationResults["structure"],
      nodeResults: nodeResults as FrameCalculationResults["nodeResults"],
      memberResults: memberResults as FrameCalculationResults["memberResults"],
      memberDiagrams: memberDiagrams as FrameCalculationResults["memberDiagrams"],
      loadCaseResults: loadCaseResults as FrameCalculationResults["loadCaseResults"],
      loadCombinationResults: loadCombinationResults as FrameCalculationResults["loadCombinationResults"],
      nodeIds,
      memberIds,
      ux_data: ((series.ux_data ?? raw.ux_data ?? []) as number[]),
      uy_data: ((series.uy_data ?? raw.uy_data ?? []) as number[]),
      rz_data: ((series.rz_data ?? raw.rz_data ?? []) as number[]),
      member_axial_data: ((series.member_axial_data ?? raw.member_axial_data ?? []) as number[]),
      member_shear_data: ((series.member_shear_data ?? raw.member_shear_data ?? []) as number[]),
      member_moment_data: ((series.member_moment_data ?? raw.member_moment_data ?? []) as number[]),
    };
  }

  if (analysisType === "truss") {
    return {
      ...(raw as Record<string, unknown>),
      apiEnvelope: raw,
      analysisType: "truss",
      truss: (raw.truss ?? preview) as TrussCalculationResults["truss"],
      preview: preview as TrussCalculationResults["preview"],
      diagram: diagram as TrussCalculationResults["diagram"],
      summary: summary as TrussCalculationResults["summary"],
      payload: (raw.request ?? raw.payload) as TrussCalculationResults["payload"],
      structure: (raw.model?.structure ?? raw.structure) as TrussCalculationResults["structure"],
      nodeResults: nodeResults as TrussCalculationResults["nodeResults"],
      memberResults: memberResults as TrussCalculationResults["memberResults"],
      nodeIds,
      memberIds,
      ux_data: ((series.ux_data ?? raw.ux_data ?? []) as number[]),
      uy_data: ((series.uy_data ?? raw.uy_data ?? []) as number[]),
      member_axial_data: ((series.member_axial_data ?? raw.member_axial_data ?? []) as TrussCalculationResults["member_axial_data"]),
    };
  }

  return {
    ...(raw as Record<string, unknown>),
    apiEnvelope: raw,
    analysisType: "beam",
    beam: (raw.beam ?? preview) as BeamCalculationResults["beam"],
    summary: summary as BeamCalculationResults["summary"],
    payload: (raw.request ?? raw.payload) as BeamCalculationResults["payload"],
    x_data: ((series.x_data ?? raw.x_data ?? []) as number[]),
    v_data: ((series.v_data ?? raw.v_data ?? []) as number[]),
    moment_data: ((series.moment_data ?? raw.moment_data ?? []) as number[]),
    shear_data: ((series.shear_data ?? raw.shear_data ?? []) as number[]),
    t_data: ((series.t_data ?? raw.t_data ?? []) as number[]),
    q_t_data: ((series.q_t_data ?? raw.q_t_data ?? []) as number[]),
  };
}

export function analysisRequestFromResult(result: LegacyAnalysisResults | null): Record<string, unknown> | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const envelope = (result as EnvelopeBackedAnalysisResults).apiEnvelope;
  if (envelope?.request && typeof envelope.request === "object") {
    return envelope.request;
  }
  if ("payload" in result && result.payload && typeof result.payload === "object") {
    return result.payload as unknown as Record<string, unknown>;
  }
  return null;
}

export function beamResultForView(result: LegacyAnalysisResults | null): BeamCalculationResults | null {
  if (analysisTypeFromResult(result) !== "beam") {
    return null;
  }
  const legacy = result as BeamCalculationResults;
  const envelope = envelopeOf(result);
  const envelopeResults = envelope?.results;
  const series = envelopeResults?.series ?? {};
  return {
    ...legacy,
    analysisType: "beam",
    beam: (envelopeResults?.preview ?? legacy.beam) as BeamCalculationResults["beam"],
    summary: (envelopeResults?.summary ?? legacy.summary) as BeamCalculationResults["summary"],
    payload: (envelope?.request ?? legacy.payload) as BeamCalculationResults["payload"],
    x_data: (series.x_data ?? legacy.x_data ?? []) as number[],
    v_data: (series.v_data ?? legacy.v_data ?? []) as number[],
    moment_data: (series.moment_data ?? legacy.moment_data ?? []) as number[],
    shear_data: (series.shear_data ?? legacy.shear_data ?? []) as number[],
    t_data: (series.t_data ?? legacy.t_data ?? []) as number[],
    q_t_data: (series.q_t_data ?? legacy.q_t_data ?? []) as number[],
  };
}

export function frameResultForView(result: LegacyAnalysisResults | null): FrameCalculationResults | null {
  if (analysisTypeFromResult(result) !== "frame") {
    return null;
  }
  const legacy = result as FrameCalculationResults;
  const envelope = envelopeOf(result);
  const envelopeResults = envelope?.results;
  const series = envelopeResults?.series ?? {};
  return {
    ...legacy,
    analysisType: "frame",
    frame: (envelopeResults?.preview ?? legacy.frame) as FrameCalculationResults["frame"],
    preview: (envelopeResults?.preview ?? legacy.preview) as FrameCalculationResults["preview"],
    diagram: (envelopeResults?.diagram ?? legacy.diagram) as FrameCalculationResults["diagram"],
    summary: (envelopeResults?.summary ?? legacy.summary) as FrameCalculationResults["summary"],
    diagnostics: (envelope?.diagnostics ?? legacy.diagnostics) as FrameCalculationResults["diagnostics"],
    payload: (envelope?.request ?? legacy.payload) as FrameCalculationResults["payload"],
    structure: (envelope?.model?.structure ?? legacy.structure) as FrameCalculationResults["structure"],
    nodeResults: (envelopeResults?.nodeResults ?? legacy.nodeResults ?? []) as FrameCalculationResults["nodeResults"],
    memberResults: (envelopeResults?.memberResults ?? legacy.memberResults ?? []) as FrameCalculationResults["memberResults"],
    memberDiagrams: (envelopeResults?.memberDiagrams ?? legacy.memberDiagrams ?? []) as FrameCalculationResults["memberDiagrams"],
    loadCaseResults: (envelopeResults?.loadCaseResults ?? legacy.loadCaseResults) as FrameCalculationResults["loadCaseResults"],
    loadCombinationResults: (envelopeResults?.loadCombinationResults ?? legacy.loadCombinationResults) as FrameCalculationResults["loadCombinationResults"],
    nodeIds: (envelopeResults?.nodeIds ?? legacy.nodeIds ?? []) as string[],
    memberIds: (envelopeResults?.memberIds ?? legacy.memberIds ?? []) as string[],
    ux_data: (series.ux_data ?? legacy.ux_data ?? []) as number[],
    uy_data: (series.uy_data ?? legacy.uy_data ?? []) as number[],
    rz_data: (series.rz_data ?? legacy.rz_data ?? []) as number[],
    member_axial_data: (series.member_axial_data ?? legacy.member_axial_data ?? []) as number[],
    member_shear_data: (series.member_shear_data ?? legacy.member_shear_data ?? []) as number[],
    member_moment_data: (series.member_moment_data ?? legacy.member_moment_data ?? []) as number[],
  };
}

export function trussResultForView(result: LegacyAnalysisResults | null): TrussCalculationResults | null {
  if (analysisTypeFromResult(result) !== "truss") {
    return null;
  }
  const legacy = result as TrussCalculationResults;
  const envelope = envelopeOf(result);
  const envelopeResults = envelope?.results;
  const series = envelopeResults?.series ?? {};
  return {
    ...legacy,
    analysisType: "truss",
    truss: (envelopeResults?.preview ?? legacy.truss) as TrussCalculationResults["truss"],
    preview: (envelopeResults?.preview ?? legacy.preview) as TrussCalculationResults["preview"],
    diagram: (envelopeResults?.diagram ?? legacy.diagram) as TrussCalculationResults["diagram"],
    summary: (envelopeResults?.summary ?? legacy.summary) as TrussCalculationResults["summary"],
    diagnostics: (envelope?.diagnostics ?? legacy.diagnostics) as TrussCalculationResults["diagnostics"],
    payload: (envelope?.request ?? legacy.payload) as TrussCalculationResults["payload"],
    structure: (envelope?.model?.structure ?? legacy.structure) as TrussCalculationResults["structure"],
    nodeResults: (envelopeResults?.nodeResults ?? legacy.nodeResults ?? []) as TrussCalculationResults["nodeResults"],
    memberResults: (envelopeResults?.memberResults ?? legacy.memberResults ?? []) as TrussCalculationResults["memberResults"],
    nodeIds: (envelopeResults?.nodeIds ?? legacy.nodeIds ?? []) as string[],
    memberIds: (envelopeResults?.memberIds ?? legacy.memberIds ?? []) as string[],
    ux_data: (series.ux_data ?? legacy.ux_data ?? []) as number[],
    uy_data: (series.uy_data ?? legacy.uy_data ?? []) as number[],
    member_axial_data: (series.member_axial_data ?? legacy.member_axial_data ?? []) as TrussCalculationResults["member_axial_data"],
  };
}

export function apiErrorMessage(raw: unknown, fallback: string): string {
  if (!raw || typeof raw !== "object") {
    return fallback;
  }
  const body = raw as ErrorEnvelope & { diagnostics?: { issues?: { message?: string }[] } };

  if (Array.isArray(body.diagnostics?.issues) && body.diagnostics.issues.length > 0) {
    const messages = body.diagnostics.issues.map((i) => i?.message).filter(Boolean);
    if (messages.length > 0) {
      return messages.join("; ");
    }
  }

  if (typeof body.error === "string") {
    return body.error;
  }
  if (body.error && typeof body.error === "object" && typeof body.error.message === "string") {
    return body.error.message;
  }
  if (typeof body.legacyError === "string") {
    return body.legacyError;
  }
  if (typeof body.message === "string") {
    return body.message;
  }
  return fallback;
}
