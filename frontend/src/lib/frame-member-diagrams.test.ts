import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFrameDiagramSeries,
  findFrameDiagramExtreme,
  findFrameDiagramKeyPoints,
  FRAME_DIAGRAM_METRICS,
  getFrameDiagramMetric,
  numericDomain,
} from "./frame-member-diagrams.ts";
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

test("findFrameDiagramKeyPoints preserves mandatory frame annotations", () => {
  const keyPoints = findFrameDiagramKeyPoints(
    {
      memberId: "M1",
      stationsM: [0, 1, 2, 2.05, 3, 4],
      stations: [0, 0.25, 0.5, 0.5125, 0.75, 1],
      axialKn: [0, 2, -6, 14, 8, 0],
      shearKn: [0, 2, -6, 14, 8, 0],
      momentKnM: [0, 2, -6, 14, 8, 0],
      deflectionMm: [0, 2, -6, 14, 8, 0],
    },
    getFrameDiagramMetric("shearKn"),
  );

  assert.ok(keyPoints.some((point) => point.kind === "global-extreme" && point.stationM === 2.05));
  assert.ok(keyPoints.some((point) => point.kind === "jump-left" && point.stationM === 2));
  assert.ok(keyPoints.some((point) => point.kind === "jump-right" && point.stationM === 2.05));
  assert.ok(keyPoints.some((point) => point.kind === "zero-crossing" && point.stationM > 1 && point.stationM < 2));
  assert.ok(keyPoints.some((point) => point.kind === "endpoint" && point.stationM === 0));
  assert.ok(keyPoints.some((point) => point.kind === "endpoint" && point.stationM === 4));
  assert.ok(!keyPoints.some((point) => point.kind === "zero-crossing" && point.stationM > 2 && point.stationM < 2.05));
});

test("findFrameDiagramKeyPoints never drops detected local extremes at the display limit", () => {
  const values = Array.from({ length: 12 }, (_, index) => (index % 2 === 0 ? 1 : 2));
  const keyPoints = findFrameDiagramKeyPoints(
    {
      memberId: "M1",
      stationsM: values.map((_, index) => index),
      stations: values.map((_, index) => index / (values.length - 1)),
      axialKn: values,
      shearKn: values,
      momentKnM: values,
      deflectionMm: values,
    },
    getFrameDiagramMetric("momentKnM"),
  );

  assert.equal(keyPoints.filter((point) => point.kind === "local-extreme").length, 9);
});

test("findFrameDiagramKeyPoints preserves a small but numerically real local extreme", () => {
  const values = [0, 100, 1, 2, 1, 0];
  const keyPoints = findFrameDiagramKeyPoints(
    {
      memberId: "M1",
      stationsM: values.map((_, index) => index),
      stations: values.map((_, index) => index / (values.length - 1)),
      axialKn: values,
      shearKn: values,
      momentKnM: values,
      deflectionMm: values,
    },
    getFrameDiagramMetric("momentKnM"),
  );

  assert.ok(keyPoints.some((point) => point.kind === "local-extreme" && point.stationM === 3));
});

test("findFrameDiagramKeyPoints does not label a same-sign near-zero sample as a crossing", () => {
  const diagram = (values: number[]) => ({
    memberId: "M1",
    stationsM: values.map((_, index) => index),
    stations: values.map((_, index) => index / (values.length - 1)),
    axialKn: values,
    shearKn: values,
    momentKnM: values,
    deflectionMm: values,
  });
  const sameSign = findFrameDiagramKeyPoints(diagram([2, 1e-12, 3]), getFrameDiagramMetric("momentKnM"));
  const trueCrossing = findFrameDiagramKeyPoints(diagram([2, 0, -3]), getFrameDiagramMetric("momentKnM"));

  assert.equal(sameSign.some((point) => point.kind === "zero-crossing"), false);
  assert.ok(trueCrossing.some((point) => point.kind === "zero-crossing" && point.stationM === 1));
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
