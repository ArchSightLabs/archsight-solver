import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

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

async function mockBeamCalculation(page: Page) {
  await page.route("**/api/calculate", async (route) => {
    const payload = route.request().postDataJSON() as Record<string, unknown>;
    const response = {
      success: true,
      operation: "calculate",
      version: "v1",
      resultHash: "release-1-8-beam-result",
      analysisType: "beam",
      request: payload,
      model: {
        analysisType: "beam",
        structure: {
          spans: [6],
          supports: [
            { label: "S1", x: 0, type: "pinned" },
            { label: "S2", x: 6, type: "roller" },
          ],
        },
      },
      results: {
        summary: {
          allowableMm: 18,
          allowableRatio: 250,
          maxDeflectionMm: 0.8,
          maxDeflectionPositionM: 3,
          status: "合格",
          statusCode: "PASS",
          method: "浏览器验收 mock 梁系杆单元法",
        },
        preview: {
          beamType: "continuous",
          beamTypeLabel: "连续梁",
          loadType: "uniform",
          loadTypeLabel: "均布荷载",
          spans: [6],
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
          curve: [
            { x: 0, v: 0, vMm: 0 },
            { x: 1.5, v: -0.3, vMm: -300 },
            { x: 3, v: -0.8, vMm: -800 },
            { x: 4.5, v: -0.4, vMm: -400 },
            { x: 6, v: 0, vMm: 0 },
          ],
          spanSummaries: [{ spanIndex: 0, startX: 0, endX: 6, length: 6, maxDeflectionMm: 0.8, maxDeflectionPositionM: 3 }],
          maxDeflection: { valueM: -0.0008, valueMm: -0.8, xM: 3, spanIndex: 0 },
          reactions: [
            { dof: 0, supportId: "S1", valueN: 5400, valueKn: 5.4 },
            { dof: 1, supportId: "S2", valueN: 5400, valueKn: 5.4 },
          ],
          warnings: [],
        },
        loadCaseResults: [],
        loadCombinationResults: [],
        series: {
          x_data: [0, 1.5, 3, 4.5, 6],
          v_data: [0, -0.3, -0.8, -0.4, 0],
          moment_data: [1.2, 5.6, 11.8, -3.2, -1.1],
          shear_data: [4.5, 1.8, -0.4, -1.9, -3.8],
          t_data: [0, 0.25, 0.5, 0.75, 1],
          q_t_data: [8, 8, 8, 8, 8],
        },
      },
      diagnostics: { status: "合格", statusCode: "PASS" },
      meta: {
        generatedAt: "2026-08-23T08:00:00.000Z",
        modelHash: "release-1-8-beam-model",
        requestHash: "release-1-8-beam-request",
      },
      errors: [],
    };

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
  await mockBeamCalculation(page);
  await page.goto("/");
  await stabilizeWorkbench(page);
}

async function runBeamCalculation(page: Page) {
  await page.getByRole("tab", { name: "结构计算", exact: true }).click();
  await page.getByRole("button", { name: "运行梁系计算" }).click();
  await expect(page.getByText("梁系计算完成")).toBeVisible();
}

test("结果页签支持键盘切换并维持焦点在当前 tab", async ({ page }) => {
  await openWorkbench(page);
  await runBeamCalculation(page);

  const tablist = page.getByRole("tablist", { name: "结果页签" });
  await expect(tablist).toBeVisible();

  const calculationTab = page.getByRole("tab", { name: "计算过程", exact: true });
  await calculationTab.click();
  await expect(calculationTab).toHaveAttribute("aria-selected", "true");
  await calculationTab.focus();
  await page.keyboard.press("ArrowRight");

  const criticalTab = page.getByRole("tab", { name: "关键点", exact: true });
  await expect(criticalTab).toHaveAttribute("aria-selected", "true");
  await expect(criticalTab).toBeFocused();
  await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "result-tab-critical");

  await page.keyboard.press("End");
  const summaryTab = page.getByRole("tab", { name: "结果摘要", exact: true });
  await expect(summaryTab).toHaveAttribute("aria-selected", "true");
  await expect(summaryTab).toBeFocused();

  await page.keyboard.press("Home");
  const overviewTab = page.getByRole("tab", { name: "全部结果", exact: true });
  await expect(overviewTab).toHaveAttribute("aria-selected", "true");
  await expect(overviewTab).toBeFocused();
});

test("工作台缩放控件可通过可访问名称触达到 200%", async ({ page }) => {
  await openWorkbench(page);

  await page.getByRole("tab", { name: "参数建模", exact: true }).click();
  await page.getByRole("tab", { name: "对象", exact: true }).click();
  await page.getByRole("button", { name: "显示工作台缩放" }).click();

  const zoomInput = page.getByLabel("工作台缩放百分比");
  await expect(zoomInput).toBeVisible();
  await zoomInput.fill("200");
  await zoomInput.press("Enter");

  await expect(zoomInput).toHaveValue("200");
  await expect(page.getByRole("button", { name: "缩小工作台" })).toBeVisible();
  await expect(page.getByRole("button", { name: "放大工作台" })).toBeVisible();
  await expect(page.getByRole("button", { name: "重置工作台缩放" })).toBeVisible();
});
