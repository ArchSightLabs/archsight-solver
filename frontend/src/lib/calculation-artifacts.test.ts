import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCalculationSnapshot,
  calculationCriticalPointKindTitle,
  calculationMetricTitle,
  calculationObjectTitle,
  calculationSideTitle,
  calculationSourceIdTitle,
  calculationSourceLabelTitle,
  calculationSourceTypeTitle,
  calculationStatusTitle,
  calculationTechnicalText,
  compareCalculationSnapshots,
  createCalculationSnapshotFromResult,
  MAX_SNAPSHOT_BYTES,
  normalizeCalculationSnapshot,
  normalizeCalculationTrace,
  normalizeCriticalPoints,
  normalizeGoverningEnvelope,
  normalizeReviewPoints,
} from "./calculation-artifacts.ts";

test("canonical CalculationTrace stages are rendered as the eight engineering process steps", () => {
  const stages = [
    "input_normalized",
    "dof_mapping",
    "element_process",
    "global_assembly",
    "boundary_reduction",
    "solver_diagnostics",
    "result_recovery",
    "equilibrium_check",
  ];
  const trace = normalizeCalculationTrace({
    schema: "CalculationTrace@1",
    stages: stages.map((stage, index) => ({ stage, summary: { step: index + 1, availability: "available" } })),
  });

  assert.deepEqual(trace.map((entry) => entry.stage), stages);
  assert.equal(trace[0]?.title, "输入规范化");
  assert.match(trace[0]?.detail ?? "", /已提供完整信息/u);
  assert.match(trace[0]?.technicalDetail ?? "", /step=1/u);
});

test("计算过程与关键点使用工程中文展示并保留折叠审计原值", () => {
  const trace = normalizeCalculationTrace({
    stages: [{
      stage: "dof_mapping",
      summary: { availability: "diagnostic_summary", nodeCount: 4, globalDofCount: 39, freeDofCount: 33 },
    }],
  });

  assert.equal(trace[0]?.detail, "已提供诊断摘要；节点数：4；总自由度数：39；未约束自由度数：33");
  assert.match(trace[0]?.technicalDetail ?? "", /freeDofCount=33/u);
  assert.equal(calculationCriticalPointKindTitle("node"), "节点值");
  assert.equal(calculationCriticalPointKindTitle("global-extreme"), "全局极值");
  assert.equal(calculationMetricTitle("reactionMz"), "约束弯矩");
  assert.equal(calculationMetricTitle("momentKnM"), "弯矩");
  assert.equal(calculationMetricTitle("maxAxialForceKn"), "最大轴力");
  assert.equal(calculationMetricTitle("max_displacement_mm"), "最大位移");
  assert.equal(calculationMetricTitle("critical_load_factor"), "临界荷载因子");
  assert.equal(calculationSourceTypeTitle("main"), "主结果");
  assert.equal(calculationSourceTypeTitle("member"), "构件");
  assert.equal(calculationSourceIdTitle("__primary__"), "基本结果");
  assert.equal(calculationSourceLabelTitle("main"), "基本结果");
  assert.equal(calculationSourceLabelTitle("future_source_contract"), "其他结果来源");
  assert.equal(calculationSideTitle("exact"), "精确位置");
  assert.equal(calculationStatusTitle("PASS"), "通过");
  assert.equal(calculationStatusTitle("PENDING"), "待计算");
  assert.equal(calculationStatusTitle("maximum_iterations_exhausted"), "达到最大迭代次数");
  assert.equal(calculationObjectTitle("endpoint", "beam"), "梁系对象");
  assert.equal(calculationTechnicalText("Euler-Bernoulli 梁理论 + 共回转全 Newton P-Delta"), "欧拉–伯努利梁理论 + 共回转全量牛顿法 P-Δ");
  assert.equal(calculationMetricTitle("future_internal_metric"), "其他工程指标");
  assert.equal(calculationCriticalPointKindTitle("future_internal_kind"), "其他关键点");
  assert.equal(calculationSourceTypeTitle("future_internal_source"), "其他来源");
  assert.equal(calculationSideTitle("future_internal_side"), "其他位置");
  assert.equal(calculationStatusTitle("FUTURE_INTERNAL_STATUS"), "状态待确认");

  const unknownProtocolTrace = normalizeCalculationTrace({
    stages: [{
      stage: "future_stage",
      title: "INTERNAL_STAGE_TITLE",
      detail: "availability=diagnostic_summary",
      summary: { method: "future_solver_backend" },
    }],
  });
  assert.equal(unknownProtocolTrace[0]?.title, "步骤 1");
  assert.equal(unknownProtocolTrace[0]?.detail, "计算方法：其他求解方法");
  assert.match(unknownProtocolTrace[0]?.technicalDetail ?? "", /INTERNAL_STAGE_TITLE/u);
});

