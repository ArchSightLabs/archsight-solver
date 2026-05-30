import { strict as assert } from "node:assert";
import test from "node:test";

import { createConnectedFrameMember, createFrameMemberDraft } from "./frame-editor-model.ts";
import { createTrussMemberDraft } from "./truss-editor-model.ts";
import type { StructureMember, StructureNode, TrussNode } from "../types/structure.ts";

const frameNodes: StructureNode[] = [
  { id: "N1", x: 0, y: 0, supportType: "fixed" },
  { id: "N2", x: 4, y: 0, supportType: "fixed" },
  { id: "N3", x: 0, y: 3, supportType: "free" },
];

const frameTemplateMembers: StructureMember[] = [
  { id: "C1", start: "N1", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 260, I_cm4: 14000, kind: "column" },
];

const trussNodes: TrussNode[] = [
  { id: "N1", x: 0, y: 0, supportType: "pinned" },
  { id: "N2", x: 4, y: 0, supportType: "roller" },
];

test("框架新增构件使用当前默认材料弹性模量并保留截面模板", () => {
  const direct = createFrameMemberDraft(0, frameNodes, [], 32.5);
  assert.equal(direct.E_GPa, 32.5);
  assert.equal(direct.materialId, "c40");

  const connected = createConnectedFrameMember(frameNodes[0], frameNodes[2], frameTemplateMembers, ["C1"], 30, "c30");
  assert.equal(connected.E_GPa, 30);
  assert.equal(connected.materialId, "c30");
  assert.equal(connected.A_cm2, 260);
  assert.equal(connected.I_cm4, 14000);
  assert.equal(connected.kind, "column");
});

test("桁架新增杆件使用当前默认材料弹性模量", () => {
  const member = createTrussMemberDraft(0, trussNodes, [], 206);

  assert.equal(member.E_GPa, 206);
  assert.equal(member.materialId, "q235");
  assert.equal(member.A_cm2, 24);
});
