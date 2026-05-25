import assert from "node:assert/strict";
import test from "node:test";
import { buildTrussLoadMarkers } from "./truss-preview-utils.ts";

test("buildTrussLoadMarkers anchors vertical loads on the node x-coordinate", () => {
  const markers = buildTrussLoadMarkers({ x: 320, y: 180 }, { fyKn: -50 }, 3);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].x1, 320);
  assert.equal(markers[0].x2, 320);
  assert.equal(markers[0].label, "竖向荷载 50.0 千牛");
  assert.equal(markers[0].labelX, 334);
});

test("buildTrussLoadMarkers keeps horizontal loads centered on the node row", () => {
  const markers = buildTrussLoadMarkers({ x: 240, y: 160 }, { fxKn: 30 }, 1);

  assert.equal(markers.length, 1);
  assert.equal(markers[0].y1, 160);
  assert.equal(markers[0].y2, 160);
  assert.equal(markers[0].label, "水平荷载 30.0 千牛");
});
