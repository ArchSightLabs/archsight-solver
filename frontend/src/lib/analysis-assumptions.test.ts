import assert from "node:assert/strict";
import test from "node:test";

import { analysisAssumptionRows } from "./analysis-assumptions.ts";

function rowValue(mode: "beam" | "frame" | "truss", label: string) {
  return analysisAssumptionRows(mode).find((row) => row.label === label)?.value ?? "";
}

test("梁系计算假定明确梁单元自由度、支座约束和单位换算", () => {
  assert.match(rowValue("beam", "计算模型"), /竖向位移 v 与转角 θz/u);
  assert.match(rowValue("beam", "支座约束"), /固结支座约束 v 与 θz/u);
  assert.match(rowValue("beam", "单位换算"), /I: cm4 -> m4/u);
});

test("平面框架计算假定保留 ux uy rz 与构件内力口径", () => {
  assert.match(rowValue("frame", "计算模型"), /ux、uy、rz/u);
  assert.match(rowValue("frame", "内力读数"), /弯矩图、剪力图、轴力图/u);
  assert.match(rowValue("frame", "支座约束"), /整体刚度矩阵/u);
});

test("平面桁架计算假定明确只传递轴力且不引入弯矩主指标", () => {
  assert.match(rowValue("truss", "计算模型"), /仅传递轴力/u);
  assert.match(rowValue("truss", "专业边界"), /不引入弯矩主指标/u);
  assert.match(rowValue("truss", "单位换算"), /MPa/u);
});

test("三类分析目标都显式声明适用边界", () => {
  for (const mode of ["beam", "frame", "truss"] as const) {
    assert.match(rowValue(mode, "适用边界"), /线弹性、小变形、确定性静力分析/u);
    assert.match(rowValue(mode, "适用边界"), /不替代规范设计/u);
  }
});
