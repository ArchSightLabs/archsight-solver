import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test.setTimeout(90_000);

type AnalysisMode = "frame" | "truss";

type StructurePayload = {
  analysisType: AnalysisMode;
  projectName?: string;
  materialId?: string;
  structure: {
    nodes: Array<{ id: string; x: number; y: number; supportType?: string; supportAngleDeg?: number }>;
    members: Array<{ id: string; start: string; end: string; kind?: string }>;
    loads?: unknown[];
  };
};

type ExportPayload = StructurePayload & {
  format: "docx";
  reportOptions?: {
    template?: string;
    figureMode?: string;
    figureScope?: string;
  };
  reportImages?: Record<string, string>;
};

type SharedReportFigureCatalog = {
  frame: { member: Array<{ overlayImageKey: string; scope: "control" | "all" }> };
  truss: { overlay: Array<{ imageKey: string; scope: "control" | "all" }> };
};

const specDir = dirname(fileURLToPath(import.meta.url));
const reportFigureCatalog = JSON.parse(
  readFileSync(join(specDir, "../../../shared/report-figures.json"), "utf-8"),
) as SharedReportFigureCatalog;

function controlReportImageKeys(mode: AnalysisMode) {
  if (mode === "frame") {
    return [
      "frame.preview",
      ...reportFigureCatalog.frame.member
        .filter((figure) => figure.scope === "control")
        .map((figure) => figure.overlayImageKey),
    ];
  }
  return [
    "truss.preview",
    ...reportFigureCatalog.truss.overlay
      .filter((figure) => figure.scope === "control")
      .map((figure) => figure.imageKey),
  ];
}

const MODE_LABELS: Record<AnalysisMode, { object: RegExp; run: string; complete: string; filename: string; imageKeys: string[] }> = {
  frame: {
    object: /平面框架-1\s+(平面框架|框架)/,
    run: "运行平面框架计算",
    complete: "平面框架计算完成",
    filename: "平面框架-计算书.docx",
    imageKeys: controlReportImageKeys("frame"),
  },
  truss: {
    object: /平面桁架-1\s+(平面桁架|桁架)/,
    run: "运行平面桁架计算",
    complete: "平面桁架计算完成",
    filename: "平面桁架-计算书.docx",
    imageKeys: controlReportImageKeys("truss"),
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

async function openAnalysisObject(page: Page, buttonName: RegExp) {
  const moduleRail = page.locator("aside").filter({ hasText: "分析对象" });
  await moduleRail.getByRole("button", { name: buttonName }).click();
}

function calculationEnvelope(payload: StructurePayload) {
  return payload.analysisType === "frame" ? frameCalculationEnvelope(payload) : trussCalculationEnvelope(payload);
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
    maxDisplacementNodeId: nodes[nodes.length - 1]?.id ?? null,
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
    maxDisplacementNodeId: nodes[nodes.length - 1]?.id ?? null,
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

function memberLength(payload: StructurePayload, member: { start: string; end: string }) {
  const start = payload.structure.nodes.find((node) => node.id === member.start);
  const end = payload.structure.nodes.find((node) => node.id === member.end);
  if (!start || !end) return 1;
  return Math.hypot(end.x - start.x, end.y - start.y) || 1;
}

async function routeCalculate(page: Page) {
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as StructurePayload;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(calculationEnvelope(payload)),
    });
  });
}

async function routeDocxExport(page: Page) {
  let observedPayload: ExportPayload | null = null;
  await page.route("**/api/export", async (route) => {
    observedPayload = route.request().postDataJSON() as ExportPayload;
    await route.fulfill({
      status: 200,
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      body: "fake-docx",
    });
  });
  return () => observedPayload;
}

async function solveAndExportDocx(page: Page, mode: AnalysisMode) {
  const labels = MODE_LABELS[mode];
  await openAnalysisObject(page, labels.object);
  await page.getByRole("tab", { name: /结构计算/ }).click();
  await page.getByRole("button", { name: labels.run }).click();
  await expect(page.getByText(labels.complete)).toBeVisible();

  await page.getByRole("button", { name: "成果导出" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: /导出计算书/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe(labels.filename);
  await expect(page.getByText("Word 计算书已生成")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await routeCalculate(page);
  await page.goto("/");
  await stabilizeWorkbench(page);
});

for (const mode of ["frame", "truss"] as const) {
  test(`${MODE_LABELS[mode].filename} 浏览器导出请求携带前端同源工程图`, async ({ page }) => {
    const observedExportPayload = await routeDocxExport(page);

    await solveAndExportDocx(page, mode);

    const payload = observedExportPayload();
    expect(payload?.analysisType).toBe(mode);
    expect(payload?.format).toBe("docx");
    expect(payload?.reportOptions).toMatchObject({ figureMode: "overlay", figureScope: "control" });
    expect(Object.keys(payload?.reportImages ?? {})).toEqual(MODE_LABELS[mode].imageKeys);
    for (const key of MODE_LABELS[mode].imageKeys) {
      expect(payload?.reportImages?.[key]).toMatch(/^data:image\/png;base64,/);
    }
  });
}
