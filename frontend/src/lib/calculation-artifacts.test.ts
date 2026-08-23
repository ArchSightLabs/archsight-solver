import assert from "node:assert/strict";
import test from "node:test";

import {
  appendCalculationSnapshot,
  compareCalculationSnapshots,
  createCalculationSnapshotFromResult,
  MAX_SNAPSHOT_BYTES,
  normalizeCalculationSnapshot,
  normalizeCalculationTrace,
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
  assert.match(trace[0]?.detail ?? "", /step=1/u);
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
