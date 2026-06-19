import { expect, test, type Page } from "@playwright/test";

test.setTimeout(120_000);

type QuickCalculationPayload =
  | {
      analysisType: "beam";
      spans?: number[];
      q?: number;
      supports?: Array<{ id?: string; x?: number; type?: string }>;
    }
  | {
      analysisType: "frame";
      structure: {
        nodes: Array<{ id: string; x: number; y: number; supportType?: string }>;
        members: Array<{ id: string; kind?: string; start: string; end: string }>;
        loads?: Array<{ type: string; member?: string; node?: string }>;
      };
    }
  | {
      analysisType: "truss";
      structure: {
        nodes: Array<{ id: string; x: number; y: number; supportType?: string }>;
        members: Array<{ id: string; kind?: string; start: string; end: string; elementType?: string }>;
        loads?: Array<{ type: string; node?: string; member?: string }>;
      };
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

async function openWorkbench(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto("/");
  await stabilizeWorkbench(page);
}

async function routeCalculate(page: Page, onPayload: (payload: QuickCalculationPayload) => void) {
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as QuickCalculationPayload;
    onPayload(payload);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(quickCalculationEnvelope(payload)),
    });
  });
}

function quickCalculationEnvelope(payload: QuickCalculationPayload) {
  const analysisType = payload.analysisType;
  const structure = "structure" in payload ? payload.structure : { spans: payload.spans, supports: payload.supports };
  return {
    success: true,
    operation: "calculate",
    version: "v1",
    analysisType,
    request: payload,
    model: { analysisType, structure },
    results: {
      summary: {
        allowableMm: 10,
        allowableRatio: 250,
        maxDeflectionMm: 1,
        maxDisplacementMm: 1,
        maxVerticalMm: 1,
        maxRotationDeg: 0.01,
        maxMomentKnM: 1,
        maxAxialForceKn: 1,
        status: "合格",
        statusCode: "PASS",
        method: "v1.5 快速建模验收 mock",
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
    errors: [],
  };
}

async function generateAndExpectCalculation(page: Page, completeText: string) {
  await page.getByRole("button", { name: "生成并计算" }).click();
  await expect(page.getByText(completeText)).toBeVisible();
}

async function openTemplateAndExpectCalculation(page: Page, sectionId: string, templateTitle: string, completeText: string) {
  await page
    .locator(`#${sectionId} article`)
    .filter({ hasText: templateTitle })
    .getByRole("button", { name: "打开并计算" })
    .click();
  await expect(page.getByText(completeText)).toBeVisible();
}

test("v1.5.0 梁系快速生成可形成连续梁求解请求", async ({ page }) => {
  let capturedPayload: QuickCalculationPayload | null = null;
  await routeCalculate(page, (payload) => {
    capturedPayload = payload;
  });
  await openWorkbench(page);

  await page.getByRole("tab", { name: "模板", exact: true }).click();
  await generateAndExpectCalculation(page, "梁系计算完成");

  expect(capturedPayload?.analysisType).toBe("beam");
  expect(capturedPayload && "spans" in capturedPayload ? capturedPayload.spans : []).toEqual([5, 5, 5]);
  expect(capturedPayload && "supports" in capturedPayload ? capturedPayload.supports?.length : 0).toBe(4);
  expect(capturedPayload && "q" in capturedPayload ? capturedPayload.q : 0).toBe(12);
});

test("v1.5.0 平面框架快速生成可形成规则框架求解请求", async ({ page }) => {
  let capturedPayload: QuickCalculationPayload | null = null;
  await routeCalculate(page, (payload) => {
    capturedPayload = payload;
  });
  await openWorkbench(page);

  const moduleRail = page.locator("aside").filter({ hasText: "分析对象" });
  await moduleRail.getByRole("button", { name: /平面框架-1\s+(平面框架|框架)/ }).click();
  await page.getByRole("tab", { name: "模板", exact: true }).click();
  await generateAndExpectCalculation(page, "平面框架计算完成");

  expect(capturedPayload?.analysisType).toBe("frame");
  const structure = capturedPayload?.analysisType === "frame" ? capturedPayload.structure : null;
  expect(structure?.nodes.length).toBe(6);
  expect(structure?.members.filter((member) => member.kind === "column").length).toBe(3);
  expect(structure?.members.filter((member) => member.kind === "beam").length).toBe(2);
  expect(structure?.loads?.filter((load) => load.type === "distributed").length).toBe(2);
});

test("v1.5.0 平面桁架快速生成可形成平行弦桁架求解请求", async ({ page }) => {
  let capturedPayload: QuickCalculationPayload | null = null;
  await routeCalculate(page, (payload) => {
    capturedPayload = payload;
  });
  await openWorkbench(page);

  const moduleRail = page.locator("aside").filter({ hasText: "分析对象" });
  await moduleRail.getByRole("button", { name: /平面桁架-1\s+(平面桁架|桁架)/ }).click();
  await page.getByRole("tab", { name: "模板", exact: true }).click();
  await generateAndExpectCalculation(page, "平面桁架计算完成");

  expect(capturedPayload?.analysisType).toBe("truss");
  const structure = capturedPayload?.analysisType === "truss" ? capturedPayload.structure : null;
  expect(structure?.nodes.length).toBe(10);
  expect(structure?.members.every((member) => member.elementType === "truss")).toBe(true);
  expect(structure?.members.filter((member) => member.kind === "diagonal").length).toBe(4);
  expect(structure?.loads?.every((load) => load.type === "nodal")).toBe(true);
});

test("v1.5.0 三类内置模板可从模板页直接打开并计算", async ({ page }) => {
  const capturedPayloads: QuickCalculationPayload[] = [];
  await routeCalculate(page, (payload) => {
    capturedPayloads.push(payload);
  });
  await openWorkbench(page);

  await page.getByRole("tab", { name: "模板", exact: true }).click();
  await expect(page.getByLabel("连续梁快速生成预设")).toBeVisible();
  await expect(page.getByText(/即将生成：3 跨、4 个支座/u)).toBeVisible();
  await openTemplateAndExpectCalculation(page, "beam-template", "简支梁均布荷载", "梁系计算完成");

  const moduleRail = page.locator("aside").filter({ hasText: "分析对象" });
  await moduleRail.getByRole("button", { name: /平面框架-1\s+(平面框架|框架)/ }).click();
  await page.getByRole("tab", { name: "模板", exact: true }).click();
  await expect(page.getByLabel("规则框架快速生成预设")).toBeVisible();
  await expect(page.getByText(/即将生成：6 节点、3 柱、2 梁/u)).toBeVisible();
  await openTemplateAndExpectCalculation(page, "frame-template", "单跨单层刚架", "平面框架计算完成");

  await moduleRail.getByRole("button", { name: /平面桁架-1\s+(平面桁架|桁架)/ }).click();
  await page.getByRole("tab", { name: "模板", exact: true }).click();
  await expect(page.getByLabel("平行弦桁架快速生成预设")).toBeVisible();
  await expect(page.getByText(/即将生成：10 节点、17 杆件/u)).toBeVisible();
  await openTemplateAndExpectCalculation(page, "truss-template", "平行弦桁架", "平面桁架计算完成");

  expect(capturedPayloads.map((payload) => payload.analysisType)).toEqual(["beam", "frame", "truss"]);
  expect(capturedPayloads[0] && "spans" in capturedPayloads[0] ? capturedPayloads[0].spans : []).toEqual([6]);
  const frameStructure = capturedPayloads[1]?.analysisType === "frame" ? capturedPayloads[1].structure : null;
  const trussStructure = capturedPayloads[2]?.analysisType === "truss" ? capturedPayloads[2].structure : null;
  expect(frameStructure?.nodes.length).toBe(4);
  expect(frameStructure?.members.length).toBe(3);
  expect(trussStructure?.members.every((member) => member.elementType === "truss")).toBe(true);
});

test("v1.5.0 新建分析对象可直接进入指定建模路径", async ({ page }) => {
  await openWorkbench(page);

  await page.getByRole("button", { name: "新建分析对象" }).click();
  const dialog = page.getByRole("dialog", { name: "新建分析对象" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /平面框架/ }).click();
  await dialog.getByRole("button", { name: /对象编辑/ }).click();
  await dialog.getByRole("button", { name: "创建" }).click();
  await expect(dialog).toBeHidden();

  const frameTabs = page.getByRole("tablist", { name: "平面框架参数" });
  await expect(frameTabs.getByRole("tab", { name: "对象", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("属性编辑", { exact: true })).toBeVisible();
});
