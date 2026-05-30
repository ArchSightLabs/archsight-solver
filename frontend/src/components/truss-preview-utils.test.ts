import assert from "node:assert/strict";
import test from "node:test";
import { placeDiagramLabel } from "../lib/diagram-label-layout.ts";
import {
  buildTrussLoadMarkers,
  buildTrussMemberLengthDimension,
  buildTrussMemberLengthDimensions,
  buildTrussMemberLengthLegendRows,
  buildTrussNodeLabelCandidates,
  buildTrussSupportMarkerGeometry,
  scoreTrussSupportedNodeLabelClearance,
} from "./truss-preview-utils.ts";

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

test("buildTrussNodeLabelCandidates keeps supported bottom-node labels above the support marker", () => {
  const node = { x: 790, y: 430 };
  const placed = placeDiagramLabel({
    id: "node-N2",
    anchor: node,
    lines: [{ text: "N2", fontSize: 11 }],
    candidates: buildTrussNodeLabelCandidates(node, { x: 500, y: 270 }, "roller", 14),
    blockers: [
      { left: node.x - 24, right: node.x + 24, top: node.y - 12, bottom: node.y + 38, weight: 8 },
      { left: node.x - 8, right: node.x + 8, top: node.y - 90, bottom: node.y + 8, weight: 5 },
    ],
    bounds: { left: 10, top: 16, right: 990, bottom: 524 },
    paddingX: 1,
    paddingY: 1,
    lineGap: 0,
    extraScore: (rect) => scoreTrussSupportedNodeLabelClearance(rect, node.y),
  });

  assert.equal(placed.textAnchor, "start");
  assert.ok(placed.rect.bottom <= node.y - 8);
  assert.ok(placed.lines[0].y < node.y);
});

test("buildTrussMemberLengthDimension uses the rod id as the dimension reference", () => {
  const dimension = buildTrussMemberLengthDimension("M1", { x: 100, y: 280 }, { x: 500, y: 280 }, 4);

  assert.equal(dimension?.memberId, "M1");
  assert.equal(dimension?.valueLabel, "4 m");
  assert.equal(dimension?.title, "杆件 M1，长度 4.00 m");
});

test("buildTrussMemberLengthLegendRows groups equal member dimensions and separates differing lengths", () => {
  const dimensions = [
    buildTrussMemberLengthDimension("M1", { x: 100, y: 280 }, { x: 500, y: 280 }, 4),
    buildTrussMemberLengthDimension("M2", { x: 500, y: 280 }, { x: 700, y: 280 }, 2),
    buildTrussMemberLengthDimension("M3", { x: 500, y: 280 }, { x: 900, y: 280 }, 4),
  ].filter((dimension): dimension is NonNullable<typeof dimension> => Boolean(dimension));

  assert.deepEqual(buildTrussMemberLengthLegendRows(dimensions, 280, 12), ["M1=M3=4 m", "M2=2 m"]);
  assert.deepEqual(buildTrussMemberLengthLegendRows(dimensions, 90, 12), ["M1=M3=4 m", "M2=2 m"]);
});

test("buildTrussMemberLengthDimensions derives member dimensions from node coordinates", () => {
  const dimensions = buildTrussMemberLengthDimensions(
    [
      { id: "N1", x: 0, y: 0 },
      { id: "N2", x: 6, y: 0 },
      { id: "N3", x: 0, y: 4 },
      { id: "N4", x: 6, y: 4 },
    ],
    [
      { id: "M1", start: "N1", end: "N3" },
      { id: "M2", start: "N3", end: "N4" },
      { id: "M3", start: "N2", end: "N4" },
    ],
  );

  assert.deepEqual(buildTrussMemberLengthLegendRows(dimensions, 220, 12), ["M1=M3=4 m", "M2=6 m"]);
});
