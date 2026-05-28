import test from "node:test";
import assert from "node:assert/strict";

import { beamSpanDimensionLabel, buildBeamSpanDimensionLegendRows, buildBeamSpanDimensionSegments } from "./beam-span-dimensions.ts";

test("beamSpanDimensionLabel adapts text to available span width", () => {
  assert.equal(beamSpanDimensionLabel(0, 4, 160), "跨1");
  assert.equal(beamSpanDimensionLabel(1, 4, 86), "跨2");
  assert.equal(beamSpanDimensionLabel(2, 4, 32), "3");
  assert.equal(beamSpanDimensionLabel(3, 4, 24), null);
});

test("buildBeamSpanDimensionSegments preserves precise length labels when span markers are hidden", () => {
  const segments = buildBeamSpanDimensionSegments([0.2, 0.2, 7.6], 8, 80, 920);

  assert.equal(segments[0]?.label, null);
  assert.equal(segments[0]?.title, "第 1 跨，跨长 0.20 m");
  assert.equal(segments[2]?.label, "跨3");
  assert.equal(segments[2]?.lengthLabel, "7.60 m");
  assert.equal(segments[segments.length - 1]?.end, 920);
});

test("buildBeamSpanDimensionLegendRows wraps index length references", () => {
  const segments = buildBeamSpanDimensionSegments([4, 4, 3], 11, 80, 920);

  assert.deepEqual(buildBeamSpanDimensionLegendRows(segments, 150), ["跨1 4.00 m", "跨2 4.00 m", "跨3 3.00 m"]);
  assert.deepEqual(buildBeamSpanDimensionLegendRows(segments, 420), ["跨1 4.00 m    跨2 4.00 m    跨3 3.00 m"]);
});
