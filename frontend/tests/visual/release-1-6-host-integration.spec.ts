import { expect, test, type Page } from "@playwright/test";
import { createArchSightSolverProjectFile } from "../../src/lib/project-file";
import { createDefaultSolverProject } from "../../src/lib/solver-project";
import { HOST_SAVE_RESULT_MESSAGE, SOLVER_PROJECT_CHANGED_MESSAGE, SOLVER_SAVE_REQUEST_MESSAGE } from "../../src/lib/host-bridge";

const protocolVersion = "1.0.0";
const sessionId = "release-1-6-session";
const nonce = "release-1-6-nonce";

async function mountSameOriginHost(page: Page) {
  await page.route("**/__release-1-6-host", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "text/html",
      body: `<!doctype html><html><body style="margin:0">
        <iframe id="solver-frame" title="Solver Host Frame" src="/" style="width:100%;height:900px;border:0"></iframe>
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

async function postLaunch(page: Page, mode: "editable" | "readonly") {
  const project = createDefaultSolverProject(new Date("2026-07-12T00:00:00.000Z"));
  const projectDocument = createArchSightSolverProjectFile(project, new Date("2026-07-12T00:01:00.000Z"));
  await page.evaluate(({ projectDocument, mode, protocolVersion, sessionId, nonce }) => {
    const target = document.querySelector<HTMLIFrameElement>("#solver-frame")?.contentWindow;
    target?.postMessage({
      type: "archsight.solver.host.launch",
      protocolVersion,
      sessionId,
      nonce,
      payload: { mode, fileName: "host-project.slv", projectDocument },
    }, window.location.origin);
  }, { projectDocument, mode, protocolVersion, sessionId, nonce });
}

async function hostMessages(page: Page) {
  return page.evaluate(() => (window as typeof window & { __solverHostMessages: Array<{ type?: string }> }).__solverHostMessages);
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

  await page.evaluate(({ protocolVersion, sessionId, nonce, saveResultMessage }) => {
    document.querySelector<HTMLIFrameElement>("#solver-frame")?.contentWindow?.postMessage({
      type: saveResultMessage,
      protocolVersion,
      sessionId,
      nonce,
      payload: { status: "saved", revision: "r1" },
    }, window.location.origin);
  }, { protocolVersion, sessionId, nonce, saveResultMessage: HOST_SAVE_RESULT_MESSAGE });
  await expect(solver.getByText("外部宿主已保存工程。")).toBeVisible();
});

test("v1.6 readonly host locks model, project replacement and save operations", async ({ page }) => {
  const solver = await mountSameOriginHost(page);
  await postLaunch(page, "readonly");

  await expect(solver.getByText(/外部宿主：只读/u)).toBeVisible();
  await expect(solver.getByLabel("只读建模区域")).toHaveAttribute("disabled", "");
  await expect(solver.getByRole("button", { name: "保存", exact: true })).toBeDisabled();
  await expect(solver.getByRole("button", { name: "新建分析对象" }).first()).toBeDisabled();
  await page.waitForTimeout(300);
  expect((await hostMessages(page)).some((message) => message.type === SOLVER_PROJECT_CHANGED_MESSAGE)).toBe(false);
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
