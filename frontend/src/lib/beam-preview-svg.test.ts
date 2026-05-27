import test from "node:test";
import assert from "node:assert/strict";

import type { BeamPreviewData } from "../types/beam.ts";
import { buildBeamPreviewSvg } from "./beam-preview-svg.ts";

test("buildBeamPreviewSvg follows the workbench beam preview sign convention", () => {
  const beam: BeamPreviewData = {
    beamType: "continuous",
    beamTypeLabel: "连续梁",
    loadType: "uniform",
    loadTypeLabel: "均布荷载",
    spans: [4, 4],
    totalLength: 8,
    supports: [
      { label: "A", x: 0, type: "pinned" },
      { label: "B", x: 4, type: "pinned" },
      { label: "C", x: 8, type: "roller" },
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

  assert.match(svg, /梁长 = 8\.00 m/);
  assert.match(svg, /A 铰支/);
  assert.match(svg, /C 滚动/);
  assert.match(svg, /q = 10\.0 kN\/m/);
  assert.match(svg, /最大挠度 1\.000 mm/);
  assert.match(svg, /80\.0,150\.0 500\.0,230\.0 920\.0,150\.0/);
});
