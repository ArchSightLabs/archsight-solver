import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveNodePairAfterEndChange,
  resolveNodePairAfterStartChange,
  resolveNodePairConnection,
} from "./node-pair-connection.ts";

test("节点对连接会在已选节点失效后回退到有效起终点", () => {
  const resolved = resolveNodePairConnection({
    nodeIds: ["N2", "N3"],
    startNodeId: "N1",
    endNodeId: "N3",
  });

  assert.deepEqual(resolved, {
    startNodeId: "N2",
    endNodeId: "N3",
    disabledReason: undefined,
  });
});

test("节点对连接在节点不足时给出统一禁用原因", () => {
  const resolved = resolveNodePairConnection({
    nodeIds: ["N1"],
    startNodeId: "N1",
    endNodeId: "",
  });

  assert.equal(resolved.startNodeId, "N1");
  assert.equal(resolved.endNodeId, "");
  assert.equal(resolved.disabledReason, "至少需要 2 个节点");
});

test("节点对连接会识别重复连接并使用业务侧原因", () => {
  const resolved = resolveNodePairConnection({
    nodeIds: ["N1", "N2", "N3"],
    startNodeId: "N2",
    endNodeId: "N1",
    duplicateExists: (startNodeId, endNodeId) => startNodeId === "N2" && endNodeId === "N1",
    duplicateReason: "两节点间已有构件",
  });

  assert.equal(resolved.disabledReason, "两节点间已有构件");
});

test("切换起点时若撞到终点，会自动选择另一个节点作为终点", () => {
  const next = resolveNodePairAfterStartChange({
    nodeIds: ["N1", "N2", "N3"],
    nextStartNodeId: "N2",
    currentEndNodeId: "N2",
  });

  assert.deepEqual(next, {
    startNodeId: "N2",
    endNodeId: "N1",
  });
});

test("切换终点时若撞到起点，会自动选择另一个节点作为起点", () => {
  const next = resolveNodePairAfterEndChange({
    nodeIds: ["N1", "N2", "N3"],
    currentStartNodeId: "N3",
    nextEndNodeId: "N3",
  });

  assert.deepEqual(next, {
    startNodeId: "N1",
    endNodeId: "N3",
  });
});
