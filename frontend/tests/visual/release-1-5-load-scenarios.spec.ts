import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

type BeamLoad =
  | { type: "uniform"; qKnPerM: number; start?: number; end?: number }
  | { type: "point"; pointLoadKn: number; x: number }
  | { type: "linear"; qStartKnPerM: number; qEndKnPerM: number; start: number; end: number };

type BeamPayload = {
  analysisType: "beam";
  beamType?: "continuous" | "simply_supported" | "cantilever";
  loadType?: "none" | "uniform" | "point" | "linear" | "combined";
  spans?: number[];
  loads?: BeamLoad[];
  loadCases?: Array<{ id: string; title: string; loads: BeamLoad[] }>;
  loadCombinations?: Array<{ id: string; title: string; factors: Record<string, number>; tags?: string[] }>;
  supports?: Array<{ id?: string; x?: number; type?: string; constraints?: string[] }>;
  spanProperties?: Array<{ id?: string; memberId?: string }>;
  q?: number;
  loadValue?: number;
};

type TrussNode = { id: string; x: number; y: number; supportType?: string };
type TrussMember = { id: string; start: string; end: string; kind?: string };
type TrussLoad =
  | { type: "nodal"; node: string; fxKn?: number; fyKn?: number }
  | { type: "distributed" | "member_load" | "member"; member: string; direction?: string; qStartKnPerM?: number; qEndKnPerM?: number; selfWeightKnPerM?: number }
  | { type: "temperature"; member: string; deltaTempC?: number; alphaPerC?: number };

type TrussPayload = {
  analysisType: "truss";
  structure: {
    nodes: TrussNode[];
    members: TrussMember[];
    loads?: TrussLoad[];
    loadCases?: Array<{ id: string; title: string; loads: TrussLoad[] }>;
    loadCombinations?: Array<{ id: string; title: string; factors: Record<string, number>; tags?: string[] }>;
  };
};

type CalculationPayload = BeamPayload | TrussPayload;

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

async function openWorkbench(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto("/");
  await stabilizeWorkbench(page);
}

async function routeCalculate(page: Page, onPayload?: (payload: CalculationPayload) => void) {
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as CalculationPayload;
    onPayload?.(payload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload.analysisType === "beam" ? beamCalculationEnvelope(payload) : trussCalculationEnvelope(payload)),
    });
  });
}

