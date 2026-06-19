import { Activity, BarChart3, FileText, LineChart, Network } from "lucide-react";
import { modelObjectMemberTerm, modelObjectVocabulary } from "../lib/model-object-vocabulary.ts";
import type {
  BeamApiPayload,
  BeamCalculationResults,
  BeamLoadInput,
  BeamLoadMarker,
  BeamPreviewData,
} from "../types/beam";
import type {
  AnalysisMode,
  FrameCalculationResults,
  FrameLoad,
  FrameLoadCaseResult,
  FrameMemberResult,
  FrameNodeResult,
  FramePreviewData,
  FrameStructure,
  TrussCalculationResults,
  TrussLoad,
  TrussLoadCaseResult,
  TrussPreviewData,
  TrussStructure,
} from "../types/structure";

export type ResultTab = {
  id: string;
  label: string;
  description: string;
  icon: typeof Activity;
};

export type ResultDisplayOption = {
  source: "primary" | "case" | "combination";
  id: string;
  label: string;
  description: string;
};

export type FrameDisplayOption = ResultDisplayOption;

function resultPreviewDescription(mode: AnalysisMode): string {
  const vocabulary = modelObjectVocabulary(mode);
  if (mode === "beam") {
    return `查看${vocabulary.supportGroupLabel}、${vocabulary.memberGroupLabel}、${vocabulary.loadGroupLabel}和放大后的挠度形态`;
  }
  return `查看${vocabulary.nodeGroupLabel}、${vocabulary.memberGroupLabel}、${vocabulary.supportGroupLabel}、${vocabulary.loadGroupLabel}、编号和放大后的变形`;
}

const BEAM_TABS: ResultTab[] = [
  { id: "overview", label: "全部结果", description: "一次查看受力变形、模型叠加工程图、数据曲线和校核摘要", icon: Activity },
  { id: "preview", label: "受力变形", description: resultPreviewDescription("beam"), icon: Network },
  { id: "diagrams", label: "工程图", description: "在梁轴线上查看挠度、弯矩和剪力的模型叠加工程图", icon: BarChart3 },
  { id: "curves", label: "数据曲线", description: "按梁轴坐标查看挠度、弯矩和剪力数据曲线", icon: LineChart },
  { id: "summary", label: "结果摘要", description: "查看计算结论与状态", icon: FileText },
];

const FRAME_TABS: ResultTab[] = [
  { id: "overview", label: "全部结果", description: "一次查看受力变形、模型叠加工程图、数据曲线和校核摘要", icon: Activity },
  { id: "preview", label: "受力变形", description: resultPreviewDescription("frame"), icon: Network },
  { id: "diagrams", label: "工程图", description: "在结构坐标系中查看弯矩、剪力、轴力和局部 y 向挠度的模型叠加工程图", icon: BarChart3 },
  { id: "curves", label: "数据曲线", description: "按节点序列查看 X/Y 向位移数据曲线", icon: LineChart },
  { id: "summary", label: "结果摘要", description: "查看计算结论与状态", icon: FileText },
];

const TRUSS_MEMBER_TERM = modelObjectMemberTerm("truss");

const TRUSS_TABS: ResultTab[] = [
  { id: "overview", label: "全部结果", description: "一次查看受力变形、模型叠加工程图、数据曲线和校核摘要", icon: Activity },
  { id: "preview", label: "受力变形", description: resultPreviewDescription("truss"), icon: Network },
  { id: "diagrams", label: "工程图", description: `在桁架坐标系中查看${TRUSS_MEMBER_TERM}轴力和节点位移的模型叠加工程图`, icon: BarChart3 },
  { id: "curves", label: "数据曲线", description: `按节点与${TRUSS_MEMBER_TERM}序列查看位移和轴力数据曲线`, icon: LineChart },
  { id: "summary", label: "结果摘要", description: "查看计算结论与状态", icon: FileText },
];

