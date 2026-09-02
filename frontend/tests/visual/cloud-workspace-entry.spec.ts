import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

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

test("嵌入 Solver 用宿主工作栏替换本地文件工具栏", async ({ page }) => {
  await page.goto("/?embed=1");

  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("heading", { name: "ArchSight 结构力学求解器" })).toBeVisible();
  await expect(page.getByRole("button", { name: "文件菜单" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "保存", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /云端工程/u })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "公开案例" })).toBeVisible();
  await expect(page.getByRole("button", { name: "验证投稿" })).toBeVisible();
  await expect(page.getByRole("button", { name: "系统设置" })).toBeVisible();
});

test("嵌入页头将 URL theme 仅作为初始主题，用户仍可切换", async ({ page }) => {
  await page.goto("/?embed=1&theme=light");

  await expect(page.locator("html")).not.toHaveClass(/dark/u);
  await page.getByRole("button", { name: "切换到深色主题" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/u);
  await expect(page.getByRole("button", { name: "切换到浅色主题" })).toBeVisible();
});

test("正式容器投影 Cloud 入口与精确宿主白名单", async ({ page, request }) => {
  const expectedCloudWorkspaceUrl =
    process.env.ARCHSIGHT_SOLVER_E2E_CLOUD_WORKSPACE_URL;
  test.skip(
    !expectedCloudWorkspaceUrl,
    "仅在候选容器运行时配置验收中执行",
  );
  if (!expectedCloudWorkspaceUrl) {
    return;
  }

  const runtimeConfigResponse = await request.get("/runtime-config.js");
  expect(runtimeConfigResponse.ok()).toBeTruthy();
  const runtimeConfigScript = await runtimeConfigResponse.text();
  const runtimeConfigMatch = runtimeConfigScript.match(
    /^window\.__ARCHSIGHT_SOLVER_RUNTIME_CONFIG__\s*=\s*(\{.*\});\s*$/s,
  );
  expect(runtimeConfigMatch).not.toBeNull();
  const runtimeConfig = JSON.parse(runtimeConfigMatch?.[1] ?? "{}") as {
    cloudWorkspaceUrl?: string;
    hostAllowedOrigins?: string;
  };
  expect(runtimeConfig.cloudWorkspaceUrl).toBe(expectedCloudWorkspaceUrl);
  expect(runtimeConfig.hostAllowedOrigins?.split(",")).toEqual([
    "http://127.0.0.1:6250",
    "https://cloud.archsight.cn",
  ]);

  const navigationResponse = await page.goto("/");
  expect(navigationResponse?.ok()).toBeTruthy();
  const contentSecurityPolicy = navigationResponse?.headers()["content-security-policy"] ?? "";
  const frameAncestors = contentSecurityPolicy
    .split(";")
    .map((directive) => directive.trim().split(/\s+/))
    .find(([name]) => name === "frame-ancestors");
  expect(frameAncestors).toEqual([
    "frame-ancestors",
    "'self'",
    "http://127.0.0.1:6250",
    "https://cloud.archsight.cn",
  ]);
  await expect(page.getByRole("link", { name: "前往云端保存" })).toHaveAttribute(
    "href",
    expectedCloudWorkspaceUrl,
  );
});
