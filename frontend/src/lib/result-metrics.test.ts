import { strict as assert } from "node:assert";
import test from "node:test";
import { defaultSensitivityMetricForMode, sensitivityResponseMetricLabel, sensitivityResponseMetrics, summaryMetricLabel } from "./result-metrics.ts";

test("三类分析目标的敏感性响应指标来自共享词表", () => {
  assert.equal(defaultSensitivityMetricForMode("beam"), "max_deflection");
  assert.equal(defaultSensitivityMetricForMode("frame"), "max_ux");
  assert.equal(defaultSensitivityMetricForMode("truss"), "max_node_displacement");

  assert.deepEqual(
    sensitivityResponseMetrics("truss").map((metric) => metric.label),
    ["最大节点位移", "最大杆件轴力", "最大杆件轴应力"],
  );
});

test("结果摘要主指标保留结构体系专业口径", () => {
  assert.equal(summaryMetricLabel("beam", "max_deflection", ""), "最大挠度");
  assert.equal(summaryMetricLabel("frame", "max_member_moment", ""), "最大构件弯矩");
  assert.equal(summaryMetricLabel("truss", "max_member_axial", ""), "最大杆件轴力");
  assert.equal(sensitivityResponseMetricLabel("beam", "max_shear", ""), "最大剪力");
});
