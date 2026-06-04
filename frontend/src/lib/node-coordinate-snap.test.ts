import assert from "node:assert/strict";
import test from "node:test";

import { normalizeGridSnapStep, snapCoordinateToGrid } from "./node-coordinate-snap.ts";

test("snapCoordinateToGrid leaves coordinates unchanged when disabled", () => {
  assert.equal(snapCoordinateToGrid(3.24, { enabled: false, stepM: 0.5 }), 3.24);
});

test("snapCoordinateToGrid rounds coordinates to the nearest grid step", () => {
  assert.equal(snapCoordinateToGrid(3.24, { enabled: true, stepM: 0.5 }), 3);
  assert.equal(snapCoordinateToGrid(3.26, { enabled: true, stepM: 0.5 }), 3.5);
  assert.equal(snapCoordinateToGrid(-1.26, { enabled: true, stepM: 0.5 }), -1.5);
});

test("normalizeGridSnapStep clamps invalid or tiny step values", () => {
  assert.equal(normalizeGridSnapStep(Number.NaN), 0.5);
  assert.equal(normalizeGridSnapStep(0), 0.5);
  assert.equal(normalizeGridSnapStep(0.001), 0.01);
});
