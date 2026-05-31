import type { WorkspaceState } from "./workspace-state.ts";
import type { AnalysisMode } from "../types/structure.ts";
import { hasFrameSupportBoundary } from "./support-vocabulary.ts";

export interface ModelObjectVocabulary {
  navigatorTitle: string;
  navigatorDescription: string;
  nodeGroupLabel: string;
  supportGroupLabel: string;
  memberGroupLabel: string;
  loadGroupLabel: string;
  noSupportLabel: string;
  noMemberLabel: string;
  addMemberLabel: string;
  addLoadLabel: string;
}

export interface ModelMetricRow {
  label: string;
  value: string;
}

export type ModelObjectKind = "node" | "support" | "member" | "load";

const MODEL_OBJECT_LABEL_FIELDS: Record<ModelObjectKind, keyof ModelObjectVocabulary> = {
  node: "nodeGroupLabel",
  support: "supportGroupLabel",
  member: "memberGroupLabel",
  load: "loadGroupLabel",
};

const MODEL_OBJECT_VOCABULARY: Record<AnalysisMode, ModelObjectVocabulary> = {
  beam: {
    navigatorTitle: "模型对象",
    navigatorDescription: "梁系按支座节点自动分跨；杆件为相邻节点之间的梁单元，支座控制 v / θz 约束，荷载作用于梁轴线。",
    nodeGroupLabel: "支座节点",
    supportGroupLabel: "支座节点",
    memberGroupLabel: "杆件",
    loadGroupLabel: "荷载",
    noSupportLabel: "暂无支座节点",
    noMemberLabel: "暂无杆件",
    addMemberLabel: "新增杆件",
    addLoadLabel: "新增荷载",
  },
  frame: {
    navigatorTitle: "模型对象",
    navigatorDescription: "平面框架节点具备 ux / uy / rz 自由度；构件连接起终点节点并恢复弯矩、剪力、轴力，材料和截面按构件维护。",
    nodeGroupLabel: "节点",
    supportGroupLabel: "支座节点",
    memberGroupLabel: "构件",
    loadGroupLabel: "荷载",
    noSupportLabel: "暂无支座约束",
    noMemberLabel: "暂无构件",
    addMemberLabel: "新增构件",
    addLoadLabel: "新增荷载",
  },
  truss: {
    navigatorTitle: "模型对象",
    navigatorDescription: "平面桁架节点仅保留 ux / uy 平动自由度；杆件按两力杆处理，材料和截面按杆件维护，不输出弯矩主指标。",
    nodeGroupLabel: "节点",
    supportGroupLabel: "支座节点",
    memberGroupLabel: "杆件",
    loadGroupLabel: "荷载",
    noSupportLabel: "暂无支座约束",
    noMemberLabel: "暂无杆件",
    addMemberLabel: "新增杆件",
    addLoadLabel: "新增荷载",
  },
};

export function modelObjectVocabulary(mode: AnalysisMode): ModelObjectVocabulary {
  return MODEL_OBJECT_VOCABULARY[mode];
}

export function modelObjectLabel(mode: AnalysisMode, kind: ModelObjectKind): string {
  return modelObjectVocabulary(mode)[MODEL_OBJECT_LABEL_FIELDS[kind]];
}

export function modelObjectCountPhrase(mode: AnalysisMode, kind: ModelObjectKind, count: number, classifier?: string): string {
  const defaultClassifier = kind === "load" ? "条" : kind === "member" && mode === "truss" ? "根" : "个";
  return `${count} ${classifier ?? defaultClassifier}${modelObjectLabel(mode, kind)}`;
}

export function modelObjectLoadLabel(mode: AnalysisMode, targetKind?: "node" | "member"): string {
  return targetKind ? `${modelObjectLabel(mode, targetKind)}${modelObjectLabel(mode, "load")}` : modelObjectLabel(mode, "load");
}

function frameSupportNodeCount(workspace: WorkspaceState): number {
  if (workspace.frame.frameMode === "custom") {
    return workspace.frame.customNodes.filter(hasFrameSupportBoundary).length;
  }

  return [workspace.frame.leftSupport, workspace.frame.rightSupport].filter((supportType) => supportType !== "free").length;
}

function trussSupportNodeCount(workspace: WorkspaceState): number {
  return workspace.truss.customNodes.filter((node) => (node.supportType ?? "free") !== "free").length;
}

export function modelObjectMetricRows(workspace: WorkspaceState, mode: AnalysisMode): ModelMetricRow[] {
  if (mode === "beam") {
    const length = workspace.beam.spans.reduce((sum, span) => sum + span.length, 0);
    return [
      { label: modelObjectVocabulary("beam").memberGroupLabel, value: `${workspace.beam.spans.length}` },
      { label: "总长度", value: `${length.toFixed(2)} m` },
      { label: modelObjectVocabulary("beam").supportGroupLabel, value: `${workspace.beam.supports.length}` },
    ];
  }

  if (mode === "frame") {
    const nodeCount = workspace.frame.frameMode === "custom" ? workspace.frame.customNodes.length : 4;
    const memberCount = workspace.frame.frameMode === "custom" ? workspace.frame.customMembers.length : 3;
    const supportCount = frameSupportNodeCount(workspace);
    const loadCount = workspace.frame.frameMode === "custom" ? workspace.frame.customLoads.length : 2;
    return [
      { label: modelObjectVocabulary("frame").nodeGroupLabel, value: `${nodeCount}` },
      { label: modelObjectVocabulary("frame").memberGroupLabel, value: `${memberCount}` },
      { label: modelObjectVocabulary("frame").supportGroupLabel, value: `${supportCount}` },
      { label: modelObjectVocabulary("frame").loadGroupLabel, value: `${loadCount}` },
    ];
  }

  return [
    { label: modelObjectVocabulary("truss").nodeGroupLabel, value: `${workspace.truss.customNodes.length}` },
    { label: modelObjectVocabulary("truss").memberGroupLabel, value: `${workspace.truss.customMembers.length}` },
    { label: modelObjectVocabulary("truss").supportGroupLabel, value: `${trussSupportNodeCount(workspace)}` },
    { label: modelObjectVocabulary("truss").loadGroupLabel, value: `${workspace.truss.customLoads.length}` },
  ];
}
