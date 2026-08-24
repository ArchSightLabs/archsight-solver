import { expect, test, type Locator, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

type AnalysisMode = "beam" | "frame" | "truss";

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

function canonicalTrace() {
  return [
    { stage: "input_normalized", title: "输入归一化", detail: "请求、结构和结果模板已统一。", step: 1, status: "done" },
    { stage: "dof_mapping", title: "自由度映射", detail: "自由度编号与约束映射完成。", step: 2, status: "done" },
    { stage: "element_process", title: "单元处理", detail: "单元刚度与等效荷载已求出。", step: 3, status: "done" },
    { stage: "global_assembly", title: "全局装配", detail: "整体方程已装配。", step: 4, status: "done" },
    { stage: "boundary_reduction", title: "边界约束消元", detail: "支座与约束已施加。", step: 5, status: "done" },
    { stage: "solver_diagnostics", title: "求解器诊断", detail: "数值诊断未发现异常。", step: 6, status: "done" },
    { stage: "result_recovery", title: "结果回代", detail: "位移、内力和反力已回代恢复。", step: 7, status: "done" },
    { stage: "equilibrium_check", title: "平衡复核", detail: "控制值与平衡检查已通过。", step: 8, status: "done" },
  ];
}

function canonicalCriticalPoints(mode: AnalysisMode) {
  if (mode === "frame") {
    return [
      { id: "frame-critical-start", kind: "endpoint", label: "端点", metricKey: "momentKnM", value: 1.0, unit: "kN·m", station: 0, sourceType: "member", sourceId: "M1" },
      { id: "frame-critical-peak", kind: "global-extreme", label: "全局极值", metricKey: "momentKnM", value: 11.4, unit: "kN·m", station: 3, sourceType: "member", sourceId: "M1" },
      { id: "frame-critical-end", kind: "endpoint", label: "端点", metricKey: "momentKnM", value: -1.2, unit: "kN·m", station: 6, sourceType: "member", sourceId: "M1" },
    ];
  }

  if (mode === "truss") {
    return [
      { id: "truss-critical-start", kind: "endpoint", label: "端点", metricKey: "axialForceKn", value: 6, unit: "kN", station: 0, sourceType: "member", sourceId: "M1" },
      { id: "truss-critical-peak", kind: "global-extreme", label: "全局极值", metricKey: "axialForceKn", value: 18, unit: "kN", station: 1.5, sourceType: "member", sourceId: "M2" },
      { id: "truss-critical-end", kind: "endpoint", label: "端点", metricKey: "axialForceKn", value: -9, unit: "kN", station: 3, sourceType: "member", sourceId: "M3" },
    ];
  }

  return [
    { id: "beam-critical-start", kind: "endpoint", label: "端点", metricKey: "momentKnM", value: 1.2, unit: "kN·m", station: 0, sourceType: "beam", sourceId: "B1" },
    { id: "beam-critical-peak", kind: "global-extreme", label: "全局极值", metricKey: "momentKnM", value: 11.8, unit: "kN·m", station: 3, sourceType: "beam", sourceId: "B1" },
    { id: "beam-critical-end", kind: "endpoint", label: "端点", metricKey: "momentKnM", value: -1.1, unit: "kN·m", station: 6, sourceType: "beam", sourceId: "B1" },
  ];
}

function canonicalEnvelope(mode: AnalysisMode) {
  if (mode === "frame") {
    return [
      {
        id: "frame-envelope-1",
        metricKey: "maxMomentKnM",
        label: "控制来源 1",
        value: 11.4,
        absoluteValue: 11.4,
        relativeValue: 0.95,
        unit: "kN·m",
        sourceType: "member",
        sourceId: "M1",
        sourceLabel: "主控制构件",
        side: "上",
        sourceHash: "fnv1a64:frame-envelope-1",
      },
      {
        id: "frame-envelope-2",
        metricKey: "maxDisplacementMm",
        label: "控制来源 2",
        value: 0.98,
        absoluteValue: 0.98,
        relativeValue: 0.06,
        unit: "mm",
        sourceType: "node",
        sourceId: "N2",
        sourceLabel: "控制节点",
        side: "右",
        sourceHash: "fnv1a64:frame-envelope-2",
      },
    ];
  }

  if (mode === "truss") {
    return [
      {
        id: "truss-envelope-1",
        metricKey: "maxAxialForceKn",
        label: "控制来源 1",
        value: 18,
        absoluteValue: 18,
        relativeValue: 1,
        unit: "kN",
        sourceType: "member",
        sourceId: "M2",
        sourceLabel: "受压杆件",
        side: "右",
        sourceHash: "fnv1a64:truss-envelope-1",
      },
      {
        id: "truss-envelope-2",
        metricKey: "maxDisplacementMm",
        label: "控制来源 2",
        value: 2.4,
        absoluteValue: 2.4,
        relativeValue: 0.24,
        unit: "mm",
        sourceType: "node",
        sourceId: "N3",
        sourceLabel: "位移控制节点",
        side: "上",
        sourceHash: "fnv1a64:truss-envelope-2",
      },
    ];
  }

  return [
    {
      id: "beam-envelope-1",
      metricKey: "maxDeflectionMm",
      label: "控制来源 1",
      value: 0.8,
      absoluteValue: 0.8,
      relativeValue: 0.09,
      unit: "mm",
      sourceType: "beam",
      sourceId: "B1",
      sourceLabel: "主控梁跨",
      side: "下",
      sourceHash: "fnv1a64:beam-envelope-1",
    },
    {
      id: "beam-envelope-2",
      metricKey: "maxMomentKnM",
      label: "控制来源 2",
      value: 11.8,
      absoluteValue: 11.8,
      relativeValue: 0.96,
      unit: "kN·m",
      sourceType: "beam",
      sourceId: "B1",
      sourceLabel: "弯矩控制截面",
      side: "上",
      sourceHash: "fnv1a64:beam-envelope-2",
    },
  ];
}

function createCalculationSnapshot(mode: AnalysisMode, summary: Record<string, unknown>, reviewPoints: unknown[]) {
  const trace = canonicalTrace();
  const criticalPoints = canonicalCriticalPoints(mode);
  const governingEnvelope = canonicalEnvelope(mode);
  return {
    id: `${mode}-snapshot-current`,
    name: `${mode === "beam" ? "梁系" : mode === "frame" ? "框架" : "桁架"}当前快照`,
    analysisMode: mode,
    createdAt: "2026-08-23T08:00:00.000Z",
    summary,
    trace,
    criticalPoints,
    reviewPoints,
    governingEnvelope,
    meta: {
      scenario: "release-1-8",
      analysisMode: mode,
    },
    sourceMeta: {
      source: "visual-release-1-8",
      analysisMode: mode,
    },
  };
}

function canonicalArtifacts(mode: AnalysisMode, summary: Record<string, unknown>, reviewPoints: unknown[] = []) {
  return {
    calculationTrace: canonicalTrace(),
    criticalPoints: canonicalCriticalPoints(mode),
    governingEnvelope: canonicalEnvelope(mode),
    calculationSnapshot: createCalculationSnapshot(mode, summary, reviewPoints),
    reviewPoints,
  };
}

function beamCalculationEnvelope(payload: BeamPayload, summaryOverrides: Record<string, unknown> = {}) {
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
  const summary = {
    allowableMm: 18,
    allowableRatio: 250,
    maxDeflectionMm: 0.8,
    maxDeflectionPositionM: 3,
    status: "合格",
    statusCode: "PASS",
    method: "浏览器验收 mock 梁系杆单元法",
    ...summaryOverrides,
  };
  const reviewPoints = Array.isArray(payload.reviewPoints) ? payload.reviewPoints.map((point) => ({ ...(point as Record<string, unknown>) })) : [];
  const artifacts = canonicalArtifacts("beam", summary, reviewPoints);

  return {
    success: true,
    operation: "calculate",
    version: "v1",
    resultHash: "release-1-8-beam-result",
    analysisType: "beam" as const,
    request: payload,
    model: { analysisType: "beam" as const, structure: { spans: beam.spans, supports: beam.supports } },
    results: {
      summary,
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
      calculationTrace: artifacts.calculationTrace,
      criticalPoints: artifacts.criticalPoints,
      reviewPoints: artifacts.reviewPoints,
      governingEnvelope: artifacts.governingEnvelope,
      calculationSnapshot: artifacts.calculationSnapshot,
    },
    diagnostics: { status: "合格", statusCode: "PASS" },
    meta: {
      generatedAt: "2026-08-23T08:00:00.000Z",
      modelHash: "release-1-8-beam-model",
      requestHash: "release-1-8-beam-request",
    },
    errors: [],
  };
}

function frameCalculationEnvelope(payload: FramePayload, summaryOverrides: Record<string, unknown> = {}) {
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
  const summary = {
    allowableMm: 18,
    maxDisplacementMm: 0.98,
    maxVerticalMm: 0.92,
    maxRotationDeg: 0.08,
    maxMomentKnM: 11.4,
    maxDisplacementNodeId: "N2",
    status: "合格",
    statusCode: "PASS",
    method: "浏览器验收 mock 二维平面框架杆单元法",
    ...summaryOverrides,
  };
  const reviewPoints = Array.isArray(payload.reviewPoints) ? payload.reviewPoints.map((point) => ({ ...(point as Record<string, unknown>) })) : [];
  const artifacts = canonicalArtifacts("frame", summary, reviewPoints);

  return {
    success: true,
    operation: "calculate",
    version: "v1",
    resultHash: "release-1-8-frame-result",
    analysisType: "frame" as const,
    request: payload,
    model: { analysisType: "frame" as const, structure: payload.structure },
    results: {
      summary,
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
      calculationTrace: artifacts.calculationTrace,
      criticalPoints: artifacts.criticalPoints,
      reviewPoints: artifacts.reviewPoints,
      governingEnvelope: artifacts.governingEnvelope,
      calculationSnapshot: artifacts.calculationSnapshot,
      secondOrder,
      buckling,
    },
    secondOrder,
    buckling,
    diagnostics: { status: "合格", statusCode: "PASS" },
    meta: {
      generatedAt: "2026-08-23T08:00:00.000Z",
      modelHash: "release-1-8-frame-model",
      requestHash: "release-1-8-frame-request",
    },
    errors: [],
  };
}

function trussCalculationEnvelope(payload: TrussPayload, summaryOverrides: Record<string, unknown> = {}) {
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
  const summary = {
    allowableMm: 10,
    allowableRatio: 250,
    maxDisplacementMm: 2.4,
    maxAxialForceKn: 18,
    maxDisplacementNodeId: controlNode.nodeId,
    maxAxialForceMemberId: memberResults[1]?.memberId ?? memberResults[0]?.memberId ?? "M1",
    status: "合格",
    statusCode: "PASS",
    method: "浏览器验收 mock 平面桁架杆单元法",
    ...summaryOverrides,
  };
  const reviewPoints = Array.isArray(payload.reviewPoints) ? payload.reviewPoints.map((point) => ({ ...(point as Record<string, unknown>) })) : [];
  const artifacts = canonicalArtifacts("truss", summary, reviewPoints);

  return {
    success: true,
    operation: "calculate",
    version: "v1",
    resultHash: "release-1-8-truss-result",
    analysisType: "truss" as const,
    request: payload,
    model: { analysisType: "truss" as const, structure: payload.structure },
    results: {
      summary,
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
      calculationTrace: artifacts.calculationTrace,
      criticalPoints: artifacts.criticalPoints,
      reviewPoints: artifacts.reviewPoints,
      governingEnvelope: artifacts.governingEnvelope,
      calculationSnapshot: artifacts.calculationSnapshot,
    },
    diagnostics: { status: "合格", statusCode: "PASS" },
    meta: {
      generatedAt: "2026-08-23T08:00:00.000Z",
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

async function openMode(page: Page, mode: AnalysisMode) {
  if (mode === "frame") {
    await page.locator("aside").filter({ hasText: "分析对象" }).getByRole("button", { name: /平面框架-1\s+(平面框架|框架)/ }).click();
    return;
  }
  if (mode === "truss") {
    await page.locator("aside").filter({ hasText: "分析对象" }).getByRole("button", { name: /平面桁架-1\s+(平面桁架|桁架)/ }).click();
  }
}

async function runCalculation(page: Page, runLabel: string, completeText: string) {
  await page.getByRole("tab", { name: "结构计算", exact: true }).click();
  await page.getByRole("button", { name: runLabel }).click();
  await expect(page.getByText(completeText)).toBeVisible();
}

async function openCalculationTrace(page: Page) {
  const tab = page.getByRole("tab", { name: "计算过程", exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "计算过程" })).toBeVisible();
}

async function openCriticalPoints(page: Page) {
  const tab = page.getByRole("tab", { name: "关键点", exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "关键点" })).toBeVisible();
}

async function openSnapshots(page: Page) {
  const tab = page.getByRole("tab", { name: "快照对比", exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tabpanel", { name: "快照对比" })).toBeVisible();
}

type UmamiEventRecord = {
  name: string;
  data: Record<string, unknown>;
};

const ALLOWED_UMAMI_KEYS = new Set([
  "schema_version",
  "app_version",
  "workspace_mode",
  "analysis_mode",
  "export_format",
  "failure_kind",
  "entry_source",
  "project_source",
  "save_method",
]);

async function installMockUmamiTracker(page: Page) {
  await page.route("**/script.js", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: "window.umami = window.umami || { track() { return undefined; } };",
    });
  });
  await page.addInitScript(() => {
    const events: Array<{ name: string; data: Record<string, unknown> }> = [];
    Object.defineProperty(window, "__archsightUmamiEvents", {
      configurable: true,
      value: events,
      writable: true,
    });
    Object.defineProperty(window, "umami", {
      configurable: true,
      value: {
        track(name: string, data: Record<string, unknown> = {}) {
          events.push({
            name,
            data: JSON.parse(JSON.stringify(data)) as Record<string, unknown>,
          });
          return undefined;
        },
      },
      writable: true,
    });
  });
}

async function readMockUmamiEvents(page: Page) {
  return page.evaluate(() => (window as Window & { __archsightUmamiEvents?: UmamiEventRecord[] }).__archsightUmamiEvents ?? []);
}

async function productTextWithoutTechnicalAudit(panel: Locator) {
  return panel.evaluate((element) => {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("details").forEach((details) => details.remove());
    return clone.innerText;
  });
}

test("梁系、框架与桁架的计算过程都暴露 8 个阶段和关键点表", async ({ page }) => {
  await openWorkbench(page);

  for (const scenario of [
    { mode: "beam" as const, run: "运行梁系计算", complete: "梁系计算完成", metric: "弯矩", source: "梁系" },
    { mode: "frame" as const, run: "运行平面框架计算", complete: "平面框架计算完成", metric: "弯矩", source: "构件" },
    { mode: "truss" as const, run: "运行平面桁架计算", complete: "平面桁架计算完成", metric: "轴力", source: "构件" },
  ]) {
    await openMode(page, scenario.mode);
    await runCalculation(page, scenario.run, scenario.complete);
    await openCalculationTrace(page);

    for (const stageTitle of [
      "输入归一化",
      "自由度映射",
      "单元处理",
      "全局装配",
      "边界约束消元",
      "求解器诊断",
      "结果回代",
      "平衡复核",
    ]) {
      await expect(page.getByText(stageTitle, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/8 步 · \d+ 个复核点/u)).toBeVisible();
    await expect(page.getByText("input_normalized", { exact: true })).toHaveCount(0);

    const tracePanel = page.getByRole("tabpanel", { name: "计算过程" });
    expect(await productTextWithoutTechnicalAudit(tracePanel)).not.toMatch(/input_normalized|dof_mapping|availability=|analysisType=|modelHash|requestHash/iu);

    const firstAuditDetails = tracePanel.locator("details").first();
    await firstAuditDetails.locator("summary").click();
    await expect(firstAuditDetails.getByText(/阶段代码：input_normalized/u)).toBeVisible();

    await openCriticalPoints(page);
    await expect(page.getByText("全局极值", { exact: true }).first()).toBeVisible();
    const criticalPanel = page.getByRole("tabpanel", { name: "关键点" });
    await expect(criticalPanel.getByText(scenario.metric, { exact: true }).first()).toBeVisible();
    await expect(criticalPanel.getByText(new RegExp(`^${scenario.source} ·`, "u")).first()).toBeVisible();
    await expect(criticalPanel.getByText("global-extreme", { exact: true })).toHaveCount(0);
    await expect(criticalPanel.getByText("momentKnM", { exact: true })).toHaveCount(0);
    await expect(criticalPanel.getByText("axialForceKn", { exact: true })).toHaveCount(0);
    await expect(page.getByText("控制来源 1", { exact: true })).toBeVisible();
    await expect(page.getByText("控制来源与包络", { exact: true })).toBeVisible();
    expect(await productTextWithoutTechnicalAudit(criticalPanel)).not.toMatch(/__primary__|\bexact\b|\bnode\b|\bmember\b|sourceHash/iu);

    await openSnapshots(page);
    const snapshotPanel = page.getByRole("tabpanel", { name: "快照对比" });
    expect(await productTextWithoutTechnicalAudit(snapshotPanel)).not.toMatch(/allowableMm|maxDisplacementMm|maxMomentKnM|secondOrderAmplificationFactor|__primary__|sourceHash|requestHash|modelHash/iu);
  }
});

test("梁系添加合法复核点后会随下一次求解发送并回显到工作台", async ({ page }) => {
  await openWorkbench(page);
  await runCalculation(page, "运行梁系计算", "梁系计算完成");
  await openCalculationTrace(page);

  const requests: Array<Record<string, unknown>> = [];
  await page.unroute("**/api/calculate");
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    requests.push(payload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(beamCalculationEnvelope(payload as BeamPayload)),
    });
  });

  await page.getByRole("button", { name: "截面复核点" }).click();
  await page.getByLabel("名称").fill("梁系截面复核点");
  await page.getByLabel("目标编号").fill("B1");
  await page.getByLabel("截面位置 / m").fill("3");
  await page.getByLabel("侧别").selectOption("left");
  await page.getByLabel("备注").fill("主控截面");
  await page.getByRole("button", { name: "添加复核点" }).click();

  const addedReviewPoint = page.getByText("梁系截面复核点", { exact: false }).first();
  await expect(addedReviewPoint).toBeVisible();
  await expect(addedReviewPoint).toContainText("截面 · B1 · 挠度");
  await expect(page.getByText("主控截面", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "结构计算", exact: true }).click();
  await page.getByRole("button", { name: "运行梁系计算" }).click();
  await expect(page.getByText("梁系计算完成")).toBeVisible();
  await openCalculationTrace(page);

  expect(requests.at(-1)?.reviewPoints).toEqual([
    {
      id: expect.any(String),
      kind: "station-check",
      targetType: "station",
      label: "梁系截面复核点",
      targetId: "B1",
      metricKey: "deflection",
      station: 3,
      side: "left",
      note: "主控截面",
    },
  ]);
});

