import assert from "node:assert/strict";
import test from "node:test";
import { parseFrameTextModel, serializeFrameTextModel } from "./frame-text-model.ts";

test("parseFrameTextModel imports SM-style nodes, members, supports and loads", () => {
  const result = parseFrameTextModel(`
N,1,0,0
N,2,6,0
N,3,0,4
N,4,6,4
NSUPT,1,6,0
NSUPT,2,4,0
E,1,3,1,1,1,1,1,1
E,3,4,1,1,1,1,1,1
E,2,4,1,1,1,1,1,1
PROP,2,2,210,220,15000,beam
DLOAD,2,-18,-12,global_y,0.2,0.8
PLOAD,2,-12,0.5,global_y
NLOAD,4,1,24,0
NLOAD,4,2,5
`);

  assert.ok(result.collections);
  assert.equal(result.collections.nodes.length, 4);
  assert.equal(result.collections.members.length, 3);
  assert.equal(result.collections.loads.length, 4);
  assert.equal(result.collections.nodes[0]?.supportType, "fixed");
  assert.equal(result.collections.nodes[1]?.supportType, "pinned");
  assert.equal(result.collections.nodes[2]?.supportType, "free");
  assert.equal(result.collections.members[1]?.kind, "beam");
  assert.equal(result.collections.members[1]?.materialId, "q345");
  assert.equal(result.collections.members[1]?.I_cm4, 15000);
  assert.deepEqual(result.collections.loads[0], {
    type: "distributed",
    member: "M2",
    qStartKnPerM: -18,
    qEndKnPerM: -12,
    direction: "global_y",
    startRatio: 0.2,
    endRatio: 0.8,
  });
  assert.deepEqual(result.collections.loads[1], {
    type: "member_point",
    member: "M2",
    forceKn: -12,
    positionRatio: 0.5,
    direction: "global_y",
  });
  assert.deepEqual(result.collections.loads[2], {
    type: "nodal",
    node: "N4",
    fxKn: 24,
    fyKn: 0,
    mzKnM: 0,
  });
  assert.deepEqual(result.collections.loads[3], {
    type: "nodal",
    node: "N4",
    fxKn: 0,
    fyKn: 0,
    mzKnM: 5,
  });
});

test("serializeFrameTextModel emits importable text", () => {
  const source = parseFrameTextModel(`
N,1,0,0
N,2,4,0
NSUPT,1,6,0
NSPRING,2,uy,12000
SPRING,2,rz,8000
E,1,2,1,1,0,1,1,1
LOAD,2,0,-10,0
`);

  assert.ok(source.collections);
  const text = serializeFrameTextModel(source.collections);
  const restored = parseFrameTextModel(text);

  assert.ok(restored.collections);
  assert.equal(restored.collections.nodes.length, 2);
  assert.equal(restored.collections.members.length, 1);
  assert.equal(restored.collections.loads.length, 1);
  assert.deepEqual(restored.collections.nodes[1]?.springs, [
    { dof: "uy", stiffnessKnPerM: 12000 },
    { dof: "rz", stiffnessKnMPerRad: 8000 },
  ]);
  assert.deepEqual(restored.collections.members[0]?.endReleases?.start, ["rz"]);
  assert.equal(restored.collections.members[0]?.materialId, "q345");
});

test("serializeFrameTextModel preserves node elastic constraints", () => {
  const text = serializeFrameTextModel({
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "pinned", springs: [{ dof: "rz", stiffnessKnMPerRad: 15000 }] },
      { id: "N2", x: 4, y: 0, supportType: "free", springs: [{ dof: "uy", stiffnessKnPerM: 12000 }] },
    ],
    members: [
      { id: "B1", start: "N1", end: "N2", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "beam" },
    ],
    loads: [],
  });

  assert.match(text, /NSUPT,1,4,0/u);
  assert.match(text, /NSPRING,1,rz,15000/u);
  assert.match(text, /NSPRING,2,uy,12000/u);

  const restored = parseFrameTextModel(text);

  assert.ok(restored.collections);
  assert.deepEqual(restored.collections.nodes[0]?.springs, [{ dof: "rz", stiffnessKnMPerRad: 15000 }]);
  assert.deepEqual(restored.collections.nodes[1]?.springs, [{ dof: "uy", stiffnessKnPerM: 12000 }]);
});

