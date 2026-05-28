import test from "node:test";
import assert from "node:assert/strict";

import { beamSpanDimensionLabel, buildBeamSpanDimensionLegendRows, buildBeamSpanDimensionSegments } from "./beam-span-dimensions.ts";

test("beamSpanDimensionLabel adapts text to available span width", () => {
  assert.equal(beamSpanDimensionLabel(0, 4, 160), "B1");
  assert.equal(beamSpanDimensionLabel(1, 4, 86), "B2");
  assert.equal(beamSpanDimensionLabel(2, 4, 32), null);
  assert.equal(beamSpanDimensionLabel(3, 4, 24), null);
});

test("buildBeamSpanDimensionSegments preserves precise length labels when span markers are hidden", () => {
  const segments = buildBeamSpanDimensionSegments([0.2, 0.2, 7.6], 8, 80, 920);

  assert.equal(segments[0]?.label, null);
  assert.equal(segments[0]?.title, "B1：第 1 跨，N1-N2，L = 0.20 m");
  assert.equal(segments[2]?.label, "B3");
  assert.equal(segments[2]?.lengthLabel, "L = 7.60 m");
  assert.equal(segments[segments.length - 1]?.end, 920);
});

test("buildBeamSpanDimensionLegendRows wraps index length references", () => {
  const segments = buildBeamSpanDimensionSegments([4, 4, 3], 11, 80, 920);

  assert.deepEqual(buildBeamSpanDimensionLegendRows(segments, 150), ["B1-B2 L = 4.00 m", "B3 L = 3.00 m"]);
  assert.deepEqual(buildBeamSpanDimensionLegendRows(segments, 420), ["B1-B2 L = 4.00 m    B3 L = 3.00 m"]);
});
