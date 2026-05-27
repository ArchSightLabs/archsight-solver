import test from "node:test";
import assert from "node:assert/strict";

import { findBeamDiagramKeyPoints } from "./beam-diagram-key-points.ts";

test("findBeamDiagramKeyPoints marks every meaningful moment local extreme", () => {
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

  assert.deepEqual(
    keyPoints.map((point) => ({ x: point.x, kind: point.kind })),
    [
      { x: 2, kind: "local-extreme" },
      { x: 4, kind: "global-extreme" },
      { x: 6, kind: "local-extreme" },
    ],
  );
});

test("findBeamDiagramKeyPoints marks shear endpoints and jump shoulders", () => {
  const keyPoints = findBeamDiagramKeyPoints(
    [
      { x: 0, value: -12 },
      { x: 1, value: -6 },
      { x: 2, value: 0 },
      { x: 3.9, value: 13 },
      { x: 4, value: -25 },
      { x: 5, value: -18 },
      { x: 6, value: -10 },
      { x: 7, value: -2 },
      { x: 8, value: 7 },
    ],
    "shearKn",
  );

  assert.deepEqual(
    keyPoints.map((point) => ({ x: point.x, kind: point.kind })),
    [
      { x: 0, kind: "endpoint" },
      { x: 3.9, kind: "jump" },
      { x: 4, kind: "global-extreme" },
      { x: 8, kind: "endpoint" },
    ],
  );
});
