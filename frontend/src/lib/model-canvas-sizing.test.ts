import assert from "node:assert/strict";
import test from "node:test";
import {
  BEAM_MODEL_CANVAS_BASE_SIZE,
  FRAME_MODEL_CANVAS_BASE_SIZE,
  TRUSS_MODEL_CANVAS_BASE_SIZE,
  modelCanvasBoardStyle,
  workbenchModelCanvasSize,
} from "./model-canvas-sizing.ts";
import { MAX_BEAM_SPANS, MAX_FRAME_MEMBERS, MAX_FRAME_NODES, MAX_TRUSS_MEMBERS, MAX_TRUSS_NODES } from "./solver-limits.ts";
import { createDefaultWorkspaceState } from "./workspace-state.ts";

test("默认三类模型保持基准画布尺寸", () => {
  const workspace = createDefaultWorkspaceState();

  assert.deepEqual(workbenchModelCanvasSize(workspace, "beam"), BEAM_MODEL_CANVAS_BASE_SIZE);
  assert.deepEqual(workbenchModelCanvasSize(workspace, "frame"), FRAME_MODEL_CANVAS_BASE_SIZE);
  assert.deepEqual(workbenchModelCanvasSize(workspace, "truss"), TRUSS_MODEL_CANVAS_BASE_SIZE);
});

test("梁系跨数和支座节点增多时扩大横向画布", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.beam.spans = Array.from({ length: 12 }, (_, index) => ({
    id: `(${index + 1})`,
    length: 4,
    E: 210,
    I: 4500,
    materialId: "q345",
  }));
  workspace.beam.supports = Array.from({ length: 13 }, (_, index) => ({
    id: `S${index + 1}`,
    x: index * 4,
    type: index === 0 ? "pinned" : index === 12 ? "roller" : "pinned",
    constraints: ["v"],
  }));

  const size = workbenchModelCanvasSize(workspace, "beam");

  assert.ok(size.width > BEAM_MODEL_CANVAS_BASE_SIZE.width);
  assert.equal(size.height, BEAM_MODEL_CANVAS_BASE_SIZE.height);
});

test("框架节点网格增多时同时扩大横向和竖向画布", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.frame.frameMode = "custom";
  workspace.frame.customNodes = Array.from({ length: 24 }, (_, index) => {
    const col = index % 8;
    const row = Math.floor(index / 8);
    return {
      id: `N${index + 1}`,
      x: col * 3,
      y: row * 3,
      supportType: row === 0 ? ("pinned" as const) : ("free" as const),
    };
  });
  workspace.frame.customMembers = Array.from({ length: 30 }, (_, index) => ({
    id: `M${index + 1}`,
    start: `N${(index % 23) + 1}`,
    end: `N${(index % 23) + 2}`,
    elementType: "frame" as const,
    materialId: "q345",
    E_GPa: 210,
    A_cm2: 240,
    I_cm4: 12000,
    kind: "beam",
  }));

  const size = workbenchModelCanvasSize(workspace, "frame");

  assert.ok(size.width > FRAME_MODEL_CANVAS_BASE_SIZE.width);
  assert.ok(size.height > FRAME_MODEL_CANVAS_BASE_SIZE.height);
});

test("桁架杆件数量增多时扩大主控画布", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.truss.customNodes = Array.from({ length: 18 }, (_, index) => ({
    id: `N${index + 1}`,
    x: (index % 9) * 2,
    y: Math.floor(index / 9) * 3,
    supportType: index < 2 ? ("pinned" as const) : ("free" as const),
  }));
  workspace.truss.customMembers = Array.from({ length: 28 }, (_, index) => ({
    id: `M${index + 1}`,
    start: `N${(index % 17) + 1}`,
    end: `N${(index % 17) + 2}`,
    elementType: "truss" as const,
    materialId: "q345",
    E_GPa: 210,
    A_cm2: 24,
    kind: "web",
  }));

  const size = workbenchModelCanvasSize(workspace, "truss");

  assert.ok(size.width > TRUSS_MODEL_CANVAS_BASE_SIZE.width);
  assert.ok(size.height > TRUSS_MODEL_CANVAS_BASE_SIZE.height);
});

