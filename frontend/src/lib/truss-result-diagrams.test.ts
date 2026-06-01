import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_TRUSS_DIAGRAM_METRIC_KEY,
  autoTrussDisplacementDisplayScale,
  getTrussDiagramMetric,
  trussAxialMemberStrokeWidth,
  TRUSS_DIAGRAM_METRICS,
} from "./truss-result-diagrams.ts";
import { STRUCTURE_VISUAL_STROKES } from "./structure-visual-tokens.ts";
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

test("桁架轴力图杆件线宽保持接近梁系结果图", () => {
  assert.equal(trussAxialMemberStrokeWidth(0, 120), STRUCTURE_VISUAL_STROKES.resultTrussAxialMin);
  assert.equal(trussAxialMemberStrokeWidth(120, 120), STRUCTURE_VISUAL_STROKES.resultTrussAxialMax);
  assert.equal(trussAxialMemberStrokeWidth(-60, 120), 2.5);
  assert.ok(STRUCTURE_VISUAL_STROKES.resultTrussBase <= STRUCTURE_VISUAL_STROKES.resultBeamBase);
  assert.ok(STRUCTURE_VISUAL_STROKES.resultTrussAxialMax < STRUCTURE_VISUAL_STROKES.resultOverlayBase);
});

test("桁架节点位移自动显示倍率按实际位移比例收敛", () => {
  const layout = {
    layoutScalePxPerM: 120,
    modelWidthPx: 960,
    modelHeightPx: 480,
  };
  const tinyScale = autoTrussDisplacementDisplayScale({ ...layout, maxDisplacementMm: 1 });
  const moderateScale = autoTrussDisplacementDisplayScale({ ...layout, maxDisplacementMm: 10 });
  const largeScale = autoTrussDisplacementDisplayScale({ ...layout, maxDisplacementMm: 40 });
  const offsetPx = (scale: number, displacementMm: number) => scale * (displacementMm / 1000) * layout.layoutScalePxPerM;

  assert.ok(tinyScale > moderateScale);
  assert.ok(moderateScale > largeScale);
  assert.ok(offsetPx(tinyScale, 1) >= 10);
  assert.ok(offsetPx(tinyScale, 1) < offsetPx(moderateScale, 10));
  assert.ok(offsetPx(largeScale, 40) <= 88);
});

test("桁架节点位移自动显示倍率避免把小位移拉得过大", () => {
  const scale = autoTrussDisplacementDisplayScale({
    maxDisplacementMm: 8.8209,
    layoutScalePxPerM: 133,
    modelWidthPx: 1200,
    modelHeightPx: 650,
  });
  const displayedOffsetPx = scale * (8.8209 / 1000) * 133;

  assert.ok(displayedOffsetPx >= 10);
  assert.ok(displayedOffsetPx <= 35);
});

test("桁架节点位移自动显示倍率在无有效位移时不显示", () => {
  assert.equal(
    autoTrussDisplacementDisplayScale({
      maxDisplacementMm: 0,
      layoutScalePxPerM: 120,
      modelWidthPx: 960,
      modelHeightPx: 480,
    }),
    0,
  );
});
