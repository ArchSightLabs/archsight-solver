import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

type AnalysisMode = "beam" | "frame" | "truss";
type CalculationPayload = { analysisType: AnalysisMode; structure?: { nodes?: unknown[]; members?: unknown[] }; spans?: number[] } & Record<string, unknown>;

const MODES: Record<AnalysisMode, { object?: RegExp; templateId: string; run: string; complete: string }> = {
  beam: { templateId: "beam-template", run: "运行梁系计算", complete: "梁系计算完成" },
  frame: { object: /平面框架-1\s+(平面框架|框架)/, templateId: "frame-template", run: "运行平面框架计算", complete: "平面框架计算完成" },
  truss: { object: /平面桁架-1\s+(平面桁架|桁架)/, templateId: "truss-template", run: "运行平面桁架计算", complete: "平面桁架计算完成" },
};

function calculationEnvelope(payload: CalculationPayload) {
  return {
    success: true,
    operation: "calculate",
    version: "v1",
    analysisType: payload.analysisType,
    request: payload,
    model: { analysisType: payload.analysisType, structure: payload.structure ?? { spans: payload.spans } },
    results: {
      summary: { status: "合格", statusCode: "PASS", maxDeflectionMm: 1, maxDisplacementMm: 1, maxMomentKnM: 1, maxAxialForceKn: 1 },
      preview: null,
      nodeResults: [],
      memberResults: [],
      memberDiagrams: [],
      nodeIds: [],
      memberIds: [],
      series: {},
    },
    diagnostics: { status: "合格", statusCode: "PASS" },
    meta: { modelHash: `model-${payload.analysisType}`, requestHash: `request-${payload.analysisType}` },
    errors: [],
  };
}

async function openMode(page: Page, mode: AnalysisMode) {
  const object = MODES[mode].object;
  if (object) {
    await page.locator("aside").filter({ hasText: "分析对象" }).getByRole("button", { name: object }).click();
  }
  await page.getByRole("tab", { name: "模板", exact: true }).click();
  await page.locator(`#${MODES[mode].templateId} button`).first().click();
}

async function editModel(page: Page, mode: AnalysisMode) {
  await page.getByRole("tab", { name: "参数建模", exact: true }).click();
  await page.getByRole("tab", { name: "对象", exact: true }).click();
  if (mode === "beam") {
    const objectPanel = page.locator("#beam-object");
    await objectPanel.getByRole("button").filter({ hasText: /L=/ }).first().click();
    const input = objectPanel.locator('input[name$="-length"]').first();
    await input.fill("4.2");
    await input.blur();
    return;
  }
  await page.locator(`#${mode}-object`).getByRole("button", { name: /^N1\b/ }).first().click();
  const editor = page.locator(`#${mode}-selected-editor`);
  const input = editor.locator('input[type="number"]').first();
  await input.fill("0.2");
  await input.blur();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as CalculationPayload;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(calculationEnvelope(payload)) });
  });
  await page.goto("/");
});

for (const mode of ["beam", "frame", "truss"] as const) {
  test(`v1.6.2 ${mode} 修改后旧结果失效，重算后导出携带对象与修订证据`, async ({ page }) => {
    let exportPayload: Record<string, unknown> | null = null;
    await page.route("**/api/export", async (route) => {
      exportPayload = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        body: "fake-xlsx",
      });
    });

    await openMode(page, mode);
    await page.getByRole("tab", { name: /结构计算/ }).click();
    await page.getByRole("button", { name: MODES[mode].run }).click();
    await expect(page.getByText(MODES[mode].complete)).toBeVisible();

    await editModel(page, mode);
    await page.getByRole("tab", { name: /结构计算/ }).click();
    await expect(page.getByText("结果已失效 (需重新计算)")).toBeVisible();
    await expect(page.getByRole("button", { name: "成果导出" })).toBeDisabled();

    await page.getByRole("button", { name: MODES[mode].run }).click();
    await expect(page.getByText(MODES[mode].complete)).toBeVisible();
    await expect(page.getByText("已同步")).toBeVisible();

    await page.getByRole("button", { name: "成果导出" }).click();
    await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("menuitem", { name: /导出参数表/ }).click(),
    ]);
    await expect(page.getByText("Excel 参数表已生成")).toBeVisible();

    expect(exportPayload?.analysisType).toBe(mode);
    const provenance = exportPayload?.resultProvenance as Record<string, unknown>;
    expect(provenance.analysisObjectId).toBeTruthy();
    expect(provenance.modelSignature).toMatch(/^fnv1a64:/);
    expect(provenance.currentProjectRevision).toEqual(expect.any(Number));
    expect((provenance.resultSource as Record<string, unknown>).source).toBe("primary");
  });
}

test("v1.6.2 切换分析对象后忽略前一对象的延迟求解回执", async ({ page }) => {
  await page.unroute("**/api/calculate");
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let markRequestStarted!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    markRequestStarted = resolve;
  });
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as CalculationPayload;
    markRequestStarted();
    await responseGate;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(calculationEnvelope(payload)) });
  });

  await openMode(page, "beam");
  await page.getByRole("tab", { name: /结构计算/ }).click();
  await page.getByRole("button", { name: MODES.beam.run }).click();
  await requestStarted;

  await page.locator("aside").filter({ hasText: "分析对象" }).getByRole("button", { name: MODES.frame.object! }).click();
  releaseResponse();

  await page.getByRole("tab", { name: /结构计算/ }).click();
  await expect(page.getByRole("button", { name: MODES.frame.run })).toBeEnabled();
  await expect(page.getByRole("button", { name: "成果导出" })).toBeDisabled();
  await expect(page.getByText("梁系计算完成")).toHaveCount(0);
  await expect(page.getByText("已同步")).toHaveCount(0);
});
