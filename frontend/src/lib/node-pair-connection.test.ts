import test from "node:test";
import assert from "node:assert/strict";

import {
  findNextAvailableNodePair,
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

test("新增连接后会推进到下一组尚未连接的节点对", () => {
  const existingPairs = new Set(["N1-N2", "N1-N3"]);
  const next = findNextAvailableNodePair({
    nodeIds: ["N1", "N2", "N3", "N4"],
    startNodeId: "N1",
    endNodeId: "N2",
    duplicateExists: (startNodeId, endNodeId) => existingPairs.has(`${startNodeId}-${endNodeId}`),
  });

  assert.deepEqual(next, {
    startNodeId: "N1",
    endNodeId: "N4",
  });
});

test("当前节点对不在模型中时，会从第一组可用节点对开始选择", () => {
  const existingPairs = new Set(["N1-N2", "N1-N3"]);
  const next = findNextAvailableNodePair({
    nodeIds: ["N1", "N2", "N3", "N4"],
    startNodeId: "",
    endNodeId: "",
    duplicateExists: (startNodeId, endNodeId) => existingPairs.has(`${startNodeId}-${endNodeId}`),
  });

  assert.deepEqual(next, {
    startNodeId: "N1",
    endNodeId: "N4",
  });
});

test("新增连接后若后续节点对均已连接，会回到前面可用节点对", () => {
  const existingPairs = new Set(["N1-N3", "N2-N3"]);
  const next = findNextAvailableNodePair({
    nodeIds: ["N1", "N2", "N3"],
    startNodeId: "N2",
    endNodeId: "N3",
    duplicateExists: (startNodeId, endNodeId) => existingPairs.has(`${startNodeId}-${endNodeId}`),
  });

  assert.deepEqual(next, {
    startNodeId: "N1",
    endNodeId: "N2",
  });
});

test("所有节点对均已连接时不再强行选择下一组连接", () => {
  const next = findNextAvailableNodePair({
    nodeIds: ["N1", "N2", "N3"],
    startNodeId: "N1",
    endNodeId: "N2",
    duplicateExists: () => true,
  });

  assert.equal(next, undefined);
});
