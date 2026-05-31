import { strict as assert } from "node:assert";
import test from "node:test";

import {
  defaultMaterialAriaLabel,
  defaultMaterialBasicDetail,
  defaultMaterialControlHint,
  defaultMaterialFieldLabel,
  materialSectionBasicDetail,
  workbenchBasicDescription,
  workbenchBasicSuccessMessage,
} from "./workbench-basic-vocabulary.ts";

test("基本页文案使用三类对象共享的短句结构", () => {
  assert.equal(workbenchBasicDescription("beam"), "先定梁型和默认材料；杆件、支座、荷载在对象页维护，批量参数在表格页复核。");
  assert.equal(workbenchBasicDescription("frame"), "先定默认材料；节点、构件、支座、荷载在对象页维护，批量参数在表格页复核。");
  assert.equal(workbenchBasicDescription("truss"), "先定默认材料；节点、杆件、支座、荷载在对象页维护，批量参数在表格页复核。");
  assert.doesNotMatch(workbenchBasicDescription("frame"), /属性检查器|先套用参数模板/u);
  assert.doesNotMatch(workbenchBasicSuccessMessage("beam"), /可继续复核/u);
});

test("基本页默认材料说明统一区分材料编号和刚度输入", () => {
  assert.equal(defaultMaterialFieldLabel("beam"), "默认材料编号（新增杆件 E）");
  assert.equal(defaultMaterialAriaLabel("frame"), "框架默认材料编号（新增构件 E）");
  assert.equal(defaultMaterialBasicDetail("beam", "q345"), "新增杆件回填 Q345 的 E；刚度仍按 E/I 输入计算。");
  assert.equal(defaultMaterialBasicDetail("frame", "q345"), "新增构件回填 Q345 的 E；刚度仍按 E/A/I 输入计算。");
  assert.equal(defaultMaterialBasicDetail("truss", "q345"), "新增杆件回填 Q345 的 E；刚度仍按 E/A 输入计算。");
  assert.equal(defaultMaterialBasicDetail("frame", "custom"), "新增构件使用自定义 E；刚度仍按 E/A/I 输入计算。");
});

test("基本页材料提示保持简洁并避免重复长说明", () => {
  assert.equal(materialSectionBasicDetail("truss"), "材料编号保留工程语义；截面面积 A 按杆件维护。");
  assert.equal(defaultMaterialControlHint("beam", "q345"), "Q345 仅回填新增杆件的 E；已有杆件不自动改写。");
  assert.equal(defaultMaterialControlHint("frame", "custom"), "自定义材料不回填预设；已有构件的 E 需在对象或表格页复核。");
  assert.doesNotMatch(defaultMaterialControlHint("truss", "q235"), /强度|稳定|连接|规范设计|kg\/m³/u);
});
