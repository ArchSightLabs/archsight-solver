import assert from "node:assert/strict";
import test from "node:test";
import { parseBeamTextModel, serializeBeamTextModel } from "./beam-text-model.ts";
import { createDefaultBeamWorkspaceState } from "./workspace-state.ts";

test("parseBeamTextModel imports spans supports springs and load", () => {
  const result = parseBeamTextModel(`
BEAM,continuous
MATERIAL,q345
SPAN,B1,6,206,85000
NODE,N1,0,pinned
NODE,N2,6,free
SPRING,N2,v,50000
LOAD,uniform,12
`);

  assert.ok(result.patch);
  assert.equal(result.patch?.beamType, "continuous");
  assert.equal(result.patch?.materialId, "q345");
  assert.equal(result.patch?.spans?.length, 1);
  assert.equal(result.patch?.spans?.[0]?.id, "B1");
  assert.equal(result.patch?.supports?.length, 2);
  assert.deepEqual(result.patch?.supports?.[0]?.constraints, ["v"]);
  assert.deepEqual(result.patch?.supports?.[1]?.springs, [{ dof: "v", stiffnessKnPerM: 50000 }]);
  assert.equal(result.patch?.q, 12);
});

test("parseBeamTextModel imports superposed beam loads", () => {
  const result = parseBeamTextModel(`
SPAN,8,210,4500
LOAD,uniform,4,0.25,0.75
LOAD,linear,2,6,0.25,0.75
LOAD,point,12,0.25
LOAD,point,8,0.75
`);

  assert.ok(result.patch);
  assert.equal(result.patch?.loadType, "combined");
  assert.equal(result.patch?.uniformLoadEnabled, true);
  assert.equal(result.patch?.uniformLoadStartRatio, 0.25);
  assert.equal(result.patch?.uniformLoadEndRatio, 0.75);
  assert.equal(result.patch?.linearLoadEnabled, true);
  assert.deepEqual(result.patch?.linearLoads, [
    { id: "L1", qStartKnPerM: 2, qEndKnPerM: 6, startRatio: 0.25, endRatio: 0.75 },
  ]);
  assert.deepEqual(result.patch?.pointLoads, [
    { id: "P1", magnitudeKn: 12, positionRatio: 0.25 },
    { id: "P2", magnitudeKn: 8, positionRatio: 0.75 },
  ]);
});

test("parseBeamTextModel preserves multiple linear loads", () => {
  const result = parseBeamTextModel(`
SPAN,4,c40,12000
SPAN,5,c40,14000
SPAN,4,c40,12000
LOAD,linear,6,18,0.15,0.85
LOAD,linear,12,18,0.3,0.6
`);

  assert.ok(result.patch);
  assert.equal(result.patch?.loadType, "combined");
  assert.equal(result.patch?.linearLoadEnabled, true);
  assert.deepEqual(result.patch?.linearLoads, [
    { id: "L1", qStartKnPerM: 6, qEndKnPerM: 18, startRatio: 0.15, endRatio: 0.85 },
    { id: "L2", qStartKnPerM: 12, qEndKnPerM: 18, startRatio: 0.3, endRatio: 0.6 },
  ]);
  assert.equal(result.patch?.distributedLoadStart, 6);
  assert.equal(result.patch?.distributedLoadEnd, 18);
});

test("parseBeamTextModel lets spans reference material ids", () => {
  const result = parseBeamTextModel(`
MATERIAL,q345
SPAN,6,q345,85000
`);

  assert.ok(result.patch);
  assert.equal(result.patch?.spans?.[0]?.materialId, "q345");
  assert.equal(result.patch?.spans?.[0]?.id, "B1");
  assert.equal(result.patch?.spans?.[0]?.E, 210);
});

test("parseBeamTextModel imports custom material definitions", () => {
  const result = parseBeamTextModel(`
MATERIAL,steelx,试验钢,205,7850
SPAN,5,steelx,9000
`);

  assert.ok(result.patch);
  assert.equal(result.patch?.materialId, "steelx");
  assert.equal(result.patch?.materials?.some((material) => material.id === "steelx" && material.youngModulus === 205), true);
  assert.deepEqual(result.patch?.spans?.[0], { id: "B1", length: 5, E: 205, I: 9000, materialId: "steelx" });
});

test("serializeBeamTextModel emits importable text", () => {
  const workspace = createDefaultBeamWorkspaceState();
  workspace.spans[0] = { ...workspace.spans[0], id: "G1" };
  workspace.supports[0] = { ...workspace.supports[0], id: "A" };
  workspace.supports[0] = {
    ...workspace.supports[0],
    constraints: [],
    springs: [{ dof: "rz", stiffnessKnMPerRad: 12000 }],
  };

  const result = parseBeamTextModel(serializeBeamTextModel(workspace));

  assert.ok(result.patch);
  assert.equal(result.patch?.beamType, workspace.beamType);
  assert.equal(result.patch?.materialId, workspace.materialId);
  assert.equal(result.patch?.spans?.length, workspace.spans.length);
  assert.equal(result.patch?.spans?.[0]?.id, "G1");
  assert.equal(result.patch?.supports?.[0]?.id, "A");
  assert.deepEqual(result.patch?.supports?.[0]?.springs, [{ dof: "rz", stiffnessKnMPerRad: 12000 }]);
});

