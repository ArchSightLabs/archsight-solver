import test from "node:test";
import assert from "node:assert/strict";

import { analysisRequestFromResult, apiErrorMessage, beamResultForView, frameResultForView, normalizeAnalysisResponse, trussResultForView } from "./api-envelope.ts";


test("normalizeAnalysisResponse maps unified beam envelope back to beam result shape", () => {
  const normalized = normalizeAnalysisResponse({
    analysisType: "beam",
    version: "v1",
    request: {
      analysisType: "beam",
      spans: [4, 4],
      beamType: "continuous",
      loadType: "uniform",
    },
    model: {
      analysisType: "beam",
      structure: {
        beamType: "continuous",
      },
    },
    results: {
      summary: {
        maxDeflectionMm: 1.25,
        maxDeflectionPositionM: 2,
        allowableMm: 16,
        allowableRatio: 250,
        status: "合格",
        statusCode: "PASS",
        method: "梁单元法 + Hermite 位移插值",
      },
      preview: {
        beamType: "continuous",
        loadType: "uniform",
      },
      diagram: {
        supportPositions: [0, 4, 8],
      },
      series: {
        x_data: [0, 4, 8],
        v_data: [0, -0.001, 0],
        moment_data: [0, 12, 0],
        shear_data: [8, 0, -8],
        t_data: [0, 1, 0],
        q_t_data: [1, 1, 1],
      },
    },
    diagnostics: {
      status: "合格",
      statusCode: "PASS",
    },
    errors: [],
  });

  assert.equal(normalized.analysisType, "beam");
  assert.equal(normalized.payload?.analysisType, "beam");
  assert.equal(normalized.apiEnvelope?.results?.summary, normalized.summary);
  assert.deepEqual(analysisRequestFromResult(normalized), {
    analysisType: "beam",
    spans: [4, 4],
    beamType: "continuous",
    loadType: "uniform",
  });
  assert.equal(normalized.beam?.beamType, "continuous");
  assert.deepEqual(normalized.x_data, [0, 4, 8]);
  assert.deepEqual(normalized.moment_data, [0, 12, 0]);
  assert.deepEqual(normalized.shear_data, [8, 0, -8]);
  assert.equal(normalized.summary?.statusCode, "PASS");
  assert.equal(beamResultForView({ ...normalized, summary: { ...normalized.summary, statusCode: "REVIEW" as const } })?.summary?.statusCode, "PASS");
});

test("evidence objects stay normalized when the result view reads its raw apiEnvelope", () => {
  const normalized = normalizeAnalysisResponse({
    analysisType: "beam",
    version: "v1",
    resultHash: "result-1",
    request: { analysisType: "beam", spans: [4], beamType: "simply_supported", loadType: "uniform" },
    model: { analysisType: "beam", structure: { spans: [4] } },
    results: {
      resultHash: "result-1",
      summary: { status: "合格", statusCode: "PASS" },
      preview: { spans: [4] },
      series: {},
      calculationTrace: { stages: [{ stage: "input_normalized", summary: { availability: "available" } }] },
      criticalPoints: { points: [{ id: "cp-1", object: "beam", objectId: "beam", metric: "moment", value: 1 }] },
      reviewPoints: { points: [{ id: "rp-1", targetType: "station", targetId: "beam", metric: "deflection", station: 2 }] },
      governingEnvelope: { entries: [{ id: "env-1", metric: "moment", value: 1, sourceId: "LC1" }] },
      calculationSnapshot: { schema: "CalculationSnapshot@1", resultHash: "result-1", summary: { maxMomentKnM: 1 } },
    },
    diagnostics: {},
    meta: { requestHash: "request-1", modelHash: "model-1", generatedAt: "2026-08-23T08:00:00Z" },
  });
  const viewed = beamResultForView(normalized);

  assert.equal(viewed?.calculationTrace?.[0]?.stage, "input_normalized");
  assert.equal(viewed?.criticalPoints?.[0]?.metricKey, "moment");
  assert.equal(viewed?.reviewPoints?.[0]?.targetId, "beam");
  assert.equal(viewed?.governingEnvelope?.[0]?.sourceId, "LC1");
  assert.equal(viewed?.calculationSnapshot?.canonicalHash, "result-1");
});


