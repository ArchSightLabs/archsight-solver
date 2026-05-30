import assert from "node:assert/strict";
import test from "node:test";

import { clamp, svgAreaPath, svgPathFromPoints } from "./result-diagram-geometry.ts";

test("工程图几何工具限制数值到指定区间", () => {
  assert.equal(clamp(-2, 0, 5), 0);
  assert.equal(clamp(3, 0, 5), 3);
  assert.equal(clamp(8, 0, 5), 5);
});

test("工程图几何工具生成稳定的 SVG 折线路径", () => {
  assert.equal(svgPathFromPoints([{ x: 0, y: 1 }, { x: 2.345, y: 6.789 }]), "M 0.00 1.00 L 2.35 6.79");
});

test("工程图几何工具生成基线闭合面积路径", () => {
  assert.equal(
    svgAreaPath([{ x: 0, y: 10 }, { x: 4, y: 10 }], [{ x: 0, y: 6 }, { x: 4, y: 8 }]),
    "M 0.00 6.00 L 4.00 8.00 L 4.00 10.00 L 0.00 10.00 Z",
  );
  assert.equal(svgAreaPath([{ x: 0, y: 10 }], [{ x: 0, y: 6 }]), "");
});
