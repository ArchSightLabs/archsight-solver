import { expect, test } from "@playwright/test";

// Match the other v1.6.2 release flows: WebKit startup can exceed Playwright's
// default 30-second test budget after the preceding browser projects.
test.setTimeout(120_000);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
});

test("v1.6.2 求解失败保留后端诊断代码、建议和对象引用", async ({ page }) => {
  await page.route("**/api/calculate", async (route) => {
    await route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: { code: "STRUCTURE_UNSTABLE_CONSTRAINTS", message: "结构求解失败" },
        diagnostics: {
          issues: [
            {
              code: "STRUCTURE_UNSTABLE_CONSTRAINTS",
              category: "constraint",
              severity: "error",
              analysisType: "beam",
              title: "结构约束不足",
              detail: "当前支座不足以消除刚体位移。",
              suggestions: ["检查支座约束。"],
              objectRefs: [{ kind: "support", id: "S1" }],
              actions: [{ id: "review_supports", label: "检查支座与约束" }],
            },
          ],
        },
      }),
    });
  });
  await page.goto("/");

  await page.getByRole("tab", { name: /结构计算/ }).click();
  await page.getByRole("button", { name: "运行梁系计算" }).click();

  await expect(page.getByText("结构约束不足", { exact: true })).toBeVisible();
  await expect(page.getByText("STRUCTURE_UNSTABLE_CONSTRAINTS")).toBeVisible();
  await expect(page.getByText(/定位：support S1/)).toBeVisible();
  await expect(page.getByText("建议：检查支座约束。", { exact: true })).toBeVisible();
});
