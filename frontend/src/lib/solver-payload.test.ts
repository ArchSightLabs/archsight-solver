import assert from "node:assert/strict";
import test from "node:test";
import { buildBeamPayload, buildFramePayload, buildTrussPayload, validateCustomFrameWorkspace, validateCustomTrussWorkspace } from "../solver-payload.ts";
import { cloneFrameWorkspaceState, createDefaultBeamWorkspaceState, createDefaultFrameWorkspaceState, createDefaultTrussWorkspaceState, normalizeFrameWorkspaceState } from "./workspace-state.ts";
import type { FrameWorkspaceState, TrussWorkspaceState } from "../types/structure.ts";

test("buildBeamPayload serializes configurable load inputs", () => {
  const workspace = createDefaultBeamWorkspaceState();
  workspace.beamType = "continuous";
  workspace.spans = [{ length: 4, E: 210, I: 4500 }];
  workspace.loadType = "linear";
  workspace.uniformLoadEnabled = false;
  workspace.linearLoadEnabled = true;
  workspace.distributedLoadStart = 8;
  workspace.distributedLoadEnd = 15;
  workspace.distributedLoadStartRatio = 0.2;
  workspace.distributedLoadEndRatio = 0.9;
  workspace.supports = [
    { id: "S1", x: 0, type: "fixed" },
    { id: "S2", x: 4, type: "roller" },
  ];

  const payload = buildBeamPayload(workspace);

  assert.equal(payload.analysisType, "beam");
  assert.equal(payload.loadType, "linear");
  assert.deepEqual(payload.loads, [{ type: "linear", qStartKnPerM: 8, qEndKnPerM: 15, start: 0.8, end: 3.6 }]);
  assert.equal(payload.distributedLoadStart, 8);
  assert.equal(payload.distributedLoadEnd, 15);
  assert.equal(payload.distributedLoadStartRatio, 0.2);
  assert.equal(payload.distributedLoadEndRatio, 0.9);
  assert.equal(payload.spanProperties?.length, workspace.spans.length);
  assert.deepEqual(payload.supports, [
    { id: "S1", x: 0, type: "fixed", constraints: undefined, springs: undefined },
    { id: "S2", x: 4, type: "roller", constraints: undefined, springs: undefined },
  ]);
});

test("buildBeamPayload serializes superposed distributed and point loads", () => {
  const workspace = createDefaultBeamWorkspaceState();
  workspace.spans = [{ length: 8, E: 210, I: 4500 }];
  workspace.uniformLoadEnabled = true;
  workspace.linearLoadEnabled = true;
  workspace.q = 4;
  workspace.distributedLoadStart = 2;
  workspace.distributedLoadEnd = 6;
  workspace.distributedLoadStartRatio = 0.25;
  workspace.distributedLoadEndRatio = 0.75;
  workspace.pointLoads = [
    { id: "P1", magnitudeKn: 12, positionRatio: 0.25 },
    { id: "P2", magnitudeKn: 8, positionRatio: 0.75 },
  ];

  const payload = buildBeamPayload(workspace);

  assert.equal(payload.loadType, "combined");
  assert.deepEqual(payload.loads, [
    { type: "uniform", qKnPerM: 4 },
    { type: "linear", qStartKnPerM: 2, qEndKnPerM: 6, start: 2, end: 6 },
    { type: "point", pointLoadKn: 12, x: 2 },
    { type: "point", pointLoadKn: 8, x: 6 },
  ]);
});

test("buildBeamPayload serializes partial uniform beam load range", () => {
  const workspace = createDefaultBeamWorkspaceState();
  workspace.spans = [{ length: 8, E: 210, I: 4500 }];
  workspace.uniformLoadEnabled = true;
  workspace.linearLoadEnabled = false;
  workspace.pointLoads = [];
  workspace.q = 5;
  workspace.uniformLoadStartRatio = 0.25;
  workspace.uniformLoadEndRatio = 0.75;

  const payload = buildBeamPayload(workspace);

  assert.equal(payload.loadType, "uniform");
  assert.deepEqual(payload.loads, [{ type: "uniform", qKnPerM: 5, start: 2, end: 6 }]);
});

test("buildBeamPayload serializes multiple linear beam loads", () => {
  const workspace = createDefaultBeamWorkspaceState();
  workspace.spans = [{ length: 4, E: 210, I: 4500 }, { length: 5, E: 210, I: 4500 }, { length: 4, E: 210, I: 4500 }];
  workspace.uniformLoadEnabled = false;
  workspace.linearLoadEnabled = true;
  workspace.linearLoads = [
    { id: "L1", qStartKnPerM: 6, qEndKnPerM: 18, startRatio: 0.15, endRatio: 0.85 },
    { id: "L2", qStartKnPerM: 12, qEndKnPerM: 18, startRatio: 0.3, endRatio: 0.6 },
  ];

  const payload = buildBeamPayload(workspace);

  assert.equal(payload.loadType, "combined");
  assert.deepEqual(payload.loads, [
    { type: "linear", qStartKnPerM: 6, qEndKnPerM: 18, start: 1.95, end: 11.049999999999999 },
    { type: "linear", qStartKnPerM: 12, qEndKnPerM: 18, start: 3.9, end: 7.8 },
  ]);
});

