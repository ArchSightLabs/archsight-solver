import assert from "node:assert/strict";
import test from "node:test";
import { modelCanvasLabelPolicy, shouldShowSteppedLabel } from "./model-canvas-label-policy.ts";

test("主控画布标签策略在对象数量可控时保持完整标注", () => {
  assert.deepEqual(modelCanvasLabelPolicy({
    nodeCount: 8,
    memberCount: 10,
    nodeVisibleTarget: 12,
    memberVisibleTarget: 14,
  }), {
    density: "normal",
    nodeLabelStep: 1,
    memberLabelStep: 1,
  });
});

test("主控画布标签策略在大模型下进入抽样密集模式", () => {
  assert.deepEqual(modelCanvasLabelPolicy({
    nodeCount: 20,
    memberCount: 31,
    nodeVisibleTarget: 12,
    memberVisibleTarget: 14,
  }), {
    density: "dense",
    nodeLabelStep: 2,
    memberLabelStep: 3,
  });
});

test("抽样标签始终保留边界、选中项和固定展示项", () => {
  assert.equal(shouldShowSteppedLabel({ index: 0, total: 20, step: 3 }), true);
  assert.equal(shouldShowSteppedLabel({ index: 19, total: 20, step: 3 }), true);
  assert.equal(shouldShowSteppedLabel({ index: 5, total: 20, step: 3, selected: true }), true);
  assert.equal(shouldShowSteppedLabel({ index: 5, total: 20, step: 3, pinned: true }), true);
  assert.equal(shouldShowSteppedLabel({ index: 5, total: 20, step: 3 }), false);
  assert.equal(shouldShowSteppedLabel({ index: 6, total: 20, step: 3 }), true);
});
