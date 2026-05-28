import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

const screenshotOptions = {
  fullPage: true,
  animations: "disabled" as const,
  maxDiffPixelRatio: 0.02,
  timeout: 15_000,
};

const moduleCases = [
  { key: "beam", dialogButton: null, objectName: "连续梁-1 梁", parameterTitle: "梁系参数" },
  { key: "frame", dialogButton: /平面框架/, objectName: "平面框架-1 框架", parameterTitle: "框架参数" },
  { key: "truss", dialogButton: /平面桁架/, objectName: "平面桁架-1 桁架", parameterTitle: "桁架参数" },
];

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

async function createAnalysisObject(page: Page, dialogButton: RegExp | null) {
  if (!dialogButton) return;
  await page.getByRole("button", { name: "新建分析对象" }).click();
  const dialog = page.getByRole("dialog", { name: "新建分析对象" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: dialogButton }).click();
  await dialog.getByRole("button", { name: "创建" }).click();
  await expect(dialog).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
  await page.goto("/");
  await stabilizeWorkbench(page);
});

for (const item of moduleCases) {
  test(`桌面端 ${item.key} 建模工作台视觉基线`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    const moduleRail = page.locator("aside").filter({ hasText: "分析对象" });
    await expect(moduleRail).toBeVisible();
    await expect(moduleRail.getByRole("button", { name: /新建分析对象/ })).toBeVisible();

    await createAnalysisObject(page, item.dialogButton);
    await expect(moduleRail.getByRole("button", { name: item.objectName, exact: true })).toBeVisible();
    await expect(page).toHaveTitle("ArchSight 结构力学求解器");
    await expect(page.getByRole("heading", { name: "ArchSight 结构力学求解器" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "工作台模式" })).toHaveCount(0);
    await expect(page.getByText(item.parameterTitle, { exact: true })).toBeVisible();
    const mainTabs = page.getByRole("tablist", { name: "主工作区分页" });
    await expect(mainTabs.getByRole("tab", { name: "参数建模", exact: true })).toBeVisible();
    await expect(mainTabs.getByRole("tab", { name: /结构计算/ })).toBeVisible();
    await expect(page.getByText("按梁系、平面框架、平面桁架切换建模参数与结果指标。")).toHaveCount(0);
    await expect(page).toHaveScreenshot(`desktop-${item.key}-workbench.png`, screenshotOptions);
  });
}

test("移动端结构体系入口与建模主场视觉基线", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("aside").filter({ hasText: "分析对象" })).toBeHidden();
  await expect(page).toHaveTitle("ArchSight 结构力学求解器");
  await expect(page.getByRole("heading", { name: "ArchSight 结构力学求解器" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "工作台模式" })).toHaveCount(0);
  await expect(page.getByText("跨段数量")).toBeVisible();
  await expect(page.getByText("梁系参数")).toBeVisible();
  await expect(page.getByRole("tab", { name: /参数建模/ })).toBeVisible();
  await expect(page).toHaveScreenshot("mobile-beam-model.png", screenshotOptions);
});

test("模板库名称输入框支持回车保存并关闭面板", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 });

  await page.getByRole("button", { name: "系统设置" }).click();
  await page.getByRole("button", { name: "模板库" }).click();

  const templateDialog = page.getByRole("dialog", { name: "模板库" });
  await expect(templateDialog).toBeVisible();
  await templateDialog.getByLabel("模板名称").fill("标准方案A");
  await templateDialog.getByLabel("模板名称").press("Enter");

  await expect(templateDialog).toBeHidden();

  await page.getByRole("button", { name: "系统设置" }).click();
  await page.getByRole("button", { name: "模板库" }).click();

  const reopenedTemplateDialog = page.getByRole("dialog", { name: "模板库" });
  await expect(reopenedTemplateDialog.getByText("标准方案A", { exact: true })).toBeVisible();
});
