import { strict as assert } from "node:assert";
import test from "node:test";
import { createDefaultBeamWorkspaceState } from "./workspace-state.ts";
import {
  buildContinuousBeamQuickModel,
  buildParallelChordTrussQuickModel,
  buildRegularFrameQuickModel,
} from "./workbench-quick-models.ts";

test("连续梁快速生成保持跨段、支座和全跨均布荷载口径", () => {
  const model = buildContinuousBeamQuickModel(createDefaultBeamWorkspaceState(), {
    spanCount: 3,
    spanLengthM: 5,
    uniformLoadKnPerM: 12,
    materialId: "q345",
    youngModulusGPa: 210,
    momentOfInertiaCm4: 8_000,
  });

  assert.equal(model.projectName, "快速生成3跨连续梁");
  assert.equal(model.beamType, "continuous");
  assert.equal(model.spans.length, 3);
  assert.equal(model.supports.length, 4);
  assert.equal(model.q, 12);
  assert.equal(model.uniformLoadEnabled, true);
  assert.deepEqual(model.customLoadCases, []);
  assert.deepEqual(model.customLoadCombinations, []);
});

test("规则框架快速生成形成可求解的节点、构件和梁面荷载", () => {
  const model = buildRegularFrameQuickModel({
    bayCount: 2,
    storyCount: 2,
    bayWidthM: 6,
    storyHeightM: 3.6,
    beamLoadKnPerM: 15,
    topLateralLoadKn: 18,
    materialId: "q345",
    columnAreaCm2: 260,
    beamAreaCm2: 220,
    columnMomentOfInertiaCm4: 12_000,
    beamMomentOfInertiaCm4: 15_000,
    youngModulusGPa: 210,
  });

  assert.equal(model.nodes.length, 9);
  assert.equal(model.members.filter((member) => member.kind === "column").length, 6);
  assert.equal(model.members.filter((member) => member.kind === "beam").length, 4);
  assert.equal(model.loads.filter((load) => load.type === "distributed").length, 4);
  assert.equal(model.loads.filter((load) => load.type === "nodal").length, 1);
  assert.equal(model.nodes.filter((node) => node.supportType === "fixed").length, 3);
});

test("平行弦桁架快速生成只生成桁架杆件、节点荷载和桁架支座", () => {
  const model = buildParallelChordTrussQuickModel({
    panelCount: 4,
    panelLengthM: 3,
    heightM: 2.5,
    topNodeLoadKn: 25,
    materialId: "q345",
    chordAreaCm2: 30,
    webAreaCm2: 20,
    youngModulusGPa: 210,
  });

  assert.equal(model.nodes.length, 10);
  assert.equal(model.members.filter((member) => member.kind === "lower_chord").length, 4);
  assert.equal(model.members.filter((member) => member.kind === "upper_chord").length, 4);
  assert.equal(model.members.filter((member) => member.kind === "vertical").length, 5);
  assert.equal(model.members.filter((member) => member.kind === "diagonal").length, 4);
  assert.equal(model.loads.length, 3);
  assert.ok(model.members.every((member) => member.elementType === "truss"));
  assert.ok(model.loads.every((load) => load.type === "nodal"));
});
