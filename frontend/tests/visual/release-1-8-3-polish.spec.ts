import { expect, test, type Locator, type Page } from "@playwright/test";

const realBackendEnabled = process.env.ARCHSIGHT_SOLVER_E2E_REAL_BACKEND === "1";

type ModelOrientation = "horizontal" | "vertical";

async function openLearningCase(page: Page, title: string) {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  await page.goto("/");
  await page.getByRole("button", { name: "公开案例", exact: true }).click();
  await page.getByRole("tab", { name: /学习路径/u }).click();
  await page.getByRole("button", { name: new RegExp(title, "u") }).click();

  const learning = page.getByRole("region", { name: "五分钟学习路径" });
  for (const fieldset of await learning.locator("fieldset").all()) {
    await fieldset.getByRole("radio").first().check();
  }
  await learning.getByRole("button", { name: "计算并核对" }).click();
  await expect(learning.getByText("判断一致")).toHaveCount(3, { timeout: 300_000 });
  await expect(page.getByText(/(?:梁系|平面框架|平面桁架)计算完成/u).first()).toBeVisible({ timeout: 300_000 });
}

async function expectModelUsesReadableCanvas(
  svg: Locator,
  mode: "frame" | "truss",
  surface: "preview" | "diagram",
  orientation: ModelOrientation,
) {
  await expect(svg).toBeVisible();
  const layout = await svg.locator(
    `[data-result-mode="${mode}"][data-result-surface="${surface}"][data-result-label-id^="node:"]`,
  ).evaluateAll((elements) => {
    const owner = elements[0]?.ownerSVGElement;
    if (!owner || elements.length < 2) {
      throw new Error("结果图缺少可用于布局验收的节点标注");
    }
    const viewBox = owner.viewBox.baseVal;
    const boxes = elements.map((element) => (element as SVGGraphicsElement).getBBox());
    const centersX = boxes.map((box) => box.x + box.width / 2);
    const centersY = boxes.map((box) => box.y + box.height / 2);
    return {
      xSpanRatio: (Math.max(...centersX) - Math.min(...centersX)) / viewBox.width,
      ySpanRatio: (Math.max(...centersY) - Math.min(...centersY)) / viewBox.height,
      centerXRatio: (Math.min(...centersX) + Math.max(...centersX)) / 2 / viewBox.width,
      centerYRatio: (Math.min(...centersY) + Math.max(...centersY)) / 2 / viewBox.height,
      clipped: boxes.some((box) => (
        box.x < viewBox.x - 1
        || box.y < viewBox.y - 1
        || box.x + box.width > viewBox.x + viewBox.width + 1
        || box.y + box.height > viewBox.y + viewBox.height + 1
      )),
    };
  });

  expect(layout.clipped, "节点标注不应被 SVG 画布裁切").toBe(false);
  if (orientation === "horizontal") {
    expect(layout.xSpanRatio, "短跨水平模型应充分利用画布宽度").toBeGreaterThan(0.62);
    expect(layout.centerYRatio, "短跨水平模型应在画布竖向居中").toBeGreaterThan(0.3);
    expect(layout.centerYRatio, "短跨水平模型应在画布竖向居中").toBeLessThan(0.7);
  } else {
    expect(layout.ySpanRatio, "纯竖向模型应充分利用画布高度").toBeGreaterThan(0.58);
    expect(layout.centerXRatio, "纯竖向模型应在画布横向居中").toBeGreaterThan(0.3);
    expect(layout.centerXRatio, "纯竖向模型应在画布横向居中").toBeLessThan(0.7);
  }
}

test.describe("v1.8.3 图形与公开内容真实页面验收", () => {
  test.skip(!realBackendEnabled, "仅在真实后端或发布镜像门禁中运行");
  test.setTimeout(360_000);

  test("BM-009 三杆桁架在受力变形图和工程图中完整居中", async ({ page }, testInfo) => {
    await openLearningCase(page, "三杆桁架：先判拉压，再看位移");

    await page.getByRole("tab", { name: "受力变形", exact: true }).click();
    const previewPanel = page.getByRole("tabpanel", { name: "受力变形" });
    const previewSvg = previewPanel.locator('svg:has([data-result-mode="truss"][data-result-surface="preview"])').first();
    await expectModelUsesReadableCanvas(previewSvg, "truss", "preview", "horizontal");
    await previewPanel.screenshot({ path: testInfo.outputPath("BM-009-受力变形图.png") });

    await page.getByRole("tab", { name: "工程图", exact: true }).click();
    const diagramPanel = page.getByRole("tabpanel", { name: "工程图" });
    const diagramSvg = diagramPanel.locator('svg:has([data-result-mode="truss"][data-result-surface="diagram"])').first();
    await expectModelUsesReadableCanvas(diagramSvg, "truss", "diagram", "horizontal");
  });

  test("GNA-003 浅拱短跨框架在受力变形图和工程图中完整居中", async ({ page }, testInfo) => {
    await openLearningCase(page, "Williams 浅拱翻转：为什么收敛失败也可能是正确结果");

    await page.getByRole("tab", { name: "受力变形", exact: true }).click();
    const previewPanel = page.getByRole("tabpanel", { name: "受力变形" });
    const previewSvg = previewPanel.locator('svg:has([data-result-mode="frame"][data-result-surface="preview"])').first();
    await expectModelUsesReadableCanvas(previewSvg, "frame", "preview", "horizontal");
    await previewPanel.screenshot({ path: testInfo.outputPath("GNA-003-受力变形图.png") });

    await page.getByRole("tab", { name: "工程图", exact: true }).click();
    const diagramPanel = page.getByRole("tabpanel", { name: "工程图" });
    const diagramSvg = diagramPanel.locator('svg:has([data-result-mode="frame"][data-result-surface="diagram"])').first();
    await expectModelUsesReadableCanvas(diagramSvg, "frame", "diagram", "horizontal");
    await diagramPanel.screenshot({ path: testInfo.outputPath("GNA-003-工程图.png") });
  });

  test("BM-010 纯竖向框架在受力变形图和工程图中完整居中", async ({ page }, testInfo) => {
    await openLearningCase(page, "悬臂柱：用变形读懂反力与弯矩");

    await page.getByRole("tab", { name: "受力变形", exact: true }).click();
    const previewPanel = page.getByRole("tabpanel", { name: "受力变形" });
    const previewSvg = previewPanel.locator('svg:has([data-result-mode="frame"][data-result-surface="preview"])').first();
    await expectModelUsesReadableCanvas(previewSvg, "frame", "preview", "vertical");
    await previewPanel.screenshot({ path: testInfo.outputPath("BM-010-受力变形图.png") });

    await page.getByRole("tab", { name: "工程图", exact: true }).click();
    const diagramPanel = page.getByRole("tabpanel", { name: "工程图" });
    const diagramSvg = diagramPanel.locator('svg:has([data-result-mode="frame"][data-result-surface="diagram"])').first();
    await expectModelUsesReadableCanvas(diagramSvg, "frame", "diagram", "vertical");
  });
});
