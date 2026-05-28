import assert from "node:assert/strict";
import test from "node:test";
import { buildTrussLoadMarkers, buildTrussMemberLengthDimension, buildTrussMemberLengthLegendRows, buildTrussSupportMarkerGeometry } from "./truss-preview-utils.ts";

test("buildTrussLoadMarkers anchors vertical loads on the node x-coordinate", () => {
  const markers = buildTrussLoadMarkers({ x: 320, y: 180 }, { fyKn: -50 }, 3);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].x1, 320);
  assert.equal(markers[0].x2, 320);
  assert.equal(markers[0].label, "竖向荷载 50.0 kN");
  assert.equal(markers[0].labelX, 334);
});

test("buildTrussLoadMarkers keeps horizontal loads centered on the node row", () => {
  const markers = buildTrussLoadMarkers({ x: 240, y: 160 }, { fxKn: 30 }, 1);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].y1, 160);
  assert.equal(markers[0].y2, 160);
  assert.equal(markers[0].label, "水平荷载 30.0 kN");
});

test("buildTrussSupportMarkerGeometry differentiates pinned and roller supports", () => {
  const pinned = buildTrussSupportMarkerGeometry("pinned", 110, 280);
  const roller = buildTrussSupportMarkerGeometry("roller", 790, 280);
  const free = buildTrussSupportMarkerGeometry("free", 450, 160);

  assert.equal(pinned?.label, "铰支座");
  assert.equal(pinned?.rollers.length, 0);
  assert.equal(roller?.label, "滚动支座");
  assert.equal(roller?.rollers.length, 2);
  assert.equal(roller?.rollers[0].cy, 313);
  assert.equal(free, null);
});

test("buildTrussMemberLengthDimension uses the rod id as the dimension reference", () => {
  const dimension = buildTrussMemberLengthDimension("M1", { x: 100, y: 280 }, { x: 500, y: 280 }, 4);

  assert.equal(dimension?.memberId, "M1");
  assert.equal(dimension?.valueLabel, "l = 4.00 m");
  assert.equal(dimension?.title, "杆件 M1，长度 4.00 m");
});

test("buildTrussMemberLengthLegendRows mirrors frame-style member dimension summaries", () => {
  const dimensions = [
    buildTrussMemberLengthDimension("M1", { x: 100, y: 280 }, { x: 500, y: 280 }, 4),
    buildTrussMemberLengthDimension("M2", { x: 500, y: 280 }, { x: 700, y: 280 }, 2),
  ].filter((dimension): dimension is NonNullable<typeof dimension> => Boolean(dimension));

  assert.deepEqual(buildTrussMemberLengthLegendRows(dimensions, 280, 12), ["M1 l = 4.00 m    M2 l = 2.00 m"]);
  assert.deepEqual(buildTrussMemberLengthLegendRows(dimensions, 190, 12), ["M1 l = 4.00 m", "M2 l = 2.00 m"]);
});