test("Umami 事件链只暴露终态且不携带模型或结果敏感字段", async ({ page }) => {
  await installMockUmamiTracker(page);
  await openWorkbench(page);

  await page.route("**/api/export", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/octet-stream",
      body: "mock-export",
    });
  });

  await expect.poll(async () => (await readMockUmamiEvents(page)).map((event) => event.name)).toContain("workbench_ready");

  await runCalculation(page, "运行梁系计算", "梁系计算完成");
  await expect.poll(async () => (await readMockUmamiEvents(page)).map((event) => event.name)).toEqual(
    expect.arrayContaining(["calculation_requested", "calculation_started", "calculation_completed", "results_viewed"]),
  );

  await openCalculationTrace(page);
  await expect.poll(async () => (await readMockUmamiEvents(page)).map((event) => event.name)).toContain("calculation_trace_viewed");

  await page.getByRole("button", { name: /成果导出/u }).click();
  await expect(page.getByRole("menu")).toBeVisible();
  await page.getByRole("menuitem", { name: /导出计算书/u }).click();
  await expect.poll(async () => (await readMockUmamiEvents(page)).map((event) => event.name)).toEqual(
    expect.arrayContaining(["report_export_requested", "export_started", "export_completed"]),
  );

  const events = await readMockUmamiEvents(page);
  const names = events.map((event) => event.name);
  for (const terminalName of ["calculation_completed", "export_completed"]) {
    expect(names.filter((name) => name === terminalName)).toHaveLength(1);
  }

  for (const event of events) {
    expect(Object.keys(event.data).every((key) => ALLOWED_UMAMI_KEYS.has(key))).toBe(true);
    expect(event.data.schema_version).toBe(1);
    expect(event.data.workspace_mode).toBe("standalone");
    expect(Object.values(event.data).every((value) => value === null || ["string", "number", "boolean"].includes(typeof value))).toBe(true);
    expect(JSON.stringify(event.data)).not.toMatch(/模型|结果|文件|错误|model|request|response|summary|critical|diagram|payload|trace|member|node|moment|shear|deflection/iu);
  }
});

