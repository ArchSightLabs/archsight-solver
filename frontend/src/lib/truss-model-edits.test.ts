import assert from "node:assert/strict";
import test from "node:test";

import {
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