export function resultTabsForMode(mode: AnalysisMode): ResultTab[] {
  if (mode === "frame") return FRAME_TABS;
  if (mode === "truss") return TRUSS_TABS;
  return BEAM_TABS;
}

type ResultsWithLoadSources =
  | BeamCalculationResults
  | FrameCalculationResults
  | TrussCalculationResults;

export function buildResultDisplayOptions(results: ResultsWithLoadSources | null): ResultDisplayOption[] {
  if (!results) return [];
  return [
    { source: "primary", id: "__primary__", label: "主结果", description: "基本荷载" },
    ...(results.loadCaseResults ?? []).map((item) => ({
      source: "case" as const,
      id: item.id,
      label: item.title || item.id,
      description: `工况 ${item.id}`,
    })),
    ...(results.loadCombinationResults ?? []).map((item) => ({
      source: "combination" as const,
      id: item.id,
      label: item.title || item.id,
      description: item.tags?.length ? `组合 ${item.id} · ${item.tags.join(" / ")}` : `组合 ${item.id}`,
    })),
  ];
}

export function buildFrameDisplayOptions(results: FrameCalculationResults | null): FrameDisplayOption[] {
  return buildResultDisplayOptions(results);
}

function scaleBeamLoad(load: BeamLoadInput, factor: number): BeamLoadInput {
  if (load.type === "point") {
    return { ...load, pointLoadKn: (load.pointLoadKn ?? 0) * factor };
  }
  if (load.type === "linear") {
    return { ...load, qStartKnPerM: (load.qStartKnPerM ?? 0) * factor, qEndKnPerM: (load.qEndKnPerM ?? 0) * factor };
  }
  return { ...load, qKnPerM: (load.qKnPerM ?? 0) * factor };
}

function selectedBeamLoads(payload: BeamApiPayload | undefined, option: ResultDisplayOption, result?: unknown): BeamLoadInput[] {
  if (!payload) return [];
  if (option.source === "case") {
    return payload.loadCases?.find((item) => item.id === option.id)?.loads ?? payload.loads ?? [];
  }
  if (option.source === "combination") {
    const resultFactors = result && typeof result === "object" && "factors" in result ? (result as { factors?: Record<string, number> }).factors : undefined;
    const factors = resultFactors ?? payload.loadCombinations?.find((item) => item.id === option.id)?.factors ?? {};
    const casesById = new Map((payload.loadCases ?? []).map((item) => [item.id, item]));
    return Object.entries(factors).flatMap(([caseId, factor]) => (casesById.get(caseId)?.loads ?? []).map((load) => scaleBeamLoad(load, Number(factor) || 0)));
  }
  return payload.loads ?? [];
}

function beamLoadMarkers(loads: BeamLoadInput[], totalLength: number): BeamLoadMarker[] {
  return loads.map((load): BeamLoadMarker => {
    if (load.type === "point") {
      return { type: "point", x: load.x, intensityKn: load.pointLoadKn };
    }
    if (load.type === "linear") {
      return {
        type: "linear",
        x: 0.5 * (load.start + load.end),
        startX: load.start,
        endX: load.end,
        length: Math.max(0, load.end - load.start),
        intensityKnPerM: Math.max(Math.abs(load.qStartKnPerM), Math.abs(load.qEndKnPerM)),
      };
    }
    const startX = load.start ?? 0;
    const endX = load.end ?? totalLength;
    return {
      type: "uniform",
      x: 0.5 * (startX + endX),
      startX,
      endX,
      length: Math.max(0, endX - startX),
      intensityKnPerM: load.qKnPerM,
    };
  });
}

function beamMomentData(result: { moment_data?: number[]; element_end_moments?: number[] }): number[] {
  if (result.moment_data) return result.moment_data;
  return (result.element_end_moments ?? []).map((value) => value / 1000.0);
}

function beamShearData(result: { shear_data?: number[]; element_end_shears?: number[] }): number[] {
  if (result.shear_data) return result.shear_data;
  return (result.element_end_shears ?? []).map((value) => value / 1000.0);
}

