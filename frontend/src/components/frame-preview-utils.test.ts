import assert from "node:assert/strict";
import test from "node:test";
import { buildFrameLoadMarkers } from "./frame-preview-utils.ts";

test("buildFrameLoadMarkers anchors vertical nodal loads on the node x-coordinate", () => {
  const markers = buildFrameLoadMarkers(
    { type: "nodal", node: "N2", fyKn: -42 },
    2,
    {
      nodeMap: new Map([["N2", { x: 480, y: 210 }]]),
      memberMap: new Map(),
    }
  );

  assert.equal(markers.length, 1);
  assert.equal(markers[0].type, "force");
  assert.equal(markers[0].x1, 480);
  assert.equal(markers[0].x2, 480);
  assert.equal(markers[0].label, "竖向荷载 42.0 千牛（向下）");
  assert.equal(markers[0].labelX, 494);
});

test("buildFrameLoadMarkers places horizontal nodal load labels outside the arrow tail", () => {
  const markers = buildFrameLoadMarkers(
    { type: "nodal", node: "N4", fxKn: 24 },
    1,
    {
      nodeMap: new Map([["N4", { x: 720, y: 180 }]]),
      memberMap: new Map(),
    }
  );

  assert.equal(markers.length, 1);
  assert.equal(markers[0].type, "force");
  assert.equal(markers[0].label, "水平荷载 24.0 千牛（向右）");
  assert.equal(markers[0].labelX, 656);
  assert.equal(markers[0].textAnchor, "end");
});

test("buildFrameLoadMarkers builds distributed load guide and arrows from the member axis", () => {
  const markers = buildFrameLoadMarkers(
    { type: "distributed", member: "M1", wyKnPerM: -18 },
    0,
    {
      nodeMap: new Map([
        ["N1", { x: 100, y: 320 }],
        ["N2", { x: 340, y: 320 }],
      ]),
      memberMap: new Map([["M1", { start: "N1", end: "N2" }]]),
    }
  );

  assert.equal(markers.length, 5);
  assert.equal(markers[0].type, "distributed-guide");
  assert.equal(markers[0].label, "向下均布荷载 18.0 千牛/米");
  assert.equal(markers[1].type, "force");
  assert.equal(markers[1].x1, 130);
  assert.equal(markers[1].x2, 130);
  assert.equal(markers[1].y1, 278);
  assert.equal(markers[1].y2, 320);
  assert.equal(markers[1].label, undefined);
});
