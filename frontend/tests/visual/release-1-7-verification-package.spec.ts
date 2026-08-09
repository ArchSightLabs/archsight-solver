import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.setTimeout(60_000);

type CalculationPayload = { analysisType: "beam" } & Record<string, unknown>;

function calculationEnvelope(payload: CalculationPayload) {
  return {
    success: true,
    operation: "calculate",
    version: "v1",
    analysisType: "beam",
    request: payload,
    model: { analysisType: "beam", spans: payload.spans },
    results: {
      summary: { status: "合格", statusCode: "PASS", maxDeflectionMm: 1, maxMomentKnM: 1 },
      preview: null,
      nodeResults: [],
      memberResults: [],
      memberDiagrams: [],
      nodeIds: [],
      memberIds: [],
      series: {},
    },
    diagnostics: { status: "合格", statusCode: "PASS" },
    meta: { modelHash: "model-release-1-7", requestHash: "request-release-1-7" },
    errors: [],
  };
}

async function mockCalculation(page: Page) {
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as CalculationPayload;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(calculationEnvelope(payload)),
    });
  });
}

function verificationCreateResponse(request: {
  payload: Record<string, unknown>;
  evidence: Record<string, unknown>;
}) {
  return {
    success: true,
    operation: "verification_package_create",
    version: "v1",
    package: {
      format: "archsight-solver-verification-package",
      formatVersion: "1.0.0",
      analysis: { input: request.payload },
      evidence: request.evidence,
      integrity: { algorithm: "sha256", packageHash: "a".repeat(64) },
    },
    verification: {
      status: "pass",
      integrityValid: true,
      replayMatched: true,
    },
  };
}

test("v1.7 工作台从当前有效结果导出可复算可信计算包", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await mockCalculation(page);

  let createRequest: Record<string, unknown> | null = null;
  await page.route("**/api/verification-packages", async (route) => {
    createRequest = route.request().postDataJSON() as Record<string, unknown>;
    const request = createRequest as {
      payload: Record<string, unknown>;
      evidence: Record<string, unknown>;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(verificationCreateResponse(request)),
    });
  });

  await page.goto("/");
  await page.getByRole("tab", { name: /结构计算/ }).click();
  await page.getByRole("button", { name: "运行梁系计算" }).click();
  await expect(page.getByText("梁系计算完成")).toBeVisible();
  await expect(page.getByText("已同步")).toBeVisible();

  await page.getByRole("button", { name: "成果导出" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: /导出可信计算包/ }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("archsight-solver-beam.solver-verification.json");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exportedPackage = JSON.parse(await readFile(downloadPath!, "utf8"));
  expect(exportedPackage.format).toBe("archsight-solver-verification-package");
  expect(exportedPackage.evidence.source).toBe("archsight-solver-web-workbench");
  expect(exportedPackage.evidence.resultSource).toMatchObject({ source: "primary", id: "__primary__" });
  expect(exportedPackage.evidence.resultProvenance.modelSignature).toMatch(/^fnv1a64:/u);
  expect(exportedPackage.analysis.input.analysisType).toBe("beam");
  expect(createRequest).not.toBeNull();
  await expect(page.getByText("可信计算包已生成")).toBeVisible();
});

test("v1.7 可信计算包响应返回前模型变化时丢弃文件", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await mockCalculation(page);

  let createRequested = false;
  let responseFulfilled = false;
  let releaseResponse: (() => void) | undefined;
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  await page.route("**/api/verification-packages", async (route) => {
    createRequested = true;
    const request = route.request().postDataJSON() as {
      payload: Record<string, unknown>;
      evidence: Record<string, unknown>;
    };
    await responseGate;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(verificationCreateResponse(request)),
    });
    responseFulfilled = true;
  });
  const downloads: string[] = [];
  page.on("download", (download) => downloads.push(download.suggestedFilename()));

  await page.goto("/");
  await page.getByRole("tab", { name: /结构计算/ }).click();
  await page.getByRole("button", { name: "运行梁系计算" }).click();
  await expect(page.getByText("梁系计算完成")).toBeVisible();

  await page.getByRole("button", { name: "成果导出" }).click();
  await page.getByRole("menuitem", { name: /导出可信计算包/ }).click();
  await expect.poll(() => createRequested).toBe(true);

  await page.getByRole("tab", { name: "参数建模", exact: true }).click();
  await page.getByLabel("均布荷载 kN/m").first().fill("18");
  await page.getByRole("button", { name: "生成连续梁" }).click();
  releaseResponse?.();

  await expect.poll(() => responseFulfilled).toBe(true);
  await page.getByRole("tab", { name: /结构计算/ }).click();
  await expect(page.getByText(/返回文件已丢弃/)).toBeVisible();
  expect(downloads).toEqual([]);
});
