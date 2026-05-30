import test from "node:test";
import assert from "node:assert/strict";

import sharedReportOptions from "../../../shared/report-options.json" with { type: "json" };
import {
  DEFAULT_REPORT_EXPORT_OPTIONS,
  REPORT_FIGURE_MODE_OPTIONS,
  REPORT_FIGURE_SCOPE_OPTIONS,
  REPORT_TEMPLATE_OPTIONS,
  normalizeReportExportOptions,
  reportFigureModeHintForMode,
  reportFigureModeOptionsForMode,
} from "./report-options.ts";

test("计算书导出选项读取 shared 契约默认值", () => {
  assert.deepEqual(DEFAULT_REPORT_EXPORT_OPTIONS, sharedReportOptions.default);
  assert.deepEqual(REPORT_TEMPLATE_OPTIONS, sharedReportOptions.templates);
  assert.deepEqual(REPORT_FIGURE_MODE_OPTIONS, sharedReportOptions.figureModes);
  assert.deepEqual(REPORT_FIGURE_SCOPE_OPTIONS, sharedReportOptions.figureScopes);
});

test("计算书导出选项归一化使用现代默认值回退", () => {
  assert.deepEqual(normalizeReportExportOptions(null), sharedReportOptions.default);
  assert.deepEqual(normalizeReportExportOptions({}), sharedReportOptions.default);
  assert.deepEqual(
    normalizeReportExportOptions({
      template: "bad" as never,
      figureMode: "bad" as never,
      figureScope: "bad" as never,
    }),
    sharedReportOptions.default,
  );
});

test("计算书图形模式文案按结构体系避免误导传统曲线", () => {
  assert.deepEqual(reportFigureModeOptionsForMode("beam"), sharedReportOptions.figureModes);
  assert.deepEqual(
    reportFigureModeOptionsForMode("frame").map((item) => item.label),
    ["模型叠加图", "模型叠加图（传统项映射）", "模型叠加图（合并项映射）"],
  );
  assert.deepEqual(
    reportFigureModeOptionsForMode("truss").map((item) => item.label),
    ["模型叠加图", "模型叠加图（传统项映射）", "模型叠加图（合并项映射）"],
  );
  assert.match(reportFigureModeHintForMode("beam"), /传统单项曲线/u);
  assert.match(reportFigureModeHintForMode("frame"), /模型叠加图/u);
  assert.match(reportFigureModeHintForMode("truss"), /模型叠加图/u);
});