test("serializeBeamTextModel preserves multiple point loads", () => {
  const workspace = createDefaultBeamWorkspaceState();
  workspace.uniformLoadEnabled = true;
  workspace.linearLoadEnabled = true;
  workspace.pointLoads = [
    { id: "P1", magnitudeKn: 12, positionRatio: 0.25 },
    { id: "P2", magnitudeKn: 8, positionRatio: 0.75 },
  ];

  const text = serializeBeamTextModel(workspace);
  const result = parseBeamTextModel(text);

  assert.match(text, /LOAD,point,12,0.25/u);
  assert.match(text, /LOAD,point,8,0.75/u);
  assert.equal(result.patch?.loadType, "combined");
  assert.equal(result.patch?.pointLoads?.length, 2);
});

test("serializeBeamTextModel preserves multiple linear loads", () => {
  const workspace = createDefaultBeamWorkspaceState();
  workspace.uniformLoadEnabled = false;
  workspace.linearLoadEnabled = true;
  workspace.linearLoads = [
    { id: "L1", qStartKnPerM: 6, qEndKnPerM: 18, startRatio: 0.15, endRatio: 0.85 },
    { id: "L2", qStartKnPerM: 12, qEndKnPerM: 18, startRatio: 0.3, endRatio: 0.6 },
  ];

  const text = serializeBeamTextModel(workspace);
  const result = parseBeamTextModel(text);

  assert.match(text, /LOAD,linear,6,18,0.15,0.85/u);
  assert.match(text, /LOAD,linear,12,18,0.3,0.6/u);
  assert.equal(result.patch?.linearLoads?.length, 2);
});

test("serializeBeamTextModel keeps long format hints as real comment lines", () => {
  const text = serializeBeamTextModel(createDefaultBeamWorkspaceState());

  assert.match(text, /# 支座类型：fixed=固结支座；pinned=铰支座；roller=滚动支座；free=自由端\/无约束/u);
  assert.match(text, /# LOAD,uniform,q_kN_per_m,startRatio,endRatio {2}均布荷载，q 为 kN\/m，范围比例默认 0-1\n# LOAD,point,P_kN,ratio {2}集中力，P 为 kN，ratio 为跨全长相对位置 0-1\n# LOAD,linear,q1,q2,startRatio,endRatio {2}线性分布荷载，q1\/q2 为起止强度 kN\/m/u);
  assert.doesNotMatch(text, /\nLOAD,linear,q1,q2,startRatio,endRatio/u);
});

test("parseBeamTextModel reports diagnostics without discarding valid draft content", () => {
  const result = parseBeamTextModel(`
SPAN,6,210,4500
UNKNOWN,1
LOAD,uniform,12
`);

  assert.ok(result.patch);
  assert.equal(result.patch?.spans?.length, 1);
  assert.equal(result.patch?.q, 12);
  assert.match(result.diagnostics.join("\n"), /未识别的梁系文本命令/u);
});

test("parseBeamTextModel rejects missing span parameters instead of defaulting", () => {
  const result = parseBeamTextModel(`
BEAM,continuous
SPAN,6
SUPPORT,S1,0,pinned
`);

  assert.ok(result.patch);
  assert.equal(result.patch?.spans, undefined);
  assert.match(result.diagnostics.join("\n"), /SPAN 必须包含杆件编号（可选）、跨长、材料编号或 E_GPa、I_cm4/u);
});

test("parseBeamTextModel rejects undefined material ids", () => {
  const result = parseBeamTextModel(`
MATERIAL,foo
SPAN,6,210,8000
`);

  assert.ok(result.patch);
  assert.notEqual(result.patch?.materialId, "foo");
  assert.equal(result.patch?.spans?.[0]?.materialId, "q345");
  assert.match(result.diagnostics.join("\n"), /材料编号 foo 未在材料库中定义/u);
});

test("parseBeamTextModel rejects undefined span material ids", () => {
  const result = parseBeamTextModel(`
MATERIAL,q345
SPAN,6,steelx,8000
`);

  assert.ok(result.patch);
  assert.equal(result.patch?.spans, undefined);
  assert.match(result.diagnostics.join("\n"), /杆件材料编号 steelx 未在材料库中定义/u);
});

test("parseBeamTextModel rejects incomplete supports loads and springs", () => {
  const result = parseBeamTextModel(`
SPAN,6,210,8000
SUPPORT,S1,0
SUPPORT,S2,6,unknown
SPRING,S1,v
LOAD,uniform
LOAD,point,8
LOAD,linear,1,2,0.9,0.1
`);

  assert.ok(result.patch);
  assert.equal(result.patch?.supports, undefined);
  assert.equal(result.patch?.loadType, "none");
  const diagnostics = result.diagnostics.join("\n");
  assert.match(diagnostics, /NODE 必须包含节点编号、x 位置和支座类型/u);
  assert.match(diagnostics, /支座类型必须为 fixed、pinned、roller 或 free/u);
  assert.match(diagnostics, /SPRING 必须包含支座编号、自由度和刚度/u);
  assert.match(diagnostics, /均布荷载 LOAD,uniform 必须包含 q_kN_per_m/u);
  assert.match(diagnostics, /集中力 LOAD,point 必须包含 P_kN 和位置比例/u);
  assert.match(diagnostics, /线性荷载范围比例必须满足/u);
});