test("结果页优先使用受控展示集合，用户复核点不混入系统采样点", () => {
  const criticalPoints = normalizeCriticalPoints({
    points: Array.from({ length: 80 }, (_, index) => ({ id: `all-${index}`, kind: "query", metric: "moment", value: index })),
    displayPoints: [{ id: "display-1", kind: "absolute", metric: "moment", value: 12, unit: "kN.m", objectId: "B1" }],
  });
  const reviewPoints = normalizeReviewPoints({
    points: [{ id: "system-1", sourceType: "system", object: "member", objectId: "B1" }],
    requestedPoints: [{ id: "request-1", sourceType: "request", targetType: "member", targetId: "B1", label: "CUSTOM_STATION", note: "raw internal note" }],
  });
  const envelope = normalizeGoverningEnvelope({
    entries: [{ id: "all-1", metric: "moment", value: 12 }],
    displayEntries: [{ id: "display-1", metric: "moment", value: 12 }],
  });

  assert.deepEqual(criticalPoints.map((item) => item.id), ["display-1"]);
  assert.deepEqual(reviewPoints.map((item) => item.id), ["request-1"]);
  assert.equal(reviewPoints[0]?.label, "复核点 1");
  assert.equal(reviewPoints[0]?.note, "用户指定的工程复核位置");
  assert.deepEqual(envelope.map((item) => item.id), ["display-1"]);
});

test("canonical result snapshot keeps hashes and the same evidence collections", () => {
  const snapshot = createCalculationSnapshotFromResult({
    analysisMode: "beam",
    result: {
      apiEnvelope: {
        resultHash: "result-1",
        meta: { requestHash: "request-1", modelHash: "model-1", generatedAt: "2026-08-23T08:00:00Z" },
        results: {
          resultHash: "result-1",
          calculationSnapshot: {
            schema: "CalculationSnapshot@1",
            analysisType: "beam",
            resultHash: "result-1",
            summary: { maxDeflectionMm: 1.2 },
          },
          calculationTrace: { stages: [{ stage: "input_normalized", summary: { availability: "available" } }] },
          criticalPoints: { points: [{ id: "cp-1", object: "beam", objectId: "beam", metric: "moment", value: 2, unit: "kN.m" }] },
          reviewPoints: { points: [{ id: "rp-1", targetType: "station", targetId: "beam", metric: "deflection", station: 3, value: -1 }] },
          governingEnvelope: { entries: [{ id: "env-1", metric: "moment", value: 2, sourceId: "LC1", resultHash: "source-1" }] },
        },
      },
    },
  });

  assert.equal(snapshot.schemaVersion, "CalculationSnapshot@1");
  assert.equal(snapshot.canonicalHash, "result-1");
  assert.equal(snapshot.requestHash, "request-1");
  assert.equal(snapshot.modelHash, "model-1");
  assert.equal(snapshot.createdAt, "2026-08-23T08:00:00Z");
  assert.equal(snapshot.trace.length, 1);
  assert.equal(snapshot.criticalPoints.length, 1);
  assert.equal(snapshot.reviewPoints[0]?.targetId, "beam");
  assert.equal(snapshot.reviewPoints[0]?.metricKey, "deflection");
  assert.equal(snapshot.governingEnvelope.length, 1);
});