test("buildTrussPayload serializes the default truss workspace", () => {
  const payload = buildTrussPayload(createDefaultTrussWorkspaceState());
  assert.ok(payload);
  assert.equal(payload?.analysisType, "truss");
  assert.equal(payload?.structure.nodes.length, 4);
  assert.equal(payload?.structure.members.length, 5);
  assert.equal(payload?.structure.loads.length, 2);
  assert.equal(payload?.structure.members[0]?.elementType, "truss");
});

test("buildTrussPayload preserves member self weight for equivalent nodal preprocessing", () => {
  const workspace = createDefaultTrussWorkspaceState();
  workspace.customLoads = [{ type: "distributed", member: "M2", direction: "global_y", selfWeightKnPerM: 2.0 }];

  const payload = buildTrussPayload(workspace);

  assert.ok(payload);
  assert.deepEqual(payload.structure.loads, [{ type: "distributed", member: "M2", direction: "global_y", wyKnPerM: undefined, qStartKnPerM: undefined, qEndKnPerM: undefined, selfWeightKnPerM: 2.0 }]);
});

test("buildFramePayload preserves advanced frame modeling fields", () => {
  const workspace = createDefaultFrameWorkspaceState();
  workspace.frameMode = "custom";
  workspace.customNodes[1] = {
    ...workspace.customNodes[1],
    supportType: "roller",
    supportAngleDeg: 45,
    springs: [{ dof: "uy", stiffnessKnPerM: 12000 }],
  };
  workspace.customMembers[1] = {
    ...workspace.customMembers[1],
    endReleases: { start: ["rz"] },
    internalHinges: [{ ratio: 0.5 }],
  };
  workspace.customLoads = [
    { type: "distributed", member: "B1", direction: "global_y", qStartKnPerM: -8, qEndKnPerM: -12 },
  ];
  workspace.customLoadCases = [
    {
      id: "DL",
      title: "恒载",
      loads: [{ type: "distributed", member: "B1", direction: "local_y", qStartKnPerM: -10, qEndKnPerM: -10 }],
    },
    {
      id: "WL",
      title: "风载",
      loads: [{ type: "nodal", node: "N4", fxKn: 12, fyKn: 0, mzKnM: 0 }],
    },
  ];
  workspace.customLoadCombinations = [{ id: "ULS1", title: "基本组合", factors: { DL: 1.2, WL: 1.5 }, tags: ["ULS", "包络"] }];

  const payload = buildFramePayload(workspace);

  assert.ok(payload);
  assert.equal(payload.structure.nodes[1]?.supportAngleDeg, 45);
  assert.equal(payload.structure.members[1]?.elementType, "frame");
  assert.deepEqual(payload.structure.nodes[1]?.springs, [{ dof: "uy", stiffnessKnPerM: 12000 }]);
  assert.deepEqual(payload.structure.members[1]?.endReleases, { start: ["rz"] });
  assert.deepEqual(payload.structure.members[1]?.internalHinges, [{ ratio: 0.5 }]);
  assert.deepEqual(payload.structure.loads[0], { type: "distributed", member: "B1", direction: "global_y", qStartKnPerM: -8, qEndKnPerM: -12 });
  assert.equal(payload.structure.loadCases?.length, 2);
  assert.deepEqual(payload.structure.loadCombinations?.[0]?.factors, { DL: 1.2, WL: 1.5 });
  assert.deepEqual(payload.structure.loadCombinations?.[0]?.tags, ["ULS", "包络"]);
});

test("validateCustomFrameWorkspace rejects invalid load combination factors", () => {
  const workspace = createDefaultFrameWorkspaceState();
  workspace.frameMode = "custom";
  workspace.customLoadCases = [{ id: "DL", title: "恒载", loads: [{ type: "nodal", node: "N4", fxKn: 0, fyKn: -10, mzKnM: 0 }] }];
  workspace.customLoadCombinations = [{ id: "ULS1", title: "基本组合", factors: { DL: 0 } }];

  assert.equal(validateCustomFrameWorkspace(workspace), "荷载组合 factors 不能全部为 0。");

  workspace.customLoadCombinations = [{ id: "ULS1", title: "基本组合", factors: {} }];
  assert.equal(validateCustomFrameWorkspace(workspace), "荷载组合 factors 不能为空。");
});

