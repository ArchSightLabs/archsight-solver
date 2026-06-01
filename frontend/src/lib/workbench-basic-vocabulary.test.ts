import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  defaultMaterialAriaLabel,
  defaultMaterialControlHint,
  defaultMaterialFieldLabel,
  workbenchBasicSuccessMessage,
} from "./workbench-basic-vocabulary.ts";

test("基本页只保留状态短句，不渲染重复说明页眉", () => {
  assert.equal(workbenchBasicSuccessMessage("beam"), "梁系输入完整，可计算。");
  assert.doesNotMatch(workbenchBasicSuccessMessage("beam"), /挠度|弯矩|剪力|支座反力|可继续复核/u);

  const sharedBasicSource = readFileSync(new URL("../components/WorkbenchModelBasicSection.tsx", import.meta.url), "utf-8");
  const sectionSources = [
    readFileSync(new URL("../components/BeamBasicSection.tsx", import.meta.url), "utf-8"),
    readFileSync(new URL("../components/FrameBasicSection.tsx", import.meta.url), "utf-8"),
    readFileSync(new URL("../components/TrussBasicSection.tsx", import.meta.url), "utf-8"),
  ].join("\n");

  assert.doesNotMatch(sharedBasicSource, /Sparkles|title|description|eyebrow/u);
  assert.doesNotMatch(sectionSources, /workbenchBasicDescription|自定义平面|参数化梁系|对象页维护模型/u);
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

test("梁系基本页把总长放在最后并给更宽指标卡", () => {
  const source = readFileSync(new URL("../components/BeamBasicSection.tsx", import.meta.url), "utf-8");

  assert.match(source, /\{ label: objectVocabulary\.memberGroupLabel, value: spanCount \},\s*\{ label: objectVocabulary\.supportGroupLabel, value: supportCount \},\s*\{ label: "总长", value: `\$\{totalLength\.toFixed\(2\)\} m`, className: "sm:col-span-2", valueClassName: "whitespace-nowrap" \}/u);
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
  assert.equal(defaultMaterialControlHint("beam", "q345"), "仅影响新增跨段；已有不变。");
  assert.equal(defaultMaterialControlHint("frame", "custom"), "仅影响新增构件；已有不变。");
  assert.ok(defaultMaterialControlHint("truss", "q235").length <= 18);
  assert.doesNotMatch(defaultMaterialControlHint("truss", "q235"), /Q235|强度|稳定|连接|规范设计|kg\/m³/u);
});
