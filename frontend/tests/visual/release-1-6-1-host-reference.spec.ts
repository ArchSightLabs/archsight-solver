import { expect, test } from "@playwright/test";


test.beforeEach(async ({ page }) => {
  await page.goto("http://127.0.0.1:6250");
});


test("v1.6.1 reference host completes cross-origin save and reopen", async ({ page }) => {
  const solver = page.frameLocator("#solverFrame");
  await expect(page.locator("#hostOrigin")).toHaveText("http://127.0.0.1:6250");
  await expect(page.locator("#solverOrigin")).toHaveText("http://127.0.0.1:6241");
  await expect(solver.getByText(/外部宿主：可编辑/u)).toBeVisible({ timeout: 20_000 });

  const loadInput = solver.getByLabel("均布荷载 kN/m").first();
  await loadInput.fill("18");
  await solver.getByRole("button", { name: "生成连续梁" }).click();
  await expect(page.locator("#log")).toContainText('"q": 18');
  await solver.getByRole("button", { name: "保存", exact: true }).click();

  await expect(page.locator("#revision")).toHaveText("1");
  await expect(page.locator("#uniformLoad")).toHaveText("18 kN/m");
  await expect(solver.getByText("外部宿主已保存工程。")).toBeVisible();

  await page.reload();
  const reopenedSolver = page.frameLocator("#solverFrame");
  await expect(reopenedSolver.getByText(/外部宿主：可编辑/u)).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("#revision")).toHaveText("1");
  await expect(page.locator("#uniformLoad")).toHaveText("18 kN/m");
});


test("v1.6.1 reference host can reopen the same project as readonly", async ({ page }) => {
  const solver = page.frameLocator("#solverFrame");
  await expect(solver.getByText(/外部宿主：可编辑/u)).toBeVisible({ timeout: 20_000 });

  await page.locator("#launchReadonly").click();

  await expect(page.locator("#mode")).toHaveText("readonly");
  await expect(solver.getByText(/外部宿主：只读/u)).toBeVisible();
  await expect(solver.getByLabel("只读建模区域")).toHaveAttribute("disabled", "");
  await expect(solver.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
});


test("v1.6.1 solver rejects a reference host served from an unlisted origin", async ({ page }) => {
  await page.goto("http://localhost:6250");
  const solver = page.frameLocator("#solverFrame");

  await expect(solver.getByRole("heading", { name: "ArchSight 结构力学求解器" })).toBeVisible({ timeout: 20_000 });
  await expect(solver.getByText(/外部宿主：/u)).toHaveCount(0);
  await expect(page.locator("#connectionStatus")).toHaveText("等待 Solver");
});
