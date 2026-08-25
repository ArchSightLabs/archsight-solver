import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf-8");
}

test("公开案例将验证算例与学习路径分成独立入口并只打开目标分析对象", () => {
  const dialog = source("./PublicExamplesDialog.tsx");

  assert.match(dialog, /条五分钟学习路径/u);
  assert.match(dialog, /featuredLearningPaths/u);
  assert.match(dialog, /createSelectedProject\(project\.project, \[object\]\)/u);
  assert.match(dialog, /先预判，再计算并核对/u);
  assert.match(dialog, /验证算例/u);
  assert.match(dialog, /学习路径/u);
  assert.match(dialog, /activeSection/u);
  assert.match(dialog, /基础力学/u);
  assert.match(dialog, /二阶效应与稳定/u);
  assert.match(dialog, /engineering-software[^\n]+工程软件对标/u);
  assert.doesNotMatch(dialog, /font-mono text-\[11px\][^\n]*\{object\.benchmark\?\.caseId\}/u);
});

test("公开算例侧栏默认折叠原始外文出处", () => {
  const panel = source("./ProjectTreePanel.tsx");

  assert.match(panel, /<details[^>]*>[\s\S]*查看原始文献出处/u);
  assert.doesNotMatch(panel, /benchmark\.reference\s*\?\s*<div/u);
});

test("学习路径接入主工作台且只使用枚举预判", () => {
  const main = source("./WorkbenchMainArea.tsx");
  const panel = source("./VerificationLearningPanel.tsx");

  assert.match(main, /activeAnalysisObject\.benchmark\?\.learning/u);
  assert.match(main, /<VerificationLearningPanel/u);
  assert.match(panel, /type="radio"/u);
  assert.match(panel, /计算并核对/u);
  assert.match(panel, /学习计算书/u);
  assert.match(panel, /XLSX 复核表/u);
  assert.match(panel, /可信证据包/u);
  assert.doesNotMatch(panel, /<textarea|contentEditable/u);
});

test("学习复核同时进入计算书和可信计算包证据", () => {
  const actions = source("../hooks/useWorkbenchActions.ts");

  assert.match(actions, /learningReview\?: LearningReview/u);
  assert.match(actions, /\{ learningReview \}/u);
  assert.match(actions, /verificationEvidence[\s\S]*learningReview/u);
});
