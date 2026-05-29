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
  assert.equal(segments[2]?.lengthLabel, "7.6m");
  assert.equal(segments[segments.length - 1]?.end, 920);
});

test("buildBeamSpanDimensionLegendRows groups equal span lengths and separates differing lengths", () => {
  const segments = buildBeamSpanDimensionSegments([4, 4, 3], 11, 80, 920);

  assert.deepEqual(buildBeamSpanDimensionLegendRows(segments, 100), ["B1=B2=4m", "B3=3m"]);
  assert.deepEqual(buildBeamSpanDimensionLegendRows(segments, 420), ["B1=B2=4m", "B3=3m"]);
});

test("buildBeamSpanDimensionLegendRows groups non-adjacent equal span lengths", () => {
  const segments = buildBeamSpanDimensionSegments([4, 3, 4], 11, 80, 920);

  assert.deepEqual(buildBeamSpanDimensionLegendRows(segments, 420), ["B1=B3=4m", "B2=3m"]);
});

test("buildBeamSpanDimensionSegments uses custom member and node ids", () => {
  const segments = buildBeamSpanDimensionSegments([4, 4], 8, 80, 920, {
    memberIds: ["G1", "G2"],
    nodeIds: ["A", "B", "C"],
  });

  assert.equal(segments[0]?.label, "G1");
  assert.equal(segments[0]?.title, "G1：第 1 跨，A-B，L = 4.00 m");
  assert.deepEqual(buildBeamSpanDimensionLegendRows(segments, 420), ["G1=G2=4m"]);
});
