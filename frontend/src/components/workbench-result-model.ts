import { Activity, BarChart3, FileText, LineChart, Network } from "lucide-react";
import type {
  AnalysisMode,
  FrameCalculationResults,
  FrameLoad,
  FrameLoadCaseResult,
  FrameMemberResult,
  FrameNodeResult,
  FramePreviewData,
  FrameStructure,
} from "../types/structure";

export type ResultTab = {
  id: string;
  label: string;
  description: string;
  icon: typeof Activity;
};

export type FrameDisplayOption = {
  source: "primary" | "case" | "combination";
  id: string;
  label: string;
  description: string;
};

const BEAM_TABS: ResultTab[] = [
  { id: "overview", label: "全部结果", description: "一次查看结构预览、模型叠加工程图、数据曲线和校核摘要", icon: Activity },
  { id: "preview", label: "结构预览", description: "查看节点、杆件、支座、荷载和挠度形态", icon: Network },
  { id: "diagrams", label: "工程图", description: "在梁轴线上查看挠度、弯矩和剪力的模型叠加工程图", icon: BarChart3 },
  { id: "curves", label: "数据曲线", description: "按梁轴坐标查看挠度、弯矩和剪力数据曲线", icon: LineChart },
  { id: "summary", label: "结果摘要", description: "查看计算结论与状态", icon: FileText },
];

const FRAME_TABS: ResultTab[] = [
  { id: "overview", label: "全部结果", description: "一次查看结构预览、模型叠加工程图、数据曲线和校核摘要", icon: Activity },
  { id: "preview", label: "结构预览", description: "查看节点、构件、支座、荷载、编号与变形", icon: Network },
  { id: "diagrams", label: "工程图", description: "在结构坐标系中查看弯矩、剪力、轴力和局部 y 向挠度的模型叠加工程图", icon: BarChart3 },
  { id: "curves", label: "数据曲线", description: "按节点序列查看 X/Y 向位移数据曲线", icon: LineChart },
  { id: "summary", label: "结果摘要", description: "查看计算结论与状态", icon: FileText },
];

const TRUSS_TABS: ResultTab[] = [
  { id: "overview", label: "全部结果", description: "一次查看结构预览、模型叠加工程图、数据曲线和校核摘要", icon: Activity },
  { id: "preview", label: "结构预览", description: "查看节点、杆件、支座、荷载、编号与变形", icon: Network },
  { id: "diagrams", label: "工程图", description: "在桁架坐标系中查看杆件轴力和节点位移的模型叠加工程图", icon: BarChart3 },
  { id: "curves", label: "数据曲线", description: "按节点与杆件序列查看位移和轴力数据曲线", icon: LineChart },
  { id: "summary", label: "结果摘要", description: "查看计算结论与状态", icon: FileText },
];

export function resultTabsForMode(mode: AnalysisMode): ResultTab[] {
  if (mode === "frame") return FRAME_TABS;
  if (mode === "truss") return TRUSS_TABS;
  return BEAM_TABS;
}

export function buildFrameDisplayOptions(results: FrameCalculationResults | null): FrameDisplayOption[] {
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
