import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);

type AnalysisMode = "beam" | "frame" | "truss";

type BeamSupportType = "pinned" | "roller" | "fixed" | "free";

type BeamPayload = {
  analysisType: "beam";
  beamType?: "continuous" | "simply_supported" | "cantilever";
  loadType?: "none" | "uniform" | "point" | "linear" | "combined";
  q?: number;
  loadValue?: number;
  spans?: number[];
  spanProperties?: Array<{ id?: string; memberId?: string }>;
  supports?: Array<{ id?: string; x?: number; type?: BeamSupportType; constraints?: string[] }>;
  loads?: unknown[];
};

type StructureNode = { id: string; x: number; y: number; supportType?: string };
type StructureMember = { id: string; start: string; end: string; kind?: string };

type StructurePayload = {
  analysisType: "frame" | "truss";
  structure: {
    nodes: StructureNode[];
    members: StructureMember[];
    loads?: unknown[];
  };
};

type CalculationPayload = BeamPayload | StructurePayload;

const MODE_CASES: Record<
  AnalysisMode,
  {
    objectButton?: RegExp;
    canvas: string;
    templateId: string;
    selectedEditorId: string;
    runLabel: string;
    completeText: string;
  }
> = {
  beam: {
    canvas: 'svg[data-model-canvas="beam"]',
    templateId: "beam-template",
    selectedEditorId: "beam-object",
    runLabel: "运行梁系计算",
    completeText: "梁系计算完成",
  },
  frame: {
    objectButton: /平面框架-1\s+(平面框架|框架)/,
    canvas: 'svg[data-model-canvas="frame"]',
    templateId: "frame-template",
    selectedEditorId: "frame-selected-editor",
    runLabel: "运行平面框架计算",
    completeText: "平面框架计算完成",
  },
  truss: {
    objectButton: /平面桁架-1\s+(平面桁架|桁架)/,
    canvas: 'svg[data-model-canvas="truss"]',
    templateId: "truss-template",
    selectedEditorId: "truss-selected-editor",
    runLabel: "运行平面桁架计算",
    completeText: "平面桁架计算完成",
  },
};