async function routeExport(page: Page, onPayload: (payload: Record<string, unknown>) => void) {
  await page.route("**/api/export", async (route) => {
    onPayload(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({
      status: 200,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: "archsight-v1.5-export-check",
    });
  });
}

function cumulativeStations(spans: number[]) {
  const stations = [0];
  for (const span of spans) {
    stations.push(stations.at(-1)! + span);
  }
  return stations;
}

function beamSeries(totalLength: number, scale: number) {
  const sampleCount = 13;
  const xData = Array.from({ length: sampleCount }, (_, index) => (totalLength * index) / (sampleCount - 1));
  return {
    x_data: xData,
    v_data: xData.map((x) => -0.001 * scale * Math.sin((Math.PI * x) / Math.max(totalLength, 1))),
    moment_data: xData.map((x) => 12 * scale * Math.sin((Math.PI * x) / Math.max(totalLength, 1))),
    shear_data: xData.map((x) => 5 * scale * Math.cos((Math.PI * x) / Math.max(totalLength, 1))),
  };
}

function beamCalculationEnvelope(payload: BeamPayload) {
  const spans = payload.spans?.length ? payload.spans : [4, 4];
  const stations = cumulativeStations(spans);
  const totalLength = stations.at(-1) ?? 0;
  const primarySeries = beamSeries(totalLength, 1);
  const supports = (payload.supports?.length ? payload.supports : stations.map((x, index) => ({ id: `S${index + 1}`, x, type: index === 0 ? "pinned" : "roller" }))).map((support, index) => ({
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
    method: "浏览器 v1.5 验收 mock 梁单元法",
  };
  const beam = {
    beamType: payload.beamType ?? "continuous",
    beamTypeLabel: "连续梁",
    loadType: payload.loadType ?? "uniform",
    loadTypeLabel: "均布荷载",
    spans,
    spanIds: spans.map((_, index) => payload.spanProperties?.[index]?.memberId ?? payload.spanProperties?.[index]?.id ?? `(${index + 1})`),
    totalLength,
    supports,
    nodes: stations.map((x, index) => ({ index, id: `node-${index}`, x, support: supports.some((support) => Math.abs(support.x - x) < 1e-6 && support.type !== "free") })),
    loads: [{ type: "uniform", x: totalLength / 2, startX: 0, endX: totalLength, length: totalLength, intensityKnPerM: payload.q ?? payload.loadValue ?? 8 }],
    curve: primarySeries.x_data.map((x, index) => ({ x, v: primarySeries.v_data[index], vMm: primarySeries.v_data[index] * 1000 })),
    spanSummaries: spans.map((span, index) => ({
      spanIndex: index,
      startX: stations[index],
      endX: stations[index + 1],
      length: span,
      maxDeflectionMm: 1 + index * 0.1,
      maxDeflectionPositionM: (stations[index] + stations[index + 1]) / 2,
    })),
    maxDeflection: { valueM: -0.0012, valueMm: -1.2, xM: totalLength / 2, spanIndex: 0 },
    reactions: supports.map((support, index) => ({ dof: index, supportId: support.label, valueN: 6000 + index * 1000, valueKn: 6 + index })),
    warnings: [],
  };
  const loadCaseResults = (payload.loadCases ?? []).map((loadCase, index) => ({
    id: loadCase.id,
    title: loadCase.title,
    summary: { ...summary, maxDeflectionMm: 1.2 + index * 0.2 },
    ...beamSeries(totalLength, index + 1),
  }));
  const loadCombinationResults = (payload.loadCombinations ?? []).map((combination, index) => ({
    id: combination.id,
    title: combination.title,
    factors: combination.factors,
    tags: combination.tags,
    summary: { ...summary, maxDeflectionMm: 1.8 + index * 0.2 },
    ...beamSeries(totalLength, 1.5 + index),
  }));

  return {
    success: true,
    operation: "calculate",
    version: "v1",
    analysisType: "beam",
    request: payload,
    model: { analysisType: "beam", structure: { spans, supports } },
    results: {
      summary,
      preview: beam,
      loadCaseResults,
      loadCombinationResults,
      series: {
        ...primarySeries,
        t_data: primarySeries.x_data.map((x) => x / Math.max(totalLength, 1)),
        q_t_data: primarySeries.x_data.map(() => payload.q ?? payload.loadValue ?? 8),
      },
    },
    diagnostics: { status: "合格", statusCode: "PASS" },
    errors: [],
  };
}

function trussMemberLength(payload: TrussPayload, member: { start: string; end: string }) {
  const start = payload.structure.nodes.find((node) => node.id === member.start);
  const end = payload.structure.nodes.find((node) => node.id === member.end);
  if (!start || !end) return 1;
  return Math.hypot(end.x - start.x, end.y - start.y) || 1;
}

function trussCaseResult(payload: TrussPayload, id: string, title: string, scale: number) {
  const nodes = payload.structure.nodes;
  const members = payload.structure.members;
  const nodeResults = nodes.map((node, index) => ({
    nodeId: node.id,
    x: node.x,
    y: node.y,
    uxMm: index * 0.12 * scale,
    uyMm: index === nodes.length - 1 ? -0.85 * scale : -0.05 * index * scale,
    displacementMm: index === nodes.length - 1 ? 0.85 * scale : 0.05 * index * scale,
    rxKn: 0,
    ryKn: 0,
    supportType: node.supportType ?? "free",
  }));
  const memberResults = members.map((member, index) => ({
    memberId: member.id,
    kind: member.kind ?? "generic",
    startNode: member.start,
    endNode: member.end,
    lengthM: trussMemberLength(payload, member),
    axialForceKn: (index % 2 === 0 ? 8 + index : -(8 + index)) * scale,
    axialStressMpa: (10 + index) * scale,
    forceState: index % 2 === 0 ? "受拉" : "受压",
  }));
  const summary = {
    allowableMm: 10,
    allowableRatio: 250,
    maxDisplacementMm: Math.max(...nodeResults.map((node) => node.displacementMm), 0),
    maxDisplacementNodeId: nodes.at(-1)?.id ?? null,
    maxAxialForceKn: Math.max(...memberResults.map((member) => Math.abs(member.axialForceKn)), 0),
    maxAxialForceMemberId: memberResults[0]?.memberId ?? null,
    status: "合格",
    statusCode: "PASS",
    method: "浏览器 v1.5 验收 mock 二维平面桁架杆单元法",
  };
  return { id, title, summary, nodeResults, memberResults };
}

function trussCalculationEnvelope(payload: TrussPayload) {
  const nodes = payload.structure.nodes;
  const members = payload.structure.members;
  const primary = trussCaseResult(payload, "BASE", "基本荷载", 1);
  const preview = {
    analysisType: "truss",
    structureType: "explicit",
    structureTypeLabel: "二维平面桁架",
    nodes: nodes.map((node) => ({ ...node, role: node.supportType && node.supportType !== "free" ? "support" : "joint" })),
    members,
    loads: payload.structure.loads ?? [],
    nodeResults: primary.nodeResults,
    memberResults: primary.memberResults,
    deformedNodes: nodes.map((node, index) => ({ id: node.id, x: node.x + index * 0.01, y: node.y - index * 0.01, uxMm: index * 0.12, uyMm: -index * 0.05 })),
    deformationScale: 1,
    summary: primary.summary,
    warnings: [],
  };
  const loadCaseResults = (payload.structure.loadCases ?? []).map((loadCase, index) => trussCaseResult(payload, loadCase.id, loadCase.title, index + 1));
  const loadCombinationResults = (payload.structure.loadCombinations ?? []).map((combination, index) => ({
    ...trussCaseResult(payload, combination.id, combination.title, 1.5 + index),
    factors: combination.factors,
    tags: combination.tags,
  }));

  return {
    success: true,
    operation: "calculate",
    version: "v1",
    analysisType: "truss",
    request: payload,
    model: { analysisType: "truss", structure: payload.structure },
    results: {
      summary: primary.summary,
      preview,
      diagram: {},
      nodeResults: primary.nodeResults,
      memberResults: primary.memberResults,
      loadCaseResults,
      loadCombinationResults,
      nodeIds: nodes.map((node) => node.id),
      memberIds: members.map((member) => member.id),
      series: {
        ux_data: primary.nodeResults.map((node) => node.uxMm),
        uy_data: primary.nodeResults.map((node) => node.uyMm),
        member_axial_data: primary.memberResults.map((member) => ({ memberId: member.memberId, axialForceKn: member.axialForceKn })),
      },
    },
    diagnostics: { status: "合格", statusCode: "PASS" },
    errors: [],
  };
}

async function runCurrentModule(page: Page, runLabel: string, completeText: string) {
  await page.getByRole("tab", { name: "结构计算", exact: true }).click();
  await page.getByRole("button", { name: runLabel }).click();
  await expect(page.getByText(completeText)).toBeVisible();
}

async function exportXlsx(page: Page) {
  await page.getByRole("button", { name: /成果导出/ }).click();
  await page.getByRole("menuitem", { name: /导出参数表/ }).click();
  await expect(page.getByText("Excel 参数表已生成")).toBeVisible();
}

test("v1.5.0 梁系工况和组合可进入结果来源切换并随 XLSX 导出记录来源", async ({ page }) => {
  let capturedPayload: BeamPayload | null = null;
  let capturedExportPayload: Record<string, unknown> | null = null;
  await routeCalculate(page, (payload) => {
    expect(payload.analysisType).toBe("beam");
    capturedPayload = payload as BeamPayload;
  });
  await routeExport(page, (payload) => {
    capturedExportPayload = payload;
  });
  await openWorkbench(page);

  await page.getByRole("tab", { name: "对象", exact: true }).click();
  await page.getByRole("button", { name: /荷载工况 · 0/ }).click();
  const beamCases = page.locator("#beam-custom-load-cases");
  await beamCases.getByRole("button", { name: "新增工况" }).click();
  await page.getByLabel("第 1 个工况编号").fill("DL");
  await page.getByLabel("第 1 个工况名称").fill("恒载");
  await page.getByLabel("第 1 条均布荷载").first().fill("8");
  await beamCases.getByRole("button", { name: "新增工况" }).click();
  await page.getByLabel("第 2 个工况编号").fill("LL");
  await page.getByLabel("第 2 个工况名称").fill("活载");
  await page.getByLabel("第 1 条均布荷载").nth(1).fill("5");

  await page.getByRole("button", { name: /荷载组合 · 0/ }).click();
  const beamCombinations = page.locator("#beam-custom-load-combinations");
  await beamCombinations.getByRole("button", { name: "新增组合" }).click();
  await page.getByLabel("第 1 个组合编号").fill("ULS1");
  await page.getByLabel("第 1 个组合名称").fill("基本组合");
  await page.getByLabel("第 1 个组合标签").fill("ULS, 包络");
  await page.getByLabel("ULS1 中 DL 的组合系数").fill("1.2");
  await page.getByLabel("ULS1 中 LL 的组合系数").fill("1.4");

  await runCurrentModule(page, "运行梁系计算", "梁系计算完成");
  expect(capturedPayload?.loadCases?.map((item) => item.id)).toEqual(["DL", "LL"]);
  expect(capturedPayload?.loadCombinations?.[0]).toMatchObject({ id: "ULS1", factors: { DL: 1.2, LL: 1.4 }, tags: ["ULS", "包络"] });

  const caseButton = page.getByRole("button", { name: /恒载\s+工况 DL/ });
  await expect(caseButton).toBeVisible();
  await caseButton.click();
  await expect(caseButton).toHaveAttribute("aria-pressed", "true");

  const combinationButton = page.getByRole("button", { name: /基本组合\s+组合 ULS1/ });
  await expect(combinationButton).toBeVisible();
  await combinationButton.click();
  await expect(combinationButton).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "受力变形", exact: true }).click();
  await expect(page.locator('[data-result-mode="beam"][data-result-surface="preview"]').first()).toBeVisible();

  await exportXlsx(page);
  expect(capturedExportPayload?.resultSource).toMatchObject({ source: "combination", id: "ULS1", label: "基本组合" });
});

test("v1.5.0 平面桁架工况和组合可进入结果来源切换并随 XLSX 导出记录来源", async ({ page }) => {
  let capturedPayload: TrussPayload | null = null;
  let capturedExportPayload: Record<string, unknown> | null = null;
  await routeCalculate(page, (payload) => {
    expect(payload.analysisType).toBe("truss");
    capturedPayload = payload as TrussPayload;
  });
  await routeExport(page, (payload) => {
    capturedExportPayload = payload;
  });
  await openWorkbench(page);

  const moduleRail = page.locator("aside").filter({ hasText: "分析对象" });
  await moduleRail.getByRole("button", { name: /平面桁架-1\s+(平面桁架|桁架)/ }).click();
  await page.getByRole("tab", { name: "模板", exact: true }).click();
  await page.locator("#truss-template button").first().click();

  await page.getByRole("tab", { name: "对象", exact: true }).click();
  await page.getByRole("button", { name: /荷载工况 · 0/ }).click();
  const trussCases = page.locator("#truss-custom-load-cases");
  await trussCases.getByRole("button", { name: "新增工况" }).click();
  await page.getByLabel("第 1 个工况编号").fill("VL");
  await page.getByLabel("第 1 个工况名称").fill("竖向荷载");
  await page.getByLabel("第 1 条荷载 Y 向力").fill("-18");

  await page.getByRole("button", { name: /荷载组合 · 0/ }).click();
  const trussCombinations = page.locator("#truss-custom-load-combinations");
  await trussCombinations.getByRole("button", { name: "新增组合" }).click();
  await page.getByLabel("第 1 个组合编号").fill("COMB1");
  await page.getByLabel("第 1 个组合名称").fill("基本组合");
  await page.getByLabel("第 1 个组合标签").fill("ULS, 包络");
  await page.getByLabel("COMB1 中 VL 的组合系数").fill("1.2");

  await runCurrentModule(page, "运行平面桁架计算", "平面桁架计算完成");
  expect(capturedPayload?.structure.loadCases?.[0]).toMatchObject({ id: "VL", title: "竖向荷载" });
  expect(capturedPayload?.structure.loadCombinations?.[0]).toMatchObject({ id: "COMB1", factors: { VL: 1.2 }, tags: ["ULS", "包络"] });

  const caseButton = page.getByRole("button", { name: /竖向荷载\s+工况 VL/ });
  await expect(caseButton).toBeVisible();
  await caseButton.click();
  await expect(caseButton).toHaveAttribute("aria-pressed", "true");

  const combinationButton = page.getByRole("button", { name: /基本组合\s+组合 COMB1/ });
  await expect(combinationButton).toBeVisible();
  await combinationButton.click();
  await expect(combinationButton).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "受力变形", exact: true }).click();
  await expect(page.locator('[data-result-mode="truss"][data-result-surface="preview"]').first()).toBeVisible();

  await exportXlsx(page);
  expect(capturedExportPayload?.resultSource).toMatchObject({ source: "combination", id: "COMB1", label: "基本组合" });
});