test("normalizeAnalysisResponse maps unified truss envelope back to truss result shape", () => {
  const normalized = normalizeAnalysisResponse({
    analysisType: "truss",
    version: "v1",
    request: {
      analysisType: "truss",
      projectName: "Roof",
      structure: {
        nodes: [{ id: "N1", x: 0, y: 0 }],
        members: [{ id: "M1", start: "N1", end: "N2" }],
        loads: [],
      },
    },
    model: {
      analysisType: "truss",
      structure: {
        nodes: [{ id: "N1", x: 0, y: 0 }],
        members: [{ id: "M1", start: "N1", end: "N2" }],
        loads: [],
      },
    },
    results: {
      summary: {
        allowableMm: 10,
        allowableRatio: 250,
        maxDisplacementMm: 1.2,
        maxDisplacementNodeId: "N2",
        maxAxialForceKn: 12,
        maxAxialForceMemberId: "M1",
        status: "合格",
        statusCode: "PASS",
        method: "二维平面桁架杆单元法",
      },
      preview: {
        analysisType: "truss",
        structureType: "explicit",
        structureTypeLabel: "二维平面桁架",
        nodes: [{ id: "N1", x: 0, y: 0, role: "support" }],
        members: [{ id: "M1", start: "N1", end: "N2" }],
        loads: [],
        nodeResults: [],
        memberResults: [],
        deformedNodes: [],
        deformationScale: 1,
        summary: {
          allowableMm: 10,
          allowableRatio: 250,
          maxDisplacementMm: 1.2,
          maxAxialForceKn: 12,
          maxDisplacementNodeId: "N2",
          maxAxialForceMemberId: "M1",
          status: "合格",
          statusCode: "PASS",
          method: "二维平面桁架杆单元法",
        },
        warnings: [],
      },
      diagram: {},
      nodeResults: [{ nodeId: "N1" }],
      memberResults: [{ memberId: "M1" }],
      nodeIds: ["N1"],
      memberIds: ["M1"],
      series: {
        ux_data: [0],
        uy_data: [0],
        member_axial_data: [{ memberId: "M1", axialForceKn: 12 }],
      },
    },
    diagnostics: {
      status: "合格",
      statusCode: "PASS",
    },
    errors: [],
  });

  assert.equal(normalized.analysisType, "truss");
  assert.equal(normalized.payload?.analysisType, "truss");
  assert.equal(normalized.apiEnvelope?.results?.summary, normalized.summary);
  assert.equal(normalized.truss?.structureTypeLabel, "二维平面桁架");
  assert.deepEqual(normalized.nodeIds, ["N1"]);
  assert.deepEqual(normalized.member_axial_data, [{ memberId: "M1", axialForceKn: 12 }]);
  assert.equal(trussResultForView({ ...normalized, nodeIds: ["legacy-node"] })?.nodeIds[0], "N1");
});

