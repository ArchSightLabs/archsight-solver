import test from "node:test";
import assert from "node:assert/strict";

import { buildFrameDiagramSeries, findFrameDiagramExtreme, FRAME_DIAGRAM_METRICS, getFrameDiagramMetric, numericDomain } from "./frame-member-diagrams.ts";
import { FRAME_REPORT_MEMBER_FIGURES, reportFiguresForScope } from "./report-figure-catalog.ts";

test("buildFrameDiagramSeries flattens member station values by metric", () => {
  const series = buildFrameDiagramSeries(
    [
      {
        memberId: "B1",
        stationsM: [0, 2, 4],
        stations: [0, 0.5, 1],
        axialKn: [1, 2, 3],
        shearKn: [4, 5, 6],
        momentKnM: [7, 8, 9],
        deflectionMm: [0, -1, 0],
      },
    ],
    getFrameDiagramMetric("momentKnM"),
  );

  assert.equal(series.metric.key, "momentKnM");
  assert.deepEqual(series.points, [
    { memberId: "B1", x: 0, y: 7 },
    { memberId: "B1", x: 2, y: 8 },
    { memberId: "B1", x: 4, y: 9 },
  ]);
});

test("numericDomain pads flat and ranged values", () => {
  assert.deepEqual(numericDomain([], 0.1), [-1, 1]);
  assert.deepEqual(numericDomain([5, 5], 0.1), [4, 6]);
  assert.deepEqual(numericDomain([0, 10], 0.1), [-1, 11]);
});

test("findFrameDiagramExtreme reports the controlling member station", () => {
  const extreme = findFrameDiagramExtreme(
    [
      {
        memberId: "B1",
        stationsM: [0, 2, 4],
        stations: [0, 0.5, 1],
        axialKn: [1, -6, 3],
        shearKn: [4, 5, 6],
        momentKnM: [7, -12, 9],
        deflectionMm: [0, -1, 0],
      },
    ],
    getFrameDiagramMetric("momentKnM"),
  );

  assert.deepEqual(extreme, {
    memberId: "B1",
    stationM: 2,
    stationRatio: 0.5,
    value: -12,
    absValue: 12,
  });
});

test("框架计算书插图顺序与界面工程图顺序一致", () => {
  assert.deepEqual(
    FRAME_REPORT_MEMBER_FIGURES.map((figure) => figure.metric),
    FRAME_DIAGRAM_METRICS.map((metric) => metric.key),
  );
  assert.deepEqual(
    FRAME_REPORT_MEMBER_FIGURES.map((figure) => figure.title),
    FRAME_DIAGRAM_METRICS.map((metric) => metric.title),
  );
  assert.deepEqual(
    FRAME_REPORT_MEMBER_FIGURES.map((figure) => figure.unit),
    FRAME_DIAGRAM_METRICS.map((metric) => metric.unit),
  );
  assert.deepEqual(
    reportFiguresForScope(FRAME_REPORT_MEMBER_FIGURES, false).map((figure) => figure.metric),
    ["momentKnM"],
  );
});
