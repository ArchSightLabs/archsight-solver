import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { resolve } from "node:path";

test.setTimeout(120_000);

declare global {
  interface Window {
    __release162SavedProject?: string;
  }
}

const canonicalProjectPath = resolve(process.cwd(), "../examples/host-iframe-demo/sample-project.slv");
const solverOrigin = new URL(process.env.ARCHSIGHT_SOLVER_E2E_URL ?? "http://127.0.0.1:6241").origin;
const referenceHostUrl = new URL("http://127.0.0.1:6250");
referenceHostUrl.searchParams.set("solverUrl", solverOrigin);

type CalculationPayload = { analysisType: "beam"; spans?: number[] } & Record<string, unknown>;

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
    meta: { modelHash: "model-release-1-6-2", requestHash: "request-release-1-6-2" },
    errors: [],
  };
}

async function mockCalculationAndExport(page: Page) {
  const calculationPayloads: CalculationPayload[] = [];
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as CalculationPayload;
    calculationPayloads.push(payload);
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(calculationEnvelope(payload)) });
  });
  await page.route("**/api/export", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      body: "release-1-6-2-xlsx",
    });
  });
  return calculationPayloads;
}

async function calculateEditInvalidateRecalculateAndExport(workbench: Page | FrameLocator) {
  await workbench.getByRole("tab", { name: /结构计算/ }).click();
  await workbench.getByRole("button", { name: "运行梁系计算" }).click();
  await expect(workbench.getByText("梁系计算完成")).toBeVisible();
  await expect(workbench.getByText("已同步")).toBeVisible();

  await workbench.getByRole("tab", { name: "参数建模", exact: true }).click();
  const loadInput = workbench.getByLabel("均布荷载 kN/m").first();
  await loadInput.fill("18");
  await workbench.getByRole("button", { name: "生成连续梁" }).click();
  await workbench.getByRole("tab", { name: /结构计算/ }).click();
  await expect(workbench.getByText("结果已失效 (需重新计算)")).toBeVisible();
  await expect(workbench.getByRole("button", { name: "成果导出" })).toBeDisabled();

  await workbench.getByRole("button", { name: "运行梁系计算" }).click();
  await expect(workbench.getByText("已同步")).toBeVisible();
  await workbench.getByRole("button", { name: "成果导出" }).click();
  await workbench.getByRole("menuitem", { name: /导出参数表/ }).click();
  await expect(workbench.getByText("Excel 参数表已生成")).toBeVisible();
}

test("v1.6.2 canonical 工程在独立工作台完成计算、失效、重算、导出、保存和重开", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => ({
        name: "release-1-6-2-canonical.slv",
        createWritable: async () => ({
          write: async (blob: Blob) => {
            window.__release162SavedProject = await blob.text();
          },
          close: async () => undefined,
        }),
      }),
    });
  });
  await mockCalculationAndExport(page);
  await page.goto("/");
  await page.locator('input[name="project-file"]').setInputFiles(canonicalProjectPath);
  await expect(page.getByText("sample-project.slv", { exact: true })).toBeVisible();

  await calculateEditInvalidateRecalculateAndExport(page);
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.__release162SavedProject ?? "")).not.toBe("");
  const savedProject = await page.evaluate(() => window.__release162SavedProject!);
  expect(JSON.parse(savedProject).project.objects[0].resultProvenance.modelSignature).toMatch(/^fnv1a64:/);

  await page.locator('input[name="project-file"]').setInputFiles({
    name: "release-1-6-2-canonical.slv",
    mimeType: "application/json",
    buffer: Buffer.from(savedProject),
  });
  await expect(page.getByLabel("均布荷载 kN/m").first()).toHaveValue("18");
  await page.getByRole("tab", { name: /结构计算/ }).click();
  await expect(page.getByText("已同步")).toBeVisible();
});

test("v1.6.2 同一 canonical 工程在嵌入工作台完成计算、保存重开和只读审阅", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    if (
      window.location.origin === "http://127.0.0.1:6250"
      && !sessionStorage.getItem("release-1-6-2-acceptance-initialized")
    ) {
      localStorage.clear();
      sessionStorage.setItem("release-1-6-2-acceptance-initialized", "true");
    }
  });
  const calculationPayloads = await mockCalculationAndExport(page);
  await page.goto(referenceHostUrl.href);
  await expect.poll(async () => {
    const state = await page.evaluate(() => ({
      status: document.querySelector("#connectionStatus")?.textContent ?? "",
      notice: document.querySelector("#operationNotice")?.textContent ?? "",
      log: document.querySelector("#log")?.textContent ?? "",
    }));
    return { ...state, pageErrors };
  }, { timeout: 45_000 }).toMatchObject({ status: "已建立会话", notice: "", pageErrors: [] });
  const solver = page.frameLocator("#solverFrame");

  await calculateEditInvalidateRecalculateAndExport(solver);
  await page.getByRole("button", { name: "保存工程" }).click();
  await expect(page.locator("#revision")).toHaveText("1");
  await expect(page.locator("#uniformLoad")).toHaveText("均布荷载 18 kN/m");
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem("archsight-solver.reference-host.project.v1");
    if (!raw) return null;
    const projectDocument = JSON.parse(raw).projectDocument;
    const activeObject = projectDocument.project.objects.find((item: { id: string }) => item.id === projectDocument.project.activeObjectId);
    return activeObject?.state?.q ?? null;
  })).toBe(18);

  await page.reload();
  await expect(page.locator("#connectionStatus")).toHaveText("已建立会话", { timeout: 20_000 });
  await page.frameLocator("#solverFrame").getByRole("tab", { name: /结构计算/ }).click();
  await page.frameLocator("#solverFrame").getByRole("button", { name: "运行梁系计算" }).click();
  await expect.poll(() => calculationPayloads.at(-1)?.q).toBe(18);
  await page.getByRole("button", { name: "只读审阅" }).click();
  await expect(page.locator("#mode")).toHaveText("readonly");
  await expect(page.getByRole("button", { name: "保存工程" })).toBeDisabled();
  await expect(page.frameLocator("#solverFrame").getByLabel("只读建模区域")).toHaveAttribute("disabled", "");
});
