import assert from "node:assert/strict";
import test from "node:test";

import {
  arrayFrameCollections,
  copyFrameCollections,
  mirrorFrameCollections,
  removeFrameLoadCaseCollections,
  removeFrameNodeCollections,
  updateFrameMemberCollections,
  updateFrameNodeCollections,
  type FrameEditorCollections,
} from "./frame-model-edits.ts";

const frameCollections = (): FrameEditorCollections => ({
  nodes: [
    { id: "N1", x: 0, y: 0, supportType: "fixed" },
    { id: "N2", x: 4, y: 0, supportType: "roller" },
    { id: "N3", x: 4, y: 3, supportType: "free" },
  ],
  members: [
    { id: "C1", start: "N1", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 120, I_cm4: 8000 },
    { id: "B1", start: "N2", end: "N3", elementType: "frame", E_GPa: 210, A_cm2: 120, I_cm4: 8000 },
  ],
  loads: [
    { type: "nodal", node: "N3", fyKn: -10 },
    { type: "distributed", member: "C1", direction: "global_y", qStartKnPerM: -6, qEndKnPerM: -6 },
    { type: "member_point", member: "B1", forceKn: -4, positionRatio: 0.5 },
    { type: "temperature", member: "C1", deltaTempC: 30, alphaPerC: 1.2e-5 },
  ],
  loadCases: [
    {
      id: "DL",
      title: "恒载",
      loads: [
        { type: "nodal", node: "N3", fyKn: -10 },
        { type: "distributed", member: "C1", direction: "global_y", qStartKnPerM: -6, qEndKnPerM: -6 },
        { type: "temperature", member: "C1", deltaTempC: 30, alphaPerC: 1.2e-5 },
      ],
    },
  ],
  loadCombinations: [
    { id: "SLS", title: "正常使用组合", factors: { DL: 1 } },
    { id: "ULS", title: "承载力组合", factors: { DL: 1.3, LL: 1.5 } },
  ],
});

test("updateFrameNodeCollections renames node references across members and load cases", () => {
  const result = updateFrameNodeCollections(frameCollections(), 2, { id: " N4 " });

  assert.ok(result);
  assert.equal(result.renamed, true);
  assert.equal(result.nextId, "N4");
  assert.equal(result.next.members[0]?.end, "N4");
  assert.equal(result.next.members[1]?.end, "N4");
  assert.deepEqual(result.next.loads[0], { type: "nodal", node: "N4", fyKn: -10 });
  assert.deepEqual(result.next.loadCases[0]?.loads[0], { type: "nodal", node: "N4", fyKn: -10 });
});

test("removeFrameNodeCollections removes dangling member loads created by connected member removal", () => {
  const next = removeFrameNodeCollections(frameCollections(), 0);

  assert.ok(next);
  assert.deepEqual(next.nodes.map((node) => node.id), ["N2", "N3"]);
  assert.deepEqual(next.members.map((member) => member.id), ["B1"]);
  assert.deepEqual(next.loads, [
    { type: "nodal", node: "N3", fyKn: -10 },
    { type: "member_point", member: "B1", forceKn: -4, positionRatio: 0.5 },
  ]);
  assert.deepEqual(next.loadCases[0]?.loads, [{ type: "nodal", node: "N3", fyKn: -10 }]);
});

