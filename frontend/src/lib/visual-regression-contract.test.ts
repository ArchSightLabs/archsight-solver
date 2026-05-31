import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";


const packageJson = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf-8")) as {
  scripts?: Record<string, string>;
};
const playwrightConfig = readFileSync(new URL("../../playwright.config.ts", import.meta.url), "utf-8");
const exportDocxSpec = readFileSync(new URL("../../tests/visual/workbench-export-docx.spec.ts", import.meta.url), "utf-8");
const visualRegressionDoc = readFileSync(new URL("../../../docs/verification/visual-regression.md", import.meta.url), "utf-8");


test("计算书图形导出提供三浏览器矩阵入口", () => {
  assert.equal(
    packageJson.scripts?.["test:visual:export-docx"],
    "playwright test workbench-export-docx.spec.ts --workers=1",
  );

  for (const browserName of ["chromium", "firefox", "webkit"]) {
    assert.match(playwrightConfig, new RegExp(`name:\\s*["']${browserName}["']`, "u"));
  }

  assert.match(visualRegressionDoc, /npm --prefix frontend run test:visual:export-docx/u);
  assert.match(visualRegressionDoc, /Chromium \/ Firefox \/ WebKit/u);
  assert.match(visualRegressionDoc, /单 worker 顺序运行/u);
});

test("计算书图形导出测试锁定共享图形目录和前端同源图片", () => {
  assert.match(exportDocxSpec, /shared\/report-figures\.json/u);
  assert.match(exportDocxSpec, /Object\.keys\(payload\?\.reportImages \?\? \{\}\)\)\.toEqual\(MODE_LABELS\[mode\]\.imageKeys\)/u);
  assert.match(exportDocxSpec, /\^data:image\\\/png;base64,/u);
});