test("梁系命名快照可以保存且零基线相对差显示为不可比", async ({ page }) => {
  let currentRun = 0;
  await openWorkbench(page);

  await page.unroute("**/api/calculate");
  await page.route("**/api/calculate", async (route) => {
    currentRun += 1;
    const payload = route.request().postDataJSON() as BeamPayload;
    const zeroBaseline = currentRun === 1;
    const response = beamCalculationEnvelope(payload, zeroBaseline ? {
      allowableMm: 0,
      allowableRatio: 250,
      maxDeflectionMm: 0,
      maxDeflectionPositionM: 0,
      status: "合格",
      statusCode: "PASS",
      method: "浏览器验收 mock 梁系杆单元法",
    } : {
      allowableMm: 18,
      allowableRatio: 250,
      maxDeflectionMm: 0.8,
      maxDeflectionPositionM: 3,
      status: "合格",
      statusCode: "PASS",
      method: "浏览器验收 mock 梁系杆单元法",
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });

  await runCalculation(page, "运行梁系计算", "梁系计算完成");
  await openSnapshots(page);
  await page.getByLabel("快照名称").fill("零基线快照");
  await page.getByRole("button", { name: "保存当前快照" }).click();
  await expect(page.getByText("1 个已保存快照", { exact: false })).toBeVisible();
  await expect(page.getByLabel("左侧快照")).toHaveValue("__current__");

  await page.getByRole("tab", { name: "结构计算", exact: true }).click();
  await page.getByRole("button", { name: "运行梁系计算" }).click();
  await expect(page.getByText("梁系计算完成")).toBeVisible();
  await openSnapshots(page);
  await page.getByLabel("左侧快照").selectOption("beam-snapshot-current");
  await page.getByLabel("右侧快照").selectOption("__current__");

  await expect(page.getByLabel("左侧快照")).toHaveValue("beam-snapshot-current");
  await expect(page.getByLabel("右侧快照")).toHaveValue("__current__");
  await expect(page.getByText("最大挠度", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("maxDeflectionMm", { exact: true })).toHaveCount(0);
  await expect(page.getByText("来源：梁系 · 主控梁跨 · B1 · 下侧", { exact: true })).toHaveCount(2);
  await expect(page.getByText(/fnv1a64:beam-envelope/u)).toHaveCount(0);
  await expect(page.getByText("左侧基线为 0，无法计算相对差", { exact: true }).first()).toBeVisible();
});
