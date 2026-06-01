import test from "node:test";
import assert from "node:assert/strict";

import type { BeamCalculationResults, BeamPreviewData } from "../types/beam.ts";
import type { FrameCalculationResults, TrussCalculationResults } from "../types/structure.ts";
import { buildBeamResultDiagramSvg } from "./beam-result-diagram-svg.ts";
import { buildBeamPreviewSvg } from "./beam-preview-svg.ts";
import { formatEngineeringValue, formatLimitRatio, formatUtilizationPercent } from "./engineering-format.ts";
import { buildReportImagePlan } from "./report-image-plan.ts";
import { assertReportImagesReady, reportImageRequirements } from "./report-image-requirements.ts";

test("formatEngineeringValue uses up to four decimals and trims trailing zeros", () => {
  assert.equal(formatEngineeringValue(3.8141, "mm"), "3.8141 mm");
  assert.equal(formatEngineeringValue(11.25, "mm"), "11.25 mm");
  assert.equal(formatEngineeringValue(0.162, "mm"), "0.162 mm");
  assert.equal(formatEngineeringValue(1, "mm"), "1 mm");
  assert.equal(formatEngineeringValue(0.00001, "mm"), "<0.0001 mm");
});

test("serviceability ratio formatting distinguishes limit ratio from utilization", () => {
  assert.equal(formatLimitRatio(250), "限值 L/250");
  assert.equal(formatLimitRatio(300.5), "限值 L/300.5");
  assert.equal(formatUtilizationPercent(8.8209, 24), "36.75%");
  assert.equal(formatUtilizationPercent(null, 0), "--");
});

test("buildBeamPreviewSvg follows the workbench beam preview sign convention", () => {
  const beam: BeamPreviewData = {
    beamType: "continuous",
    beamTypeLabel: "连续梁",
    loadType: "uniform",
    loadTypeLabel: "均布荷载",
    spans: [4, 4],
    totalLength: 8,
    supports: [
      { label: "S1", x: 0, type: "pinned" },
      { label: "S2", x: 4, type: "pinned" },
      { label: "S3", x: 8, type: "roller" },
    ],
    nodes: [
      { index: 0, x: 0, support: true },
      { index: 1, x: 4, support: true },
      { index: 2, x: 8, support: true },
    ],
    loads: [{ type: "uniform", x: 4, startX: 0, endX: 8, length: 8, intensityKnPerM: 10 }],
    curve: [
      { x: 0, v: 0, vMm: 0 },
      { x: 4, v: -0.001, vMm: -1 },
      { x: 8, v: 0, vMm: 0 },
    ],
    spanSummaries: [],
    maxDeflection: { valueM: -0.001, valueMm: -1, xM: 4, spanIndex: 0 },
    reactions: [],
    warnings: [],
  };

  const svg = buildBeamPreviewSvg(beam);

  assert.match(svg, /梁长=8 m/);
  assert.match(svg, />\(1\)</);
  assert.match(svg, />1</);
  assert.match(svg, /cx="90\.0" cy="132\.0"/);
  assert.match(svg, /x1="80\.0" y1="85\.0" x2="80\.0" y2="142\.0"/);
  assert.doesNotMatch(svg, />S1</);
  assert.doesNotMatch(svg, />S3</);
  assert.match(svg, /q=10\.0 kN\/m/);
  assert.match(svg, /最大挠度 1 mm/);
  assert.match(svg, /80\.0,150\.0 500\.0,230\.0 920\.0,150\.0/);
  assert.match(svg, /stop-color="#2563eb"/);
  assert.match(svg, /stroke="#b45309"/);
});

