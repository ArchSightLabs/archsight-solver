import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDisplayedBeamResults,
  buildDisplayedFrameResults,
  buildDisplayedTrussResults,
  buildResultDisplayOptions,
  resultTabsForMode,
} from "./workbench-result-model.ts";

function tabDescription(mode: Parameters<typeof resultTabsForMode>[0], tabId: string): string {
  return resultTabsForMode(mode).find((tab) => tab.id === tabId)?.description ?? "";
}

function tabLabel(mode: Parameters<typeof resultTabsForMode>[0], tabId: string): string {
  return resultTabsForMode(mode).find((tab) => tab.id === tabId)?.label ?? "";
}

test("结果页标签明确区分模型叠加工程图和数据曲线", () => {
  assert.match(tabDescription("beam", "diagrams"), /模型叠加工程图/u);
  assert.match(tabDescription("frame", "diagrams"), /模型叠加工程图/u);
  assert.match(tabDescription("truss", "diagrams"), /模型叠加工程图/u);

  assert.match(tabDescription("frame", "curves"), /节点序列/u);
  assert.match(tabDescription("truss", "curves"), /节点与杆件序列/u);
});

test("load case result display works for beam and truss, not only frame", () => {
  const beam = {
    x_data: [0, 1],
    v_data: [0, -0.001],
    moment_data: [0, 0],
    shear_data: [0, 0],
    t_data: [],
    q_t_data: [],
    payload: {
      analysisType: "beam",
      spans: [1],
      beamType: "simply_supported",
      loadType: "uniform",
      loadValue: 1,
      loadPosition: 0.5,
      loadEnd: 1,
      E: 200,
      I: 1000,
      q: 1,
      freq: 1,
      duration: 1,
      materialId: "steel",
      loadCases: [{ id: "LC1", title: "LC1", loads: [{ type: "uniform", qKnPerM: 2 }] }],
      loadCombinations: [{ id: "COMB1", title: "COMB1", factors: { LC1: 1.2 } }],
    },
    summary: { allowableMm: 10, allowableRatio: 1, maxDeflectionMm: 1, maxDeflectionPositionM: 1, status: "OK", statusCode: "PASS", method: "test" },
    loadCaseResults: [{ id: "LC1", title: "LC1", summary: { maxDeflectionMm: 2 }, x_data: [0, 1], v_data: [0, -0.002], element_end_moments: [0, 2000], element_end_shears: [0, 3000] }],
    loadCombinationResults: [{ id: "COMB1", title: "COMB1", factors: { LC1: 1.2 }, summary: { maxDeflectionMm: 2.4 }, x_data: [0, 1], v_data: [0, -0.0024], element_end_moments: [0, 2400], element_end_shears: [0, 3600] }],
  };
  const beamOptions = buildResultDisplayOptions(beam as never);
  const displayedBeam = buildDisplayedBeamResults(beam as never, beamOptions.find((option) => option.id === "COMB1"));

  assert.equal(beamOptions.length, 3);
  assert.equal(displayedBeam?.summary?.maxDeflectionMm, 2.4);
  assert.deepEqual(displayedBeam?.moment_data, [0, 2.4]);

  const truss = {
    analysisType: "truss",
    summary: { allowableMm: 10, allowableRatio: 1, maxDisplacementMm: 1, maxDisplacementNodeId: "N1", maxAxialForceKn: 1, maxAxialForceMemberId: "M1", status: "OK", statusCode: "PASS", method: "test" },
    structure: {
      template: "explicit",
      nodes: [{ id: "N1", x: 0, y: 0, supportType: "pinned" }],
      members: [{ id: "M1", start: "N1", end: "N1", E_GPa: 200, A_cm2: 10 }],
      loads: [],
      loadCases: [{ id: "LC1", title: "LC1", loads: [{ type: "nodal", node: "N1", fyKn: -1 }] }],
      loadCombinations: [{ id: "COMB1", title: "COMB1", factors: { LC1: 1.5 } }],
    },
    truss: null,
    nodeResults: [],
    memberResults: [],
    nodeIds: [],
    memberIds: [],
    ux_data: [],
    uy_data: [],
    member_axial_data: [],
    loadCombinationResults: [{
      id: "COMB1",
      title: "COMB1",
      factors: { LC1: 1.5 },
      summary: { maxDisplacementMm: 3, maxAxialForceKn: 4 },
      nodeResults: [{ nodeId: "N1", x: 0, y: 0, uxMm: 1, uyMm: 2, displacementMm: 3, rxKn: 0, ryKn: 0, supportType: "pinned" }],
      memberResults: [{ memberId: "M1", kind: "generic", startNode: "N1", endNode: "N1", lengthM: 0, axialForceKn: 4, axialStressMpa: 0, forceState: "tension" }],
    }],
  };
  const trussOptions = buildResultDisplayOptions(truss as never);
  const displayedTruss = buildDisplayedTrussResults(truss as never, trussOptions.find((option) => option.id === "COMB1"));

  assert.equal(displayedTruss?.summary.maxDisplacementMm, 3);
  assert.deepEqual(displayedTruss?.ux_data, [1]);
  assert.deepEqual(displayedTruss?.member_axial_data, [{ memberId: "M1", axialForceKn: 4 }]);
});

