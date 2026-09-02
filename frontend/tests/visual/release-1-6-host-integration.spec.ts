import { expect, test, type Page } from "@playwright/test";
import { createArchSightSolverProjectFile } from "../../src/lib/project-file";
import { createDefaultSolverProject } from "../../src/lib/solver-project";
import { HOST_REQUEST_SAVE_MESSAGE, HOST_SAVE_RESULT_MESSAGE, SOLVER_ERROR_MESSAGE, SOLVER_PROJECT_CHANGED_MESSAGE, SOLVER_READY_MESSAGE, SOLVER_SAVE_REQUEST_MESSAGE } from "../../src/lib/host-bridge";

const protocolVersion = "1.0.0";
const sessionId = "release-1-6-session";
const nonce = "release-1-6-nonce";

async function mountSameOriginHost(page: Page, embedded = false) {
  await page.route("**/__release-1-6-host", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0">
        <iframe id="solver-frame" title="Solver Host Frame" src="/${embedded ? "?embed=1" : ""}" style="width:100%;height:900px;border:0"></iframe>
        <script>
          window.__solverHostMessages = [];
          window.addEventListener("message", (event) => {
            if (event.source === document.querySelector("#solver-frame")?.contentWindow) {
              window.__solverHostMessages.push(event.data);
            }
          });
        </script>
      </body></html>`,
    });
  });
  await page.goto("/__release-1-6-host");
  const solver = page.frameLocator("#solver-frame");
  await expect(solver.getByRole("heading", { name: "ArchSight 结构力学求解器" })).toBeVisible({ timeout: 15_000 });
  return solver;
}

async function postLaunch(page: Page, mode: "editable" | "readonly", hostUiActions: string[] = []) {
  const project = createDefaultSolverProject(new Date("2026-07-12T00:00:00.000Z"));
  const projectDocument = createArchSightSolverProjectFile(project, new Date("2026-07-12T00:01:00.000Z"));
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await page.evaluate(({ projectDocument, mode, hostUiActions, protocolVersion, sessionId, nonce }) => {
      const target = document.querySelector<HTMLIFrameElement>("#solver-frame")?.contentWindow;
      target?.postMessage({
        type: "archsight.solver.host.launch",
        protocolVersion,
        sessionId,
        nonce,
        payload: { mode, fileName: "host-project.slv", projectDocument, hostUiActions },
      }, window.location.origin);
    }, { projectDocument, mode, hostUiActions, protocolVersion, sessionId, nonce });
    await page.waitForTimeout(150);
    const ready = (await hostMessages(page)).some((message) => (
      message.type === SOLVER_READY_MESSAGE
      && "sessionId" in message
      && message.sessionId === sessionId
    ));
    if (ready) return;
  }
  throw new Error(`Solver 未在重试窗口内确认 Host launch：${JSON.stringify(await hostMessages(page))}`);
}

test("嵌入页头只向已协商的 Host Client 请求云端文件与工程动作", async ({ page }) => {
  const solver = await mountSameOriginHost(page, true);
  await postLaunch(page, "editable", ["project", "new", "open", "save", "saveAs", "versions", "share"]);

  await expect(solver.getByRole("heading", { name: "ArchSight 结构力学求解器" })).toBeVisible();
  await expect(solver.getByRole("button", { name: "文件菜单", exact: true })).toHaveCount(0);
  await expect(solver.getByRole("button", { name: "云端文件菜单" })).toBeVisible();
  await expect(solver.getByRole("button", { name: "已保存", exact: true })).toBeDisabled();

  const loadInput = solver.getByLabel("均布荷载 kN/m").first();
  await loadInput.fill("18");
  await solver.getByRole("button", { name: "生成连续梁" }).click();
  await expect(solver.getByRole("button", { name: "保存", exact: true })).toBeEnabled();

  await solver.getByRole("button", { name: "云端文件菜单" }).click();
  await solver.getByRole("menuitem", { name: "新建", exact: true }).click();
  await solver.getByRole("button", { name: "云端文件菜单" }).click();
  await solver.getByRole("menuitem", { name: "打开", exact: true }).click();
  await solver.getByRole("button", { name: "云端文件菜单" }).click();
  await solver.getByRole("menuitem", { name: "另存为", exact: true }).click();
  await solver.getByRole("button", { name: "工程", exact: true }).click();
  await solver.getByRole("button", { name: "保存", exact: true }).click();
  await expect(solver.getByRole("button", { name: "保存", exact: true })).toBeEnabled();

  await expect.poll(async () => (await hostMessages(page)).findLast((message) => (
    message.type === "archsight.solver.portal.actionRequested" && message.payload?.action === "save"
  ))?.payload?.requestId).toBeTruthy();
  const savePortalAction = (await hostMessages(page)).findLast((message) => (
    message.type === "archsight.solver.portal.actionRequested" && message.payload?.action === "save"
  ));
  expect(savePortalAction?.payload?.requestId).toBeTruthy();
  await page.evaluate(({ protocolVersion, sessionId, nonce, requestSaveMessage, requestId }) => {
    document.querySelector<HTMLIFrameElement>("#solver-frame")?.contentWindow?.postMessage({
      type: requestSaveMessage,
      protocolVersion,
      sessionId,
      nonce,
      payload: { requestId },
    }, window.location.origin);
  }, {
    protocolVersion,
    sessionId,
    nonce,
    requestSaveMessage: HOST_REQUEST_SAVE_MESSAGE,
    requestId: savePortalAction?.payload?.requestId,
  });
  await expect(solver.getByRole("button", { name: "正在保存" })).toBeDisabled();
  await solver.getByRole("button", { name: "历史", exact: true }).click();
  await solver.getByRole("button", { name: "分享", exact: true }).click();

  await expect.poll(async () => (await hostMessages(page)).filter((message) => (
    message.type === "archsight.solver.portal.actionRequested"
  )).length).toBe(7);
  const actions = (await hostMessages(page)).filter((message) => (
    message.type === "archsight.solver.portal.actionRequested"
  ));
  expect(actions.map((message) => message.payload?.action)).toEqual(["new", "open", "saveAs", "project", "save", "versions", "share"]);
  expect(actions.every((message) => message.sessionId === sessionId && message.nonce === nonce && message.payload?.requestId)).toBe(true);
});

async function hostMessages(page: Page) {
  return page.evaluate(() => (window as typeof window & {
    __solverHostMessages: Array<{ type?: string; sessionId?: string; payload?: { action?: string; requestId?: string; message?: string } }>;
  }).__solverHostMessages);
}

test("v1.6 editable host completes launch, change, save request and save result", async ({ page }) => {
  const solver = await mountSameOriginHost(page);
  await postLaunch(page, "editable");

  await expect(solver.getByText(/外部宿主：可编辑/u)).toBeVisible();
  const loadInput = solver.getByLabel("均布荷载 kN/m").first();
  await expect(loadInput).toBeEnabled();
  await loadInput.fill("18");
  await solver.getByRole("button", { name: "生成连续梁" }).click();
  await expect.poll(async () => (await hostMessages(page)).some((message) => message.type === SOLVER_PROJECT_CHANGED_MESSAGE)).toBe(true);

  await solver.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(async () => (await hostMessages(page)).some((message) => message.type === SOLVER_SAVE_REQUEST_MESSAGE)).toBe(true);
  const firstRequestId = (await hostMessages(page))
    .findLast((message) => message.type === SOLVER_SAVE_REQUEST_MESSAGE)?.payload?.requestId;
  expect(firstRequestId).toBeTruthy();

  await loadInput.fill("19");
  await solver.getByRole("button", { name: "生成连续梁" }).click();

  await page.evaluate(({ protocolVersion, sessionId, nonce, saveResultMessage, requestId }) => {
    document.querySelector<HTMLIFrameElement>("#solver-frame")?.contentWindow?.postMessage({
      type: saveResultMessage,
      protocolVersion,
      sessionId,
      nonce,
      payload: { status: "saved", revision: "r1", requestId },
    }, window.location.origin);
  }, { protocolVersion, sessionId, nonce, saveResultMessage: HOST_SAVE_RESULT_MESSAGE, requestId: firstRequestId });
  await expect(solver.getByText("外部宿主已保存较早版本，当前修改仍未保存。")).toBeVisible();
  await expect(solver.getByText("未保存", { exact: true })).toBeVisible();

  await solver.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(async () => (
    await hostMessages(page)
  ).filter((message) => message.type === SOLVER_SAVE_REQUEST_MESSAGE).length).toBe(2);
  const latestRequestId = (await hostMessages(page))
    .findLast((message) => message.type === SOLVER_SAVE_REQUEST_MESSAGE)?.payload?.requestId;
  await page.evaluate(({ protocolVersion, sessionId, nonce, saveResultMessage, requestId }) => {
    document.querySelector<HTMLIFrameElement>("#solver-frame")?.contentWindow?.postMessage({
      type: saveResultMessage,
      protocolVersion,
      sessionId,
      nonce,
      payload: { status: "saved", revision: "r2", requestId },
    }, window.location.origin);
  }, { protocolVersion, sessionId, nonce, saveResultMessage: HOST_SAVE_RESULT_MESSAGE, requestId: latestRequestId });
  await expect(solver.getByText("外部宿主已保存工程。")).toBeVisible();
  await expect(solver.getByText("已保存", { exact: true })).toBeVisible();
});

test("v1.6 readonly host locks model and save while allowing host-authorized open", async ({ page }) => {
  const solver = await mountSameOriginHost(page);
  await postLaunch(page, "readonly", ["new", "open", "save", "saveAs"]);

  await expect(solver.getByText(/外部宿主：只读/u)).toBeVisible();
  await expect(solver.getByLabel("只读建模区域")).toHaveAttribute("disabled", "");
  await expect(solver.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  await solver.getByRole("button", { name: "云端文件菜单" }).click();
  await expect(solver.getByRole("menuitem", { name: "新建", exact: true })).toBeDisabled();
  await expect(solver.getByRole("menuitem", { name: "打开", exact: true })).toBeEnabled();
  await expect(solver.getByRole("menuitem", { name: "另存为", exact: true })).toBeDisabled();
  await expect(solver.getByRole("button", { name: "公开案例", exact: true })).toBeDisabled();
  await expect(solver.getByRole("button", { name: "新建分析对象" }).first()).toBeDisabled();
  await page.waitForTimeout(300);
  expect((await hostMessages(page)).some((message) => message.type === SOLVER_PROJECT_CHANGED_MESSAGE)).toBe(false);
});

test("v1.6.2 host protocol rejects a stale save result without consuming the active request", async ({ page }) => {
  const solver = await mountSameOriginHost(page);
  await postLaunch(page, "editable");
  await solver.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(async () => (await hostMessages(page)).some((message) => message.type === SOLVER_SAVE_REQUEST_MESSAGE)).toBe(true);
  const requestId = (await hostMessages(page)).findLast((message) => message.type === SOLVER_SAVE_REQUEST_MESSAGE)?.payload?.requestId;
  expect(requestId).toBeTruthy();

  const postSaveResult = (nextRequestId: string) => page.evaluate(({ protocolVersion, sessionId, nonce, requestId }) => {
    document.querySelector<HTMLIFrameElement>("#solver-frame")?.contentWindow?.postMessage({
      type: "archsight.solver.host.saveResult",
      protocolVersion,
      sessionId,
      nonce,
      payload: { status: "saved", requestId },
    }, window.location.origin);
  }, { protocolVersion, sessionId, nonce, requestId: nextRequestId });

  await postSaveResult("stale-request");
  await expect.poll(async () => (await hostMessages(page)).some((message) => (
    message.type === SOLVER_ERROR_MESSAGE && message.payload?.message?.includes("陈旧回执")
  ))).toBe(true);

  await postSaveResult(requestId!);
  await expect(solver.getByText("外部宿主已保存工程。")).toBeVisible();
});

test("v1.6 host launch is rejected when the message source is not the parent", async ({ page }) => {
  const project = createDefaultSolverProject(new Date("2026-07-12T00:00:00.000Z"));
  const projectDocument = createArchSightSolverProjectFile(project, new Date("2026-07-12T00:01:00.000Z"));
  const solver = await mountSameOriginHost(page);
  await page.route("**/__release-1-6-attacker", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><body>attacker frame</body></html>",
    });
  });
  await page.evaluate(() => {
    const attacker = document.createElement("iframe");
    attacker.id = "attacker-frame";
    attacker.src = "/__release-1-6-attacker";
    document.body.append(attacker);
  });
  const attackerFrame = page.frameLocator("#attacker-frame");
  await expect(attackerFrame.getByText("attacker frame")).toBeVisible();
  const attacker = page.frames().find((frame) => frame.url().includes("__release-1-6-attacker"));
  expect(attacker).toBeTruthy();
  await attacker!.evaluate(({ projectDocument, protocolVersion, sessionId, nonce }) => {
    window.parent.document.querySelector<HTMLIFrameElement>("#solver-frame")?.contentWindow?.postMessage({
      type: "archsight.solver.host.launch",
      protocolVersion,
      sessionId,
      nonce,
      payload: { mode: "editable", projectDocument },
    }, window.location.origin);
  }, { projectDocument, protocolVersion, sessionId, nonce });

  await expect(solver.getByText(/外部宿主：/u)).toHaveCount(0);
});