test("normalizeFrameWorkspaceState preserves invalid combinations for validation", () => {
  const workspace = normalizeFrameWorkspaceState({
    ...createDefaultFrameWorkspaceState(),
    frameMode: "custom",
    customLoadCases: [{ id: " DL ", title: "恒载", loads: [{ type: "nodal", node: "N4", fxKn: 0, fyKn: -10, mzKnM: 0 }] }],
    customLoadCombinations: [{ id: " ULS1 ", title: "基本组合", factors: { " DL ": 0 } }],
  } as Partial<FrameWorkspaceState>);

  assert.deepEqual(workspace.customLoadCombinations[0].factors, { DL: 0 });
  assert.equal(validateCustomFrameWorkspace(workspace), "荷载组合 factors 不能全部为 0。");
});

test("normalizeFrameWorkspaceState canonicalizes load case ids and preserves advanced fields", () => {
  const workspace = normalizeFrameWorkspaceState({
    ...createDefaultFrameWorkspaceState(),
    frameMode: "custom",
    customNodes: [
      { id: "N1", x: 0, y: 0, supportType: "fixed" },
      { id: "N2", x: 4, y: 0, supportType: "roller", supportAngleDeg: 45, springs: [{ dof: "uy", stiffnessKnPerM: 12000 }] },
    ],
    customMembers: [
      { id: "B1", start: "N1", end: "N2", E_GPa: 210, A_cm2: 220, I_cm4: 15000, kind: "beam", endReleases: { end: ["rz"] }, internalHinges: [{ ratio: 0.5 }] },
    ],
    customLoads: [{ type: "distributed", member: "B1", direction: "global_y", qStartKnPerM: -8, qEndKnPerM: -12 }],
    customLoadCases: [{ id: " DL ", title: "恒载", loads: [{ type: "nodal", node: "N2", fxKn: 0, fyKn: -10, mzKnM: 0 }] }],
    customLoadCombinations: [{ id: " ULS1 ", title: "基本组合", factors: { " DL ": 1.2 }, tags: [" ULS ", "包络", "ULS", ""] }],
  } as Partial<FrameWorkspaceState>);
  const cloned = cloneFrameWorkspaceState(workspace);

  assert.equal(cloned.customNodes[1].supportAngleDeg, 45);
  assert.deepEqual(cloned.customNodes[1].springs, [{ dof: "uy", stiffnessKnPerM: 12000 }]);
  assert.deepEqual(cloned.customMembers[0].endReleases?.end, ["rz"]);
  assert.deepEqual(cloned.customMembers[0].internalHinges, [{ ratio: 0.5 }]);
  assert.equal(cloned.customLoadCases[0].id, "DL");
  assert.equal(cloned.customLoadCombinations[0].id, "ULS1");
  assert.deepEqual(cloned.customLoadCombinations[0].factors, { DL: 1.2 });
  assert.deepEqual(cloned.customLoadCombinations[0].tags, ["ULS", "包络"]);
});

test("buildFramePayload uses canonical load case ids for combinations", () => {
  const workspace = createDefaultFrameWorkspaceState();
  workspace.frameMode = "custom";
  workspace.customLoadCases = [{ id: " DL ", title: "恒载", loads: [{ type: "nodal", node: "N4", fxKn: 0, fyKn: -10, mzKnM: 0 }] }];
  workspace.customLoadCombinations = [{ id: " ULS1 ", title: "基本组合", factors: { " DL ": 1.2 }, tags: [" ULS ", "包络", "ULS"] }];

  const payload = buildFramePayload(workspace);

  assert.ok(payload);
  assert.equal(payload.structure.loadCases?.[0]?.id, "DL");
  assert.equal(payload.structure.loadCombinations?.[0]?.id, "ULS1");
  assert.deepEqual(payload.structure.loadCombinations?.[0]?.factors, { DL: 1.2 });
  assert.deepEqual(payload.structure.loadCombinations?.[0]?.tags, ["ULS", "包络"]);
});

test("validateCustomTrussWorkspace rejects invalid references", () => {
  const invalidWorkspace = {
    ...createDefaultTrussWorkspaceState(),
    customNodes: [
      { id: "N1", x: 0, y: 0, supportType: "pinned" },
      { id: "N1", x: 6, y: 0, supportType: "roller" },
    ],
    customMembers: [
      { id: "M1", start: "N1", end: "N2", E_GPa: 210, A_cm2: 24, kind: "generic" },
    ],
    customLoads: [
      { type: "nodal", node: "N9", fxKn: 0, fyKn: -10 },
    ],
  } as TrussWorkspaceState;

  assert.equal(validateCustomTrussWorkspace(invalidWorkspace), "节点 ID 不能重复。");

  const missingMemberWorkspace = createDefaultTrussWorkspaceState();
  missingMemberWorkspace.customLoads = [{ type: "distributed", member: "MX", direction: "global_y", selfWeightKnPerM: 1.0 }];
  assert.equal(validateCustomTrussWorkspace(missingMemberWorkspace), "荷载引用了不存在的节点或杆件。");
});
