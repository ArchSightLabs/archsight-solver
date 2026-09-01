import { expect, test } from "@playwright/test";

test("独立 Solver 提供可选云端保存入口", async ({ page }) => {
  await page.addInitScript(() => {
    window.__ARCHSIGHT_SOLVER_RUNTIME_CONFIG__ = {
      cloudWorkspaceUrl: "https://cloud.archsight.cn/solver",
    };
  });
  await page.goto("/");

  const cloudEntry = page.getByRole("link", { name: "前往云端保存" });
  await expect(cloudEntry).toBeVisible();
  await expect(cloudEntry).toHaveAttribute("href", "https://cloud.archsight.cn/solver");
  await expect(cloudEntry).toHaveAttribute(
    "title",
    "登录云空间后创建或打开云项目；当前本地工程不会自动上传",
  );
});

test("未配置云空间时独立 Solver 不显示入口", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("link", { name: "前往云端保存" })).toHaveCount(0);
});

test("嵌入 Solver 不重复显示云空间入口", async ({ page }) => {
  await page.addInitScript(() => {
    window.__ARCHSIGHT_SOLVER_RUNTIME_CONFIG__ = {
      cloudWorkspaceUrl: "https://cloud.archsight.cn/solver",
    };
  });
  await page.goto("/?embed=1");

  await expect(page.getByRole("link", { name: "前往云端保存" })).toHaveCount(0);
});
