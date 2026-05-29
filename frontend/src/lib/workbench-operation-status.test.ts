import test from "node:test";
import assert from "node:assert/strict";

import {
  exportOperationForFormat,
  exportToolbarLabel,
  operationCompletedNotice,
  operationFailedNotice,
  operationRunningNotice,
  solvingRunLabel,
  validationNotice,
} from "./workbench-operation-status.ts";

test("工作台操作状态保留三类结构体系的专业求解文案", () => {
  assert.equal(solvingRunLabel("beam"), "梁系计算中...");
  assert.equal(solvingRunLabel("frame"), "平面框架计算中...");
  assert.equal(solvingRunLabel("truss"), "平面桁架计算中...");
  assert.equal(operationRunningNotice("solve", "frame").title, "正在运行平面框架线弹性静力分析");
});

test("工作台导出状态区分计算书和参数表", () => {
  assert.equal(exportOperationForFormat("docx"), "exportDocx");
  assert.equal(exportOperationForFormat("xlsx"), "exportXlsx");
  assert.equal(exportToolbarLabel(null), "成果导出");
  assert.equal(exportToolbarLabel("docx"), "生成计算书...");
  assert.equal(operationCompletedNotice("exportDocx", "beam").title, "Word 计算书已生成");
  assert.equal(operationRunningNotice("exportXlsx", "truss").message, "正在写入输入参数、计算摘要和结构结果数据表。");
});

test("工作台错误提示使用统一的内联校核语义", () => {
  assert.deepEqual(validationNotice("构件 M1 引用了不存在的节点。"), {
    phase: "error",
    tone: "error",
    title: "模型输入未通过校核",
    message: "构件 M1 引用了不存在的节点。",
  });
  assert.equal(operationFailedNotice("sensitivity", "后端连接失败").title, "参数敏感性分析失败");
});
