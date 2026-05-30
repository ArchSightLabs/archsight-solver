import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TRUSS_DIAGRAM_METRIC_KEY,
  getTrussDiagramMetric,
  TRUSS_DIAGRAM_METRICS,
} from "./truss-result-diagrams.ts";
import { reportFiguresForScope, TRUSS_REPORT_OVERLAY_FIGURES } from "./report-figure-catalog.ts";

test("桁架界面工程图目录由计算书图形目录派生", () => {
  assert.deepEqual(
    TRUSS_DIAGRAM_METRICS.map((metric) => metric.title),
    TRUSS_REPORT_OVERLAY_FIGURES.map((figure) => figure.title),
  );
  assert.deepEqual(
    TRUSS_DIAGRAM_METRICS.map((metric) => metric.unit),
    TRUSS_REPORT_OVERLAY_FIGURES.map((figure) => figure.unit),
  );
  assert.deepEqual(
    TRUSS_DIAGRAM_METRICS.map((metric) => metric.key),
    ["axialForceKn", "displacementMm"],
  );
});

test("桁架控制图与默认界面图一致", () => {
  assert.equal(DEFAULT_TRUSS_DIAGRAM_METRIC_KEY, "axialForceKn");
  assert.equal(getTrussDiagramMetric("displacementMm").title, "节点位移图");
  assert.deepEqual(
    reportFiguresForScope(TRUSS_REPORT_OVERLAY_FIGURES, false).map((figure) => figure.metric),
    ["axial"],
  );
});