test("平面桁架结果页不把工程图描述成弯矩或剪力图", () => {
  const trussDescriptions = resultTabsForMode("truss").map((tab) => tab.description).join("\n");

  assert.doesNotMatch(trussDescriptions, /弯矩|剪力/u);
  assert.match(tabDescription("truss", "diagrams"), /杆件轴力和节点位移/u);
});

test("结果页受力变形说明沿用各分析对象的共享对象词表口径", () => {
  assert.deepEqual(
    (["beam", "frame", "truss"] as const).map((mode) => tabLabel(mode, "preview")),
    ["受力变形", "受力变形", "受力变形"],
  );
  assert.equal(tabDescription("beam", "preview"), "查看支座、跨段、荷载和放大后的挠度形态");
  assert.equal(tabDescription("frame", "preview"), "查看节点、构件、支座节点、荷载、编号和放大后的变形");
  assert.equal(tabDescription("truss", "preview"), "查看节点、杆件、支座节点、荷载、编号和放大后的变形");
  assert.doesNotMatch(
    ["beam", "truss", "frame"].map((mode) => tabDescription(mode as Parameters<typeof resultTabsForMode>[0], "preview")).join("\n"),
    /节点、(?:杆件|构件)、支座、/u,
  );
});

test("框架结果页包含稳定审查标签并透传二阶与屈曲结果", () => {
  assert.equal(tabLabel("frame", "stability"), "稳定审查");
  assert.match(tabDescription("frame", "stability"), /首阶\/二阶对比/u);

  const frame = {
    analysisType: "frame",
    summary: { allowableMm: 20, maxDisplacementMm: 2.4, maxVerticalMm: 1.8, maxRotationDeg: 0.2, maxMomentKnM: 32, maxDisplacementNodeId: "N4", status: "合格", statusCode: "PASS", method: "二维平面框架杆单元法" },
    structure: {
      template: "portal_frame",
      nodes: [],
      members: [],
      loads: [],
    },
    frame: null,
    preview: null,
    diagram: null,
    payload: { analysisType: "frame", projectName: "Portal", materialId: "q345", structure: { template: "portal_frame", nodes: [], members: [], loads: [] } },
    nodeResults: [],
    memberResults: [],
    memberDiagrams: [],
    loadCaseResults: [{
      id: "DL",
      title: "恒载",
      summary: { status: "合格" },
      nodeResults: [],
      memberResults: [],
      memberDiagrams: [],
      secondOrder: {
        enabled: true,
        status: "converged",
        method: "P-Delta",
        amplificationFactor: 1.12,
        firstOrder: {
          summary: { allowableMm: 20, maxDisplacementMm: 2, maxVerticalMm: 1.4, maxRotationDeg: 0.18, maxMomentKnM: 30, maxDisplacementNodeId: "N4", status: "合格", statusCode: "PASS", method: "线性一阶" },
          nodeResults: [],
          memberResults: [],
          memberDiagrams: [],
        },
      },
      buckling: {
        enabled: true,
        status: "converged",
        method: "特征屈曲",
        criticalLoadFactor: 4.2,
        modes: [{
          modeNumber: 1,
          criticalLoadFactor: 4.2,
          residualNorm: 1e-7,
          constraintResidual: 2e-8,
          memberModeShapes: [{
            memberId: "C1",
            stationsM: [0, 2, 4],
            ratios: [0, 0.5, 1],
            ux: [0, 0.1, 0],
            uy: [0, 1, 0],
            rz: [0, 0.2, 0],
          }],
        }],
      },
    }],
    loadCombinationResults: [],
    secondOrder: {
      enabled: true,
      status: "converged",
      method: "P-Delta",
      amplificationFactor: 1.12,
      firstOrder: {
        summary: { allowableMm: 20, maxDisplacementMm: 2, maxVerticalMm: 1.4, maxRotationDeg: 0.18, maxMomentKnM: 30, maxDisplacementNodeId: "N4", status: "合格", statusCode: "PASS", method: "线性一阶" },
        nodeResults: [],
        memberResults: [],
        memberDiagrams: [],
      },
      iterationHistory: [
        { step: 1, iteration: 1, loadFactor: 0.5, residualNorm: 1e-4, displacementMm: 0.8, status: "converged" },
      ],
    },
    buckling: {
      enabled: true,
      status: "converged",
      method: "特征屈曲",
      criticalLoadFactor: 4.2,
      modes: [{
        modeNumber: 1,
        criticalLoadFactor: 4.2,
        residualNorm: 1e-7,
        constraintResidual: 2e-8,
        memberModeShapes: [{
          memberId: "C1",
          stationsM: [0, 2, 4],
          ratios: [0, 0.5, 1],
          ux: [0, 0.1, 0],
          uy: [0, 1, 0],
          rz: [0, 0.2, 0],
        }],
      }],
    },
    nodeIds: [],
    memberIds: [],
    ux_data: [],
    uy_data: [],
    rz_data: [],
    member_axial_data: [],
    member_shear_data: [],
    member_moment_data: [],
  };

  const displayed = buildDisplayedFrameResults(frame as never, { source: "case", id: "DL", label: "恒载", description: "工况 DL" });
  assert.equal(displayed?.secondOrder?.status, "converged");
  assert.equal(displayed?.buckling?.modes?.[0]?.memberModeShapes?.[0]?.memberId, "C1");
});
