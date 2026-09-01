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