test("serializeFrameTextModel uses sequential SM element numbers for named members", () => {
  const text = serializeFrameTextModel({
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "fixed" },
      { id: "N2", x: 0, y: 4, supportType: "free" },
      { id: "N3", x: 6, y: 4, supportType: "free" },
    ],
    members: [
      { id: "C1", start: "N1", end: "N2", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
      { id: "B1", start: "N2", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 15000, kind: "beam" },
    ],
    loads: [
      { type: "distributed", member: "B1", qStartKnPerM: -18, qEndKnPerM: -18, direction: "global_y", startRatio: 0.15, endRatio: 0.85 },
      { type: "member_point", member: "B1", forceKn: -12, positionRatio: 0.5, direction: "global_y" },
    ],
  });

  assert.match(text, /PROP,1,1,210,240,12000,column,q345/u);
  assert.match(text, /PROP,2,2,210,220,15000,beam,q345/u);
  assert.match(text, /DLOAD,2,-18,-18,global_y,0.15,0.85/u);
  assert.match(text, /PLOAD,2,-12,0.5,global_y/u);
});

test("serializeFrameTextModel round-trips load cases and combinations", () => {
  const text = serializeFrameTextModel({
    nodes: [
      { id: "N1", x: 0, y: 0, supportType: "fixed" },
      { id: "N2", x: 6, y: 0, supportType: "pinned" },
      { id: "N3", x: 6, y: 4, supportType: "free" },
    ],
    members: [
      { id: "C1", start: "N1", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
      { id: "B1", start: "N2", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 15000, kind: "beam" },
    ],
    loads: [{ type: "nodal", node: "N3", fxKn: 20, fyKn: 0, mzKnM: 0 }],
    loadCases: [
      {
        id: "DL",
        title: "恒载",
        loads: [{ type: "distributed", member: "B1", qStartKnPerM: -12, qEndKnPerM: -12, direction: "global_y", startRatio: 0, endRatio: 1 }],
      },
      {
        id: "WL",
        title: "风荷载",
        loads: [{ type: "nodal", node: "N3", fxKn: 16, fyKn: 0, mzKnM: 0 }],
      },
    ],
    loadCombinations: [
      { id: "ULS1", title: "基本组合", factors: { DL: 1.2, WL: 1.4 }, tags: ["ULS", "包络"] },
    ],
  });

  assert.match(text, /CASE,DL,恒载/u);
  assert.match(text, /CASELOAD,DL,DLOAD,2,-12,-12,global_y,0,1/u);
  assert.match(text, /COMB,ULS1,基本组合,ULS\/包络/u);
  assert.match(text, /FACTOR,ULS1,WL,1.4/u);

  const restored = parseFrameTextModel(text);

  assert.ok(restored.collections);
  assert.equal(restored.collections.loadCases?.length, 2);
  assert.equal(restored.collections.loadCases?.[0]?.loads.length, 1);
  assert.equal(restored.collections.loadCombinations?.length, 1);
  assert.deepEqual(restored.collections.loadCombinations?.[0]?.factors, { DL: 1.2, WL: 1.4 });
});

test("parseFrameTextModel reports ignored invalid references for preview blocking", () => {
  const result = parseFrameTextModel(`
N,1,0,0
N,2,4,0
MEMBER,M1,N1,N3
LOAD,N3,0,-10,0
`);

  assert.ok(result.collections);
  assert.equal(result.collections.members.length, 0);
  assert.equal(result.collections.loads.length, 0);
  assert.match(result.diagnostics.join("\n"), /已忽略/u);
});

test("parseFrameTextModel rejects invalid node spring definitions", () => {
  const result = parseFrameTextModel(`
N,1,0,0
NSPRING,1,uz,100
NSPRING,1,uy,0
NSPRING,2,uy,100
`);

  assert.ok(result.collections);
  assert.equal(result.collections.nodes[0]?.springs, undefined);
  const diagnostics = result.diagnostics.join("\n");
  assert.match(diagnostics, /节点弹簧自由度必须为 ux、uy 或 rz/u);
  assert.match(diagnostics, /节点弹簧刚度必须大于 0/u);
  assert.match(diagnostics, /节点弹簧引用了不存在的节点 N2/u);
});
