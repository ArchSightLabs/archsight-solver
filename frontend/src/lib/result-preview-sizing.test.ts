import assert from "node:assert/strict";
import test from "node:test";
import { RESULT_PREVIEW_BASE_SIZE, fitResultPreviewPoints, resultPreviewCanvasSize, resultPreviewSvgStyle } from "./result-preview-sizing.ts";

test("默认结果预览画布保持基准尺寸", () => {
  const size = resultPreviewCanvasSize(
    [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 0, y: 4 },
      { x: 6, y: 4 },
    ],
    3,
  );

  assert.deepEqual(size, RESULT_PREVIEW_BASE_SIZE);
});

test("大节点网格结果预览扩展横向和竖向画布", () => {
  const nodes = Array.from({ length: 30 }, (_, index) => ({
    x: (index % 10) * 3,
    y: Math.floor(index / 10) * 3,
  }));

  const size = resultPreviewCanvasSize(nodes, 42);

  assert.ok(size.width > RESULT_PREVIEW_BASE_SIZE.width);
  assert.ok(size.height > RESULT_PREVIEW_BASE_SIZE.height);
});

test("默认结果预览 SVG 按容器自适应避免初始滚动条", () => {
  assert.deepEqual(resultPreviewSvgStyle(RESULT_PREVIEW_BASE_SIZE), {
    width: "100%",
    height: "auto",
    maxWidth: "1000px",
    margin: "0 auto",
  });
});

test("扩展结果预览 SVG 默认响应式完整适配避免内嵌滚动", () => {
  assert.deepEqual(resultPreviewSvgStyle({ width: 1800, height: 720 }), {
    width: "100%",
    height: "auto",
    maxWidth: "1800px",
    margin: "0 auto",
  });
});

test("短跨水平模型按真实边界铺满并在图面垂直居中", () => {
  const layout = fitResultPreviewPoints(
    [
      { x: 0, y: 0 },
      { x: 0.33, y: 0 },
    ],
    RESULT_PREVIEW_BASE_SIZE,
    { left: 70, right: 70, top: 70, bottom: 70 },
  );
  const start = layout.map({ x: 0, y: 0 });
  const end = layout.map({ x: 0.33, y: 0 });

  assert.ok(end.x - start.x > 800);
  assert.ok(Math.abs(start.y - RESULT_PREVIEW_BASE_SIZE.height / 2) < 1);
  assert.ok(Math.abs(end.y - RESULT_PREVIEW_BASE_SIZE.height / 2) < 1);
});

test("纯竖向模型按真实边界铺满并在图面水平居中", () => {
  const layout = fitResultPreviewPoints(
    [
      { x: 4, y: 0 },
      { x: 4, y: 0.5 },
    ],
    RESULT_PREVIEW_BASE_SIZE,
    { left: 70, right: 70, top: 70, bottom: 70 },
  );
  const bottom = layout.map({ x: 4, y: 0 });
  const top = layout.map({ x: 4, y: 0.5 });

  assert.ok(bottom.y - top.y > 390);
  assert.ok(Math.abs(bottom.x - RESULT_PREVIEW_BASE_SIZE.width / 2) < 1);
  assert.ok(Math.abs(top.x - RESULT_PREVIEW_BASE_SIZE.width / 2) < 1);
});
