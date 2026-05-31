import assert from "node:assert/strict";
import test from "node:test";

import { analysisVocabulary, defaultAnalysisObjectNameForMode } from "./analysis-vocabulary.ts";

test("分析目标词表保持三类结构体系的专业命名", () => {
  assert.deepEqual(
    (["beam", "truss", "frame"] as const).map((mode) => analysisVocabulary(mode).systemLabel),
    ["梁系", "平面桁架", "平面框架"],
  );
  assert.equal(analysisVocabulary("beam").runLabel, "运行梁系计算");
  assert.equal(analysisVocabulary("frame").resultLabel, "平面框架计算结果");
  assert.equal(analysisVocabulary("truss").previewFigureLabel, "平面桁架结构预览图");
});

test("默认分析对象名称不把梁系窄化为连续梁", () => {
  assert.equal(defaultAnalysisObjectNameForMode("beam"), "梁系-1");
  assert.equal(defaultAnalysisObjectNameForMode("frame", 2), "平面框架-2");
  assert.equal(defaultAnalysisObjectNameForMode("truss", 3), "平面桁架-3");
});
