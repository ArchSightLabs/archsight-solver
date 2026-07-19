import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

declare global {
  interface Window {
    __completeProjectSavePicker?: () => void;
    __savedProjectText?: string;
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!window.sessionStorage.getItem("archsight-solver.lifecycle-test-initialized")) {
      window.localStorage.clear();
      window.sessionStorage.setItem("archsight-solver.lifecycle-test-initialized", "true");
    }
  });
});

test("v1.6.2 嵌入模式不读写独立工作台草稿和模板存储", async ({ page }) => {
  await page.goto("/?embed=1");
  await expect(page.getByRole("tab", { name: "参数建模" })).toBeVisible();

  expect(await page.evaluate(() => ({
    autosave: localStorage.getItem("archsight-solver.project-autosave.v1"),
    templates: localStorage.getItem("archsight-solver.template-library"),
  }))).toEqual({ autosave: null, templates: null });
});

test("v1.6.2 独立工作台刷新后恢复未保存草稿", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => ({
        name: "restored-draft.slv",
        createWritable: async () => ({
          write: async (blob: Blob) => {
            window.__savedProjectText = await blob.text();
          },
          close: async () => undefined,
        }),
      }),
    });
  });
  await page.goto("/");
  const loadInput = page.getByLabel("均布荷载 kN/m").first();
  await loadInput.fill("27");
  await page.getByRole("button", { name: "生成连续梁" }).click();
  await expect(page.getByText("未保存", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const raw = localStorage.getItem("archsight-solver.project-autosave.v1");
    return raw ? JSON.parse(JSON.parse(raw).projectFileText).project.objects[0].state.q : null;
  })).toBe(27);

  await page.reload();

  await expect(page.getByText("未保存", { exact: true })).toBeVisible();
  await expect(page.getByText("已恢复浏览器本地工程草稿，请保存为正式工程文件。")).toBeVisible();
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await expect.poll(async () => {
    const raw = await page.evaluate(() => window.__savedProjectText ?? "");
    return raw ? JSON.parse(raw).project.objects[0].state.q : null;
  }).toBe(27);
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("archsight-solver.project-autosave.v1"))).toBeNull();
});

test("v1.6.2 无效独立工程文件不破坏当前有效工程", async ({ page }) => {
  let alertMessage = "";
  page.on("dialog", async (dialog) => {
    alertMessage = dialog.message();
    await dialog.accept();
  });
  await page.goto("/");
  const loadInput = page.getByLabel("均布荷载 kN/m").first();
  await loadInput.fill("31");
  await page.getByRole("button", { name: "生成连续梁" }).click();

  await page.locator('input[name="project-file"]').setInputFiles({
    name: "invalid-project.slv",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schema: "not-a-solver-project", project: {} })),
  });

  await expect.poll(() => alertMessage).toContain("项目文件读取失败");
  await expect(loadInput).toHaveValue("31");
  await expect(page.getByText("未保存", { exact: true })).toBeVisible();
});

test("v1.6.2 独立保存期间的新修改不会被旧快照覆盖", async ({ page }) => {
  await page.addInitScript(() => {
    let resolvePicker: ((handle: {
      name: string;
      createWritable: () => Promise<{
        write: (blob: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }) => void) | null = null;
    const picker = new Promise<{
      name: string;
      createWritable: () => Promise<{
        write: (blob: Blob) => Promise<void>;
        close: () => Promise<void>;
      }>;
    }>((resolve) => {
      resolvePicker = resolve;
    });
    const handle = {
      name: "lifecycle-save.slv",
      createWritable: async () => ({
        write: async (blob: Blob) => {
          window.__savedProjectText = await blob.text();
        },
        close: async () => undefined,
      }),
    };
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: () => picker,
    });
    window.__completeProjectSavePicker = () => resolvePicker?.(handle);
  });

  await page.goto("/");
  const loadInput = page.getByLabel("均布荷载 kN/m").first();
  await loadInput.fill("18");
  await page.getByRole("button", { name: "生成连续梁" }).click();
  await expect(page.getByText("未保存", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "保存", exact: true }).click();
  await loadInput.fill("19");
  await page.getByRole("button", { name: "生成连续梁" }).click();
  await page.evaluate(() => window.__completeProjectSavePicker?.());

  await expect(loadInput).toHaveValue("19");
  await expect(page.getByText("未保存", { exact: true })).toBeVisible();
  await expect(page.getByText("本地文件已保存较早版本，当前修改仍未保存。")).toBeVisible();
  await expect.poll(async () => JSON.parse(await page.evaluate(() => window.__savedProjectText ?? "{}"))
    .project.objects[0].state.q).toBe(18);
});

test("v1.6.2 此前工程的延迟保存不得改写新打开工程的文件关联", async ({ page }) => {
  await page.addInitScript(() => {
    let resolvePicker: ((handle: {
      name: string;
      createWritable: () => Promise<{ write: () => Promise<void>; close: () => Promise<void> }>;
    }) => void) | null = null;
    const picker = new Promise<{
      name: string;
      createWritable: () => Promise<{ write: () => Promise<void>; close: () => Promise<void> }>;
    }>((resolvePickerPromise) => {
      resolvePicker = resolvePickerPromise;
    });
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: () => picker,
    });
    window.__completeProjectSavePicker = () => resolvePicker?.({
      name: "previous-project.slv",
      createWritable: async () => ({ write: async () => undefined, close: async () => undefined }),
    });
  });

  await page.goto("/");
  await page.getByLabel("均布荷载 kN/m").first().fill("18");
  await page.getByRole("button", { name: "生成连续梁" }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();

  await page.locator('input[name="project-file"]').setInputFiles(resolve(process.cwd(), "../examples/host-iframe-demo/sample-project.slv"));
  await expect(page.getByText("sample-project.slv", { exact: true })).toBeVisible();
  await page.evaluate(() => window.__completeProjectSavePicker?.());

  await expect(page.getByText("sample-project.slv", { exact: true })).toBeVisible();
  await expect(page.getByText("此前工程的本地保存已完成，当前工程未受影响。")).toBeVisible();
  await expect(page.getByText("已保存", { exact: true })).toBeVisible();
});

test("v1.6.2 独立保存失败保留当前工程和 dirty", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => {
        throw new Error("模拟磁盘写入失败");
      },
    });
  });
  page.on("dialog", (dialog) => dialog.accept());

  await page.goto("/");
  const loadInput = page.getByLabel("均布荷载 kN/m").first();
  await loadInput.fill("23");
  await page.getByRole("button", { name: "生成连续梁" }).click();
  await page.getByRole("button", { name: "保存", exact: true }).click();

  await expect(loadInput).toHaveValue("23");
  await expect(page.getByText("未保存", { exact: true })).toBeVisible();
});
