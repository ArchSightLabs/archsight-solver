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
  assert.equal(STRUCTURE_VISUAL_STROKES.modelMember, 3.2);
  assert.equal(STRUCTURE_VISUAL_STROKES.previewMember, 7);
  assert.equal(STRUCTURE_VISUAL_STROKES.previewTrussMember, 3.2);
  assert.equal(STRUCTURE_VISUAL_STROKES.modelFrameSelectedMember, 5.2);
  assert.equal(STRUCTURE_VISUAL_STROKES.modelFrameLoad, 1.15);
  assert.equal(STRUCTURE_VISUAL_STROKES.modelFrameSelectedLoad, 1.8);
  assert.equal(STRUCTURE_VISUAL_STROKES.modelFrameLoadGuide, 0.9);
  assert.equal(STRUCTURE_VISUAL_STROKES.modelTrussSelectedMember, 5.2);
  assert.equal(STRUCTURE_VISUAL_STROKES.resultBeamBase, 3);
  assert.equal(STRUCTURE_VISUAL_STROKES.resultOverlayBase, 7);
  assert.equal(STRUCTURE_VISUAL_STROKES.resultTrussBase, STRUCTURE_VISUAL_STROKES.resultBeamBase);
  assert.equal(STRUCTURE_VISUAL_STROKES.resultTrussAxialMax, 4.2);
  assert.equal(STRUCTURE_VISUAL_STROKES.resultTrussDeformedMember, 2.2);
  assert.equal(STRUCTURE_VISUAL_STROKES.reportBaseMember, 5);
});

test("桁架和框架建模图避免复用粗预览线宽", () => {
  const frameSketch = readFileSync(new URL("../components/model-canvas/FrameSketch.tsx", import.meta.url), "utf-8");
  const trussSketch = readFileSync(new URL("../components/model-canvas/TrussSketch.tsx", import.meta.url), "utf-8");
  const trussPreview = readFileSync(new URL("../components/TrussPreview.tsx", import.meta.url), "utf-8");

  assert.match(frameSketch, /STRUCTURE_VISUAL_STROKES\.modelFrameSelectedMember/u);
  assert.match(frameSketch, /STRUCTURE_VISUAL_STROKES\.modelFrameLoad/u);
  assert.match(frameSketch, /STRUCTURE_VISUAL_STROKES\.modelFrameSelectedLoad/u);
  assert.match(frameSketch, /STRUCTURE_VISUAL_STROKES\.modelFrameLoadGuide/u);
  assert.match(trussSketch, /STRUCTURE_VISUAL_STROKES\.modelTrussSelectedMember/u);
  assert.match(trussPreview, /STRUCTURE_VISUAL_STROKES\.previewTrussMember/u);
  assert.doesNotMatch(trussPreview, /STRUCTURE_VISUAL_STROKES\.previewMember/u);
});

test("梁系受力变形文案不使用梁体口径，并保留挠度专业口径", () => {
  const beamPreview = readFileSync(new URL("../components/BeamPreview.tsx", import.meta.url), "utf-8");

  assert.match(beamPreview, /梁系受力变形/u);
  assert.match(beamPreview, /挠度/u);
  assert.match(beamPreview, /位移倍率/u);
  assert.match(beamPreview, /result-preview-scale-slider/u);
  assert.match(beamPreview, /荷载/u);
  assert.match(beamPreview, /位移/u);
  assert.match(beamPreview, /极值/u);
  assert.doesNotMatch(beamPreview, /梁体/u);
});

test("平面框架受力变形主图使用位移层控制而非未变形图层控制", () => {
  const framePreview = readFileSync(new URL("../components/FramePreview.tsx", import.meta.url), "utf-8");

  assert.match(framePreview, /位移倍率/u);
  assert.match(framePreview, /result-preview-scale-slider/u);
  assert.match(framePreview, /荷载/u);
  assert.match(framePreview, /位移/u);
  assert.match(framePreview, /极值/u);
  assert.doesNotMatch(framePreview, /未变形/u);
});

test("平面桁架受力变形主图提供位移倍率和图层控制", () => {
  const trussPreview = readFileSync(new URL("../components/TrussPreview.tsx", import.meta.url), "utf-8");

  assert.match(trussPreview, /位移倍率/u);
  assert.match(trussPreview, /result-preview-scale-slider/u);
  assert.match(trussPreview, /荷载/u);
  assert.match(trussPreview, /位移/u);
  assert.match(trussPreview, /极值/u);
});

test("系统显示设置使用跨结构对象视觉口径", () => {
  const systemSettings = readFileSync(new URL("../components/SystemSettingsPanel.tsx", import.meta.url), "utf-8");

  assert.match(systemSettings, /蓝色结构对象与橙色荷载/u);
  assert.doesNotMatch(systemSettings, /蓝色构件/u);
});
