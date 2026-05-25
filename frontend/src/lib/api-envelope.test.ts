import test from "node:test";
import assert from "node:assert/strict";

import { analysisRequestFromResult, beamResultForView, frameResultForView, normalizeAnalysisResponse, trussResultForView } from "./api-envelope.ts";


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
});
