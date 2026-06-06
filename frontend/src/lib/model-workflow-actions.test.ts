import assert from "node:assert/strict";
import test from "node:test";
import {
  applyModelGeometryAction,
  deleteModelSelections,
  modelGeometryToolbarState,
  moveModelCanvasNode,
} from "./model-workflow-actions.ts";
import { createDefaultWorkspaceState } from "./workspace-state.ts";

test("两节点多选连接在框架中新增构件而不是新增节点", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.analysisMode = "frame";
  const previousNodeCount = workspace.frame.customNodes.length;
  const previousMemberCount = workspace.frame.customMembers.length;

  const result = applyModelGeometryAction({
    workspace,
    selection: { mode: "frame", type: "node", id: "N4" },
    selectionSet: [
      { mode: "frame", type: "node", id: "N1" },
      { mode: "frame", type: "node", id: "N4" },
    ],
    action: "add-connected-node",
    materialLibrary: [],
  });

  assert.ok(result);
  assert.equal(result.workspace.frame.customNodes.length, previousNodeCount);
  assert.equal(result.workspace.frame.customMembers.length, previousMemberCount + 1);
  assert.ok(result.workspace.frame.customMembers.some((member) => member.start === "N1" && member.end === "N4"));
  assert.deepEqual(result.selection, { mode: "frame", type: "member", id: "M1" });
});

test("两节点多选连接在桁架中新增杆件并切换工具栏语义", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.analysisMode = "truss";
  const selectionSet = [
    { mode: "truss", type: "node", id: "N1" },
    { mode: "truss", type: "node", id: "N2" },
  ] as const;

  const toolbar = modelGeometryToolbarState(workspace, selectionSet[1], [...selectionSet]);
  assert.equal(toolbar?.connectsSelectedNodes, true);
  assert.equal(toolbar?.addConnectedNodeLabel, "连接所选杆件");

  const result = applyModelGeometryAction({
    workspace,
    selection: selectionSet[1],
    selectionSet: [...selectionSet],
    action: "add-connected-node",
    materialLibrary: [],
  });

  assert.ok(result);
  assert.ok(result.workspace.truss.customMembers.some((member) => member.start === "N1" && member.end === "N2"));
  assert.deepEqual(result.selection, { mode: "truss", type: "member", id: "M6" });
});

test("画布拖动节点只更新目标节点坐标", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.analysisMode = "frame";

  const result = moveModelCanvasNode({
    workspace,
    mode: "frame",
    nodeId: "N3",
    point: { x: 1.23456, y: 5.67891 },
  });

  assert.ok(result);
  const moved = result.workspace.frame.customNodes.find((node) => node.id === "N3");
  const untouched = result.workspace.frame.customNodes.find((node) => node.id === "N4");
  assert.equal(moved?.x, 1.235);
  assert.equal(moved?.y, 5.679);
  assert.equal(untouched?.x, 6);
  assert.equal(untouched?.y, 4);
});

test("Delete 删除桁架节点会级联删除相连杆件和节点荷载", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.analysisMode = "truss";

  const result = deleteModelSelections({
    workspace,
    selections: [{ mode: "truss", type: "node", id: "N3" }],
  });

  assert.ok(result);
  assert.equal(result.workspace.truss.customNodes.some((node) => node.id === "N3"), false);
  assert.equal(result.workspace.truss.customMembers.some((member) => member.start === "N3" || member.end === "N3"), false);
  assert.equal(result.workspace.truss.customLoads.some((load) => load.type === "nodal" && load.node === "N3"), false);
});
