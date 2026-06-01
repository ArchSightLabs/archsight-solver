import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./workbench-result-panels.tsx", import.meta.url), "utf-8");

test("结果页计算口径默认使用压缩摘要而不是长句假定清单", () => {
  assert.match(source, /计算口径/u);
  assert.match(source, /ASSUMPTION_SUMMARIES/u);
  assert.doesNotMatch(source, /计算假定与符号约定/u);
  assert.doesNotMatch(source, /analysisAssumptionRows/u);
});

test("结果摘要副文本保持短读数，不再使用说明书式行距", () => {
  assert.match(source, /leading-snug/u);
  assert.doesNotMatch(source, /leading-relaxed text-slate-600 dark:text-slate-300\/80/u);
});
