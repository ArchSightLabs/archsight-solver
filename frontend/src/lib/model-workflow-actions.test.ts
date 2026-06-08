import assert from "node:assert/strict";
import test from "node:test";
import {
  applyModelGeometryAction,
  deleteModelSelections,
  modelGeometryToolbarState,
  moveModelCanvasNode,
} from "./model-workflow-actions.ts";
import { MAX_BEAM_SPANS } from "./solver-limits.ts";
import { createDefaultBeamSupports, createDefaultWorkspaceState } from "./workspace-state.ts";
import { workbenchSelectionFromCanvasDataset } from "./workbench-selection-utils.ts";

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

test("梁系画布节点数据集可解析为工作台选择", () => {
  const selection = workbenchSelectionFromCanvasDataset({
    canvasMode: "beam",
    canvasType: "node",
    canvasId: "node-1",
  } as globalThis.DOMStringMap);

  assert.deepEqual(selection, { mode: "beam", type: "node", id: "node-1" });
});

test("梁系内部节点拖拽同步相邻跨长和支座边界", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.analysisMode = "beam";

  const result = moveModelCanvasNode({
    workspace,
    mode: "beam",
    nodeId: "node-1",
    point: { x: 5.25, y: 100 },
  });

  assert.ok(result);
  assert.deepEqual(result.workspace.beam.spans.map((span) => span.length), [5.25, 2.75]);
  assert.deepEqual(result.workspace.beam.supports.map((support) => support.x), [0, 5.25, 8]);
  assert.deepEqual(result.selection, { mode: "beam", type: "node", id: "node-1" });
});

test("梁系端点节点不执行跨长拖拽", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.analysisMode = "beam";

  assert.equal(moveModelCanvasNode({
    workspace,
    mode: "beam",
    nodeId: "node-0",
    point: { x: 1, y: 0 },
  }), null);
});

test("梁系画布增加跨段使用统一跨数上限", () => {
  const workspace = createDefaultWorkspaceState();
  workspace.analysisMode = "beam";
  const initialSpanCount = Math.min(12, MAX_BEAM_SPANS - 1);
  workspace.beam.spans = Array.from({ length: initialSpanCount }, (_, index) => ({
    id: `(${index + 1})`,
    length: 4,
    E: 210,
    I: 4500,
    materialId: "q345",
  }));
  workspace.beam.supports = createDefaultBeamSupports("continuous", workspace.beam.spans);

  const result = applyModelGeometryAction({
    workspace,
    action: "add-connected-node",
    materialLibrary: [],
  });

  assert.ok(result);
  assert.equal(result.workspace.beam.spans.length, initialSpanCount + 1);
  assert.equal(result.workspace.beam.supports.at(-1)?.x, (initialSpanCount + 1) * 4);
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
