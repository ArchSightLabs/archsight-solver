import test from "node:test";
import assert from "node:assert/strict";

import { createConnectedFrameMember, createConnectedFrameMemberByNodeId, frameMemberExists, inferFrameNodeDraft } from "./frame-editor-model.ts";
import { createConnectedTrussMember, createConnectedTrussMemberByNodeId, trussMemberExists } from "./truss-editor-model.ts";
import type { StructureMember, StructureNode, TrussMember, TrussNode } from "../types/structure.ts";

test("框架按选定起终节点新增构件并按几何关系推断构件类型", () => {
  const nodes: StructureNode[] = [
    { id: "N1", x: 0, y: 0, supportType: "fixed" },
    { id: "N2", x: 4, y: 0, supportType: "fixed" },
    { id: "N3", x: 4, y: 3, supportType: "free" },
  ];
  const members: StructureMember[] = [
    { id: "C1", start: "N1", end: "N3", elementType: "frame", E_GPa: 200, A_cm2: 240, I_cm4: 12000, kind: "column" },
  ];

  const beam = createConnectedFrameMember(nodes[0], nodes[1], members, members.map((member) => member.id), 210);
  const brace = createConnectedFrameMember(nodes[0], nodes[2], [...members, beam], ["C1", beam.id], 210);

  assert.equal(beam.start, "N1");
  assert.equal(beam.end, "N2");
  assert.equal(beam.kind, "beam");
  assert.equal(brace.start, "N1");
  assert.equal(brace.end, "N3");
  assert.equal(brace.kind, "brace");
  assert.equal(frameMemberExists([beam], "N2", "N1"), true);
});

test("框架表格入口按显式起终节点新增构件，避免按数组下标生成无效连接", () => {
  const nodes: StructureNode[] = [
    { id: "N1", x: 0, y: 0, supportType: "fixed" },
    { id: "N2", x: 6, y: 0, supportType: "fixed" },
    { id: "N3", x: 0, y: 4, supportType: "free" },
    { id: "N4", x: 6, y: 4, supportType: "free" },
  ];
  const members: StructureMember[] = [
    { id: "C1", start: "N1", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
    { id: "B1", start: "N3", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 15000, kind: "beam" },
    { id: "C2", start: "N2", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
  ];

  const duplicate = createConnectedFrameMemberByNodeId("N3", "N4", nodes, members, 210);
  const brace = createConnectedFrameMemberByNodeId("N1", "N4", nodes, members, 210);

  assert.equal(duplicate, undefined);
  assert.equal(brace?.start, "N1");
  assert.equal(brace?.end, "N4");
  assert.equal(brace?.kind, "brace");
  assert.notEqual(brace?.start, brace?.end);
});

test("框架从选中端节点新增节点时优先补同轴竖向构件", () => {
  const nodes: StructureNode[] = [
    { id: "N1", x: 0, y: 0, supportType: "fixed" },
    { id: "N2", x: 6, y: 0, supportType: "fixed" },
    { id: "N3", x: 0, y: 4, supportType: "free" },
    { id: "N4", x: 6, y: 4, supportType: "free" },
    { id: "N5", x: 9, y: 4, supportType: "free" },
  ];
  const members: StructureMember[] = [
    { id: "C1", start: "N1", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
    { id: "B1", start: "N3", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 15000, kind: "beam" },
    { id: "C2", start: "N2", end: "N4", elementType: "frame", E_GPa: 210, A_cm2: 240, I_cm4: 12000, kind: "column" },
    { id: "B2", start: "N4", end: "N5", elementType: "frame", E_GPa: 210, A_cm2: 220, I_cm4: 15000, kind: "beam" },
  ];

  const nextNode = inferFrameNodeDraft(nodes, nodes.map((node) => node.id), "N5");
  const nextMember = createConnectedFrameMember(nodes[4], nextNode, members, members.map((member) => member.id), 210);

  assert.equal(nextNode.id, "N6");
  assert.equal(nextNode.x, nodes[4].x);
  assert.equal(nextNode.y, 0);
  assert.equal(nextMember.start, "N5");
  assert.equal(nextMember.end, "N6");
  assert.equal(nextMember.kind, "column");
});

test("框架选中节点已有同轴节点时继续沿当前标高延伸", () => {
  const nodes: StructureNode[] = [
    { id: "N1", x: 0, y: 0, supportType: "fixed" },
    { id: "N2", x: 6, y: 0, supportType: "fixed" },
    { id: "N3", x: 0, y: 4, supportType: "free" },
    { id: "N4", x: 6, y: 4, supportType: "free" },
  ];

  const nextNode = inferFrameNodeDraft(nodes, nodes.map((node) => node.id), "N4");

  assert.equal(nextNode.id, "N5");
  assert.equal(nextNode.x, 12);
  assert.equal(nextNode.y, 4);
});

test("桁架按选定起终节点新增杆件并阻止同一节点对重复连接", () => {
  const nodes: TrussNode[] = [
    { id: "N1", x: 0, y: 0, supportType: "pinned" },
    { id: "N2", x: 4, y: 0, supportType: "roller" },
    { id: "N3", x: 2, y: 3, supportType: "free" },
  ];
  const members: TrussMember[] = [
    { id: "M1", start: "N1", end: "N2", elementType: "truss", E_GPa: 200, A_cm2: 30, kind: "lower_chord" },
  ];

  const diagonal = createConnectedTrussMember(nodes[0], nodes[2], members, members.map((member) => member.id), 210);

  assert.equal(diagonal.start, "N1");
  assert.equal(diagonal.end, "N3");
  assert.equal(diagonal.kind, "diagonal");
  assert.equal(diagonal.A_cm2, 30);
  assert.equal(diagonal.E_GPa, 210);
  assert.equal(trussMemberExists([...members, diagonal], "N3", "N1"), true);
  assert.equal(trussMemberExists([...members, diagonal], "N2", "N3"), false);
});

test("桁架表格入口按显式起终节点新增杆件，并拒绝重复节点对", () => {
  const nodes: TrussNode[] = [
    { id: "N1", x: 0, y: 0, supportType: "pinned" },
    { id: "N2", x: 6, y: 0, supportType: "roller" },
    { id: "N3", x: 3, y: 3, supportType: "free" },
  ];
  const members: TrussMember[] = [
    { id: "M1", start: "N1", end: "N3", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "diagonal" },
    { id: "M2", start: "N3", end: "N2", elementType: "truss", E_GPa: 210, A_cm2: 24, kind: "diagonal" },
  ];

  const duplicate = createConnectedTrussMemberByNodeId("N3", "N1", nodes, members, 210);
  const lowerChord = createConnectedTrussMemberByNodeId("N1", "N2", nodes, members, 210);

  assert.equal(duplicate, undefined);
  assert.equal(lowerChord?.start, "N1");
  assert.equal(lowerChord?.end, "N2");
  assert.equal(lowerChord?.kind, "lower_chord");
});
