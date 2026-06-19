import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

function componentSource(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf-8");
}

test("模板卡片整体可点击时不再显示套用伪按钮", () => {
  const sources = [
    componentSource("./BeamTemplateSection.tsx"),
    componentSource("./FrameTemplateSection.tsx"),
    componentSource("./TrussTemplateSection.tsx"),
  ];

  sources.forEach((source) => {
    assert.doesNotMatch(source, />\s*套用\s*</u);
    assert.doesNotMatch(source, /flex shrink-0 flex-col items-end/u);
  });
});

test("模板页不重复渲染模板标题", () => {
  const sources = [
    componentSource("./BeamTemplateSection.tsx"),
    componentSource("./FrameTemplateSection.tsx"),
    componentSource("./TrussTemplateSection.tsx"),
  ].join("\n");

  assert.doesNotMatch(sources, /Sparkles/u);
  assert.doesNotMatch(sources, /eyebrow flex items-center gap-2[\s\S]{0,120}模板/u);
});

test("模板数量信息只在有补充价值时并入标签行", () => {
  const beamSource = componentSource("./BeamTemplateSection.tsx");
  const frameSource = componentSource("./FrameTemplateSection.tsx");
  const trussSource = componentSource("./TrussTemplateSection.tsx");

  assert.doesNotMatch(beamSource, /template\.state\.spans\.length\}\s*跨/u);
  assert.match(frameSource, /template\.nodes\.length\}\s*节点/u);
  assert.match(trussSource, /template\.members\.length\}\s*\{memberTerm\}/u);
});

test("模板页保留工程预设、生成摘要和一键首算入口", () => {
  const beamSource = componentSource("./BeamTemplateSection.tsx");
  const frameSource = componentSource("./FrameTemplateSection.tsx");
  const trussSource = componentSource("./TrussTemplateSection.tsx");
  const sources = [beamSource, frameSource, trussSource].join("\n");

  assert.match(beamSource, /aria-label="连续梁快速生成预设"/u);
  assert.match(frameSource, /aria-label="规则框架快速生成预设"/u);
  assert.match(trussSource, /aria-label="平行弦桁架快速生成预设"/u);
  assert.match(sources, /即将生成/u);
  assert.match(sources, /打开并计算/u);
});
