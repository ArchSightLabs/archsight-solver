import test from "node:test";
import assert from "node:assert/strict";

import { findBeamDiagramKeyPoints } from "./beam-diagram-key-points.ts";

test("findBeamDiagramKeyPoints marks local extremes and zero crossings", () => {
  const keyPoints = findBeamDiagramKeyPoints(
    [
      { x: 0, value: 0 },
      { x: 1, value: 8 },
      { x: 2, value: 12 },
      { x: 3, value: 7 },
      { x: 4, value: -20 },
      { x: 5, value: 7 },
      { x: 6, value: 12 },
      { x: 7, value: 8 },
      { x: 8, value: 0 },
    ],
    "momentKnM",
  );

  assert.ok(keyPoints.some((point) => point.kind === "endpoint" && point.x === 0));
  assert.ok(keyPoints.some((point) => point.kind === "endpoint" && point.x === 8));
  assert.ok(keyPoints.some((point) => point.kind === "global-extreme" && point.x === 4));
  assert.ok(keyPoints.some((point) => point.kind === "local-extreme" && point.x === 2));
  assert.ok(keyPoints.some((point) => point.kind === "local-extreme" && point.x === 6));
  assert.equal(keyPoints.filter((point) => point.kind === "zero-crossing").length, 2);
});

test("findBeamDiagramKeyPoints marks shear jump shoulders and zero crossings", () => {
  const keyPoints = findBeamDiagramKeyPoints(
    [
      { x: 0, value: -8 },
      { x: 1, value: -4 },
      { x: 2, value: 4 },
      { x: 2.05, value: 20 },
      { x: 3, value: 30 },
      { x: 4, value: 14 },
      { x: 5, value: -2 },
    ],
    "shearKn",
  );

  assert.ok(keyPoints.some((point) => point.kind === "jump-left" && point.x === 2));
  assert.ok(keyPoints.some((point) => point.kind === "jump-right" && point.x === 2.05));
  assert.ok(keyPoints.some((point) => point.kind === "zero-crossing" && point.x > 4 && point.x < 5));
  assert.equal(keyPoints.find((point) => point.kind === "global-extreme")?.x, 3);
});

test("findBeamDiagramKeyPoints never drops detected local extremes at the display limit", () => {
  const keyPoints = findBeamDiagramKeyPoints(
    Array.from({ length: 12 }, (_, index) => ({ x: index, value: index % 2 === 0 ? 1 : 2 })),
    "momentKnM",
  );

  assert.equal(keyPoints.filter((point) => point.kind === "local-extreme").length, 9);
});

test("findBeamDiagramKeyPoints preserves a small but numerically real local extreme", () => {
  const keyPoints = findBeamDiagramKeyPoints(
    [
      { x: 0, value: 0 },
      { x: 1, value: 100 },
      { x: 2, value: 1 },
      { x: 3, value: 2 },
      { x: 4, value: 1 },
      { x: 5, value: 0 },
    ],
    "momentKnM",
  );

  assert.ok(keyPoints.some((point) => point.kind === "local-extreme" && point.x === 3));
});

test("findBeamDiagramKeyPoints does not label a same-sign near-zero sample as a crossing", () => {
  const sameSign = findBeamDiagramKeyPoints(
    [
      { x: 0, value: 2 },
      { x: 1, value: 1e-12 },
      { x: 2, value: 3 },
    ],
    "momentKnM",
  );
  const trueCrossing = findBeamDiagramKeyPoints(
    [
      { x: 0, value: 2 },
      { x: 1, value: 0 },
      { x: 2, value: -3 },
    ],
    "momentKnM",
  );

  assert.equal(sameSign.some((point) => point.kind === "zero-crossing"), false);
  assert.ok(trueCrossing.some((point) => point.kind === "zero-crossing" && point.x === 1));
});
