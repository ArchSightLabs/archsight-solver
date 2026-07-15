import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

const solverOrigin = new URL(process.env.ARCHSIGHT_SOLVER_E2E_URL || "http://127.0.0.1:6241").origin;
const referenceHostUrl = new URL("http://127.0.0.1:6250");
referenceHostUrl.searchParams.set("solverUrl", solverOrigin);

function fakeSolverDocument(capabilities: Record<string, boolean>, saveResponseDelayMs: number | null = 0) {
  return `<!doctype html><script>
    const capabilities = ${JSON.stringify(capabilities)};
    let projectDocument = null;
    parent.postMessage({
      type: "archsight.solver.ready",
      protocolVersion: "1.0.0",
      payload: { capabilities },
    }, "http://127.0.0.1:6250");
    window.addEventListener("message", (event) => {
      const message = event.data;
      if (message?.type === "archsight.solver.host.launch") {
        projectDocument = message.payload?.projectDocument;
        parent.postMessage({
          type: "archsight.solver.ready",
          protocolVersion: "1.0.0",
          sessionId: message.sessionId,
          nonce: message.nonce,
          payload: { capabilities },
        }, "http://127.0.0.1:6250");
      }
      if (${saveResponseDelayMs !== null} && message?.type === "archsight.solver.host.requestSave") {
        window.setTimeout(() => {
          parent.postMessage({
            type: "archsight.solver.project.saveRequest",
            protocolVersion: "1.0.0",
            sessionId: message.sessionId,
            nonce: message.nonce,
            payload: {
              requestId: message.payload?.requestId,
              projectDocument,
            },
          }, "http://127.0.0.1:6250");
        }, ${saveResponseDelayMs ?? 0});
      }
    });
  <\/script>`;
}

const requiredCapabilities = {
  loadProjectDocument: true,
  emitProjectChanged: true,
  acceptHostSaveRequest: true,
  emitSaveRequest: true,
  acceptSaveResult: true,
};


test.beforeEach(async ({ page }) => {
  await page.goto(referenceHostUrl.href);
});


test("v1.6.1 reference host completes cross-origin save and reopen", async ({ page }) => {
  const solver = page.frameLocator("#solverFrame");
  await expect(page.locator("#hostOrigin")).toHaveText("http://127.0.0.1:6250");
  await expect(page.locator("#solverOrigin")).toHaveText(solverOrigin);
  await expect(page.locator("#connectionStatus")).toHaveText("已建立会话", { timeout: 20_000 });
  await expect(solver.getByRole("banner")).toHaveCount(0);
  await expect(solver.getByRole("button", { name: "文件菜单" })).toHaveCount(0);
  await expect(solver.getByRole("button", { name: "系统设置" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "新建工程" })).toBeVisible();
  await expect(page.getByRole("button", { name: "打开工程" })).toBeVisible();
  await expect(page.getByRole("button", { name: "保存工程" })).toBeVisible();

  const loadInput = solver.getByLabel("均布荷载 kN/m").first();
  await loadInput.fill("18");
  await solver.getByRole("button", { name: "生成连续梁" }).click();
  await expect(page.locator("#log")).toContainText('"q": 18');
  const solverFrame = page.frames().find((frame) => frame.url().startsWith(solverOrigin));
  expect(solverFrame).toBeTruthy();
  expect(await solverFrame!.evaluate(() => localStorage.getItem("archsight-solver.project-autosave.v1"))).toBeNull();
  await page.getByRole("button", { name: "保存工程" }).click();

  await expect(page.locator("#revision")).toHaveText("1");
  await expect(page.locator("#saveState")).toHaveText("已保存");
  await expect(page.locator("#uniformLoad")).toHaveText("均布荷载 18 kN/m");
  await expect(page.locator("#log")).toContainText("archsight.solver.host.requestSave");
  await expect(page.locator("#log")).toContainText("archsight.solver.project.saveRequest");
  await expect(page.locator("#log")).toContainText("archsight.solver.host.saveResult");

  await page.reload();
  const reopenedSolver = page.frameLocator("#solverFrame");
  await expect(page.locator("#connectionStatus")).toHaveText("已建立会话", { timeout: 20_000 });
  await expect(reopenedSolver.getByRole("tab", { name: "参数建模" })).toBeVisible();
  await expect(page.locator("#revision")).toHaveText("1");
  await expect(page.locator("#uniformLoad")).toHaveText("均布荷载 18 kN/m");
});


test("v1.6.1 bootstrap ready can launch before the iframe fallback timer", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/host.js", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    expect(source).toContain("}, 250);");
    await route.fulfill({
      response,
      body: source.replace("}, 250);", "}, 5000);"),
    });
  });

  await page.reload();

  await expect(page.locator("#connectionStatus")).toHaveText("已建立会话", { timeout: 3_000 });
  await expect(page.locator("#log")).toContainText("archsight.solver.host.launch");
  expect(pageErrors).toEqual([]);
});


