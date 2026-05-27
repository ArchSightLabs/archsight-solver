import test from "node:test";
import assert from "node:assert/strict";

import { beamSpanDimensionLabel, buildBeamSpanDimensionLegendRows, buildBeamSpanDimensionSegments } from "./beam-span-dimensions.ts";

test("beamSpanDimensionLabel adapts text to available span width", () => {
  assert.equal(beamSpanDimensionLabel(0, 4, 160), "(1)");
  assert.equal(beamSpanDimensionLabel(1, 4, 86), "(2)");
  assert.equal(beamSpanDimensionLabel(2, 4, 50), "(3)");
  assert.equal(beamSpanDimensionLabel(3, 4, 32), null);
});

test("buildBeamSpanDimensionSegments preserves precise length labels when span markers are hidden", () => {
  const segments = buildBeamSpanDimensionSegments([0.2, 0.2, 7.6], 8, 80, 920);

  assert.equal(segments[0]?.label, null);
  assert.equal(segments[0]?.title, "第 1 跨，跨长 0.20 m");
  assert.equal(segments[2]?.label, "(3)");
  assert.equal(segments[2]?.lengthLabel, "l = 7.60 m");
  assert.equal(segments[segments.length - 1]?.end, 920);
});

test("buildBeamSpanDimensionLegendRows wraps index length references", () => {
  const segments = buildBeamSpanDimensionSegments([4, 4, 3], 11, 80, 920);

  assert.deepEqual(buildBeamSpanDimensionLegendRows(segments, 170), ["(1) l = 4.00 m", "(2) l = 4.00 m", "(3) l = 3.00 m"]);
  assert.deepEqual(buildBeamSpanDimensionLegendRows(segments, 520), ["(1) l = 4.00 m    (2) l = 4.00 m    (3) l = 3.00 m"]);
});
