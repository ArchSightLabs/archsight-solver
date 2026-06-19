import assert from "node:assert/strict";
import test from "node:test";

import {
  arrayTrussCollections,
  copyTrussCollections,
  mirrorTrussCollections,
  removeTrussNodeCollections,
  updateTrussMemberCollections,
  updateTrussNodeCollections,
  type TrussEditorCollections,
} from "./truss-model-edits.ts";

const trussCollections = (): TrussEditorCollections => ({
  nodes: [
    { id: "N1", x: 0, y: 0, supportType: "pinned" },
    { id: "N2", x: 4, y: 0, supportType: "roller" },
    { id: "N3", x: 2, y: 2, supportType: "free" },
  ],
  members: [
    { id: "M1", start: "N1", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 24 },
    { id: "M2", start: "N2", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 24 },
  ],
  loads: [
    { type: "nodal", node: "N3", fyKn: -10 },
    { type: "distributed", member: "M1", qStartKnPerM: -1, qEndKnPerM: -1 },
    { type: "member", member: "M2", selfWeightKnPerM: 0.2 },
  ],
  loadCases: [
    {
      id: "LC1",
      title: "主工况",
      loads: [
        { type: "nodal", node: "N3", fyKn: -8 },
        { type: "distributed", member: "M1", qStartKnPerM: -0.5, qEndKnPerM: -0.5 },
      ],
    },
  ],
  loadCombinations: [{ id: "COMB1", title: "组合 1", factors: { LC1: 1 } }],
});

test("updateTrussNodeCollections renames node references across rods and nodal loads", () => {
  const result = updateTrussNodeCollections(trussCollections(), 2, { id: " N4 " });

  assert.ok(result);
  assert.equal(result.nextId, "N4");
  assert.equal(result.next.members[0]?.end, "N4");
  assert.equal(result.next.members[1]?.end, "N4");
  assert.deepEqual(result.next.loads[0], { type: "nodal", node: "N4", fyKn: -10 });
});

test("removeTrussNodeCollections removes dangling member loads created by connected rod removal", () => {
  const next = removeTrussNodeCollections(trussCollections(), 0);

  assert.ok(next);
  assert.deepEqual(next.nodes.map((node) => node.id), ["N2", "N3"]);
  assert.deepEqual(next.members.map((member) => member.id), ["M2"]);
  assert.deepEqual(next.loads, [
    { type: "nodal", node: "N3", fyKn: -10 },
    { type: "member", member: "M2", selfWeightKnPerM: 0.2 },
  ]);
});

test("updateTrussMemberCollections renames rod loads", () => {
  const result = updateTrussMemberCollections(trussCollections(), 1, { id: " M20 " });

  assert.ok(result);
  assert.equal(result.next.members[1]?.id, "M20");
  const renamedLoad = result.next.loads[2];
  assert.equal(renamedLoad?.type, "member");
  assert.equal(renamedLoad && "member" in renamedLoad ? renamedLoad.member : "", "M20");
});

test("updateTrussNodeCollections and updateTrussMemberCollections keep load case references in sync", () => {
  const nodeResult = updateTrussNodeCollections(trussCollections(), 2, { id: "N4" });

  assert.ok(nodeResult);
  assert.deepEqual(nodeResult.next.loadCases[0]?.loads[0], { type: "nodal", node: "N4", fyKn: -8 });

  const memberResult = updateTrussMemberCollections(nodeResult.next, 0, { id: "M10" });

  assert.ok(memberResult);
  assert.deepEqual(memberResult.next.loadCases[0]?.loads[1], { type: "distributed", member: "M10", qStartKnPerM: -0.5, qEndKnPerM: -0.5 });
});

test("copyTrussCollections duplicates selected panel and member loads", () => {
  const next = copyTrussCollections(trussCollections(), { memberIds: ["M1"], offsetX: 6 });

  assert.deepEqual(next.nodes.slice(3).map((node) => [node.id, node.x, node.y]), [
    ["N1_C1", 6, 0],
    ["N3_C1", 8, 2],
  ]);
  assert.deepEqual(next.members[2], { id: "M1_C1", start: "N1_C1", end: "N3_C1", elementType: "truss", E_GPa: 210, A_cm2: 24 });
  assert.deepEqual(next.loads.slice(3), [
    { type: "nodal", node: "N3_C1", fyKn: -10 },
    { type: "distributed", member: "M1_C1", qStartKnPerM: -1, qEndKnPerM: -1 },
  ]);
});

test("mirrorTrussCollections mirrors nodal load components", () => {
  const next = mirrorTrussCollections(trussCollections(), { axis: "y", origin: 0, nodeIds: ["N3"] });
  const copiedNode = next.nodes.find((node) => node.id === "N3_C1");
  const copiedLoad = next.loads.find((load) => load.type === "nodal" && load.node === "N3_C1");

  assert.deepEqual(copiedNode, { id: "N3_C1", x: -2, y: 2, supportType: "free" });
  assert.deepEqual(copiedLoad, { type: "nodal", node: "N3_C1", fyKn: -10 });
});

test("arrayTrussCollections creates fixed-count copies from the original selection", () => {
  const next = arrayTrussCollections(trussCollections(), { count: 2, deltaX: 4, deltaY: 0 });

  assert.equal(next.nodes.length, 9);
  assert.equal(next.members.length, 6);
  assert.deepEqual(next.nodes.slice(3).map((node) => node.id), ["N1_C1", "N2_C1", "N3_C1", "N1_C2", "N2_C2", "N3_C2"]);
  assert.deepEqual(next.members.slice(2).map((member) => [member.id, member.start, member.end]), [
    ["M1_C1", "N1_C1", "N3_C1"],
    ["M2_C1", "N2_C1", "N3_C1"],
    ["M1_C2", "N1_C2", "N3_C2"],
    ["M2_C2", "N2_C2", "N3_C2"],
  ]);
});
