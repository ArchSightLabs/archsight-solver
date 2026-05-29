import type { AnalysisMode } from "../types/structure.ts";

export interface AnalysisVocabulary {
  systemLabel: string;
  analysisLabel: string;
  parameterTitle: string;
  runLabel: string;
  waitingLabel: string;
  resultLabel: string;
  previewFigureLabel: string;
  defaultObjectNamePrefix: string;
}

const ANALYSIS_VOCABULARY: Record<AnalysisMode, AnalysisVocabulary> = {
  beam: {
    systemLabel: "梁系",
    analysisLabel: "梁系分析",
    parameterTitle: "梁系参数",
    runLabel: "运行梁系计算",
    waitingLabel: "等待梁系计算",
    resultLabel: "梁系计算结果",
    previewFigureLabel: "梁系结构预览图",
    defaultObjectNamePrefix: "梁系",
  },
  frame: {
    systemLabel: "平面框架",
    analysisLabel: "平面框架分析",
    parameterTitle: "平面框架参数",
    runLabel: "运行平面框架计算",
    waitingLabel: "等待平面框架计算",
    resultLabel: "平面框架计算结果",
    previewFigureLabel: "平面框架结构预览图",
    defaultObjectNamePrefix: "平面框架",
  },
  truss: {
    systemLabel: "平面桁架",
    analysisLabel: "平面桁架分析",
    parameterTitle: "平面桁架参数",
    runLabel: "运行平面桁架计算",
    waitingLabel: "等待平面桁架计算",
    resultLabel: "平面桁架计算结果",
    previewFigureLabel: "平面桁架结构预览图",
    defaultObjectNamePrefix: "平面桁架",
  },
};

export function analysisVocabulary(mode: AnalysisMode): AnalysisVocabulary {
  return ANALYSIS_VOCABULARY[mode];
}

export function defaultAnalysisObjectNameForMode(mode: AnalysisMode, index = 1): string {
  return `${analysisVocabulary(mode).defaultObjectNamePrefix}-${index}`;
}
