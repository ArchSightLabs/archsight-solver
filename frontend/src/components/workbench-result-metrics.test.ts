import assert from "node:assert/strict";
import test from "node:test";

import type { BeamCalculationResults } from "../types/beam.ts";
import type { FrameCalculationResults, TrussCalculationResults } from "../types/structure.ts";
import { beamSummaryRows, frameSummaryRows, trussSummaryRows } from "./workbench-result-metrics.ts";

function frameResultsWithMembers(memberResults: FrameCalculationResults["memberResults"]): FrameCalculationResults {
  return {
    analysisType: "frame",
    summary: {
      allowableMm: 12,
      maxDisplacementMm: 4.2,
      maxVerticalMm: 3.1,
      maxRotationDeg: 0.01,
      maxMomentKnM: 42,
      maxDisplacementNodeId: "N4",
      status: "通过",
      statusCode: "PASS",
      method: "平面框架矩阵位移法",
    },
    payload: {} as FrameCalculationResults["payload"],
    structure: {} as FrameCalculationResults["structure"],
    nodeResults: [],
    memberResults,
    memberDiagrams: [],
    nodeIds: ["N1", "N2"],
    memberIds: memberResults.map((member) => member.memberId),
    ux_data: [],
    uy_data: [],
    rz_data: [],
    member_axial_data: [],
    member_shear_data: [],
    member_moment_data: [],
  };
}

test("框架结果摘要为最大构件弯矩显示控制构件", () => {
  const rows = frameSummaryRows(frameResultsWithMembers([
    {
      memberId: "C1",
      kind: "column",
      startNode: "N1",
      endNode: "N3",
      axialStartKn: 0,
      shearStartKn: 0,
      momentStartKnM: 18,
      axialEndKn: 0,
      shearEndKn: 0,
      momentEndKnM: -20,
      lengthM: 4,
    },
    {
      memberId: "B1",
      kind: "beam",
      startNode: "N3",
      endNode: "N4",
      axialStartKn: 0,
      shearStartKn: 0,
      momentStartKnM: 12,
      axialEndKn: 0,
      shearEndKn: 0,
      momentEndKnM: -7,
      maxAbsMomentKnM: 42,
      lengthM: 6,
    },
  ]));

  assert.equal(rows.find((row) => row.label === "最大构件弯矩")?.detail, "构件 B1");
});

test("梁系和桁架结果摘要不把 L/250 限值显示成当前控制比", () => {
  const beamRows = beamSummaryRows({
    x_data: [],
    v_data: [],
    moment_data: [],
    shear_data: [],
    t_data: [],
    q_t_data: [],
    summary: {
      allowableMm: 20,
      allowableRatio: 250,
      maxDeflectionMm: 5,
      maxDeflectionPositionM: 2,
      status: "合格",
      statusCode: "PASS",
      method: "梁单元法",
    },
  } satisfies BeamCalculationResults);
  const trussRows = trussSummaryRows({
    analysisType: "truss",
    summary: {
      allowableMm: 24,
      allowableRatio: 250,
      maxDisplacementMm: 8.8209,
      maxDisplacementNodeId: "N2",
      maxAxialForceKn: 133.3333,
      maxAxialForceMemberId: "M2",
      status: "合格",
      statusCode: "PASS",
      method: "二维平面桁架杆单元法",
    },
    payload: {
      analysisType: "truss",
      projectName: "测试桁架",
      materialId: "q235",
      structure: { template: "explicit", nodes: [], members: [], loads: [] },
    },
    structure: { template: "explicit", nodes: [], members: [], loads: [] },
    nodeResults: [],
    memberResults: [],
    nodeIds: [],
    memberIds: [],
    ux_data: [],
    uy_data: [],
    member_axial_data: [],
  } satisfies TrussCalculationResults);

  assert.equal(beamRows.find((row) => row.label === "允许挠度")?.detail, "L/250 · 25% · PASS");
  assert.equal(trussRows.find((row) => row.label === "允许位移")?.detail, "L/250 · 36.75% · PASS");
});
