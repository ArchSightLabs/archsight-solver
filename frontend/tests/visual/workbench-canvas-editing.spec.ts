import { expect, test, type Page } from "@playwright/test";

async function openFrameWorkbench(page: Page) {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/");
  await page.getByRole("button", { name: /平面框架-1\s+平面框架/ }).click();
  await expect(page.locator('svg[data-model-canvas="frame"]')).toBeVisible();
}

function canvasItem(page: Page, type: "node" | "member" | "load", id: string) {
  return page.locator(`[data-canvas-mode="frame"][data-canvas-type="${type}"][data-canvas-id="${id}"]`);
}

test("框架画布支持两节点多选连接、拖动节点和 Delete 删除", async ({ page }) => {
  await openFrameWorkbench(page);
  await expect(page.locator('svg[data-model-canvas="frame"]')).toHaveAttribute("viewBox", "0 0 1080 460");

  await canvasItem(page, "node", "N1").click();
  await canvasItem(page, "node", "N4").click({ modifiers: ["Control"] });
  await page.getByRole("button", { name: "连接所选节点" }).click();
  await expect(canvasItem(page, "member", "M1")).toBeVisible();

  const node = canvasItem(page, "node", "N3");
  const before = await node.boundingBox();
  expect(before).not.toBeNull();
  if (!before) return;

  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 70, before.y + before.height / 2 - 35, { steps: 8 });
  await page.mouse.up();

  const after = await node.boundingBox();
  expect(after).not.toBeNull();
  expect(Math.abs((after?.x ?? 0) - before.x) + Math.abs((after?.y ?? 0) - before.y)).toBeGreaterThan(5);

  await page.keyboard.press("Delete");
  await expect(canvasItem(page, "node", "N3")).toHaveCount(0);
});

test("框架画布支持框选节点并切换到连接所选节点动作", async ({ page }) => {
  await openFrameWorkbench(page);

  const startNode = await canvasItem(page, "node", "N1").boundingBox();
  const endNode = await canvasItem(page, "node", "N2").boundingBox();
  expect(startNode).not.toBeNull();
  expect(endNode).not.toBeNull();
  if (!startNode || !endNode) return;

  const left = Math.min(startNode.x, endNode.x) - 18;
  const top = Math.min(startNode.y, endNode.y) - 18;
  const right = Math.max(startNode.x + startNode.width, endNode.x + endNode.width) + 18;
  const bottom = Math.max(startNode.y + startNode.height, endNode.y + endNode.height) + 18;

  await page.mouse.move(left, top);
  await page.mouse.down();
  await page.mouse.move(right, bottom, { steps: 10 });
  await page.mouse.up();

  await expect(page.getByRole("button", { name: "连接所选节点" })).toBeEnabled();
});

test("框架画布框选光标正确且框选层裁剪在画布可见区域内", async ({ page }) => {
  await openFrameWorkbench(page);

  const scrollArea = page.locator('[data-model-canvas-scroll="true"]');
  const board = page.locator('[data-model-canvas-board="true"]');
  await expect(scrollArea).toHaveCSS("cursor", "crosshair");

  const scrollBox = await scrollArea.boundingBox();
  const boardBox = await board.boundingBox();
  expect(scrollBox).not.toBeNull();
  expect(boardBox).not.toBeNull();
  if (!scrollBox || !boardBox) return;

  const startX = boardBox.x + boardBox.width * 0.68;
  const startY = boardBox.y + boardBox.height * 0.68;
  const endX = boardBox.x + boardBox.width + 260;
  const endY = boardBox.y + boardBox.height + 260;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });

  const marquee = page.locator('[data-model-canvas-marquee="true"]');
  await expect(marquee).toBeVisible();
  const marqueeBox = await marquee.boundingBox();
  expect(marqueeBox).not.toBeNull();
  if (!marqueeBox) return;

  const visibleRight = Math.min(boardBox.x + boardBox.width, scrollBox.x + scrollBox.width);
  const visibleBottom = Math.min(boardBox.y + boardBox.height, scrollBox.y + scrollBox.height);
  expect(marqueeBox.x + marqueeBox.width).toBeLessThanOrEqual(visibleRight + 2);
  expect(marqueeBox.y + marqueeBox.height).toBeLessThanOrEqual(visibleBottom + 2);

  await page.mouse.up();
  await expect(marquee).toHaveCount(0);
});

test("框架画布将网格吸附作为建模工具栏控件", async ({ page }) => {
  await openFrameWorkbench(page);

  await expect(page.getByRole("toolbar", { name: "网格吸附工具" })).toBeVisible();
  const snapToggle = page.getByRole("button", { name: "开启节点坐标网格吸附" });
  await expect(page.getByLabel("网格吸附步距（m）")).toHaveValue("0.5");
  await snapToggle.click();
  await expect(page.getByRole("button", { name: "关闭节点坐标网格吸附" })).toHaveAttribute("aria-pressed", "true");
});

test("框架画布支持拖动并重置模型标注", async ({ page }) => {
  await openFrameWorkbench(page);

  const label = page.locator('[data-canvas-mode="frame"][data-canvas-type="label"][data-canvas-id="dimension-legend"]');
  await expect(label).toBeVisible();
  await expect(label).not.toHaveAttribute("transform", /translate/u);

  const labelBox = await label.boundingBox();
  expect(labelBox).not.toBeNull();
  if (!labelBox) return;

  await page.mouse.move(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(labelBox.x + labelBox.width / 2 + 90, labelBox.y + labelBox.height / 2 + 42, { steps: 8 });
  await page.mouse.up();

  await expect(label).toHaveAttribute("transform", /translate\(/u);
  await expect(page.getByRole("toolbar", { name: "标注工具" })).toBeVisible();
  await page.getByRole("button", { name: "重置所选标注位置" }).click();
  await expect(label).not.toHaveAttribute("transform", /translate/u);
});
