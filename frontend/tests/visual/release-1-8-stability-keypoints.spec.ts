import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

type BeamPayload = {
  analysisType: "beam";
  spans?: number[];
} & Record<string, unknown>;

type FrameNode = {
  id: string;
  x: number;
  y: number;
  supportType?: string;
};

type FrameMember = {
  id: string;
  start: string;
  end: string;
  kind?: string;
};

type FramePayload = {
  analysisType: "frame";
  structure: {
    nodes: FrameNode[];
    members: FrameMember[];
    loads?: unknown[];
    loadCases?: Array<{ id: string; title: string; loads: unknown[] }>;
    loadCombinations?: Array<{ id: string; title: string; factors: Record<string, number>; tags?: string[] }>;
  };
} & Record<string, unknown>;

type TrussNode = {
  id: string;
  x: number;
  y: number;
  supportType?: string;
};

type TrussMember = {
  id: string;
  start: string;
  end: string;
  kind?: string;
};

type TrussPayload = {
  analysisType: "truss";
  structure: {
    nodes: TrussNode[];
    members: TrussMember[];
    loads?: unknown[];
    loadCases?: Array<{ id: string; title: string; loads: unknown[] }>;
    loadCombinations?: Array<{ id: string; title: string; factors: Record<string, number>; tags?: string[] }>;
  };
} & Record<string, unknown>;

type CalculationPayload = BeamPayload | FramePayload | TrussPayload;