test("snapshot persistence requires a canonical hash, rejects oversized facts and de-duplicates one result", () => {
  const canonical = normalizeCalculationSnapshot(
    { resultHash: "result-1", createdAt: "2026-08-23T08:00:00Z", summary: { value: 1 } },
    "beam",
  );
  const withoutHash = normalizeCalculationSnapshot({ createdAt: "2026-08-23T08:00:01Z", summary: { value: 2 } }, "beam");
  const oversized = normalizeCalculationSnapshot(
    { resultHash: "result-large", createdAt: "2026-08-23T08:00:02Z", note: "x".repeat(MAX_SNAPSHOT_BYTES + 1) },
    "beam",
  );

  assert.deepEqual(appendCalculationSnapshot([], withoutHash), []);
  assert.deepEqual(appendCalculationSnapshot([], oversized), []);
  const first = appendCalculationSnapshot([], canonical, "基线");
  const repeated = appendCalculationSnapshot(first, canonical, "重复");
  assert.equal(repeated.length, 1);
  assert.equal(repeated[0]?.name, "重复");
});

test("review point aliases preserve backend object provenance and metric", () => {
  const points = normalizeReviewPoints({
    points: [{ id: "review-1", object: "member", objectId: "M2", metric: "axial", station: 2.5 }],
  });
  assert.deepEqual(points[0], {
    id: "review-1",
    kind: "custom",
    targetType: "member",
    label: "复核点 1",
    targetId: "M2",
    metricKey: "axial",
    station: 2.5,
    side: undefined,
    note: undefined,
  });
});

test("snapshot comparison does not invent a percentage from a zero baseline", () => {
  const left = normalizeCalculationSnapshot({ resultHash: "left", summary: { maxMomentKnM: 0 } }, "beam");
  const right = normalizeCalculationSnapshot({ resultHash: "right", summary: { maxMomentKnM: 10 } }, "beam");
  const row = compareCalculationSnapshots(left, right).rows.find((item) => item.key === "maxMomentKnM");
  assert.equal(row?.relDiff, null);
  assert.match(row?.reason ?? "", /基线为 0/u);
});

test("快照对比只展示中文工程字段和可读来源，同时保留数值单位", () => {
  const left = normalizeCalculationSnapshot({
    resultHash: "left-result-hash",
    summary: {
      allowableMm: 24,
      maxDisplacementMm: 0.0665,
      maxMomentKnM: 42.9673,
      secondOrderAmplificationFactor: 3.2972,
    },
    governingEnvelope: [{
      id: "ux-control",
      metricKey: "ux",
      kind: "absolute",
      value: 0.0665,
      unit: "mm",
      sourceType: "main",
      sourceId: "__primary__",
      sourceLabel: "main",
      side: "exact",
      sourceHash: "left-source-hash",
    }],
  }, "frame");
  const right = normalizeCalculationSnapshot({
    resultHash: "right-result-hash",
    summary: {
      allowableMm: 24,
      maxDisplacementMm: 0.07,
      maxMomentKnM: 43.1,
      secondOrderAmplificationFactor: 3.4,
    },
    governingEnvelope: [{
      id: "ux-control",
      metricKey: "ux",
      kind: "absolute",
      value: 0.07,
      unit: "mm",
      sourceType: "main",
      sourceId: "__primary__",
      sourceLabel: "main",
      side: "exact",
      sourceHash: "right-source-hash",
    }],
  }, "frame");

  const comparison = compareCalculationSnapshots(left, right);
  const byKey = new Map(comparison.rows.map((row) => [row.key, row]));
  assert.equal(byKey.get("allowableMm")?.label, "允许位移");
  assert.equal(byKey.get("maxDisplacementMm")?.label, "最大位移");
  assert.equal(byKey.get("maxMomentKnM")?.label, "最大弯矩");
  assert.equal(byKey.get("secondOrderAmplificationFactor")?.label, "二阶放大系数");
  assert.equal(byKey.get("maxDisplacementMm")?.unit, "mm");

  const envelope = comparison.rows.find((row) => row.key.startsWith("governing:ux::"));
  assert.equal(envelope?.label, "X 向位移 · 绝对控制值");
  assert.equal(envelope?.leftText, "来源：主结果 · 基本结果 · 精确位置");
  assert.doesNotMatch(envelope?.leftText ?? "", /__primary__|left-source-hash|absolute/u);
});
