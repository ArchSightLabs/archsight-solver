import test from "node:test";
import assert from "node:assert/strict";

import { clampModelLabelOffsetToCanvas, modelLabelOffsetFromOffsets, modelLabelTransform, modelLabelTransformFromOffsets, normalizeModelLabelOffset } from "./model-label-overrides.ts";

test("normalizeModelLabelOffset keeps finite label micro-adjustments", () => {
  assert.deepEqual(normalizeModelLabelOffset({ dx: 12.345, dy: -6.789 }), { dx: 12.35, dy: -6.79 });
  assert.equal(normalizeModelLabelOffset({ dx: Number.NaN, dy: 0 }), null);
});

test("clampModelLabelOffsetToCanvas keeps adjusted labels inside the model canvas", () => {
  const bounds = { x: 20, y: 30, width: 80, height: 24 };
  const canvas = { width: 200, height: 120 };

  assert.deepEqual(clampModelLabelOffsetToCanvas({ dx: -100, dy: -100 }, bounds, canvas), { dx: -12, dy: -22 });
  assert.deepEqual(clampModelLabelOffsetToCanvas({ dx: 500, dy: 500 }, bounds, canvas), { dx: 92, dy: 58 });
  assert.equal(modelLabelTransform({ dx: 0, dy: 0 }), undefined);
  assert.equal(modelLabelTransformFromOffsets({ "member:B1": { dx: 12, dy: -6 } }, "member:B1"), "translate(12 -6)");
  assert.equal(modelLabelTransformFromOffsets({ "member:B1": { dx: 12, dy: -6 } }, "node:N1"), undefined);
  assert.deepEqual(modelLabelOffsetFromOffsets({ "member:B1": { dx: 12, dy: -6 } }, "member:B1"), { dx: 12, dy: -6 });
  assert.deepEqual(modelLabelOffsetFromOffsets({ "member:B1": { dx: 12, dy: -6 } }, "node:N1"), { dx: 0, dy: 0 });
});
