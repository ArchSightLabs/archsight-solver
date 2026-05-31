import assert from "node:assert/strict";
import test from "node:test";
import { RESULT_PREVIEW_BASE_SIZE, resultPreviewCanvasSize, resultPreviewSvgStyle } from "./result-preview-sizing.ts";

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

test("结果预览 SVG 使用实际像素尺寸以触发滚动", () => {
  assert.deepEqual(resultPreviewSvgStyle({ width: 1800, height: 720 }), {
    width: "1800px",
    height: "720px",
    maxWidth: "none",
  });
});