test("updateFrameMemberCollections renames member loads in base loads and load cases", () => {
  const result = updateFrameMemberCollections(frameCollections(), 0, { id: " C10 " });

  assert.ok(result);
  assert.equal(result.next.members[0]?.id, "C10");
  const baseLoad = result.next.loads[1];
  const temperatureLoad = result.next.loads[3];
  const loadCaseLoad = result.next.loadCases[0]?.loads[1];
  const loadCaseTemperatureLoad = result.next.loadCases[0]?.loads[2];
  assert.equal(baseLoad?.type, "distributed");
  assert.equal(baseLoad && "member" in baseLoad ? baseLoad.member : "", "C10");
  assert.equal(temperatureLoad?.type, "temperature");
  assert.equal(temperatureLoad && "member" in temperatureLoad ? temperatureLoad.member : "", "C10");
  assert.equal(loadCaseLoad?.type, "distributed");
  assert.equal(loadCaseLoad && "member" in loadCaseLoad ? loadCaseLoad.member : "", "C10");
  assert.equal(loadCaseTemperatureLoad?.type, "temperature");
  assert.equal(loadCaseTemperatureLoad && "member" in loadCaseTemperatureLoad ? loadCaseTemperatureLoad.member : "", "C10");
});

test("copyFrameCollections duplicates selected subgraph with rewritten loads", () => {
  const next = copyFrameCollections(frameCollections(), { memberIds: ["C1"], offsetX: 8 });

  assert.deepEqual(next.nodes.slice(3).map((node) => [node.id, node.x, node.y]), [
    ["N1_C1", 8, 0],
    ["N3_C1", 12, 3],
  ]);
  assert.deepEqual(next.members[2], { id: "C1_C1", start: "N1_C1", end: "N3_C1", elementType: "frame", E_GPa: 210, A_cm2: 120, I_cm4: 8000 });
  assert.deepEqual(next.loads.slice(4), [
    { type: "nodal", node: "N3_C1", fyKn: -10 },
    { type: "distributed", member: "C1_C1", direction: "global_y", qStartKnPerM: -6, qEndKnPerM: -6 },
    { type: "temperature", member: "C1_C1", deltaTempC: 30, alphaPerC: 1.2e-5 },
  ]);
  assert.deepEqual(next.loadCases[0]?.loads.slice(3), [
    { type: "nodal", node: "N3_C1", fyKn: -10 },
    { type: "distributed", member: "C1_C1", direction: "global_y", qStartKnPerM: -6, qEndKnPerM: -6 },
    { type: "temperature", member: "C1_C1", deltaTempC: 30, alphaPerC: 1.2e-5 },
  ]);
});

test("mirrorFrameCollections mirrors geometry and global load signs", () => {
  const next = mirrorFrameCollections(frameCollections(), { axis: "x", origin: 0, nodeIds: ["N3"], memberIds: [] });
  const copiedNode = next.nodes.find((node) => node.id === "N3_C1");
  const copiedLoad = next.loads.find((load) => load.type === "nodal" && load.node === "N3_C1");

  assert.deepEqual(copiedNode, { id: "N3_C1", x: 4, y: -3, supportType: "free" });
  assert.deepEqual(copiedLoad, { type: "nodal", node: "N3_C1", fyKn: 10 });
});

test("arrayFrameCollections creates fixed-count copies from the original selection", () => {
  const next = arrayFrameCollections(frameCollections(), { count: 2, deltaX: 5, deltaY: 0 });

  assert.equal(next.nodes.length, 9);
  assert.equal(next.members.length, 6);
  assert.deepEqual(next.nodes.slice(3).map((node) => node.id), ["N1_C1", "N2_C1", "N3_C1", "N1_C2", "N2_C2", "N3_C2"]);
  assert.deepEqual(next.members.slice(2).map((member) => [member.id, member.start, member.end]), [
    ["C1_C1", "N1_C1", "N3_C1"],
    ["B1_C1", "N2_C1", "N3_C1"],
    ["C1_C2", "N1_C2", "N3_C2"],
    ["B1_C2", "N2_C2", "N3_C2"],
  ]);
});

test("removeFrameLoadCaseCollections removes load combination factors for deleted load cases", () => {
  const next = removeFrameLoadCaseCollections(frameCollections(), 0);

  assert.ok(next);
  assert.deepEqual(next.loadCases, []);
  assert.deepEqual(next.loadCombinations, [{ id: "ULS", title: "承载力组合", factors: { LL: 1.5 } }]);
});
