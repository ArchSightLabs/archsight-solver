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
    componentSource("./TrussCustomModelEditor.tsx"),
  ];

  sources.forEach((source) => {
    assert.doesNotMatch(source, />\s*套用\s*</u);
    assert.doesNotMatch(source, /flex shrink-0 flex-col items-end/u);
  });
});

test("模板数量信息只在有补充价值时并入标签行", () => {
  const beamSource = componentSource("./BeamTemplateSection.tsx");
  const frameSource = componentSource("./FrameTemplateSection.tsx");
  const trussSource = componentSource("./TrussCustomModelEditor.tsx");

  assert.doesNotMatch(beamSource, /template\.state\.spans\.length\}\s*跨/u);
  assert.match(frameSource, /template\.nodes\.length\}\s*节点/u);
  assert.match(trussSource, /template\.members\.length\}\s*\{memberTerm\}/u);
});
