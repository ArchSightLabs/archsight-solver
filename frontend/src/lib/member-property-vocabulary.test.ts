import test from "node:test";
import assert from "node:assert/strict";

import { memberMaterialPresetHint, memberSectionSummary } from "./member-property-vocabulary.ts";

test("构件材料截面摘要按结构体系显示必要工程参数", () => {
  assert.equal(
    memberSectionSummary("beam", { E: 206, I: 85000, materialLabel: "Q235" }),
    "材料 Q235 · E=206 GPa · I=85000 cm⁴",
  );
  assert.equal(
    memberSectionSummary("frame", { E_GPa: 210, A_cm2: 220, I_cm4: 15000 }),
    "E=210 GPa · A=220 cm² · I=15000 cm⁴",
  );
  assert.equal(
    memberSectionSummary("truss", { E_GPa: 200.5, A_cm2: 24.25 }),
    "E=200.5 GPa · A=24.25 cm²",
  );
});

test("材料预设提示明确只回填 E 且不替代截面参数", () => {
  assert.match(memberMaterialPresetHint("frame", "构件"), /只回填弹性模量 E/u);
  assert.match(memberMaterialPresetHint("frame", "构件"), /截面面积 A 和截面惯性矩 I/u);
  assert.match(memberMaterialPresetHint("truss", "杆件"), /截面面积 A/u);
});