function stabilizeWorkbench(page: Page) {
  return page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
      }
    `,
  });
}

function beamCalculationEnvelope(payload: BeamPayload) {
  const xData = [0, 1.5, 3, 4.5, 6];
  const momentData = [1.2, 5.6, 11.8, -3.2, -1.1];
  const shearData = [4.5, 1.8, -0.4, -1.9, -3.8];
  const deflectionData = [0, -0.3, -0.8, -0.4, 0];
  const beam = {
    beamType: "continuous",
    beamTypeLabel: "连续梁",
    loadType: "uniform",
    loadTypeLabel: "均布荷载",
    spans: payload.spans?.length ? payload.spans : [6],
    spanIds: ["B1"],
    totalLength: 6,
    supports: [
      { label: "S1", x: 0, type: "pinned" },
      { label: "S2", x: 6, type: "roller" },
    ],
    nodes: [
      { index: 0, id: "N1", x: 0, support: true },
      { index: 1, id: "N2", x: 6, support: true },
    ],
    loads: [{ type: "uniform", x: 3, startX: 0, endX: 6, length: 6, intensityKnPerM: 8 }],
    curve: xData.map((x, index) => ({ x, v: deflectionData[index], vMm: deflectionData[index] * 1000 })),
    spanSummaries: [{ spanIndex: 0, startX: 0, endX: 6, length: 6, maxDeflectionMm: 0.8, maxDeflectionPositionM: 3 }],
    maxDeflection: { valueM: -0.0008, valueMm: -0.8, xM: 3, spanIndex: 0 },
    reactions: [
      { dof: 0, supportId: "S1", valueN: 5400, valueKn: 5.4 },
      { dof: 1, supportId: "S2", valueN: 5400, valueKn: 5.4 },
    ],
    warnings: [],
  };

  return {
    success: true,
    operation: "calculate",
    version: "v1",
    resultHash: "release-1-8-beam-result",
    analysisType: "beam" as const,
    request: payload,
    model: { analysisType: "beam" as const, structure: { spans: beam.spans, supports: beam.supports } },
    results: {
      summary: {
        allowableMm: 18,
        allowableRatio: 250,
        maxDeflectionMm: 0.8,
        maxDeflectionPositionM: 3,
        status: "合格",
        statusCode: "PASS",
        method: "浏览器验收 mock 梁系杆单元法",
      },
      preview: beam,
      loadCaseResults: [],
      loadCombinationResults: [],
      series: {
        x_data: xData,
        v_data: deflectionData,
        moment_data: momentData,
        shear_data: shearData,
        t_data: xData.map((x) => x / 6),
        q_t_data: xData.map(() => 8),
      },
    },
    diagnostics: { status: "合格", statusCode: "PASS" },
    meta: {
      modelHash: "release-1-8-beam-model",
      requestHash: "release-1-8-beam-request",
    },
    errors: [],
  };
}

function frameCalculationEnvelope(payload: FramePayload) {
  const nodes = payload.structure.nodes;
  const members = payload.structure.members;
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const memberLength = (member: FrameMember) => {
    const start = nodeById.get(member.start);
    const end = nodeById.get(member.end);
    return start && end ? Math.hypot(end.x - start.x, end.y - start.y) || 1 : 1;
  };
  const controlMember = members.find((member) => /B\d*/u.test(member.id)) ?? members[0];
  const memberDiagrams = members.map((member, index) => {
    const length = memberLength(member);
    const stationsM = [0, 0.25 * length, 0.5 * length, 0.75 * length, length];
    const isControl = member.id === controlMember?.id;
    return {
      memberId: member.id,
      stationsM,
      stations: [0, 0.25, 0.5, 0.75, 1],
      axialKn: isControl ? [1.1, 3.2, 4.8, -1.5, -0.7] : [0.3 + index * 0.1, 0.8 + index * 0.1, 1.1 + index * 0.1, 0.4, 0.1],
      shearKn: isControl ? [0.9, 2.4, 3.8, -1.0, -1.7] : [0.2 + index * 0.05, 0.5 + index * 0.05, 0.8 + index * 0.05, 0.3, 0.1],
      momentKnM: isControl ? [1.0, 5.1, 11.4, -3.1, -0.9] : [0.4 + index * 0.1, 1.0 + index * 0.1, 1.8 + index * 0.1, 0.7, 0.2],
      deflectionMm: isControl ? [0, -0.18, -0.52, -0.24, 0] : [0, -0.05, -0.12, -0.06, 0],
    };
  });
  const secondOrder = {
    enabled: true,
    status: "converged",
    method: "P-Delta",
    converged: true,
    loadSteps: 6,
    totalIterations: 9,
    tolerance: 1e-6,
    amplificationFactor: 1.24,
    maxHorizontalDisplacementMm: 0.14,
    maxVerticalDisplacementMm: 0.92,
    maxDisplacementMm: 0.98,
    firstOrder: {
      summary: {
        allowableMm: 18,
        maxDisplacementMm: 0.78,
        maxVerticalMm: 0.72,
        maxRotationDeg: 0.08,
        maxMomentKnM: 10.2,
        maxDisplacementNodeId: "N2",
        status: "合格",
        statusCode: "PASS",
        method: "线性一阶",
      },
      nodeResults: [],
      memberResults: [],
      memberDiagrams: [],
    },
    iterationHistory: [
      { step: 1, iteration: 1, loadFactor: 0.5, residualNorm: 1e-4, displacementMm: 0.28, status: "iterating" },
      { step: 1, iteration: 2, loadFactor: 1, residualNorm: 8e-7, displacementMm: 0.92, status: "converged" },
    ],
    algorithm: { id: "corotational_newton_v1", version: "1" },
    equilibriumStatus: "not_converged",
    stabilityStatus: "near_critical",
    nonlinearPathTrace: {
      schema: "NonlinearPathTrace@1",
      algorithm: { id: "corotational_newton_v1", version: "1" },
      control: { type: "adaptive_load_control", lineSearch: "residual_reduction" },
      convergence: { relativeResidualTolerance: 1e-8 },
      mesh: {
        referenceNodes: nodes.map((node) => ({ id: node.id, x: node.x, y: node.y })),
        refinedMembers: members.map((member) => ({ id: member.id, start: member.start, end: member.end })),
      },
      steps: [
        { step: 1, loadFactor: 0.25, fixedLoadFactor: 0, pathPhase: "variable", stepSize: 0.25, iterations: 3, equilibriumStatus: "converged", stabilityStatus: "stable", minimumTangentEigenvalue: 8.4, maxDisplacementMm: 0.28 },
        { step: 2, loadFactor: 0.5, fixedLoadFactor: 0, pathPhase: "variable", stepSize: 0.25, iterations: 5, equilibriumStatus: "converged", stabilityStatus: "stable", minimumTangentEigenvalue: 3.2, maxDisplacementMm: 0.62 },
        { step: 3, loadFactor: 0.72, fixedLoadFactor: 0, pathPhase: "variable", stepSize: 0.22, iterations: 8, equilibriumStatus: "converged", stabilityStatus: "near_critical", minimumTangentEigenvalue: 0.18, maxDisplacementMm: 1.18 },
      ],
      iterations: [
        { step: 2, iteration: 4, loadFactor: 0.5, equilibriumResidualRelative: 0.0024, displacementIncrementRelative: 0.0008, energyIncrementRelative: 0.0002, status: "iterating" },
      ],
      attempts: [
        { step: 4, loadFactor: 0.8, fixedLoadFactor: 0, pathPhase: "variable", status: "cutback", terminationReason: "minimum_step_exhausted" },
      ],
      keyPoints: [
        { id: "start:keyframe:0", kind: "start", source: "keyframe", sourceIndex: 0, step: 0, pathPhase: "variable", pathProgress: 0, fixedLoadFactor: 0, loadFactor: 0, maxDisplacementMm: 0, minimumTangentEigenvalue: 10, equilibriumResidualRelative: 0, status: "converged", stabilityStatus: "stable" },
        { id: "residual_peak:iteration:0", kind: "residual_peak", source: "iteration", sourceIndex: 0, step: 2, pathPhase: "variable", pathProgress: 0.5, fixedLoadFactor: 0, loadFactor: 0.5, maxDisplacementMm: 0.62, minimumTangentEigenvalue: 3.2, equilibriumResidualRelative: 0.0024, status: "iterating", stabilityStatus: "stable" },
        { id: "minimum_stability:step:2", kind: "minimum_stability", source: "step", sourceIndex: 2, step: 3, pathPhase: "variable", pathProgress: 0.72, fixedLoadFactor: 0, loadFactor: 0.72, maxDisplacementMm: 1.18, minimumTangentEigenvalue: 0.18, equilibriumResidualRelative: 1e-9, status: "converged", stabilityStatus: "near_critical" },
        { id: "cutback:attempt:0", kind: "cutback", source: "attempt", sourceIndex: 0, step: 4, pathPhase: "variable", pathProgress: 0.8, fixedLoadFactor: 0, loadFactor: 0.8, maxDisplacementMm: 1.35, minimumTangentEigenvalue: 0.04, equilibriumResidualRelative: 0.012, status: "cutback", stabilityStatus: "near_critical" },
        { id: "last_converged:step:2", kind: "last_converged", source: "step", sourceIndex: 2, step: 3, pathPhase: "variable", pathProgress: 0.72, fixedLoadFactor: 0, loadFactor: 0.72, maxDisplacementMm: 1.18, minimumTangentEigenvalue: 0.18, equilibriumResidualRelative: 1e-9, status: "converged", stabilityStatus: "near_critical" },
        { id: "failure:attempt:0", kind: "failure", source: "attempt", sourceIndex: 0, step: 4, pathPhase: "variable", pathProgress: 0.8, fixedLoadFactor: 0, loadFactor: 0.8, maxDisplacementMm: 1.35, minimumTangentEigenvalue: 0.04, equilibriumResidualRelative: 0.012, status: "failed", stabilityStatus: "near_critical" },
      ],
      keyframes: [0, 0.25, 0.5, 0.72].map((loadFactor, step) => ({
        step,
        loadFactor,
        fixedLoadFactor: 0,
        pathPhase: "variable",
        nodeDisplacements: nodes.map((_, nodeIndex) => ({
          nodeIndex,
          uxM: nodeIndex * loadFactor * 0.00008,
          uyM: -nodeIndex * loadFactor * 0.00016,
          rzRad: nodeIndex * loadFactor * 0.00001,
        })),
      })),
      lastConverged: { loadFactor: 0.72, fixedLoadFactor: 0, maxDisplacementMm: 1.18, step: 3 },
      finalAttempt: { step: 4, loadFactor: 0.8, status: "failed", terminationReason: "minimum_step_exhausted" },
      summary: { equilibriumStatus: "not_converged", stabilityStatus: "near_critical", acceptedSteps: 3, failedAttempts: 1, terminationReason: "minimum_step_exhausted" },
    },
    methodComparison: {
      schema: "MethodComparison@1",
      methods: [
        { id: "linear_first_order_v1", label: "首阶线性" },
        { id: "initial_stress_v1", label: "初始应力兼容" },
        { id: "corotational_newton_v1", label: "共回转 Newton" },
        { id: "linear_buckling_v1", label: "线性屈曲特征值" },
      ],
      metrics: [
        { id: "max_displacement_mm", unit: "mm", comparable: true, values: { linear_first_order_v1: 0.78, initial_stress_v1: 0.96, corotational_newton_v1: 1.18 } },
        { id: "critical_load_factor", unit: "", comparable: false, unavailableReason: "临界荷载因子不与位移响应作同量纲比较", values: { linear_buckling_v1: 4.8 } },
      ],
      limitations: ["只比较当前模型的数值响应，不给出规范安全结论。"],
    },
    limitations: "P-Delta 迭代 mock",
  };
  const buckling = {
    enabled: true,
    status: "converged",
    method: "特征屈曲",
    criticalLoadFactor: 4.8,
    memberEulerScreen: [
      {
        memberId: "M1",
        compressionKn: 24,
        eulerCriticalLoadKn: 115.2,
        criticalLoadFactor: 4.8,
        utilizationRatio: 0.21,
        screeningMethod: "mock",
      },
    ],
    modes: [
      {
        modeNumber: 1,
        criticalLoadFactor: 4.8,
        residualNorm: 1e-7,
        constraintResidual: 2e-8,
        memberModeShapes: [
          {
            memberId: "M1",
            stationsM: [0, 1.5, 3, 4.5, 6],
            ratios: [0, 0.25, 0.5, 0.75, 1],
            ux: [0, 0.01, 0.02, 0.01, 0],
            uy: [0, 0.2, 0.35, -0.18, 0],
            rz: [0, 0.08, 0.15, 0.06, 0],
          },
        ],
        nodeDisplacements: [
          { nodeId: "N1", ux: 0, uy: 0, rz: 0 },
          { nodeId: "N2", ux: 0.02, uy: 0.35, rz: 0.15 },
        ],
      },
    ],
  };

  return {
    success: true,
    operation: "calculate",
    version: "v1",
    resultHash: "release-1-8-frame-result",
    analysisType: "frame" as const,
    request: payload,
    model: { analysisType: "frame" as const, structure: payload.structure },
    results: {
      summary: {
        allowableMm: 18,
        maxDisplacementMm: 0.98,
        maxVerticalMm: 0.92,
        maxRotationDeg: 0.08,
        maxMomentKnM: 11.4,
        maxDisplacementNodeId: "N2",
        status: "合格",
        statusCode: "PASS",
        method: "浏览器验收 mock 二维平面框架杆单元法",
      },
      preview: {
        analysisType: "frame" as const,
        structureType: "explicit",
        structureTypeLabel: "二维平面框架",
        nodes,
        members,
        loads: [],
        nodeResults: nodes.map((node, index) => ({
          nodeId: node.id,
          x: node.x,
          y: node.y,
          supportType: node.supportType ?? "free",
          uxMm: index * 0.02,
          uyMm: index === 0 ? 0 : -0.92,
          rotationDeg: index === 0 ? 0 : 0.08,
          resultantMm: index === 0 ? 0 : 0.92,
          reactionFxKn: index === 0 ? 3 : -3,
          reactionFyKn: index === 0 ? 6 : 6,
          reactionMzKnM: index === 0 ? 2 : -2,
        })),
        memberResults: members.map((member, index) => {
          const length = memberLength(member);
          const isControl = member.id === controlMember?.id;
          return {
            memberId: member.id,
            kind: member.kind ?? "member",
            startNode: member.start,
            endNode: member.end,
            axialStartKn: isControl ? 6 : 2 + index,
            shearStartKn: isControl ? 4 : 1.5 + index,
            momentStartKnM: isControl ? 11.4 : 2 + index,
            axialEndKn: isControl ? -6 : -(2 + index),
            shearEndKn: isControl ? -4 : -(1.5 + index),
            momentEndKnM: isControl ? -1.2 : -(2 + index),
            maxAbsAxialKn: isControl ? 6 : 2 + index,
            maxAbsShearKn: isControl ? 4 : 1.5 + index,
            maxAbsMomentKnM: isControl ? 11.4 : 2 + index,
            lengthM: length,
          };
        }),
        memberDiagrams,
        deformedNodes: nodes.map((node, index) => ({ nodeId: node.id, x: node.x + index * 0.02, y: node.y - index * 0.92 })),
        deformationScale: 1,
        summary: {
          allowableMm: 18,
          maxDisplacementMm: 0.98,
          maxVerticalMm: 0.92,
          maxRotationDeg: 0.08,
          maxMomentKnM: 11.4,
          maxDisplacementNodeId: "N2",
          status: "合格",
          statusCode: "PASS",
          method: "浏览器验收 mock 二维平面框架杆单元法",
        },
        warnings: [],
      },
      diagram: {},
      nodeResults: [
        ...nodes.map((node, index) => ({
          nodeId: node.id,
          x: node.x,
          y: node.y,
          supportType: node.supportType ?? "free",
          uxMm: index * 0.02,
          uyMm: index === 0 ? 0 : -0.92,
          rotationDeg: index === 0 ? 0 : 0.08,
          resultantMm: index === 0 ? 0 : 0.92,
          reactionFxKn: index === 0 ? 3 : -3,
          reactionFyKn: index === 0 ? 6 : 6,
          reactionMzKnM: index === 0 ? 2 : -2,
        })),
      ],
      memberResults: members.map((member, index) => {
        const length = memberLength(member);
        const isControl = member.id === controlMember?.id;
        return {
          memberId: member.id,
          kind: member.kind ?? "member",
          startNode: member.start,
          endNode: member.end,
          axialStartKn: isControl ? 6 : 2 + index,
          shearStartKn: isControl ? 4 : 1.5 + index,
          momentStartKnM: isControl ? 11.4 : 2 + index,
          axialEndKn: isControl ? -6 : -(2 + index),
          shearEndKn: isControl ? -4 : -(1.5 + index),
          momentEndKnM: isControl ? -1.2 : -(2 + index),
          maxAbsAxialKn: isControl ? 6 : 2 + index,
          maxAbsShearKn: isControl ? 4 : 1.5 + index,
          maxAbsMomentKnM: isControl ? 11.4 : 2 + index,
          lengthM: length,
        };
      }),
      memberDiagrams,
      loadCaseResults: [],
      loadCombinationResults: [],
      nodeIds: nodes.map((node) => node.id),
      memberIds: members.map((member) => member.id),
      series: {
        ux_data: nodes.map((_, index) => index * 0.02),
        uy_data: nodes.map((_, index) => (index === 0 ? 0 : -0.92)),
        rz_data: nodes.map((_, index) => (index === 0 ? 0 : 0.08)),
        member_axial_data: members.map((member, index) => ({ memberId: member.id, axialForceKn: member.id === controlMember?.id ? 6 : 2 + index })),
        member_shear_data: members.map((member, index) => ({ memberId: member.id, shearKn: member.id === controlMember?.id ? 4 : 1.5 + index })),
        member_moment_data: members.map((member, index) => ({ memberId: member.id, momentKnM: member.id === controlMember?.id ? 11.4 : 2 + index })),
      },
      secondOrder,
      buckling,
    },
    secondOrder,
    buckling,
    diagnostics: { status: "合格", statusCode: "PASS" },
    meta: {
      modelHash: "release-1-8-frame-model",
      requestHash: "release-1-8-frame-request",
    },
    errors: [],
  };
}

function trussCalculationEnvelope(payload: TrussPayload) {
  const nodes = payload.structure.nodes.slice(0, 4).map((node, index) => ({
    ...node,
    supportType: index === 0 ? "pinned" : index === 3 ? "roller" : "free",
  }));
  const members = [
    { ...(payload.structure.members[0] ?? { id: "M1", kind: "upper_chord" }), start: nodes[0]?.id ?? "N1", end: nodes[1]?.id ?? "N2" },
    { ...(payload.structure.members[1] ?? { id: "M2", kind: "upper_chord" }), start: nodes[1]?.id ?? "N2", end: nodes[2]?.id ?? "N3" },
    { ...(payload.structure.members[2] ?? { id: "M3", kind: "upper_chord" }), start: nodes[2]?.id ?? "N3", end: nodes[3]?.id ?? "N4" },
  ];
  const nodeResults = nodes.map((node, index) => ({
    nodeId: node.id,
    x: node.x,
    y: node.y,
    uxMm: index === 3 ? 0 : index * 0.04,
    uyMm: index === 1 ? 0.4 : index === 2 ? 2.4 : index === 3 ? 0 : -1.1,
    displacementMm: index === 1 ? 0.4 : index === 2 ? 2.4 : index === 3 ? 0 : -1.1,
    rxKn: 0,
    ryKn: 0,
    supportType: node.supportType ?? (index === 0 ? "pinned" : index === nodes.length - 1 ? "roller" : "free"),
  }));
  const memberResults = members.map((member, index) => ({
    memberId: member.id,
    kind: member.kind ?? "member",
    startNode: member.start,
    endNode: member.end,
    lengthM: 1.5 + index,
    axialForceKn: index === 1 ? -18 : 6 + index,
    axialStressMpa: 12 + index,
    forceState: index === 1 ? "受压" : "受拉",
  }));
  const controlNode = nodeResults.find((node) => node.displacementMm === 2.4) ?? nodeResults[2] ?? nodeResults[0];

  return {
    success: true,
    operation: "calculate",
    version: "v1",
    resultHash: "release-1-8-truss-result",
    analysisType: "truss" as const,
    request: payload,
    model: { analysisType: "truss" as const, structure: payload.structure },
    results: {
      summary: {
        allowableMm: 10,
        allowableRatio: 250,
        maxDisplacementMm: 2.4,
        maxAxialForceKn: 18,
        maxDisplacementNodeId: controlNode.nodeId,
        maxAxialForceMemberId: memberResults[1]?.memberId ?? memberResults[0]?.memberId ?? "M1",
        status: "合格",
        statusCode: "PASS",
        method: "浏览器验收 mock 平面桁架杆单元法",
      },
      preview: {
        analysisType: "truss" as const,
        structureType: "explicit",
        structureTypeLabel: "二维平面桁架",
        nodes: nodes.map((node) => ({ ...node, role: node.supportType && node.supportType !== "free" ? "support" : "joint" })),
        members,
        loads: [],
        nodeResults,
        memberResults,
        deformedNodes: nodes.map((node, index) => ({
          id: node.id,
          x: node.x + index * 0.02,
          y: node.y + (index === 1 ? 0.12 : index === nodes.length - 1 ? -0.08 : 0),
          uxMm: index === 3 ? 0 : index * 0.04,
          uyMm: index === 1 ? 0.4 : index === 2 ? 2.4 : index === 3 ? 0 : -1.1,
        })),
        deformationScale: 1,
        summary: {
          allowableMm: 10,
          allowableRatio: 250,
          maxDisplacementMm: 2.4,
          maxAxialForceKn: 18,
          maxDisplacementNodeId: controlNode.nodeId,
          maxAxialForceMemberId: memberResults[1]?.memberId ?? memberResults[0]?.memberId ?? "M1",
          status: "合格",
          statusCode: "PASS",
          method: "浏览器验收 mock 平面桁架杆单元法",
        },
        warnings: [],
      },
      diagram: {},
      nodeResults,
      memberResults,
      nodeIds: nodes.map((node) => node.id),
      memberIds: members.map((member) => member.id),
      series: {
        ux_data: nodeResults.map((node) => node.uxMm),
        uy_data: nodeResults.map((node) => node.uyMm),
        member_axial_data: memberResults.map((member) => ({ memberId: member.memberId, axialForceKn: member.axialForceKn })),
      },
    },
    diagnostics: { status: "合格", statusCode: "PASS" },
    meta: {
      modelHash: "release-1-8-truss-model",
      requestHash: "release-1-8-truss-request",
    },
    errors: [],
  };
}

async function mockCalculation(page: Page) {
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as CalculationPayload;
    const response =
      payload.analysisType === "frame"
        ? frameCalculationEnvelope(payload)
        : payload.analysisType === "truss"
          ? trussCalculationEnvelope(payload)
          : beamCalculationEnvelope(payload);

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

async function openWorkbench(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await mockCalculation(page);
  await page.goto("/");
  await stabilizeWorkbench(page);
}

async function runCalculation(page: Page, runLabel: string, completeText: string) {
  await page.getByRole("tab", { name: "结构计算", exact: true }).click();
  await page.getByRole("button", { name: runLabel }).click();
  await expect(page.getByText(completeText)).toBeVisible();
}

async function openDiagramTab(page: Page) {
  await page.getByRole("tab", { name: "工程图", exact: true }).click();
}

async function selectMetric(page: Page, tablistName: string, metricName: string) {
  await page.getByRole("tablist", { name: tablistName }).getByRole("tab", { name: metricName, exact: true }).click();
}

test("梁系工程图关键点暴露 data-keypoint-kind 与站位数值", async ({ page }) => {
  await openWorkbench(page);
  await runCalculation(page, "运行梁系计算", "梁系计算完成");
  await openDiagramTab(page);
  await selectMetric(page, "梁系工程图类型", "弯矩图");

  const globalExtreme = page.locator('[data-keypoint-kind="global-extreme"]').first();
  const firstEndpoint = page.locator('[data-keypoint-kind="endpoint"]').filter({ hasText: "x = 0.00 m" }).first();

  await expect(globalExtreme).toBeVisible();
  await expect(globalExtreme).toContainText("全局极值");
  await expect(globalExtreme).toContainText("x = 3.00 m");
  await expect(globalExtreme).toContainText("11.8");
  await expect(firstEndpoint).toBeVisible();
  await expect(firstEndpoint).toContainText("端点");
  await expect(firstEndpoint).toContainText("x = 0.00 m");
  await expect(firstEndpoint).toContainText("1.2");
});

test("框架工程图关键点暴露 data-keypoint-kind 与站位数值", async ({ page }) => {
  await openWorkbench(page);
  await page.locator("aside").filter({ hasText: "分析对象" }).getByRole("button", { name: /平面框架-1\s+(平面框架|框架)/ }).click();
  await runCalculation(page, "运行平面框架计算", "平面框架计算完成");
  await openDiagramTab(page);
  await selectMetric(page, "框架工程图类型", "弯矩图");

  const globalExtreme = page.locator('[data-keypoint-kind="global-extreme"]').first();
  const endPoint = page.locator('[data-keypoint-kind="endpoint"]').first();

  await expect(globalExtreme).toBeVisible();
  await expect(globalExtreme).toContainText("全局极值");
  await expect(globalExtreme.locator("text").filter({ hasText: "全局极值" })).toHaveCount(0);
  await expect(globalExtreme).toContainText(/x = \d+\.\d{2} m/u);
  await expect(globalExtreme).toContainText(/kN·m/u);
  await expect(endPoint).toBeVisible();
  await expect(endPoint).toContainText("端点");
  await expect(endPoint).toContainText(/x = \d+\.\d{2} m/u);
  await expect(endPoint).toContainText(/kN·m/u);

  await page.getByRole("button", { name: "显示关键点类型" }).click();
  await expect(globalExtreme.locator("text").filter({ hasText: "全局极值" })).toBeVisible();
  await expect(endPoint.locator("text").filter({ hasText: "端点" })).toBeVisible();
});

test("v1.8.1 几何非线性过程播放显示 canonical 关键点、数值和分层解释", async ({ page }) => {
  await openWorkbench(page);
  await page.locator("aside").filter({ hasText: "分析对象" }).getByRole("button", { name: /平面框架-1\s+(平面框架|框架)/ }).click();
  await runCalculation(page, "运行平面框架计算", "平面框架计算完成");
  await page.getByRole("tab", { name: "稳定审查", exact: true }).click();

  await expect(page.getByRole("heading", { name: "几何非线性过程播放" })).toBeVisible();
  await expect(page.getByRole("img", { name: /几何非线性荷载路径.*残差峰值/u })).toBeVisible();
  await expect(page.getByText(/残差峰值 · r 0\.002 \/ 0\.62 mm/u).first()).toBeVisible();
  await expect(page.getByText(/最小切线指标 0\.18/u).first()).toBeVisible();
  await expect(page.getByText(/切步回退 · λ 0\.8/u).first()).toBeVisible();
  await expect(page.getByText(/最后收敛 · λ 0\.72/u).first()).toBeVisible();
  await expect(page.getByText(/终止 · λ 0\.8/u).first()).toBeVisible();
  await expect(page.getByText("方法比较", { exact: true })).toBeVisible();
  await expect(page.getByText("共回转 Newton · 最大位移", { exact: true })).toBeVisible();
  await expect(page.getByText("线性屈曲特征值 · 临界荷载因子", { exact: true })).toBeVisible();
  await expect(page.getByText("corotational_newton_v1", { exact: true })).toHaveCount(0);

  const pathChart = page.getByRole("img", { name: /几何非线性荷载路径.*残差峰值/u });
  const chartOverflow = await pathChart.evaluate((chart) => {
    const container = chart.parentElement!;
    return { clientWidth: container.clientWidth, scrollWidth: container.scrollWidth };
  });
  expect(chartOverflow.scrollWidth).toBeLessThanOrEqual(chartOverflow.clientWidth + 1);

  const labelBounds = await page.locator('[data-keypoint-kind] text').evaluateAll((labels) => labels.map((label) => {
    const bounds = label.getBoundingClientRect();
    return { text: label.textContent ?? "", left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
  }));
  for (let leftIndex = 0; leftIndex < labelBounds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < labelBounds.length; rightIndex += 1) {
      const left = labelBounds[leftIndex]!;
      const right = labelBounds[rightIndex]!;
      const overlaps = left.left < right.right && right.left < left.right && left.top < right.bottom && right.top < left.bottom;
      expect(overlaps, `关键点标签不应重叠：${left.text} / ${right.text}`).toBe(false);
    }
  }

  const chartBounds = await pathChart.boundingBox();
  expect(chartBounds).not.toBeNull();
  for (const label of labelBounds) {
    expect(label.left, `关键点标签左侧不应被裁切：${label.text}`).toBeGreaterThanOrEqual((chartBounds?.x ?? 0) - 1);
    expect(label.right, `关键点标签右侧不应被裁切：${label.text}`).toBeLessThanOrEqual((chartBounds?.x ?? 0) + (chartBounds?.width ?? 0) + 1);
  }

  await page.getByRole("button", { name: "算法", exact: true }).click();
  await expect(page.getByText(/共回转基本变形.*一致切线.*全 Newton/u)).toBeVisible();
  await page.getByRole("button", { name: "入门", exact: true }).click();
  await expect(page.getByText(/播放的是实际求解路径/u)).toBeVisible();

  const slider = page.getByRole("slider", { name: "选择非线性荷载步" });
  await slider.fill("1");
  await expect(page.getByText("2/4", { exact: true })).toBeVisible();
});

test("桁架位移图暴露控制值、端点与真零节点标签", async ({ page }) => {
  await openWorkbench(page);
  await page.locator("aside").filter({ hasText: "分析对象" }).getByRole("button", { name: /平面桁架-1\s+(平面桁架|桁架)/ }).click();
  await runCalculation(page, "运行平面桁架计算", "平面桁架计算完成");
  await openDiagramTab(page);
  await selectMetric(page, "桁架工程图类型", "节点位移图");

  const control = page.locator('[data-keypoint-kind="control"]').first();
  const zero = page.locator('[data-keypoint-kind="zero"]').first();
  const endPoints = page.locator('[data-keypoint-kind="end"]');

  await expect(control).toBeVisible();
  await expect(control).toContainText("控制值");
  await expect(control.locator("text").filter({ hasText: "控制值" })).toHaveCount(0);
  await expect(control).toContainText("2.4");
  await expect(control).toContainText("mm");
  await expect(zero).toBeVisible();
  await expect(zero).toContainText("零点");
  await expect(zero.locator("text").filter({ hasText: "零点" })).toHaveCount(0);
  await expect(zero).toContainText("0");
  await expect(zero).toContainText("mm");
  await expect(endPoints).toHaveCount(2);
  await expect(endPoints.first()).toBeVisible();
  await expect(endPoints.nth(1)).toBeVisible();
  await expect(endPoints.first()).toContainText("端点");
  await expect(endPoints.nth(1)).toContainText("端点");

  await page.getByRole("button", { name: "显示关键点类型" }).click();
  await expect(control.locator("text").filter({ hasText: "控制值" })).toBeVisible();
  await expect(zero.locator("text").filter({ hasText: "零点" })).toBeVisible();
  await expect(endPoints.first().locator("text").filter({ hasText: "端点" })).toBeVisible();
});

test("框架稳定审查面板暴露 P-Delta 轨迹、模态选择器与屈曲模态", async ({ page }) => {
  await openWorkbench(page);
  await page.locator("aside").filter({ hasText: "分析对象" }).getByRole("button", { name: /平面框架-1\s+(平面框架|框架)/ }).click();
  await runCalculation(page, "运行平面框架计算", "平面框架计算完成");
  await page.getByRole("tab", { name: "稳定审查", exact: true }).click();

  await expect(page.getByText("平衡状态", { exact: true })).toBeVisible();
  await expect(page.getByText("P-Delta · 共回转 Newton 法", { exact: true })).toBeVisible();
  await expect(page.getByText("稳定状态", { exact: true })).toBeVisible();
  await expect(page.getByText("收敛轨迹", { exact: true })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "荷载因子", exact: true })).toBeVisible();
  await expect(page.getByText("loadFactor", { exact: true })).toHaveCount(0);
  const summaryWidths = await page.getByTestId("stability-summary-grid").locator(":scope > div").evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().width));
  expect(Math.min(...summaryWidths)).toBeGreaterThan(140);
  await expect(page.getByText("模态选择器", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "屈曲模态" })).toBeVisible();
  await expect(page.getByRole("button", { name: /查看屈曲模态 1，临界因子 4.8/u })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("img", { name: /屈曲模态 1 全局振型图/u })).toBeVisible();
  await expect(page.getByRole("cell", { name: "已收敛", exact: true })).toBeVisible();
  await expect(page.getByRole("row", { name: /1 1 0\.5 0\.0001/u })).toBeVisible();
});
