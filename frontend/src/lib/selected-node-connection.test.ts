import { strict as assert } from "node:assert";
import test from "node:test";
import { connectableNodeOptionsForNode, resolveSelectedNodeConnectionTarget } from "./selected-node-connection.ts";

const NODE_OPTIONS = [
  { value: "N1", label: "N1" },
  { value: "N2", label: "N2" },
  { value: "N3", label: "N3" },
];

test("选中节点连接入口排除自身和已连接节点对", () => {
  const options = connectableNodeOptionsForNode({
    currentNodeId: "N1",
    nodeOptions: NODE_OPTIONS,
    duplicateExists: (startNodeId, endNodeId) => startNodeId === "N1" && endNodeId === "N2",
  });

  assert.deepEqual(options, [{ value: "N3", label: "N3" }]);
});

test("选中节点连接目标失效后回退到第一组可连接节点", () => {
  const targetId = resolveSelectedNodeConnectionTarget({
    currentNodeId: "N1",
    currentTargetId: "N2",
    nodeOptions: NODE_OPTIONS,
    duplicateExists: (startNodeId, endNodeId) => startNodeId === "N1" && endNodeId === "N2",
  });

  assert.equal(targetId, "N3");
});

test("选中节点没有可连接目标时返回空值", () => {
  const targetId = resolveSelectedNodeConnectionTarget({
    currentNodeId: "N1",
    currentTargetId: "N2",
    nodeOptions: NODE_OPTIONS.slice(0, 2),
    duplicateExists: () => true,
  });

  assert.equal(targetId, "");
});
