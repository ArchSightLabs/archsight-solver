import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

import { STRUCTURE_OBJECT_COLORS, STRUCTURE_VISUAL_STROKES } from "./structure-visual-tokens.ts";

function cssVariable(css: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}:\\s*([^;]+);`, "u"));
  assert.ok(match, `缺少 CSS 变量 ${name}`);
  return match[1]?.trim() ?? "";
}

test("参数建模与结果预览共享结构对象视觉语义变量", () => {
  const css = readFileSync(new URL("../index.css", import.meta.url), "utf-8");

  assert.equal(cssVariable(css, "--structure-object-member"), STRUCTURE_OBJECT_COLORS.member);
  assert.equal(cssVariable(css, "--structure-object-node"), STRUCTURE_OBJECT_COLORS.node);
  assert.equal(cssVariable(css, "--structure-object-support-fill"), STRUCTURE_OBJECT_COLORS.supportFill);
  assert.equal(cssVariable(css, "--structure-object-support-stroke"), STRUCTURE_OBJECT_COLORS.supportStroke);
  assert.equal(cssVariable(css, "--structure-object-support-line"), STRUCTURE_OBJECT_COLORS.supportLine);
  assert.equal(cssVariable(css, "--structure-object-load"), STRUCTURE_OBJECT_COLORS.load);
  assert.match(css, /--model-member:\s*var\(--structure-object-member\);/u);
  assert.match(css, /--structure-preview-base-start:\s*var\(--structure-object-member\);/u);
  assert.match(css, /--model-node:\s*var\(--structure-object-node\);/u);
  assert.match(css, /--structure-preview-node:\s*var\(--structure-object-node\);/u);
  assert.match(css, /--model-load:\s*var\(--structure-object-load\);/u);
  assert.match(css, /--structure-preview-load:\s*var\(--structure-object-load\);/u);
  assert.doesNotMatch(css, /\.frame-structure-preview-surface\s*\{[\s\S]*--structure-preview-base-start:/u);
});

test("结构对象线宽语义由共享令牌命名", () => {
  assert.equal(STRUCTURE_VISUAL_STROKES.modelBeamMember, 3.2);
  assert.equal(STRUCTURE_VISUAL_STROKES.modelMember, 4.5);
  assert.equal(STRUCTURE_VISUAL_STROKES.previewMember, 7);
  assert.equal(STRUCTURE_VISUAL_STROKES.resultBeamBase, 3);
  assert.equal(STRUCTURE_VISUAL_STROKES.resultOverlayBase, 7);
  assert.equal(STRUCTURE_VISUAL_STROKES.reportBaseMember, 5);
});