test("buildBeamResultDiagramSvg uses workbench-style span dimensions and key point annotations", () => {
  const beam: BeamPreviewData = {
    beamType: "continuous",
    beamTypeLabel: "连续梁",
    loadType: "uniform",
    loadTypeLabel: "均布荷载",
    spans: [4, 4],
    totalLength: 8,
    supports: [
      { label: "S1", x: 0, type: "pinned" },
      { label: "S2", x: 4, type: "pinned" },
      { label: "S3", x: 8, type: "roller" },
    ],
    nodes: [
      { index: 0, x: 0, support: true },
      { index: 1, x: 4, support: true },
      { index: 2, x: 8, support: true },
    ],
    loads: [],
    curve: [],
    spanSummaries: [],
    maxDeflection: { valueM: 0, valueMm: 0, xM: 0, spanIndex: 0 },
    reactions: [],
    warnings: [],
  };
  const results: BeamCalculationResults = {
    x_data: [0, 1.5, 4, 6.5, 8],
    moment_data: [0, 11.25, -20, 11.25, 0],
    shear_data: [],
    v_data: [],
    t_data: [],
    q_t_data: [],
    beam,
  };

  const svg = buildBeamResultDiagramSvg(results, "momentKnM");

  assert.match(svg, /梁长=8 m/);
  assert.match(svg, /\(1\)=\(2\)=4 m/);
  assert.match(svg, />\(1\)</);
  assert.match(svg, />-20 kN·m</);
  assert.match(svg, />11\.25 kN·m</);
  assert.match(svg, /cx="90\.00" cy="164\.00"/);
  assert.match(svg, />x = 4\.00 m</);
  assert.match(svg, />x = 1\.50 m</);
  assert.doesNotMatch(svg, />S3</);
  assert.match(svg, /stroke-dasharray="4 4"/);
  assert.match(svg, /stroke="#2563eb" stroke-opacity="0\.82"/);
});

test("assertReportImagesReady prevents frontend DOCX export from falling back to simplified backend figures", () => {
  const beam: BeamPreviewData = {
    beamType: "continuous",
    beamTypeLabel: "连续梁",
    loadType: "uniform",
    loadTypeLabel: "均布荷载",
    spans: [4, 4],
    totalLength: 8,
    supports: [
      { label: "S1", x: 0, type: "pinned" },
      { label: "S2", x: 4, type: "pinned" },
      { label: "S3", x: 8, type: "roller" },
    ],
    nodes: [
      { index: 0, x: 0, support: true },
      { index: 1, x: 4, support: true },
      { index: 2, x: 8, support: true },
    ],
    loads: [],
    curve: [],
    spanSummaries: [],
    maxDeflection: { valueM: 0, valueMm: 0, xM: 0, spanIndex: 0 },
    reactions: [],
    warnings: [],
  };
  const input = {
    analysisMode: "beam" as const,
    beamResults: {
      x_data: [0, 4, 8],
      moment_data: [0, -20, 0],
      shear_data: [],
      v_data: [],
      t_data: [],
      q_t_data: [],
      beam,
    },
    frameResults: null,
    trussResults: null,
    sensitivityData: null,
    reportOptions: { template: "standard" as const, figureMode: "overlay" as const, figureScope: "control" as const },
  };

  assert.deepEqual(
    reportImageRequirements(input).map((item) => item.key),
    ["beam.preview", "beam.overlay.moment", "beam.overlay.shear", "beam.overlay.deflection"],
  );
  assert.throws(() => assertReportImagesReady({ "beam.preview": "data:image/png;base64,test" }, input), /梁系弯矩图/);
  assert.doesNotThrow(() =>
    assertReportImagesReady(
      {
        "beam.preview": "data:image/png;base64,test",
        "beam.overlay.moment": "data:image/png;base64,test",
        "beam.overlay.shear": "data:image/png;base64,test",
        "beam.overlay.deflection": "data:image/png;base64,test",
      },
      input,
    ),
  );
});

