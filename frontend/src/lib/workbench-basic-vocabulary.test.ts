import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  defaultMaterialAriaLabel,
  defaultMaterialControlHint,
  defaultMaterialFieldLabel,
  workbenchBasicDescription,
  workbenchBasicSuccessMessage,
} from "./workbench-basic-vocabulary.ts";

test("基本页文案保持摘要式短句", () => {
  assert.equal(workbenchBasicDescription("beam"), "模板定型；默认材料用于新增跨段。");
  assert.equal(workbenchBasicDescription("frame"), "默认材料用于新增构件；对象页维护模型。");
  assert.equal(workbenchBasicDescription("truss"), "默认材料用于新增杆件；对象页维护模型。");
  assert.equal(workbenchBasicSuccessMessage("beam"), "梁系输入完整，可计算。");
  assert.ok(workbenchBasicDescription("frame").length <= 24);
  assert.doesNotMatch(workbenchBasicDescription("frame"), /属性检查器|先套用参数模板|批量参数|支座节点|荷载/u);
  assert.doesNotMatch(workbenchBasicDescription("beam"), /先定梁型/u);
  assert.doesNotMatch(workbenchBasicSuccessMessage("beam"), /挠度|弯矩|剪力|支座反力|可继续复核/u);
});

test("框架和桁架基本页不提供模板恢复或对象编辑动作", () => {
  const frameBasicSource = readFileSync(new URL("../components/FrameBasicSection.tsx", import.meta.url), "utf-8");
  const trussBasicSource = readFileSync(new URL("../components/TrussBasicSection.tsx", import.meta.url), "utf-8");
  const sharedBasicSource = readFileSync(new URL("../components/WorkbenchModelBasicSection.tsx", import.meta.url), "utf-8");

  assert.doesNotMatch(frameBasicSource, /恢复单跨刚架|补全同轴|新增节点并连接|onResetToPortal|onCompleteAxisMembers|onAddNode/u);
  assert.doesNotMatch(trussBasicSource, /恢复默认屋架|新增节点|onResetToBenchmark|onAddNode/u);
  assert.match(sharedBasicSource, /actions\.length \?/u);
});

test("基本页不渲染说明书式详情行", () => {
  const sources = [
    readFileSync(new URL("../components/BeamBasicSection.tsx", import.meta.url), "utf-8"),
    readFileSync(new URL("../components/FrameBasicSection.tsx", import.meta.url), "utf-8"),
    readFileSync(new URL("../components/TrussBasicSection.tsx", import.meta.url), "utf-8"),
    readFileSync(new URL("../components/WorkbenchModelBasicSection.tsx", import.meta.url), "utf-8"),
  ];

  sources.forEach((source) => {
    assert.doesNotMatch(source, /detailRows|支座自由度|求解模型|输入单位|主要结果|materialSectionBasicDetail|supportSystemHint/u);
  });
});

test("基本页对象术语从共享对象词表派生", () => {
  const source = readFileSync(new URL("./workbench-basic-vocabulary.ts", import.meta.url), "utf-8");

  assert.match(source, /modelObjectMemberTerm/u);
  assert.doesNotMatch(source, /memberTerm:\s*"(?:构件|杆件)"/u);
  assert.doesNotMatch(source, /(?:description|successMessage|materialFieldLabel|materialAriaLabel|materialSectionDetail):\s*"/u);
});

test("基本页材料提示保持简洁并避免重复长说明", () => {
  assert.equal(defaultMaterialFieldLabel("beam"), "默认材料");
  assert.equal(defaultMaterialAriaLabel("frame"), "框架默认材料（新增构件 E）");
  assert.equal(defaultMaterialControlHint("beam", "q345"), "新增跨段使用 Q345；已有不变。");
  assert.equal(defaultMaterialControlHint("frame", "custom"), "手动 E；已有构件不变。");
  assert.ok(defaultMaterialControlHint("truss", "q235").length <= 18);
  assert.doesNotMatch(defaultMaterialControlHint("truss", "q235"), /强度|稳定|连接|规范设计|kg\/m³/u);
});