function buildBeamPreviewForDisplay(
  base: BeamPreviewData | undefined,
  payload: BeamApiPayload | undefined,
  summary: BeamCalculationResults["summary"],
  xData: number[],
  vData: number[],
  loads: BeamLoadInput[],
): BeamPreviewData | undefined {
  if (!base) return undefined;
  const curve = xData.map((x, index) => {
    const valueM = Number(vData[index]) || 0;
    return { x, v: valueM, vMm: valueM * 1000.0 };
  });
  const max = curve.reduce<{ valueMm: number; xM: number } | null>((current, point) => {
    if (!current || Math.abs(point.vMm) > Math.abs(current.valueMm)) return { valueMm: point.vMm, xM: point.x };
    return current;
  }, null);
  return {
    ...base,
    loads: beamLoadMarkers(loads, base.totalLength),
    curve,
    maxDeflection: {
      ...base.maxDeflection,
      valueM: (max?.valueMm ?? summary?.maxDeflectionMm ?? 0) / 1000.0,
      valueMm: max?.valueMm ?? summary?.maxDeflectionMm ?? 0,
      xM: max?.xM ?? summary?.maxDeflectionPositionM ?? 0,
    },
    loadType: payload?.loadType ?? base.loadType,
    loadTypeLabel: payload?.loadType ? "选中结果来源" : base.loadTypeLabel,
  };
}

export function buildDisplayedBeamResults(results: BeamCalculationResults | null, option: ResultDisplayOption | undefined): BeamCalculationResults | null {
  if (!results || !option || option.source === "primary") return results;
  const result =
    option.source === "case"
      ? results.loadCaseResults?.find((item) => item.id === option.id)
      : results.loadCombinationResults?.find((item) => item.id === option.id);
  if (!result) return results;
  const summary = { ...(results.summary ?? {}), ...(result.summary ?? {}) } as BeamCalculationResults["summary"];
  const xData = result.x_data ?? results.x_data;
  const vData = result.v_data ?? results.v_data;
  const momentData = beamMomentData(result);
  const shearData = beamShearData(result);
  const loads = selectedBeamLoads(results.payload, option, result);
  return {
    ...results,
    summary,
    beam: buildBeamPreviewForDisplay(results.beam, results.payload, summary, xData, vData, loads),
    x_data: xData,
    v_data: vData,
    moment_data: momentData.length ? momentData : results.moment_data,
    shear_data: shearData.length ? shearData : results.shear_data,
  };
}

function scaleFrameLoad(load: FrameLoad, factor: number): FrameLoad {
  if (load.type === "nodal") {
    return {
      ...load,
      fxKn: (load.fxKn ?? 0) * factor,
      fyKn: (load.fyKn ?? 0) * factor,
      mzKnM: (load.mzKnM ?? 0) * factor,
    };
  }
  if (load.type === "member_point") {
    return {
      ...load,
      forceKn: (load.forceKn ?? 0) * factor,
    };
  }
  if (load.type === "temperature") {
    return {
      ...load,
      deltaTempC: (load.deltaTempC ?? 0) * factor,
    };
  }
  return {
    ...load,
    wyKnPerM: load.wyKnPerM === undefined ? undefined : load.wyKnPerM * factor,
    qStartKnPerM: load.qStartKnPerM === undefined ? undefined : load.qStartKnPerM * factor,
    qEndKnPerM: load.qEndKnPerM === undefined ? undefined : load.qEndKnPerM * factor,
  };
}

function selectedFrameLoads(structure: FrameStructure, option: FrameDisplayOption, result?: FrameLoadCaseResult & { factors?: Record<string, number>; tags?: string[] }): FrameLoad[] {
  if (option.source === "case") {
    return structure.loadCases?.find((item) => item.id === option.id)?.loads ?? structure.loads;
  }
  if (option.source === "combination") {
    const factors = result?.factors ?? structure.loadCombinations?.find((item) => item.id === option.id)?.factors ?? {};
    const casesById = new Map((structure.loadCases ?? []).map((item) => [item.id, item]));
    return Object.entries(factors).flatMap(([caseId, factor]) => (casesById.get(caseId)?.loads ?? []).map((load) => scaleFrameLoad(load, Number(factor) || 0)));
  }
  return structure.loads;
}