test("normalizeAnalysisResponse maps unified frame envelope back to frame result shape", () => {
  const normalized = normalizeAnalysisResponse({
    analysisType: "frame",
    version: "v1",
    request: {
      analysisType: "frame",
      projectName: "Portal",
      structure: {
        nodes: [{ id: "N1", x: 0, y: 0 }],
        members: [{ id: "C1", start: "N1", end: "N2" }],
        loads: [],
      },
    },
    model: {
      analysisType: "frame",
      structure: {
        nodes: [{ id: "N1", x: 0, y: 0 }],
        members: [{ id: "C1", start: "N1", end: "N2" }],
        loads: [],
      },
    },
    results: {
      summary: {
        allowableMm: 20,
        maxDisplacementMm: 2.4,
        maxVerticalMm: 1.8,
        maxRotationDeg: 0.2,
        maxMomentKnM: 32,
        maxDisplacementNodeId: "N4",
        status: "合格",
        statusCode: "PASS",
        method: "二维平面框架杆单元法",
      },
      preview: {
        analysisType: "frame",
        structureType: "portal_frame",
        structureTypeLabel: "二维平面框架",
        nodes: [],
        members: [],
        loads: [],
        nodeResults: [],
        memberResults: [],
        deformedNodes: [],
        deformationScale: 1,
        summary: {
          maxDisplacementMm: 2.4,
          maxVerticalMm: 1.8,
          maxRotationDeg: 0.2,
          maxDisplacementNodeId: "N4",
          status: "合格",
        },
        warnings: [],
      },
      diagram: {},
      nodeResults: [{ nodeId: "N1" }],
      memberResults: [{ memberId: "C1" }],
      memberDiagrams: [{ memberId: "C1", stations: [0, 1], stationsM: [0, 4], axialKn: [0, 0], shearKn: [5, -5], momentKnM: [0, 0], deflectionMm: [0, -1] }],
      loadCaseResults: [{ id: "DL", title: "恒载", summary: { status: "合格" }, nodeResults: [], memberResults: [], memberDiagrams: [] }],
      loadCombinationResults: [{ id: "ULS1", title: "基本组合", factors: { DL: 1.2 }, summary: { status: "合格" }, nodeResults: [], memberResults: [], memberDiagrams: [] }],
      secondOrder: {
        enabled: true,
        status: "converged",
        method: "P-Delta",
        amplificationFactor: 1.18,
        firstOrder: {
          summary: {
            allowableMm: 20,
            maxDisplacementMm: 2.1,
            maxVerticalMm: 1.5,
            maxRotationDeg: 0.2,
            maxMomentKnM: 31,
            maxDisplacementNodeId: "N4",
            status: "合格",
            statusCode: "PASS",
            method: "线性一阶",
          },
          nodeResults: [{ nodeId: "N1" }],
          memberResults: [{ memberId: "C1" }],
          memberDiagrams: [{ memberId: "C1", stations: [0, 1], stationsM: [0, 4], axialKn: [0, 0], shearKn: [0, 0], momentKnM: [0, 0], deflectionMm: [0, 0] }],
        },
      },
      buckling: {
        enabled: true,
        status: "converged",
        method: "特征屈曲",
        criticalLoadFactor: 4.8,
        modes: [{
          modeNumber: 1,
          criticalLoadFactor: 4.8,
          residualNorm: 1e-7,
          constraintResidual: 1e-8,
          memberModeShapes: [{
            memberId: "C1",
            stationsM: [0, 2, 4],
            ratios: [0, 0.5, 1],
            ux: [0, 0.2, 0],
            uy: [0, 1, 0],
            rz: [0, 0.1, 0],
          }],
        }],
      },
      nodeIds: ["N1", "N4"],
      memberIds: ["C1"],
      series: {
        ux_data: [0, 1.1],
        uy_data: [0, -2.4],
        rz_data: [0, 0.2],
        member_axial_data: [10.5],
        member_shear_data: [6.3],
        member_moment_data: [32],
      },
    },
    diagnostics: {
      status: "合格",
      statusCode: "PASS",
      method: "二维平面框架杆单元法",
    },
    errors: [],
  });

  assert.equal(normalized.analysisType, "frame");
  assert.equal(normalized.payload?.analysisType, "frame");
  assert.equal(normalized.apiEnvelope?.results?.summary, normalized.summary);
  assert.equal(normalized.summary?.statusCode, "PASS");
  assert.deepEqual(normalized.nodeIds, ["N1", "N4"]);
  assert.deepEqual(normalized.member_moment_data, [32]);
  assert.deepEqual(normalized.memberDiagrams[0]?.momentKnM, [0, 0]);
  assert.equal(normalized.loadCombinationResults?.[0]?.factors.DL, 1.2);
  assert.equal(normalized.secondOrder?.status, "converged");
  assert.equal(normalized.buckling?.modes?.[0]?.memberModeShapes?.[0]?.memberId, "C1");
  const drifted = {
    ...normalized,
    summary: { ...normalized.summary, statusCode: "REVIEW" as const },
    nodeIds: ["legacy-node"],
    loadCombinationResults: [],
  };
  const view = frameResultForView(drifted);
  assert.equal(view?.summary?.statusCode, "PASS");
  assert.deepEqual(view?.nodeIds, ["N1", "N4"]);
  assert.equal(view?.loadCombinationResults?.[0]?.factors.DL, 1.2);
  assert.equal(view?.secondOrder?.amplificationFactor, 1.18);
  assert.equal(view?.buckling?.criticalLoadFactor, 4.8);
});

test("apiErrorMessage prefers diagnostics issue messages", () => {
  assert.equal(
    apiErrorMessage({
      diagnostics: {
        issues: [
          {
            code: "STRUCTURE_UNSTABLE_CONSTRAINTS",
            severity: "error",
            category: "constraint",
            title: "结构约束不足",
            detail: "当前支座不足以消除刚体位移。",
            suggestions: ["检查支座约束。"],
            analysisType: "frame",
            objectRefs: [{ kind: "node", id: "N1" }],
            actions: [{ id: "review_supports", label: "检查支座与约束" }],
          },
        ],
      },
      error: "后端通用错误",
    }, "求解失败"),
    "结构约束不足：当前支座不足以消除刚体位移。 建议：检查支座约束。",
  );

  assert.equal(apiErrorMessage({ error: { message: "结构错误" } }, "求解失败"), "结构错误");
});
