import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function componentSource(fileName: string) {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf-8");
}

test("框架对象页接入复制、镜像和阵列编辑入口", () => {
  const source = componentSource("FrameCustomModelEditor.tsx");

  assert.match(source, /copyFrameCollections\(value/u);
  assert.match(source, /mirrorFrameCollections\(value/u);
  assert.match(source, /arrayFrameCollections\(value/u);
  assert.match(source, /selectGeneratedFrameGeometry/u);
  assert.match(source, /geometryEditTarget\.label/u);
  assert.match(source, /onClick=\{copyGeometryTarget\}/u);
  assert.match(source, /onClick=\{\(\) => mirrorGeometryTarget\("x"\)\}/u);
  assert.match(source, /onClick=\{\(\) => mirrorGeometryTarget\("y"\)\}/u);
  assert.match(source, /onClick=\{\(\) => arrayGeometryTarget\("x"\)\}/u);
  assert.match(source, /onClick=\{\(\) => arrayGeometryTarget\("y"\)\}/u);
});

test("桁架对象页接入复制、镜像和阵列编辑入口", () => {
  const source = componentSource("TrussCustomModelEditor.tsx");

  assert.match(source, /copyTrussCollections\(value/u);
  assert.match(source, /mirrorTrussCollections\(value/u);
  assert.match(source, /arrayTrussCollections\(value/u);
  assert.match(source, /selectGeneratedTrussGeometry/u);
  assert.match(source, /geometryEditTarget\.label/u);
  assert.match(source, /onClick=\{copyGeometryTarget\}/u);
  assert.match(source, /onClick=\{\(\) => mirrorGeometryTarget\("x"\)\}/u);
  assert.match(source, /onClick=\{\(\) => mirrorGeometryTarget\("y"\)\}/u);
  assert.match(source, /onClick=\{\(\) => arrayGeometryTarget\("x"\)\}/u);
  assert.match(source, /onClick=\{\(\) => arrayGeometryTarget\("y"\)\}/u);
});

test("框架和桁架表格页使用可回写的批量编辑器", () => {
  const frameTable = componentSource("FrameTableSection.tsx");
  const trussTable = componentSource("TrussTableSection.tsx");
  const frameEditor = componentSource("FrameCustomModelEditor.tsx");
  const trussEditor = componentSource("TrussCustomModelEditor.tsx");

  assert.match(frameTable, /FrameNodeEditor/u);
  assert.match(frameTable, /FrameMemberEditor/u);
  assert.match(frameTable, /FrameLoadEditor/u);
  assert.match(frameTable, /variant="table"/u);
  assert.match(frameTable, /onNodeUpdate\(index, patch\)/u);
  assert.match(frameTable, /onMemberUpdate\(index, patch\)/u);
  assert.match(frameTable, /onLoadUpdate\(index, patch\)/u);
  assert.match(frameEditor, /onNodeUpdate=\{updateNode\}/u);
  assert.match(frameEditor, /onMemberUpdate=\{updateMember\}/u);
  assert.match(frameEditor, /onLoadUpdate=\{updateLoad\}/u);

  assert.match(trussTable, /TrussNodeEditor/u);
  assert.match(trussTable, /TrussMemberEditor/u);
  assert.match(trussTable, /TrussLoadEditor/u);
  assert.match(trussTable, /variant="table"/u);
  assert.match(trussTable, /onNodeUpdate\(index, patch\)/u);
  assert.match(trussTable, /onMemberUpdate\(index, patch\)/u);
  assert.match(trussTable, /onLoadUpdate\(index, patch\)/u);
  assert.match(trussEditor, /onNodeUpdate=\{updateNode\}/u);
  assert.match(trussEditor, /onMemberUpdate=\{updateMember\}/u);
  assert.match(trussEditor, /onLoadUpdate=\{updateLoad\}/u);
});