function buildFramePreviewForDisplay(
  base: FramePreviewData | undefined,
  structure: FrameStructure,
  summary: FrameCalculationResults["summary"],
  nodeResults: FrameNodeResult[],
  memberResults: FrameMemberResult[],
  memberDiagrams: FrameCalculationResults["memberDiagrams"],
  loads: FrameLoad[],
): FramePreviewData | undefined {
  if (!base) return undefined;
  const span = Math.max(...structure.nodes.map((node) => node.x), 0) - Math.min(...structure.nodes.map((node) => node.x), 0);
  const height = Math.max(...structure.nodes.map((node) => node.y), 0) - Math.min(...structure.nodes.map((node) => node.y), 0);
  const maxDisplacementMm = Math.max(...nodeResults.map((item) => item.resultantMm), 0);
  const deformationScale = maxDisplacementMm > 1e-9 ? (0.15 * Math.max(span, height)) / (maxDisplacementMm / 1000.0) : 0.0;
  return {
    ...base,
    loads,
    nodeResults,
    memberResults,
    memberDiagrams,
    deformedNodes: nodeResults.map((item) => ({
      nodeId: item.nodeId,
      x: item.x + (item.uxMm / 1000.0) * deformationScale,
      y: item.y + (item.uyMm / 1000.0) * deformationScale,
    })),
    deformationScale,
    summary: {
      ...base.summary,
      maxDisplacementMm: summary.maxDisplacementMm,
      maxVerticalMm: summary.maxVerticalMm,
      maxRotationDeg: summary.maxRotationDeg,
      maxDisplacementNodeId: nodeResults.reduce<string | null>((current, item) => {
        if (!current) return item.nodeId;
        const currentResult = nodeResults.find((candidate) => candidate.nodeId === current);
        return item.resultantMm > (currentResult?.resultantMm ?? 0) ? item.nodeId : current;
      }, null),
      status: summary.status,
    },
  };
}

export function buildDisplayedFrameResults(results: FrameCalculationResults | null, option: FrameDisplayOption | undefined): FrameCalculationResults | null {
  if (!results || !option || option.source === "primary") return results;
  const result =
    option.source === "case"
      ? results.loadCaseResults?.find((item) => item.id === option.id)
      : results.loadCombinationResults?.find((item) => item.id === option.id);
  if (!result) return results;
  const loads = selectedFrameLoads(results.structure, option, result);
  const nodeIds = result.nodeResults.map((item) => item.nodeId);
  const memberIds = result.memberResults.map((item) => item.memberId);
  return {
    ...results,
    summary: result.summary,
    frame: buildFramePreviewForDisplay(results.frame ?? results.preview, results.structure, result.summary, result.nodeResults, result.memberResults, result.memberDiagrams, loads),
    preview: buildFramePreviewForDisplay(results.preview ?? results.frame, results.structure, result.summary, result.nodeResults, result.memberResults, result.memberDiagrams, loads),
    nodeResults: result.nodeResults,
    memberResults: result.memberResults,
    memberDiagrams: result.memberDiagrams,
    nodeIds,
    memberIds,
    ux_data: result.nodeResults.map((item) => item.uxMm),
    uy_data: result.nodeResults.map((item) => item.uyMm),
    rz_data: result.nodeResults.map((item) => item.rotationDeg),
    member_axial_data: result.memberResults.map((item) => item.axialStartKn),
    member_shear_data: result.memberResults.map((item) => item.shearStartKn),
    member_moment_data: result.memberResults.map((item) => item.momentStartKnM),
  };
}