test("assertReportImagesReady requires frame and truss preview images before DOCX export", () => {
  const reportOptions = { template: "complete" as const, figureMode: "both" as const, figureScope: "all" as const };
  const frameInput = {
    analysisMode: "frame" as const,
    beamResults: null,
    frameResults: {} as FrameCalculationResults,
    trussResults: null,
    sensitivityData: null,
    reportOptions,
  };
  const trussInput = {
    analysisMode: "truss" as const,
    beamResults: null,
    frameResults: null,
    trussResults: {} as TrussCalculationResults,
    sensitivityData: null,
    reportOptions,
  };

  assert.deepEqual(
    reportImageRequirements(frameInput).map((item) => item.key),
    ["frame.preview", "frame.overlay.moment", "frame.overlay.shear", "frame.overlay.memberDeflection", "frame.overlay.axial"],
  );
  assert.throws(
    () => assertReportImagesReady({ "frame.overlay.moment": "data:image/png;base64,test" }, frameInput),
    /平面框架受力变形图/u,
  );
  assert.deepEqual(
    reportImageRequirements(trussInput).map((item) => item.key),
    ["truss.preview", "truss.overlay.axial", "truss.overlay.displacement"],
  );
  assert.throws(
    () => assertReportImagesReady({ "truss.overlay.axial": "data:image/png;base64,test" }, trussInput),
    /平面桁架受力变形图/u,
  );
});

test("buildReportImagePlan normalizes legacy control scope to all core figure keys", () => {
  const reportOptions = { template: "standard" as const, figureMode: "overlay" as const, figureScope: "control" as const };

  assert.deepEqual(
    buildReportImagePlan({
      analysisMode: "beam",
      beamResults: {} as BeamCalculationResults,
      frameResults: null,
      trussResults: null,
      sensitivityData: null,
      reportOptions,
    }).map((item) => item.key),
    ["beam.preview", "beam.overlay.moment", "beam.overlay.shear", "beam.overlay.deflection"],
  );

  assert.deepEqual(
    buildReportImagePlan({
      analysisMode: "frame",
      beamResults: null,
      frameResults: {} as FrameCalculationResults,
      trussResults: null,
      sensitivityData: null,
      reportOptions,
    }).map((item) => item.key),
    ["frame.preview", "frame.overlay.moment", "frame.overlay.shear", "frame.overlay.memberDeflection", "frame.overlay.axial"],
  );

  assert.deepEqual(
    buildReportImagePlan({
      analysisMode: "truss",
      beamResults: null,
      frameResults: null,
      trussResults: {} as TrussCalculationResults,
      sensitivityData: null,
      reportOptions,
    }).map((item) => item.key),
    ["truss.preview", "truss.overlay.axial", "truss.overlay.displacement"],
  );
});

test("框架和桁架计算书图形计划不再混入非 UI 同源传统曲线", () => {
  const reportOptions = { template: "complete" as const, figureMode: "both" as const, figureScope: "all" as const };

  const framePlan = buildReportImagePlan({
    analysisMode: "frame",
    beamResults: null,
    frameResults: {} as FrameCalculationResults,
    trussResults: null,
    sensitivityData: null,
    reportOptions,
  });
  assert.deepEqual(
    framePlan.map((item) => item.key),
    ["frame.preview", "frame.overlay.moment", "frame.overlay.shear", "frame.overlay.memberDeflection", "frame.overlay.axial"],
  );
  assert.deepEqual([...new Set(framePlan.map((item) => item.kind))], ["framePreview", "frameOverlay"]);

  const trussPlan = buildReportImagePlan({
    analysisMode: "truss",
    beamResults: null,
    frameResults: null,
    trussResults: {} as TrussCalculationResults,
    sensitivityData: null,
    reportOptions,
  });
  assert.deepEqual(
    trussPlan.map((item) => item.key),
    ["truss.preview", "truss.overlay.axial", "truss.overlay.displacement"],
  );
  assert.deepEqual([...new Set(trussPlan.map((item) => item.kind))], ["trussPreview", "trussOverlay"]);
});
