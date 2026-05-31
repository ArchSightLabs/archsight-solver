import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";


const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8")) as {
  scripts?: Record<string, string>;
};
const playwrightConfig = readFileSync(new URL("../../playwright.config.ts", import.meta.url), "utf-8");
const exportDocxSpec = readFileSync(new URL("../../tests/visual/workbench-export-docx.spec.ts", import.meta.url), "utf-8");
const largeCanvasSpec = readFileSync(new URL("../../tests/visual/workbench-large-canvas.spec.ts", import.meta.url), "utf-8");
const visualRegressionDoc = readFileSync(new URL("../../../docs/verification/visual-regression.md", import.meta.url), "utf-8");


test("计算书图形导出提供三浏览器矩阵入口", () => {
  const exportDocxCommand = packageJson.scripts?.["test:visual:export-docx"] ?? "";

  assert.equal((exportDocxCommand.match(/playwright test workbench-export-docx\.spec\.ts/gu) ?? []).length, 3);
  assert.equal((exportDocxCommand.match(/--workers=1/gu) ?? []).length, 3);
  assert.match(playwrightConfig, /process\.env\.NO_PROXY = mergeNoProxyHosts\(process\.env\.NO_PROXY\)/u);
  assert.match(playwrightConfig, /127\.0\.0\.1", "localhost", "::1/u);

  for (const browserName of ["chromium", "firefox", "webkit"]) {
    assert.match(playwrightConfig, new RegExp(`name:\\s*["']${browserName}["']`, "u"));
    assert.match(exportDocxCommand, new RegExp(`--project=${browserName}\\b`, "u"));
  }

  assert.match(visualRegressionDoc, /npm --prefix frontend run test:visual:export-docx/u);
  assert.match(visualRegressionDoc, /Chromium \/ Firefox \/ WebKit/u);
  assert.match(visualRegressionDoc, /三个子命令顺序运行/u);
});

test("计算书图形导出测试锁定共享图形目录和前端同源图片", () => {
  assert.match(exportDocxSpec, /shared\/report-figures\.json/u);
  assert.match(exportDocxSpec, /Object\.keys\(payload\?\.reportImages \?\? \{\}\)\)\.toEqual\(MODE_LABELS\[mode\]\.imageKeys\)/u);
  assert.match(exportDocxSpec, /\^data:image\\\/png;base64,/u);
});

test("主控大模型画布视觉回归覆盖三类分析对象", () => {
  for (const modelName of ["梁系", "平面桁架", "平面框架"]) {
    assert.match(largeCanvasSpec, new RegExp(`${modelName}.*主控建模画布扩展`, "u"));
  }

  assert.match(largeCanvasSpec, /const spanCount = 16/u);
  assert.match(largeCanvasSpec, /const spanCount = 96/u);
  assert.match(largeCanvasSpec, /const nodeCount = 120/u);
  assert.match(largeCanvasSpec, /const spanLength = 4/u);
  assert.match(largeCanvasSpec, /SUPPORT,S\$\{index \+ 1\},\$\{index \* spanLength\},\$\{type\}/u);
  assert.match(largeCanvasSpec, /5x4 节点网格/u);
  assert.match(largeCanvasSpec, /10x2 桁架网格/u);
  assert.match(largeCanvasSpec, /96 跨连续梁/u);
  assert.match(largeCanvasSpec, /120 节点长排框架/u);
  assert.match(largeCanvasSpec, /120 节点长排桁架/u);
  assert.ok((largeCanvasSpec.match(/scrollWidth\)\.toBeGreaterThan\(/gu) ?? []).length >= 5);
});