test("v1.6.1 reference host owns new open and save project lifecycle", async ({ page }) => {
  await expect(page.locator("#connectionStatus")).toHaveText("已建立会话", { timeout: 20_000 });

  await page.getByRole("button", { name: "新建工程" }).click();
  await expect(page.locator("#connectionStatus")).toHaveText("已建立会话");
  await expect(page.locator("#projectName")).toHaveText("Host 新建结构分析工程");
  await expect(page.locator("#saveState")).toHaveText("有未保存更改");

  await page.locator("#projectFileInput").setInputFiles(resolve(process.cwd(), "../examples/host-iframe-demo/sample-project.slv"));
  await expect(page.locator("#connectionStatus")).toHaveText("已建立会话");
  await expect(page.locator("#projectName")).toHaveText("Host Reference 梁系项目");
  await page.getByRole("button", { name: "保存工程" }).click();

  await expect(page.locator("#revision")).toHaveText("1");
  await expect(page.locator("#saveState")).toHaveText("已保存");
});


test("v1.6.1 reference host rejects an invalid project and restores the active session", async ({ page }) => {
  await expect(page.locator("#connectionStatus")).toHaveText("已建立会话", { timeout: 20_000 });
  const originalName = await page.locator("#projectName").textContent();

  await page.locator("#projectFileInput").setInputFiles({
    name: "invalid-project.slv",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({
      schema: "archsight-solver.project",
      project: { name: "Invalid shallow project" },
    })),
  });

  await expect(page.locator("#operationNotice")).toContainText("打开工程失败");
  await expect(page.locator("#connectionStatus")).toHaveText("已建立会话", { timeout: 20_000 });
  await expect(page.locator("#projectName")).toHaveText(originalName || "Host Reference 梁系项目");
});


test("v1.6.1 reference host can reopen the same project as readonly", async ({ page }) => {
  const solver = page.frameLocator("#solverFrame");
  await expect(page.locator("#connectionStatus")).toHaveText("已建立会话", { timeout: 20_000 });

  await page.locator("#launchReadonly").click();

  await expect(page.locator("#mode")).toHaveText("readonly");
  await expect(page.locator("#connectionStatus")).toHaveText("已建立会话");
  await expect(page.getByRole("button", { name: "保存工程" })).toBeDisabled();
  await expect(solver.getByLabel("只读建模区域")).toHaveAttribute("disabled", "");
  await expect(solver.getByRole("button", { name: "文件菜单" })).toHaveCount(0);
});


test("v1.6.1 solver rejects a reference host served from an unlisted origin", async ({ page }) => {
  const unlistedHostUrl = new URL(referenceHostUrl.href);
  unlistedHostUrl.hostname = "localhost";
  await page.goto(unlistedHostUrl.href);
  const solver = page.frameLocator("#solverFrame");

  await expect(solver.getByRole("tab", { name: "参数建模" })).toBeVisible({ timeout: 20_000 });
  await expect(solver.getByRole("banner")).toHaveCount(0);
  await expect(page.locator("#connectionStatus")).toHaveText("等待 Solver");
});


test("v1.6.1 reference host rejects a solver without the required save capability", async ({ page }) => {
  await page.route(`${solverOrigin}/**`, async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: fakeSolverDocument({
        loadProjectDocument: true,
        emitProjectChanged: true,
        emitSaveRequest: true,
        acceptSaveResult: true,
      }),
    });
  });

  await page.reload();

  await expect(page.locator("#connectionStatus")).toHaveText("Solver 版本不兼容");
  await expect(page.locator("#operationNotice")).toContainText("acceptHostSaveRequest");
  await expect(page.getByRole("button", { name: "保存工程" })).toBeDisabled();
  await expect(page.locator("#log")).not.toContainText("archsight.solver.host.launch");
});


test("v1.6.1 reference host ignores a save snapshot that arrives after timeout", async ({ page }) => {
  await page.route("**/host.js", async (route) => {
    const response = await route.fetch();
    const source = await response.text();
    expect(source).toContain("const SAVE_REQUEST_TIMEOUT_MS = 8_000;");
    await route.fulfill({
      response,
      body: source.replace("const SAVE_REQUEST_TIMEOUT_MS = 8_000;", "const SAVE_REQUEST_TIMEOUT_MS = 50;"),
    });
  });
  await page.route(`${solverOrigin}/**`, async (route) => {
    await route.fulfill({
      contentType: "text/html",
      body: fakeSolverDocument(requiredCapabilities, 150),
    });
  });

  await page.reload();
  await expect(page.locator("#connectionStatus")).toHaveText("已建立会话");
  await page.getByRole("button", { name: "新建工程" }).click();
  await expect(page.locator("#saveState")).toHaveText("有未保存更改");
  await page.getByRole("button", { name: "保存工程" }).click();

  await expect(page.locator("#operationNotice")).toContainText("保存请求超时");
  await expect(page.locator("#operationNotice")).toContainText("已忽略超时后返回的保存快照");
  await expect(page.locator("#revision")).toHaveText("0");
  await expect(page.locator("#saveState")).toHaveText("有未保存更改");
  expect(await page.evaluate(() => localStorage.getItem("archsight-solver.reference-host.project.v1"))).toBeNull();
});
