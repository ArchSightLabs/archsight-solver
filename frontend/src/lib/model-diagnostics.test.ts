import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBeamModelDiagnostics,
  buildFrameModelDiagnostics,
  buildModelDiagnostics,
  buildTrussModelDiagnostics,
} from "./model-diagnostics.ts";
import {
  createDefaultBeamWorkspaceState,
  createDefaultFrameWorkspaceState,
  createDefaultTrussWorkspaceState,
  createDefaultWorkspaceState,
} from "./workspace-state.ts";
import type { TrussWorkspaceState } from "../types/structure.ts";

function issueCodes(diagnostics: { issues: Array<{ code: string }> }) {
  return diagnostics.issues.map((item) => item.code);
}

test("三类默认模型求解前诊断为可计算", () => {
  assert.equal(buildBeamModelDiagnostics(createDefaultBeamWorkspaceState()).status, "ready");
  assert.equal(buildFrameModelDiagnostics(createDefaultFrameWorkspaceState()).status, "ready");
  assert.equal(buildTrussModelDiagnostics(createDefaultTrussWorkspaceState()).status, "ready");

  const workspace = createDefaultWorkspaceState();
  workspace.analysisMode = "truss";
  assert.equal(buildModelDiagnostics(workspace).status, "ready");
});

test("梁系诊断阻断缺失工况的荷载组合", () => {
  const workspace = createDefaultBeamWorkspaceState();
  workspace.customLoadCases = [{ id: "DL", title: "恒载", loads: [{ type: "uniform", qKnPerM: 8 }] }];
  workspace.customLoadCombinations = [{ id: "ULS1", title: "基本组合", factors: { LL: 1.5 } }];

  const diagnostics = buildBeamModelDiagnostics(workspace);

  assert.equal(diagnostics.status, "blocked");
  assert.ok(issueCodes(diagnostics).includes("LOAD_COMBINATION_UNKNOWN_CASE"));
});

test("梁系诊断按显式 constraints 判断竖向约束", () => {
  const workspace = createDefaultBeamWorkspaceState();
  workspace.supports = [{ id: "A", x: 0, type: "fixed", constraints: ["rz"], springs: [] }];

  const diagnostics = buildBeamModelDiagnostics(workspace);

  assert.equal(diagnostics.status, "blocked");
  assert.ok(issueCodes(diagnostics).includes("BEAM_NO_VERTICAL_RESTRAINT"));
});

test("平面框架诊断阻断支座约束不足并提示自由孤立节点", () => {
  const workspace = createDefaultFrameWorkspaceState();
  workspace.frameMode = "custom";
  workspace.customNodes = [
    { id: "N1", x: 0, y: 0, supportType: "pinned" },
    { id: "N2", x: 4, y: 0, supportType: "free" },
    { id: "N3", x: 2, y: 2, supportType: "free" },
  ];
  workspace.customMembers = [
    { id: "B1", start: "N1", end: "N2", E_GPa: 210, A_cm2: 120, I_cm4: 8000, kind: "beam" },
  ];
  workspace.customLoads = [];

  const diagnostics = buildFrameModelDiagnostics(workspace);

  assert.equal(diagnostics.status, "blocked");
  assert.ok(issueCodes(diagnostics).includes("FRAME_UNSTABLE_SUPPORTS"));
  assert.ok(issueCodes(diagnostics).includes("STRUCTURE_ISOLATED_FREE_NODE"));
});

test("规则框架诊断覆盖模板支座和刚度异常", () => {
  const workspace = createDefaultFrameWorkspaceState();
  workspace.frameMode = "portal_frame";
  workspace.leftSupport = "free";
  workspace.rightSupport = "free";
  workspace.beamI = 0;

  const diagnostics = buildFrameModelDiagnostics(workspace);

  assert.equal(diagnostics.status, "blocked");
  assert.ok(issueCodes(diagnostics).includes("FRAME_TEMPLATE_STIFFNESS_INVALID"));
  assert.ok(issueCodes(diagnostics).includes("FRAME_UNSTABLE_SUPPORTS"));
});

test("平面桁架诊断阻断不适用字段和缺失工况引用", () => {
  const workspace = createDefaultTrussWorkspaceState();
  workspace.customNodes = [
    { id: "N1", x: 0, y: 0, supportType: "pinned", supportAngleDeg: 45 } as unknown as TrussWorkspaceState["customNodes"][number],
    { id: "N2", x: 4, y: 0, supportType: "roller" },
  ];
  workspace.customMembers = [
    { id: "M1", start: "N1", end: "N2", E_GPa: 210, A_cm2: 24, kind: "generic" },
  ];
  workspace.customLoads = [];
  workspace.customLoadCases = [{ id: "VL", title: "竖向荷载", loads: [{ type: "nodal", node: "N2", fyKn: -10 }] }];
  workspace.customLoadCombinations = [{ id: "COMB1", title: "基本组合", factors: { WL: 1 } }];

  const diagnostics = buildTrussModelDiagnostics(workspace);

  assert.equal(diagnostics.status, "blocked");
  assert.ok(issueCodes(diagnostics).includes("TRUSS_UNSUPPORTED_NODE_FIELD"));
  assert.ok(issueCodes(diagnostics).includes("LOAD_COMBINATION_UNKNOWN_CASE"));
});
