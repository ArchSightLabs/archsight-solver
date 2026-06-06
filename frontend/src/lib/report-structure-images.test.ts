import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFrameOverlayGraphics,
  buildFramePreviewGraphics,
  buildFrameSupportMarkerGraphics,
  buildTrussOverlayGraphics,
  buildTrussPreviewGraphics,
  frameReportCanvasSize,
  frameReportNodesFromPreview,
  trussReportCanvasSize,
  trussReportNodesFromPreview,
} from "./report-structure-images.ts";
import type { FrameCalculationResults, FramePreviewData, TrussCalculationResults, TrussPreviewData } from "../types/structure.ts";
import { REPORT_IMAGE_BASE_SIZE, type ReportGraphic } from "./report-structure-graphics.ts";

function graphicTexts(graphics: ReportGraphic[]): string[] {
  return graphics.flatMap((graphic) => {
    const style = graphic.style as { text?: unknown } | undefined;
    return typeof style?.text === "string" ? [style.text] : [];
  });
}

function assertGraphicText(graphics: ReportGraphic[], expected: string): void {
  const texts = graphicTexts(graphics);
  assert.ok(
    texts.some((text) => text.includes(expected)),
    `缺少图形文字：${expected}\n实际文字：${texts.join(" | ")}`,
  );
}

function assertSomeGraphicText(graphics: ReportGraphic[], pattern: RegExp): void {
  const texts = graphicTexts(graphics);
  assert.ok(
    texts.some((text) => pattern.test(text)),
    `缺少匹配图形文字：${pattern}\n实际文字：${texts.join(" | ")}`,
  );
}

function backgroundShape(graphics: ReportGraphic[]): { width: number; height: number } {
  const shape = graphics[0]?.shape as { width?: unknown; height?: unknown } | undefined;
  return {
    width: Number(shape?.width ?? 0),
    height: Number(shape?.height ?? 0),
  };
}

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

test("框架计算书图形保留滚动支座法向角", () => {
  const preview = {
    analysisType: "frame",
    structureType: "explicit",
    structureTypeLabel: "二维平面框架",
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "roller", supportAngleDeg: 45 },
      { id: "N2", x: 4, y: 0, supportType: "free" },
    ],
    members: [],
    loads: [],
    nodeResults: [],
    memberResults: [],
    memberDiagrams: [],
    deformedNodes: [],
    deformationScale: 1,
    summary: {
      maxDisplacementMm: 0,
      maxVerticalMm: 0,
      maxRotationDeg: 0,
      status: "合格",
    },
    warnings: [],
  } satisfies FramePreviewData;

  assert.equal(frameReportNodesFromPreview(preview)[0]?.supportAngleDeg, 45);

  const defaultMarker = buildFrameSupportMarkerGraphics("roller", { x: 100, y: 100 });
  const inclinedMarker = buildFrameSupportMarkerGraphics("roller", { x: 100, y: 100 }, 45);
  const defaultBaseLine = defaultMarker[1]?.shape as { y1: number; y2: number };
  const inclinedBaseLine = inclinedMarker[1]?.shape as { y1: number; y2: number };

  assert.equal(defaultMarker.length, inclinedMarker.length);
  assert.equal(defaultBaseLine.y1, defaultBaseLine.y2);
  assert.notEqual(Math.round(inclinedBaseLine.y1), Math.round(inclinedBaseLine.y2));
});

test("框架计算书预览图保留节点构件编号尺寸和荷载标注", () => {
  const results = {
    analysisType: "frame",
    frame: {
      analysisType: "frame",
      structureType: "explicit",
      structureTypeLabel: "二维平面框架",
      nodes: [
        { id: "N1", x: 0, y: 0, supportType: "fixed" },
        { id: "N2", x: 6, y: 0, supportType: "fixed" },
        { id: "N3", x: 0, y: 4, supportType: "free" },
        { id: "N4", x: 6, y: 4, supportType: "free" },
      ],
      members: [
        { id: "C1", start: "N1", end: "N3", kind: "column" },
        { id: "B1", start: "N3", end: "N4", kind: "beam" },
        { id: "C2", start: "N2", end: "N4", kind: "column" },
      ],
      loads: [
        { type: "distributed", member: "B1", wyKnPerM: -18, direction: "global_y" },
        { type: "nodal", node: "N4", fxKn: -24 },
      ],
      deformedNodes: [
        { nodeId: "N1", x: 0, y: 0 },
        { nodeId: "N2", x: 6, y: 0 },
        { nodeId: "N3", x: 0.12, y: 3.98 },
        { nodeId: "N4", x: 6.1, y: 3.96 },
      ],
    },
  } as unknown as FrameCalculationResults;

  const graphics = buildFramePreviewGraphics(results);

  assertGraphicText(graphics, "平面框架受力变形示意");
  assertGraphicText(graphics, "N1");
  assertGraphicText(graphics, "N4");
  assertGraphicText(graphics, "C1");
  assertGraphicText(graphics, "B1");
  assertGraphicText(graphics, "C1=C2=4 m");
  assertGraphicText(graphics, "B1=6 m");
  assertSomeGraphicText(graphics, /q\d+=18\.0 kN\/m/u);
  assertSomeGraphicText(graphics, /F\d+=24\.0 kN/u);
});

