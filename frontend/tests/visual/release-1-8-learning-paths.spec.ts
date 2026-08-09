import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";

test.setTimeout(90_000);

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));

type CalculationPayload = { analysisType: "beam" | "frame" | "truss" } & Record<string, unknown>;

function publicExampleCatalog() {
  const output = execFileSync(
    "uv",
    ["run", "python", "-c", "import json; from backend.examples.public_validation_projects import build_public_validation_projects; print(json.dumps(build_public_validation_projects()))"],
    { cwd: repositoryRoot, encoding: "utf-8" },
  );
  return JSON.parse(output) as Record<string, unknown>;
}

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
        allowableMm: 20,
        allowableRatio: 250,
        maxDeflectionMm: 11.25,
        maxDisplacementMm: 12.8,
        maxVerticalMm: 0.315,
        maxRotationDeg: 0.275,
        maxMomentKnM: 150,
        maxAxialForceKn: 50,
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
      modelHash: `model-release-1-8-${payload.analysisType}`,
      requestHash: `request-release-1-8-${payload.analysisType}`,
    },
    errors: [],
  };
}

async function installApiMocks(page: Page) {
  const catalog = publicExampleCatalog();
  await page.route("**/api/examples/projects", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(catalog),
  }));
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as CalculationPayload;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(calculationEnvelope(payload)),
    });
  });
  await page.route("**/api/verification-packages", async (route) => {
    const request = route.request().postDataJSON() as {
      payload: Record<string, unknown>;
      evidence: Record<string, unknown>;
    };
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        operation: "verification_package_create",
        version: "v1",
        package: {
          format: "archsight-solver-verification-package",
          formatVersion: "1.0.0",
          analysis: { input: request.payload },
          evidence: request.evidence,
          integrity: { algorithm: "sha256", packageHash: "b".repeat(64) },
        },
        verification: { status: "pass", integrityValid: true, replayMatched: true },
      }),
    });
  });
}

const learningPaths = [
  { title: "简支梁：先判反力，再读弯矩与挠度", caseId: "beam-simply-supported-center-point", pathId: "beam-symmetry-path", analysisType: "beam" },
  { title: "三杆桁架：先判拉压，再看位移", caseId: "BM-009", pathId: "truss-force-path", analysisType: "truss" },
  { title: "悬臂柱：用变形读懂反力与弯矩", caseId: "BM-010", pathId: "frame-cantilever-path", analysisType: "frame" },
] as const;

for (const learningPath of learningPaths) {
  test(`v1.8 ${learningPath.title} 完成预判、计算与可信证据导出`, async ({ page }) => {
    await page.addInitScript(() => localStorage.clear());
    await installApiMocks(page);

    await page.goto("/");
    await page.getByRole("button", { name: "公开案例", exact: true }).click();
    await expect(page.getByText("三条五分钟学习路径")).toBeVisible();
    await page.getByRole("button", { name: new RegExp(learningPath.title, "u") }).click();

    const panel = page.getByRole("region", { name: "五分钟学习路径" });
    await expect(panel.getByRole("heading", { name: learningPath.title })).toBeVisible();
    await expect(panel.getByText(learningPath.caseId, { exact: true })).toBeVisible();
    await expect(panel.locator("textarea")).toHaveCount(0);

    for (const fieldset of await panel.locator("fieldset").all()) {
      await fieldset.getByRole("radio").first().check();
    }
    await panel.getByRole("button", { name: "计算并核对" }).click();

    await expect(panel.getByText("判断一致")).toHaveCount(3);
    await expect(panel.getByText("计算结果与当前模型一致，可以导出学习复核证据。")).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await panel.getByRole("button", { name: "可信证据包" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    const verificationPackage = JSON.parse(await readFile(downloadPath!, "utf-8"));
    expect(verificationPackage.analysis.input.analysisType).toBe(learningPath.analysisType);
    expect(verificationPackage.evidence.learningReview).toEqual({
      schemaVersion: 1,
      pathId: learningPath.pathId,
      caseId: learningPath.caseId,
      reviewed: true,
      answers: expect.arrayContaining([
        expect.objectContaining({ predictionId: expect.any(String), selectedOptionId: expect.any(String) }),
      ]),
    });
    expect(JSON.stringify(verificationPackage.evidence.learningReview)).not.toMatch(/prompt|explanation|label|freeText/u);
  });
}