function scaleTrussLoad(load: TrussLoad, factor: number): TrussLoad {
  if (load.type === "nodal") {
    return { ...load, fxKn: (load.fxKn ?? 0) * factor, fyKn: (load.fyKn ?? 0) * factor };
  }
  if (load.type === "temperature") {
    return { ...load, deltaTempC: (load.deltaTempC ?? 0) * factor };
  }
  return {
    ...load,
    wyKnPerM: load.wyKnPerM === undefined ? undefined : load.wyKnPerM * factor,
    qStartKnPerM: load.qStartKnPerM === undefined ? undefined : load.qStartKnPerM * factor,
    qEndKnPerM: load.qEndKnPerM === undefined ? undefined : load.qEndKnPerM * factor,
    selfWeightKnPerM: load.selfWeightKnPerM === undefined ? undefined : load.selfWeightKnPerM * factor,
  };
}

function selectedTrussLoads(structure: TrussStructure, option: ResultDisplayOption, result?: TrussLoadCaseResult & { factors?: Record<string, number> }): TrussLoad[] {
  if (option.source === "case") {
    return structure.loadCases?.find((item) => item.id === option.id)?.loads ?? structure.loads;
  }
  if (option.source === "combination") {
    const factors = result?.factors ?? structure.loadCombinations?.find((item) => item.id === option.id)?.factors ?? {};
    const casesById = new Map((structure.loadCases ?? []).map((item) => [item.id, item]));
    return Object.entries(factors).flatMap(([caseId, factor]) => (casesById.get(caseId)?.loads ?? []).map((load) => scaleTrussLoad(load, Number(factor) || 0)));
  }
  return structure.loads;
}

function buildTrussPreviewForDisplay(
  base: TrussPreviewData | undefined,
  summary: TrussCalculationResults["summary"],
  nodeResults: TrussCalculationResults["nodeResults"],
  memberResults: TrussCalculationResults["memberResults"],
  loads: TrussLoad[],
): TrussPreviewData | undefined {
  if (!base) return undefined;
  return {
    ...base,
    loads,
    nodeResults,
    memberResults,
    summary: { ...base.summary, ...summary },
    deformedNodes: base.nodes.map((node) => {
      const result = nodeResults.find((item) => item.nodeId === node.id);
      return {
        id: node.id,
        x: node.x + ((result?.uxMm ?? 0) / 1000.0) * (base.deformationScale || 1),
        y: node.y + ((result?.uyMm ?? 0) / 1000.0) * (base.deformationScale || 1),
        uxMm: result?.uxMm ?? 0,
        uyMm: result?.uyMm ?? 0,
      };
    }),
  };
}

export function buildDisplayedTrussResults(results: TrussCalculationResults | null, option: ResultDisplayOption | undefined): TrussCalculationResults | null {
  if (!results || !option || option.source === "primary") return results;
  const result =
    option.source === "case"
      ? results.loadCaseResults?.find((item) => item.id === option.id)
      : results.loadCombinationResults?.find((item) => item.id === option.id);
  if (!result) return results;
  const summary = { ...results.summary, ...result.summary } as TrussCalculationResults["summary"];
  const nodeIds = result.nodeResults.map((item) => item.nodeId);
  const memberIds = result.memberResults.map((item) => item.memberId);
  const loads = selectedTrussLoads(results.structure, option, result);
  return {
    ...results,
    summary,
    truss: buildTrussPreviewForDisplay(results.truss ?? results.preview, summary, result.nodeResults, result.memberResults, loads),
    preview: buildTrussPreviewForDisplay(results.preview ?? results.truss, summary, result.nodeResults, result.memberResults, loads),
    nodeResults: result.nodeResults,
    memberResults: result.memberResults,
    nodeIds,
    memberIds,
    ux_data: result.nodeResults.map((item) => item.uxMm),
    uy_data: result.nodeResults.map((item) => item.uyMm),
    member_axial_data: result.memberResults.map((item) => ({ memberId: item.memberId, axialForceKn: item.axialForceKn })),
  };
}
