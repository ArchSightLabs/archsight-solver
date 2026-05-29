import test from "node:test";
import assert from "node:assert/strict";

import sharedReportOptions from "../../../shared/report-options.json" with { type: "json" };
import {
  DEFAULT_REPORT_EXPORT_OPTIONS,
  REPORT_FIGURE_MODE_OPTIONS,
  REPORT_FIGURE_SCOPE_OPTIONS,
  REPORT_TEMPLATE_OPTIONS,
  normalizeReportExportOptions,
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