test("接近系统上限的梁系长排模型继续扩大主控画布", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.beam.spans = Array.from({ length: MAX_BEAM_SPANS }, (_, index) => ({
    id: `B${index + 1}`,
    length: 4,
    E: 210,
    I: 4500,
    materialId: "q345",
  }));
  workspace.beam.supports = Array.from({ length: MAX_BEAM_SPANS + 1 }, (_, index) => ({
    id: `S${index + 1}`,
    x: index * 4,
    type: index === MAX_BEAM_SPANS ? "roller" : "pinned",
    constraints: ["v"],
  }));

  const size = workbenchModelCanvasSize(workspace, "beam");

  assert.ok(size.width > 20000);
  assert.equal(size.height, BEAM_MODEL_CANVAS_BASE_SIZE.height);
});

test("接近系统上限的框架和桁架长排模型继续扩大主控画布", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.frame.frameMode = "custom";
  workspace.frame.customNodes = Array.from({ length: MAX_FRAME_NODES }, (_, index) => ({
    id: `N${index + 1}`,
    x: index * 3,
    y: 0,
    supportType: index === 0 ? ("pinned" as const) : index === MAX_FRAME_NODES - 1 ? ("roller" as const) : ("free" as const),
  }));
  workspace.frame.customMembers = Array.from({ length: MAX_FRAME_MEMBERS }, (_, index) => {
    const startIndex = index % MAX_FRAME_NODES;
    const endIndex = (startIndex + 1) % MAX_FRAME_NODES;
    return {
      id: `M${index + 1}`,
      start: `N${startIndex + 1}`,
      end: `N${endIndex + 1}`,
      elementType: "frame" as const,
      materialId: "q345",
      E_GPa: 210,
      A_cm2: 240,
      I_cm4: 12000,
      kind: "beam",
    };
  });

  workspace.truss.customNodes = Array.from({ length: MAX_TRUSS_NODES }, (_, index) => ({
    id: `N${index + 1}`,
    x: index * 3,
    y: 0,
    supportType: index === 0 ? ("pinned" as const) : index === MAX_TRUSS_NODES - 1 ? ("roller" as const) : ("free" as const),
  }));
  workspace.truss.customMembers = Array.from({ length: MAX_TRUSS_MEMBERS }, (_, index) => {
    const startIndex = index % MAX_TRUSS_NODES;
    const endIndex = (startIndex + 1) % MAX_TRUSS_NODES;
    return {
      id: `M${index + 1}`,
      start: `N${startIndex + 1}`,
      end: `N${endIndex + 1}`,
      elementType: "truss" as const,
      materialId: "q345",
      E_GPa: 210,
      A_cm2: 24,
      kind: "web",
    };
  });

  const frameSize = workbenchModelCanvasSize(workspace, "frame");
  const trussSize = workbenchModelCanvasSize(workspace, "truss");

  assert.ok(frameSize.width > 20000);
  assert.ok(frameSize.height > FRAME_MODEL_CANVAS_BASE_SIZE.height);
  assert.ok(trussSize.width > 20000);
  assert.ok(trussSize.height > TRUSS_MODEL_CANVAS_BASE_SIZE.height);
});

test("画布缩放样式使用实际像素尺寸", () => {
  assert.deepEqual(modelCanvasBoardStyle({ width: 900, height: 360 }, 200), {
    width: "1800px",
    height: "720px",
    minWidth: "100%",
    minHeight: "100%",
  });
  assert.deepEqual(modelCanvasBoardStyle({ width: 900, height: 360 }, 70), {
    width: "630px",
    height: "252px",
    minWidth: undefined,
    minHeight: undefined,
  });
});

test("默认基准画布使用容器自适应样式避免初始滚动条", () => {
  assert.deepEqual(modelCanvasBoardStyle({ width: 900, height: 360 }, 100), {
    width: "100%",
    maxWidth: "900px",
    height: "auto",
    aspectRatio: "900 / 360",
    margin: "0 auto",
  });
  assert.deepEqual(modelCanvasBoardStyle({ width: 900, height: 300 }, 100), {
    width: "100%",
    maxWidth: "900px",
    height: "auto",
    aspectRatio: "900 / 300",
    margin: "0 auto",
  });
});

test("默认中等框架画布按容器宽高缩放避免宽屏纵向滚动条", () => {
  const style = modelCanvasBoardStyle({ width: 1080, height: 506 }, 100, { width: 1180, height: 372 });
  const width = Number.parseFloat(String(style.width));
  const height = Number.parseFloat(String(style.height));

  assert.equal(style.margin, "0 auto");
  assert.ok(width <= 1179);
  assert.ok(height <= 371);
  assert.ok(width > 0);
  assert.ok(height > 0);
});
