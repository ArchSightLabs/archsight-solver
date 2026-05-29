import test from "node:test";
import assert from "node:assert/strict";

import type { BeamCalculationResults, BeamPreviewData } from "../types/beam.ts";
import { buildBeamResultDiagramSvg } from "./beam-result-diagram-svg.ts";
import { buildBeamPreviewSvg } from "./beam-preview-svg.ts";
import { formatEngineeringValue } from "./engineering-format.ts";
import { assertReportImagesReady, reportImageRequirements } from "./report-image-requirements.ts";

test("formatEngineeringValue uses up to four decimals and trims trailing zeros", () => {
  assert.equal(formatEngineeringValue(3.8141, "mm"), "3.8141 mm");
  assert.equal(formatEngineeringValue(11.25, "mm"), "11.25 mm");
  assert.equal(formatEngineeringValue(0.162, "mm"), "0.162 mm");
  assert.equal(formatEngineeringValue(1, "mm"), "1 mm");
  assert.equal(formatEngineeringValue(0.00001, "mm"), "<0.0001 mm");
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

  assert.match(svg, /梁长=8m/);
  assert.match(svg, />\(1\)</);
  assert.match(svg, />1</);
  assert.doesNotMatch(svg, />S1</);
  assert.doesNotMatch(svg, />S3</);
  assert.match(svg, /q=10\.0 kN\/m/);
  assert.match(svg, /最大挠度 1 mm/);
  assert.match(svg, /80\.0,150\.0 500\.0,230\.0 920\.0,150\.0/);
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

  assert.match(svg, /梁长=8m/);
  assert.match(svg, /\(1\)=\(2\)=4m/);
  assert.match(svg, />\(1\)</);
  assert.match(svg, />-20 kN·m</);
  assert.match(svg, />11\.25 kN·m</);
  assert.match(svg, />x = 4\.00 m</);
  assert.match(svg, />x = 1\.50 m</);
  assert.doesNotMatch(svg, />S3</);
  assert.match(svg, /stroke-dasharray="4 4"/);
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
    ["beam.preview", "beam.overlay.moment"],
  );
  assert.throws(() => assertReportImagesReady({ "beam.preview": "data:image/png;base64,test" }, input), /梁系弯矩图/);
  assert.doesNotThrow(() => assertReportImagesReady({ "beam.preview": "data:image/png;base64,test", "beam.overlay.moment": "data:image/png;base64,test" }, input));
});