test("框架计算书预览图随大模型扩展画布并压缩等长构件图例", () => {
  const cols = 10;
  const rows = 3;
  const nodes = Array.from({ length: cols * rows }, (_, index) => ({
    id: `N${index + 1}`,
    x: (index % cols) * 3,
    y: Math.floor(index / cols) * 3,
    supportType: index < cols ? "pinned" : "free",
  }));
  const members = [
    ...Array.from({ length: rows }).flatMap((_, row) =>
      Array.from({ length: cols - 1 }, (_, col) => ({
        id: `M${row * (cols - 1) + col + 1}`,
        start: `N${row * cols + col + 1}`,
        end: `N${row * cols + col + 2}`,
      })),
    ),
    ...Array.from({ length: rows - 1 }).flatMap((_, row) =>
      Array.from({ length: cols }, (_, col) => {
        const id = rows * (cols - 1) + row * cols + col + 1;
        return {
          id: `M${id}`,
          start: `N${row * cols + col + 1}`,
          end: `N${(row + 1) * cols + col + 1}`,
        };
      }),
    ),
  ];
  const frame = {
    analysisType: "frame",
    structureType: "explicit",
    structureTypeLabel: "二维平面框架",
    nodes,
    members,
    loads: [],
    deformedNodes: nodes.map((node) => ({ nodeId: node.id, x: node.x, y: node.y })),
  };
  const results = { analysisType: "frame", frame } as unknown as FrameCalculationResults;

  const canvasSize = frameReportCanvasSize(frame as unknown as NonNullable<FrameCalculationResults["frame"]>);
  const graphics = buildFramePreviewGraphics(results);

  assert.ok(canvasSize.width > REPORT_IMAGE_BASE_SIZE.width);
  assert.ok(canvasSize.height > REPORT_IMAGE_BASE_SIZE.height);
  assert.deepEqual(backgroundShape(graphics), canvasSize);
  assertGraphicText(graphics, "M1=M2=M3=M4=3 m");
  assertGraphicText(graphics, "M45=M46=M47=3 m");
});

test("框架计算书叠加图保留结果图名称控制值和模型编号", () => {
  const results = {
    analysisType: "frame",
    frame: {
      analysisType: "frame",
      structureType: "explicit",
      structureTypeLabel: "二维平面框架",
      nodes: [
        { id: "N1", x: 0, y: 0, supportType: "fixed" },
        { id: "N2", x: 6, y: 0, supportType: "fixed" },
        { id: "N3", x: 0, y: 4, supportType: "free" },
        { id: "N4", x: 6, y: 4, supportType: "free" },
      ],
      members: [
        { id: "C1", start: "N1", end: "N3", kind: "column" },
        { id: "B1", start: "N3", end: "N4", kind: "beam" },
        { id: "C2", start: "N2", end: "N4", kind: "column" },
      ],
      loads: [],
      deformedNodes: [],
    },
    memberDiagrams: [
      { memberId: "C1", stations: [0, 1], stationsM: [0, 4], axialKn: [4, 4], shearKn: [2, -2], momentKnM: [0, 12], deflectionMm: [0, 0.2] },
      { memberId: "B1", stations: [0, 0.5, 1], stationsM: [0, 3, 6], axialKn: [0, 0, 0], shearKn: [18, 0, -18], momentKnM: [0, 42.908, 0], deflectionMm: [0, -2.32, 0] },
      { memberId: "C2", stations: [0, 1], stationsM: [0, 4], axialKn: [6, 6], shearKn: [3, -3], momentKnM: [0, 10], deflectionMm: [0, 0.1] },
    ],
  } as unknown as FrameCalculationResults;

  const graphics = buildFrameOverlayGraphics(results, "momentKnM");

  assertGraphicText(graphics, "平面框架 弯矩图（模型叠加）");
  assertGraphicText(graphics, "N1");
  assertGraphicText(graphics, "C1");
  assertGraphicText(graphics, "B1");
  assertGraphicText(graphics, "42.91 kN·m\nB1 / 3.00 m");
});

