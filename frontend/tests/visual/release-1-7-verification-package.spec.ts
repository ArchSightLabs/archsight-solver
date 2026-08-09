import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

test.setTimeout(60_000);

type CalculationPayload = { analysisType: "beam" | "frame" | "truss" } & Record<string, unknown>;

function calculationEnvelope(payload: CalculationPayload) {
  return {
    success: true,
    operation: "calculate",
    version: "v1",
    analysisType: payload.analysisType,
    request: payload,
    model: { analysisType: payload.analysisType, spans: payload.spans, structure: payload.structure },
    results: {
      summary: {
        status: "合格",
        statusCode: "PASS",
        allowableMm: 10,
        allowableRatio: 250,
        maxDeflectionMm: 1,
        maxDisplacementMm: 1,
        maxVerticalMm: 1,
        maxRotationDeg: 0.01,
        maxMomentKnM: 1,
        maxAxialForceKn: 1,
      },
      preview: null,
      nodeResults: [],
      memberResults: [],
      memberDiagrams: [],
      nodeIds: [],
      memberIds: [],
      series: {},
    },
    diagnostics: { status: "合格", statusCode: "PASS" },
    meta: {
      modelHash: `model-release-1-7-${payload.analysisType}`,
      requestHash: `request-release-1-7-${payload.analysisType}`,
    },
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

test("v1.7 梁、平面框架和平面桁架均从当前 provenance 导出可信计算包", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await mockCalculation(page);

  const createRequests: Array<{
    payload: CalculationPayload;
    evidence: Record<string, unknown> & {
      resultProvenance: { analysisType: string; modelSignature: string };
      resultSource: { source: string; id: string };
    };
  }> = [];
  await page.route("**/api/verification-packages", async (route) => {
    const request = route.request().postDataJSON() as (typeof createRequests)[number];
    createRequests.push(request);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(verificationCreateResponse(request)),
    });
  });

  await page.goto("/");
  const moduleRail = page.locator("aside").filter({ hasText: "分析对象" });
  const scenarios = [
    {
      analysisType: "beam",
      object: null,
      run: "运行梁系计算",
      complete: "梁系计算完成",
      filename: "archsight-solver-beam.solver-verification.json",
    },
    {
      analysisType: "frame",
      object: /平面框架-1\s+(平面框架|框架)/u,
      run: "运行平面框架计算",
      complete: "平面框架计算完成",
      filename: "archsight-solver-frame.solver-verification.json",
    },
    {
      analysisType: "truss",
      object: /平面桁架-1\s+(平面桁架|桁架)/u,
      run: "运行平面桁架计算",
      complete: "平面桁架计算完成",
      filename: "archsight-solver-truss.solver-verification.json",
    },
  ] as const;

  for (const scenario of scenarios) {
    if (scenario.object) {
      await moduleRail.getByRole("button", { name: scenario.object }).click();
    }
    await page.getByRole("tab", { name: /结构计算/ }).click();
    await page.getByRole("button", { name: scenario.run }).click();
    await expect(page.getByText(scenario.complete)).toBeVisible();

    await page.getByRole("button", { name: "成果导出" }).click();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: /导出可信计算包/ }).click();
    expect((await downloadPromise).suggestedFilename()).toBe(scenario.filename);

    const request = createRequests.at(-1);
    expect(request?.payload.analysisType).toBe(scenario.analysisType);
    expect(request?.evidence.resultProvenance.analysisType).toBe(scenario.analysisType);
    expect(request?.evidence.resultProvenance.modelSignature).toMatch(/^fnv1a64:/u);
    expect(request?.evidence.resultSource).toMatchObject({ source: "primary", id: "__primary__" });
  }
});
