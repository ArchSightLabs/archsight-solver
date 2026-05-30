import test from "node:test";
import assert from "node:assert/strict";

import { trussReportNodesFromPreview } from "./report-structure-images.ts";
import type { TrussPreviewData } from "../types/structure.ts";

test("桁架计算书图形节点保留铰支座与滚动支座差异", () => {
  const preview = {
    analysisType: "truss",
    structureType: "explicit",
    structureTypeLabel: "二维平面桁架",
    nodes: [
      { id: "N1", x: 0, y: 0, role: "support", supportType: "pinned" },
      { id: "N2", x: 6, y: 0, role: "support", supportType: "roller" },
      { id: "N3", x: 3, y: 3, role: "free", supportType: "free" },
    ],
    members: [],
    loads: [],
    nodeResults: [],
    memberResults: [],
    deformedNodes: [],
    deformationScale: 1,
    summary: {
      allowableMm: 24,
      allowableRatio: 250,
      maxDisplacementMm: 0,
      maxAxialForceKn: 0,
      statusCode: "PASS",
      status: "合格",
      method: "二维平面桁架杆单元法",
    },
    warnings: [],
  } satisfies TrussPreviewData;

  assert.deepEqual(trussReportNodesFromPreview(preview).map((node) => node.supportType), ["pinned", "roller", "free"]);
});

test("桁架旧预览契约缺少 supportType 时仍按 role 兼容显示", () => {
  const legacyPreview = {
    nodes: [
      { id: "N1", x: 0, y: 0, role: "support" },
      { id: "N2", x: 6, y: 0, role: "free" },
    ],
  } as TrussPreviewData;

  assert.deepEqual(trussReportNodesFromPreview(legacyPreview).map((node) => node.supportType), ["pinned", "free"]);
});