test("桁架计算书图形保留节点杆件编号尺寸和轴力控制标注", () => {
  const truss = {
    analysisType: "truss",
    structureType: "explicit",
    structureTypeLabel: "二维平面桁架",
    nodes: [
      { id: "N1", x: 0, y: 0, role: "support", supportType: "pinned" },
      { id: "N2", x: 4, y: 0, role: "support", supportType: "roller" },
      { id: "N3", x: 2, y: 3, role: "free", supportType: "free" },
    ],
    members: [
      { id: "R1", start: "N1", end: "N2" },
      { id: "R2", start: "N1", end: "N3" },
      { id: "R3", start: "N2", end: "N3" },
    ],
    loads: [{ type: "nodal", node: "N3", fyKn: -20 }],
    nodeResults: [
      { nodeId: "N1", x: 0, y: 0, uxMm: 0, uyMm: 0, displacementMm: 0, rxKn: 0, ryKn: 10, supportType: "pinned" },
      { nodeId: "N2", x: 4, y: 0, uxMm: 0, uyMm: 0, displacementMm: 0, rxKn: 0, ryKn: 10, supportType: "roller" },
      { nodeId: "N3", x: 2, y: 3, uxMm: 0.4, uyMm: -1.2, displacementMm: 1.265, rxKn: 0, ryKn: 0, supportType: "free" },
    ],
    memberResults: [
      { memberId: "R1", axialForceKn: 8 },
      { memberId: "R2", axialForceKn: -25 },
      { memberId: "R3", axialForceKn: 18 },
    ],
    deformedNodes: [
      { id: "N1", x: 0, y: 0, uxMm: 0, uyMm: 0 },
      { id: "N2", x: 4, y: 0, uxMm: 0, uyMm: 0 },
      { id: "N3", x: 2.12, y: 2.86, uxMm: 0.4, uyMm: -1.2 },
    ],
  };
  const results = {
    analysisType: "truss",
    truss,
    preview: truss,
    nodeResults: truss.nodeResults,
    memberResults: truss.memberResults,
  } as unknown as TrussCalculationResults;

  const previewGraphics = buildTrussPreviewGraphics(results);
  const overlayGraphics = buildTrussOverlayGraphics(results, "axial");

  assertGraphicText(previewGraphics, "平面桁架受力变形示意");
  assertGraphicText(previewGraphics, "N1");
  assertGraphicText(previewGraphics, "N3");
  assertGraphicText(previewGraphics, "R1");
  assertSomeGraphicText(previewGraphics, /R1=4 m/u);
  assertGraphicText(previewGraphics, "竖向荷载 20.0 kN");
  assertGraphicText(overlayGraphics, "平面桁架 杆件轴力图（模型叠加）");
  assertGraphicText(overlayGraphics, "-25.00 kN\nR2");
});

test("桁架计算书预览图随大模型扩展画布并压缩等长杆件图例", () => {
  const cols = 10;
  const rows = 3;
  const nodes = Array.from({ length: cols * rows }, (_, index) => ({
    id: `N${index + 1}`,
    x: (index % cols) * 3,
    y: Math.floor(index / cols) * 3,
    role: index < cols ? "support" : "free",
    supportType: index < cols ? "pinned" : "free",
  }));
  const members = [
    ...Array.from({ length: rows }).flatMap((_, row) =>
      Array.from({ length: cols - 1 }, (_, col) => ({
        id: `M${row * (cols - 1) + col + 1}`,
        start: `N${row * cols + col + 1}`,
        end: `N${row * cols + col + 2}`,
      })),
    ),
    ...Array.from({ length: rows - 1 }).flatMap((_, row) =>
      Array.from({ length: cols }, (_, col) => {
        const id = rows * (cols - 1) + row * cols + col + 1;
        return {
          id: `M${id}`,
          start: `N${row * cols + col + 1}`,
          end: `N${(row + 1) * cols + col + 1}`,
        };
      }),
    ),
  ];
  const truss = {
    analysisType: "truss",
    structureType: "explicit",
    structureTypeLabel: "二维平面桁架",
    nodes,
    members,
    loads: [],
    nodeResults: [],
    memberResults: [],
    deformedNodes: nodes.map((node) => ({ id: node.id, x: node.x, y: node.y, uxMm: 0, uyMm: 0 })),
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
  };
  const results = { analysisType: "truss", truss, preview: truss, nodeResults: [], memberResults: [] } as unknown as TrussCalculationResults;

  const canvasSize = trussReportCanvasSize(truss as unknown as NonNullable<TrussCalculationResults["truss"]>);
  const graphics = buildTrussPreviewGraphics(results);

  assert.ok(canvasSize.width > REPORT_IMAGE_BASE_SIZE.width);
  assert.ok(canvasSize.height > REPORT_IMAGE_BASE_SIZE.height);
  assert.deepEqual(backgroundShape(graphics), canvasSize);
  assertGraphicText(graphics, "M1=M2=M3=M4=3 m");
  assertGraphicText(graphics, "M45=M46=M47=3 m");
});
