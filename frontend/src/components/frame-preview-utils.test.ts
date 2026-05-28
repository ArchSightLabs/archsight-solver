import assert from "node:assert/strict";
import test from "node:test";
import { buildFrameDimensionLegendRows, buildFrameLoadLabelMap, buildFrameLoadMarkers, frameMemberDimensionValueLabel } from "./frame-preview-utils.ts";

test("buildFrameLoadMarkers anchors vertical nodal loads on the node x-coordinate", () => {
  const load = { type: "nodal" as const, node: "N2", fyKn: -42 };
  const loadLabels = buildFrameLoadLabelMap([load]);
  const markers = buildFrameLoadMarkers(
    load,
    0,
    {
      nodeMap: new Map([["N2", { x: 480, y: 210 }]]),
      memberMap: new Map(),
      loadLabel: loadLabels.get(0),
    }
  );

  assert.equal(markers.length, 1);
  assert.equal(markers[0].type, "force");
  assert.equal(markers[0].x1, 480);
  assert.equal(markers[0].x2, 480);
  assert.equal(markers[0].label, "F1=42.0kN");
  assert.equal(markers[0].labelX, 494);
});

test("buildFrameLoadMarkers places horizontal nodal load labels outside the arrow tail", () => {
  const load = { type: "nodal" as const, node: "N4", fxKn: 24 };
  const loadLabels = buildFrameLoadLabelMap([load]);
  const markers = buildFrameLoadMarkers(
    load,
    0,
    {
      nodeMap: new Map([["N4", { x: 720, y: 180 }]]),
      memberMap: new Map(),
      loadLabel: loadLabels.get(0),
    }
  );

  assert.equal(markers.length, 1);
  assert.equal(markers[0].type, "force");
  assert.equal(markers[0].label, "F1=24.0kN");
  assert.equal(markers[0].labelX, 656);
  assert.equal(markers[0].textAnchor, "end");
});

test("buildFrameLoadMarkers builds distributed load guide and arrows from the member axis", () => {
  const load = { type: "distributed" as const, member: "B1", wyKnPerM: -18 };
  const loadLabels = buildFrameLoadLabelMap([load]);
  const markers = buildFrameLoadMarkers(
    load,
    0,
    {
      nodeMap: new Map([
        ["N1", { x: 100, y: 320 }],
        ["N2", { x: 340, y: 320 }],
      ]),
      memberMap: new Map([["B1", { start: "N1", end: "N2" }]]),
      loadLabel: loadLabels.get(0),
    }
  );

  assert.equal(markers.length, 13);
  assert.equal(markers[0].type, "distributed-guide");
  assert.equal(markers[0].label, "q1=18.0kN/m");
  assert.equal(markers[1].type, "force");
  assert.equal(markers[1].x1, 110);
  assert.equal(markers[1].x2, 110);
  assert.equal(markers[1].y1, 276);
  assert.equal(markers[1].y2, 320);
  assert.equal(markers[1].label, undefined);
});

test("buildFrameLoadMarkers respects partial distributed load range", () => {
  const load = { type: "distributed" as const, member: "M1", qStartKnPerM: -8, qEndKnPerM: -12, startRatio: 0.25, endRatio: 0.75 };
  const loadLabels = buildFrameLoadLabelMap([load]);
  const markers = buildFrameLoadMarkers(
    load,
    0,
    {
      nodeMap: new Map([
        ["N1", { x: 100, y: 320 }],
        ["N2", { x: 340, y: 320 }],
      ]),
      memberMap: new Map([["M1", { start: "N1", end: "N2" }]]),
      loadLabel: loadLabels.get(0),
    }
  );

  assert.equal(markers[0].type, "distributed-guide");
  assert.equal(markers[0].x1, 160);
  assert.equal(markers[0].x2, 280);
  assert.match(markers[0].label, /@0\.25-0\.75L/u);
});

test("buildFrameDimensionLegendRows groups equal member lengths and separates differing lengths", () => {
  const dimensions = [
    { memberId: "C1", valueLabel: frameMemberDimensionValueLabel({ x: 0, y: 0 }, { x: 0, y: 4 }) },
    { memberId: "B1", valueLabel: frameMemberDimensionValueLabel({ x: 0, y: 4 }, { x: 6, y: 4 }) },
    { memberId: "C2", valueLabel: frameMemberDimensionValueLabel({ x: 6, y: 0 }, { x: 6, y: 4 }) },
  ];

  assert.deepEqual(buildFrameDimensionLegendRows(dimensions, 220, 12), ["C1=C2=4m", "B1=6m"]);
});
