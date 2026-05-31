import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

test("参数建模与结果预览共享结构对象视觉语义变量", () => {
  const css = readFileSync(new URL("../index.css", import.meta.url), "utf-8");

  assert.match(css, /--structure-object-member:\s*#2563eb;/u);
  assert.match(css, /--model-member:\s*var\(--structure-object-member\);/u);
  assert.match(css, /--structure-preview-base-start:\s*var\(--structure-object-member\);/u);
  assert.match(css, /--model-node:\s*var\(--structure-object-node\);/u);
  assert.match(css, /--structure-preview-node:\s*var\(--structure-object-node\);/u);
  assert.match(css, /--model-load:\s*var\(--structure-object-load\);/u);
  assert.match(css, /--structure-preview-load:\s*var\(--structure-object-load\);/u);
});
