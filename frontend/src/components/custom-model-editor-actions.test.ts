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
