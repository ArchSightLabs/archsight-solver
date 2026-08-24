import assert from "node:assert/strict";
import test from "node:test";

import type { FrameNonlinearPathTrace } from "../types/structure.ts";
import { buildNonlinearPathKeyPoints, layoutNonlinearPathLabels, nonlinearPathPlotPoints } from "./frame-nonlinear-path.ts";

function legacyTrace(): FrameNonlinearPathTrace {
  return {
    schema: "NonlinearPathTrace@1",
    algorithm: { id: "corotational_newton_v1", version: "1" },
    control: {},
    convergence: {},
    mesh: {},
    steps: [
      { step: 1, fixedLoadFactor: 0.5, loadFactor: 0, pathPhase: "fixed_preload", stepSize: 0.5, iterations: 2, equilibriumStatus: "converged", stabilityStatus: "stable", minimumTangentEigenvalue: 8, maxDisplacementMm: 1 },
      { step: 2, fixedLoadFactor: 1, loadFactor: 0, pathPhase: "fixed_preload", stepSize: 0.5, iterations: 2, equilibriumStatus: "converged", stabilityStatus: "stable", minimumTangentEigenvalue: 6, maxDisplacementMm: 2 },
      { step: 3, fixedLoadFactor: 1, loadFactor: 0.4, pathPhase: "variable", stepSize: 0.4, iterations: 3, equilibriumStatus: "converged", stabilityStatus: "near_critical", minimumTangentEigenvalue: 1, maxDisplacementMm: 5 },
      { step: 4, fixedLoadFactor: 1, loadFactor: 0.7, pathPhase: "variable", stepSize: 0.3, iterations: 4, equilibriumStatus: "converged", stabilityStatus: "unstable", minimumTangentEigenvalue: -2, maxDisplacementMm: 4 },
    ],
    iterations: [
      { step: 1, iteration: 1, loadFactor: 0, fixedLoadFactor: 0.5, pathPhase: "fixed_preload", equilibriumResidualRelative: 0.01, displacementMm: 1, stabilityStatus: "stable" },
      { step: 3, iteration: 2, loadFactor: 0.4, fixedLoadFactor: 1, pathPhase: "variable", equilibriumResidualRelative: 0.03, displacementMm: 5, minimumTangentEigenvalue: 1, stabilityStatus: "near_critical" },
      { step: 4, iteration: 3, loadFactor: 0.7, fixedLoadFactor: 1, pathPhase: "variable", equilibriumResidualRelative: 0.02, displacementMm: 4, minimumTangentEigenvalue: -2, stabilityStatus: "unstable" },
    ],
    attempts: [{ step: 4, status: "cutback", pathPhase: "variable", fixedLoadFactor: 1, loadFactor: 0.8 }],
    keyframes: [],
    lastConverged: { loadFactor: 0.7, fixedLoadFactor: 1, maxDisplacementMm: 4, step: 4 },
    finalAttempt: { step: 5, status: "failed", pathPhase: "variable", fixedLoadFactor: 1, loadFactor: 0.75 },
    summary: {},
  };
}

function canonicalTrace(): FrameNonlinearPathTrace {
  return {
    ...legacyTrace(),
    keyPoints: [
      {
        id: "start:keyframe:0",
        kind: "start",
        source: "keyframe",
        sourceIndex: 0,
        step: 1,
        pathPhase: "fixed_preload",
        pathProgress: 0.5,
        fixedLoadFactor: 0.5,
        loadFactor: 0,
        maxDisplacementMm: 1,
        minimumTangentEigenvalue: 8,
        stabilityStatus: "stable",
      },
      {
        id: "residual_peak:iteration:2",
        kind: "residual_peak",
        source: "iteration",
        sourceIndex: 2,
        step: 3,
        pathPhase: "variable",
        pathProgress: 1.9,
        fixedLoadFactor: 1,
        loadFactor: 0.4,
        maxDisplacementMm: 5,
        minimumTangentEigenvalue: 1,
        equilibriumResidualRelative: 0.03,
        stabilityStatus: "near_critical",
      },
      {
        id: "last_converged:step:3",
        kind: "last_converged",
        source: "step",
        sourceIndex: 3,
        step: 4,
        pathPhase: "variable",
        pathProgress: 2.2,
        fixedLoadFactor: 1,
        loadFactor: 0.7,
        maxDisplacementMm: 4,
        minimumTangentEigenvalue: -2,
        stabilityStatus: "unstable",
      },
    ],
  };
}

test("nonlinear path keeps preload and variable phases in one ordered coordinate", () => {
  assert.deepEqual(nonlinearPathPlotPoints(legacyTrace()).map((point) => point.pathProgress), [0.5, 1, 1.4, 1.7]);
});

test("canonical key points are mapped directly with source metadata and residual peak labels", () => {
  const points = buildNonlinearPathKeyPoints(canonicalTrace());
  const residualPeak = points.find((point) => point.kind === "residual_peak");

  assert.equal(points.find((point) => point.kind === "start")?.source, "keyframe");
  assert.equal(residualPeak?.source, "iteration");
  assert.equal(residualPeak?.sourceIndex, 2);
  assert.equal(residualPeak?.pathProgress, 1.9);
  assert.ok(residualPeak?.label.includes("残差峰值"));
  assert.ok(residualPeak?.label.includes("0.03"));
});

test("legacy traces still derive response turning, stability transitions and residual peak labels", () => {
  const points = buildNonlinearPathKeyPoints(legacyTrace());
  assert.ok(points.some((point) => point.kind === "preload_end" && point.label.includes("2 mm")));
  assert.ok(points.some((point) => point.kind === "response_turning" && point.label.includes("5 mm")));
  assert.ok(points.some((point) => point.kind === "stability_change" && point.label.includes("λ 0.4")));
  assert.ok(points.some((point) => point.kind === "minimum_stability" && point.label.includes("-2")));
  assert.ok(points.some((point) => point.kind === "residual_peak" && point.label.includes("0.03")));
  assert.ok(points.some((point) => point.kind === "cutback" && point.label.includes("0.8")));
  assert.ok(points.some((point) => point.kind === "failure" && point.label.includes("0.75")));
});

test("同一终点附近的非线性关键点标签会分层避让且不越出图框", () => {
  const placements = layoutNonlinearPathLabels(
    [
      { id: "minimum", x: 712, y: 48, label: "最小切线指标 0.18" },
      { id: "cutback", x: 786, y: 34, label: "切步回退 · λ 0.8" },
      { id: "last", x: 712, y: 48, label: "最后收敛 · λ 0.72 / 1.18 mm" },
      { id: "failure", x: 786, y: 34, label: "终止 · λ 0.8" },
    ],
    { left: 60, right: 786, top: 8, bottom: 232 },
  );

  for (const placement of placements) {
    assert.ok(placement.bounds.left >= 60);
    assert.ok(placement.bounds.right <= 786);
    assert.ok(placement.bounds.top >= 8);
    assert.ok(placement.bounds.bottom <= 232);
  }
  for (let leftIndex = 0; leftIndex < placements.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < placements.length; rightIndex += 1) {
      const left = placements[leftIndex]!.bounds;
      const right = placements[rightIndex]!.bounds;
      assert.ok(
        left.right <= right.left
        || right.right <= left.left
        || left.bottom <= right.top
        || right.bottom <= left.top,
      );
    }
  }
});