async function stabilizeWorkbench(page: Page) {
  await page.addStyleTag({
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

async function openAnalysisMode(page: Page, mode: AnalysisMode) {
  const item = MODE_CASES[mode];
  if (item.objectButton) {
    const moduleRail = page.locator("aside").filter({ hasText: "分析对象" });
    await moduleRail.getByRole("button", { name: item.objectButton }).click();
  }
  await expect(page.locator(item.canvas)).toBeVisible();
}

async function applyFirstTemplate(page: Page, mode: AnalysisMode) {
  await page.getByRole("tab", { name: "模板", exact: true }).click();
  await page.locator(`#${MODE_CASES[mode].templateId} button`).first().click();
  await expect(page.locator(MODE_CASES[mode].canvas)).toBeVisible();
}

async function editFirstModelObject(page: Page, mode: AnalysisMode) {
  await page.getByRole("tab", { name: "对象", exact: true }).click();

  if (mode === "beam") {
    const objectPanel = page.locator("#beam-object");
    await objectPanel.getByRole("button").filter({ hasText: /L=/ }).first().click();
    const lengthInput = objectPanel.locator('input[name$="-length"]').first();
    await lengthInput.fill("4.2");
    await lengthInput.blur();
    return;
  }

  await page.locator(`#${mode}-object`).getByRole("button", { name: /^N1\b/ }).first().click();
  const editor = page.locator(`#${MODE_CASES[mode].selectedEditorId}`);
  const firstNumberInput = editor.locator('input[type="number"]').first();
  await firstNumberInput.fill("0.2");
  await firstNumberInput.blur();
}

async function solveAndInspectResultTabs(page: Page, mode: AnalysisMode) {
  await page.getByRole("tab", { name: /结构计算/ }).click();
  await page.getByRole("button", { name: MODE_CASES[mode].runLabel }).click();
  await expect(page.getByText(MODE_CASES[mode].completeText)).toBeVisible();

  await page.getByRole("button", { name: /受力变形/ }).click();
  await expect(page.locator(`[data-result-mode="${mode}"][data-result-surface="preview"]`).first()).toBeVisible();

  await page.getByRole("button", { name: /工程图/ }).click();
  await expect(page.locator(`[data-result-mode="${mode}"][data-result-surface="diagram"]`).first()).toBeVisible();
}

function cumulativeStations(spans: number[]) {
  const stations = [0];
  for (const span of spans) {
    stations.push(stations.at(-1)! + span);
  }
  return stations;
}

function beamCalculationEnvelope(payload: BeamPayload) {
  const spans = payload.spans?.length ? payload.spans : [4, 4];
  const stations = cumulativeStations(spans);
  const totalLength = stations.at(-1) ?? 0;
  const sampleCount = 13;
  const xData = Array.from({ length: sampleCount }, (_, index) => (totalLength * index) / (sampleCount - 1));
  const vData = xData.map((x) => -0.0012 * Math.sin((Math.PI * x) / Math.max(totalLength, 1)));
  const momentData = xData.map((x) => 16 * Math.sin((Math.PI * x) / Math.max(totalLength, 1)));
  const shearData = xData.map((x) => 8 * Math.cos((Math.PI * x) / Math.max(totalLength, 1)));
  const loadIntensity = payload.q ?? payload.loadValue ?? 8;
  const supports = (payload.supports?.length ? payload.supports : stations.map((x, index) => ({ id: `S${index + 1}`, x, type: index === 0 ? "pinned" : "roller" as BeamSupportType }))).map((support, index) => ({
    label: support.id ?? `S${index + 1}`,
    x: Number.isFinite(support.x) ? support.x! : stations[index] ?? 0,
    type: support.type ?? (index === 0 ? "pinned" : "roller"),
    constraints: support.constraints,
  }));
  const summary = {
    allowableMm: 18,
    allowableRatio: 250,
    maxDeflectionMm: 1.2,
    maxDeflectionPositionM: totalLength / 2,
    status: "合格",
    statusCode: "PASS",
    method: "浏览器 smoke mock 梁单元法",
  };
  const preview = {
    beamType: payload.beamType ?? "continuous",
    beamTypeLabel: "连续梁",
    loadType: payload.loadType ?? "uniform",
    loadTypeLabel: "均布荷载",
    spans,
    spanIds: spans.map((_, index) => payload.spanProperties?.[index]?.memberId ?? payload.spanProperties?.[index]?.id ?? `(${index + 1})`),
    totalLength,
    supports,
    nodes: stations.map((x, index) => ({
      index,
      id: `node-${index}`,
      x,
      support: supports.some((support) => Math.abs(support.x - x) < 1e-6 && support.type !== "free"),
    })),
    loads: [
      {
        type: "uniform",
        x: totalLength / 2,
        startX: 0,
        endX: totalLength,
        length: totalLength,
        intensityKnPerM: loadIntensity,
      },
    ],
    curve: xData.map((x, index) => ({ x, v: vData[index], vMm: vData[index] * 1000 })),
    spanSummaries: spans.map((span, index) => ({
      spanIndex: index,
      startX: stations[index],
      endX: stations[index + 1],
      length: span,
      maxDeflectionMm: 1 + index * 0.1,
      maxDeflectionPositionM: (stations[index] + stations[index + 1]) / 2,
    })),
    maxDeflection: {
      valueM: -0.0012,
      valueMm: -1.2,
      xM: totalLength / 2,
      spanIndex: 0,
    },
    reactions: supports.map((support, index) => ({
      dof: index,
      supportId: support.label,
      valueN: 6000 + index * 1000,
      valueKn: 6 + index,
    })),
    warnings: [],
  };

  return {
    success: true,
    operation: "calculate",
    version: "v1",
    analysisType: "beam",
    request: payload,
    model: { analysisType: "beam", structure: { spans, supports } },
    results: {
      summary,
      preview,
      diagram: {},
      series: {
        x_data: xData,
        v_data: vData,
        moment_data: momentData,
        shear_data: shearData,
        t_data: xData.map((x) => x / Math.max(totalLength, 1)),
        q_t_data: xData.map(() => loadIntensity),
      },
    },
    diagnostics: { status: "合格", statusCode: "PASS" },
    errors: [],
  };
}

function memberLength(payload: StructurePayload, member: { start: string; end: string }) {
  const start = payload.structure.nodes.find((node) => node.id === member.start);
  const end = payload.structure.nodes.find((node) => node.id === member.end);
  if (!start || !end) return 1;
  return Math.hypot(end.x - start.x, end.y - start.y) || 1;
}

function frameCalculationEnvelope(payload: StructurePayload) {
  const nodes = payload.structure.nodes;
  const members = payload.structure.members;
  const nodeResults = nodes.map((node, index) => ({
    nodeId: node.id,
    x: node.x,
    y: node.y,
    supportType: node.supportType ?? "free",
    uxMm: index * 0.2,
    uyMm: index === nodes.length - 1 ? -1.2 : 0,
    rotationDeg: 0,
    resultantMm: index === nodes.length - 1 ? 1.2 : 0,
    reactionFxKn: 0,
    reactionFyKn: 0,
    reactionMzKnM: 0,
  }));
  const memberResults = members.map((member, index) => ({
    memberId: member.id,
    kind: member.kind ?? "member",
    startNode: member.start,
    endNode: member.end,
    axialStartKn: 8 + index,
    shearStartKn: 5 + index,
    momentStartKnM: 10 + index,
    axialEndKn: -(8 + index),
    shearEndKn: -(5 + index),
    momentEndKnM: -(10 + index),
    maxAbsAxialKn: 8 + index,
    maxAbsShearKn: 5 + index,
    maxAbsMomentKnM: 10 + index,
    lengthM: memberLength(payload, member),
  }));
  const memberDiagrams = members.map((member, index) => ({
    memberId: member.id,
    stationsM: [0, memberLength(payload, member) / 2, memberLength(payload, member)],
    stations: [0, 0.5, 1],
    axialKn: [5 + index, 6 + index, 4 + index],
    shearKn: [7 + index, 0, -(7 + index)],
    momentKnM: [0, 12 + index, 0],
    deflectionMm: [0, -(0.4 + index * 0.1), 0],
  }));
  const summary = {
    allowableMm: 20,
    maxDisplacementMm: 1.2,
    maxVerticalMm: 1.2,
    maxRotationDeg: 0,
    maxMomentKnM: 12,
    maxDisplacementNodeId: nodes.at(-1)?.id ?? null,
    status: "合格",
    statusCode: "PASS",
    method: "二维平面框架杆单元法",
  };
  const preview = {
    analysisType: "frame",
    structureType: "explicit",
    structureTypeLabel: "二维平面框架",
    nodes,
    members,
    loads: payload.structure.loads ?? [],
    nodeResults,
    memberResults,
    memberDiagrams,
    deformedNodes: nodes.map((node, index) => ({ nodeId: node.id, x: node.x + index * 0.01, y: node.y - index * 0.01 })),
    deformationScale: 1,
    summary,
    warnings: [],
  };
  return {
    success: true,
    operation: "calculate",
    version: "v1",
    analysisType: "frame",
    request: payload,
    model: { analysisType: "frame", structure: payload.structure },
    results: {
      summary,
      preview,
      diagram: {},
      nodeResults,
      memberResults,
      memberDiagrams,
      nodeIds: nodes.map((node) => node.id),
      memberIds: members.map((member) => member.id),
      series: {
        ux_data: nodeResults.map((node) => node.uxMm),
        uy_data: nodeResults.map((node) => node.uyMm),
        rz_data: nodeResults.map((node) => node.rotationDeg),
        member_axial_data: memberResults.map((member) => member.maxAbsAxialKn),
        member_shear_data: memberResults.map((member) => member.maxAbsShearKn),
        member_moment_data: memberResults.map((member) => member.maxAbsMomentKnM),
      },
    },
    diagnostics: { status: "合格", statusCode: "PASS" },
    errors: [],
  };
}

function trussCalculationEnvelope(payload: StructurePayload) {
  const nodes = payload.structure.nodes;
  const members = payload.structure.members;
  const nodeResults = nodes.map((node, index) => ({
    nodeId: node.id,
    x: node.x,
    y: node.y,
    uxMm: index * 0.15,
    uyMm: index === nodes.length - 1 ? -0.9 : 0,
    displacementMm: index === nodes.length - 1 ? 0.9 : 0,
    rxKn: 0,
    ryKn: 0,
    supportType: node.supportType ?? "free",
  }));
  const memberResults = members.map((member, index) => ({
    memberId: member.id,
    kind: member.kind ?? "chord",
    startNode: member.start,
    endNode: member.end,
    lengthM: memberLength(payload, member),
    axialForceKn: index % 2 === 0 ? 8 + index : -(8 + index),
    axialStressMpa: 12 + index,
    forceState: index % 2 === 0 ? "受拉" : "受压",
  }));
  const summary = {
    allowableMm: 10,
    allowableRatio: 250,
    maxDisplacementMm: 0.9,
    maxDisplacementNodeId: nodes.at(-1)?.id ?? null,
    maxAxialForceKn: Math.max(...memberResults.map((member) => Math.abs(member.axialForceKn)), 0),
    maxAxialForceMemberId: memberResults[0]?.memberId ?? null,
    status: "合格",
    statusCode: "PASS",
    method: "二维平面桁架杆单元法",
  };
  const preview = {
    analysisType: "truss",
    structureType: "explicit",
    structureTypeLabel: "二维平面桁架",
    nodes: nodes.map((node) => ({ ...node, role: node.supportType && node.supportType !== "free" ? "support" : "joint" })),
    members,
    loads: payload.structure.loads ?? [],
    nodeResults,
    memberResults,
    deformedNodes: nodes.map((node, index) => ({ id: node.id, x: node.x + index * 0.01, y: node.y - index * 0.01, uxMm: index * 0.15, uyMm: -index * 0.1 })),
    deformationScale: 1,
    summary,
    warnings: [],
  };
  return {
    success: true,
    operation: "calculate",
    version: "v1",
    analysisType: "truss",
    request: payload,
    model: { analysisType: "truss", structure: payload.structure },
    results: {
      summary,
      preview,
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
    errors: [],
  };
}

function calculationEnvelope(payload: CalculationPayload) {
  if (payload.analysisType === "beam") return beamCalculationEnvelope(payload);
  if (payload.analysisType === "frame") return frameCalculationEnvelope(payload);
  return trussCalculationEnvelope(payload);
}

async function routeCalculate(page: Page) {
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as CalculationPayload;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(calculationEnvelope(payload)),
    });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await routeCalculate(page);
  await page.goto("/");
  await stabilizeWorkbench(page);
});

for (const mode of ["beam", "frame", "truss"] as const) {
  test(`v1.4.0 ${mode} 内置模板主路径可编辑、计算并查看受力变形和工程图`, async ({ page }) => {
    await openAnalysisMode(page, mode);
    await applyFirstTemplate(page, mode);
    await editFirstModelObject(page, mode);
    await solveAndInspectResultTabs(page, mode);
  });
}
