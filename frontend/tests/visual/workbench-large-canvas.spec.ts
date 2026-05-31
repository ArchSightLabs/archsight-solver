import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

async function selectObject(page: Page, name: RegExp) {
  const moduleRail = page.locator("aside").filter({ hasText: "分析对象" });
  await moduleRail.getByRole("button", { name }).first().click();
}

async function openTextTab(page: Page) {
  await page.locator("button").filter({ hasText: /^文本$/ }).click();
}

async function importTextModel(page: Page, ariaLabel: string, textModel: string) {
  await openTextTab(page);
  await page.getByLabel(ariaLabel).fill(textModel);
  await page.getByRole("button", { name: "应用文本模型" }).click();
}

async function canvasMetrics(page: Page) {
  const board = page.locator(".model-canvas-board").first();
  await expect(board).toBeVisible();
  return board.evaluate((element) => {
    const scroll = element.parentElement;
    const svg = element.querySelector("svg");
    const viewBox = svg?.getAttribute("viewBox")?.split(/\s+/u).map(Number) ?? [];
    const rect = element.getBoundingClientRect();
    return {
      boardWidth: rect.width,
      boardHeight: rect.height,
      scrollClientWidth: scroll?.clientWidth ?? 0,
      scrollClientHeight: scroll?.clientHeight ?? 0,
      scrollWidth: scroll?.scrollWidth ?? 0,
      scrollHeight: scroll?.scrollHeight ?? 0,
      viewBoxWidth: viewBox[2] ?? 0,
      viewBoxHeight: viewBox[3] ?? 0,
    };
  });
}

function frameGridTextModel() {
  const lines: string[] = ["# 5x4 节点网格，验证主控建模画布扩展"];
  const cols = 5;
  const rows = 4;
  let memberIndex = 1;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const id = row * cols + col + 1;
      const support = row === 0 && col === 0 ? "pinned" : row === 0 && col === cols - 1 ? "roller" : "free";
      lines.push(`NODE,N${id},${col * 3},${row * 3},${support}`);
    }
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols - 1; col += 1) {
      const start = row * cols + col + 1;
      lines.push(`MEMBER,F${memberIndex},N${start},N${start + 1},beam,210,240,12000,q345`);
      memberIndex += 1;
    }
  }
  for (let row = 0; row < rows - 1; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const start = row * cols + col + 1;
      lines.push(`MEMBER,F${memberIndex},N${start},N${start + cols},column,210,240,12000,q345`);
      memberIndex += 1;
    }
  }

  return lines.join("\n");
}

function beamLongTextModel() {
  const spanCount = 16;
  const spanLength = 4;
  const lines: string[] = ["# 16 跨连续梁，验证梁系主控建模画布扩展", "BEAM,continuous", "MATERIAL,q345"];

  for (let index = 0; index < spanCount; index += 1) {
    lines.push(`SPAN,(${index + 1}),${spanLength},q345,85000`);
  }

  for (let index = 0; index <= spanCount; index += 1) {
    const type = index === 0 ? "pinned" : index === spanCount ? "roller" : "pinned";
    lines.push(`SUPPORT,S${index + 1},${index * spanLength},${type}`);
  }

  return lines.join("\n");
}

function trussGridTextModel() {
  const lines: string[] = ["# 10x2 桁架网格，验证主控建模画布扩展"];
  const cols = 10;
  let memberIndex = 1;

  for (let col = 0; col < cols; col += 1) {
    const support = col === 0 ? "pinned" : col === cols - 1 ? "roller" : "free";
    lines.push(`NODE,N${col + 1},${col * 2},0,${support}`);
  }
  for (let col = 0; col < cols; col += 1) {
    lines.push(`NODE,N${cols + col + 1},${col * 2},3,free`);
  }

  for (let col = 0; col < cols - 1; col += 1) {
    lines.push(`MEMBER,T${memberIndex},N${col + 1},N${col + 2},210,24,bottom_chord,q345`);
    memberIndex += 1;
    lines.push(`MEMBER,T${memberIndex},N${cols + col + 1},N${cols + col + 2},210,24,upper_chord,q345`);
    memberIndex += 1;
    lines.push(`MEMBER,T${memberIndex},N${col + 1},N${cols + col + 2},210,24,web,q345`);
    memberIndex += 1;
  }

  return lines.join("\n");
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("/");
});

test("梁系跨段支座增多后主控建模画布扩展并触发滚动", async ({ page }) => {
  await importTextModel(page, "梁系文本模型", beamLongTextModel());

  const metrics = await canvasMetrics(page);

  expect(metrics.viewBoxWidth).toBeGreaterThan(900);
  expect(metrics.viewBoxHeight).toBeGreaterThanOrEqual(300);
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.scrollClientWidth);
  expect(metrics.boardWidth).toBeGreaterThan(metrics.scrollClientWidth);
});

test("平面框架节点构件增多后主控建模画布扩展并触发滚动", async ({ page }) => {
  await selectObject(page, /平面框架-1/);
  await importTextModel(page, "平面框架文本模型", frameGridTextModel());

  const metrics = await canvasMetrics(page);

  expect(metrics.viewBoxWidth).toBeGreaterThan(900);
  expect(metrics.viewBoxHeight).toBeGreaterThan(360);
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.scrollClientWidth);
  expect(metrics.boardWidth).toBeGreaterThan(metrics.scrollClientWidth);
});

test("平面桁架节点杆件增多后主控建模画布扩展并触发滚动", async ({ page }) => {
  await selectObject(page, /平面桁架-1/);
  await importTextModel(page, "平面桁架文本模型", trussGridTextModel());

  const metrics = await canvasMetrics(page);

  expect(metrics.viewBoxWidth).toBeGreaterThan(900);
  expect(metrics.viewBoxHeight).toBeGreaterThanOrEqual(360);
  expect(metrics.scrollWidth).toBeGreaterThan(metrics.scrollClientWidth);
  expect(metrics.boardWidth).toBeGreaterThan(metrics.scrollClientWidth);
});
