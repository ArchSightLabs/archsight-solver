import { strict as assert } from "node:assert";
import test from "node:test";
import {
  materialEngineeringNote,
  materialDropdownOptions,
  materialElasticityLabelForYoungModulus,
  materialLibraryFromCustomMaterials,
  materialIdForMember,
  materialLabelForId,
  materialLabelForYoungModulus,
  materialOptionDescription,
  materialOptionLabel,
  materialOptionMenuLabel,
  materialOptionSelectedLabel,
  memberElasticityDistributionLabel,
  memberMaterialEngineeringNote,
  normalizeProjectCustomMaterials,
  selectableMaterialPresets,
  youngModulusForMaterial,
} from "./material-presets.ts";
import { memberMaterialPresetHint, memberPropertyLabels } from "./member-property-vocabulary.ts";
import { PREDEFINED_MATERIALS } from "../types/material.ts";

test("共享材料目录保留结构工程材料名称和 E/密度", () => {
  const q345 = PREDEFINED_MATERIALS.find((material) => material.id === "q345");
  const custom = PREDEFINED_MATERIALS.find((material) => material.id === "custom");

  assert.equal(q345?.name, "Q345 低合金高强度结构钢");
  assert.equal(q345?.youngModulus, 210);
  assert.equal(q345?.density, 7850);
  assert.match(materialOptionLabel(q345!), /E=210 GPa/u);
  assert.match(materialOptionLabel(custom!), /手动 E/u);
  assert.doesNotMatch(materialOptionLabel(custom!), /E=206 GPa/u);
  assert.equal(materialOptionSelectedLabel(q345!), "Q345");
  assert.equal(materialOptionMenuLabel(q345!), "Q345 低合金高强度结构钢");
  assert.equal(materialOptionDescription(q345!), "E=210 GPa · ρ=7850 kg/m³");
  assert.equal(materialOptionSelectedLabel(custom!), "自定义");
});

test("材料下拉只列系统预设并使用短选项", () => {
  const options = materialDropdownOptions(PREDEFINED_MATERIALS);
  const q345 = options.find((option) => option.value === "q345");
  const detailedOptions = materialDropdownOptions(PREDEFINED_MATERIALS, { includeCustom: true, includeDescriptions: true });
  const custom = detailedOptions.find((option) => option.value === "custom");

  assert.equal(options.some((option) => option.value === "custom"), false);
  assert.equal(selectableMaterialPresets(PREDEFINED_MATERIALS).some((material) => material.id === "custom"), false);
  assert.deepEqual(q345, {
    value: "q345",
    label: "Q345 低合金高强度结构钢",
    selectedLabel: "Q345",
  });
  assert.deepEqual(custom, {
    value: "custom",
    label: "手动 E",
    selectedLabel: "自定义",
    description: "手动输入 E；不回填预设",
  });
});

test("工程自定义材料进入材料库下拉且不能覆盖系统内置材料", () => {
  const customMaterials = normalizeProjectCustomMaterials([
    { id: "timber-c24", name: "C24 结构木材", youngModulus: 11, density: 420 },
    { id: "q345", name: "非法覆盖", youngModulus: 1, density: 1 },
  ]);
  const library = materialLibraryFromCustomMaterials(customMaterials);
  const options = materialDropdownOptions(library);
  const timber = options.find((option) => option.value === "timber-c24");

  assert.equal(customMaterials.length, 1);
  assert.equal(timber?.label, "TIMBER-C24 C24 结构木材");
  assert.equal(timber?.selectedLabel, "TIMBER-C24 自定义");
  assert.equal(timber?.badge, "自定义");
  assert.equal(materialOptionDescription(customMaterials[0]), "自定义 · E=11 GPa · ρ=420 kg/m³");
  assert.equal(youngModulusForMaterial("timber-c24", 210, library), 11);
  assert.equal(materialLabelForId("timber-c24", library), "TIMBER-C24");
  assert.equal(
    memberElasticityDistributionLabel([{ materialId: "timber-c24", E_GPa: 11 }], "构件", "timber-c24", library),
    "",
  );
});

test("材料说明明确预设不替代强度和规范设计", () => {
  const note = materialEngineeringNote("c40");

  assert.match(note, /C40 混凝土/u);
  assert.match(note, /E=32\.5 GPa/u);
  assert.match(note, /裂缝、徐变、收缩和配筋设计不在当前线弹性求解范围内/u);
});

test("材料预设回填弹性模量而不是覆盖截面参数", () => {
  assert.equal(youngModulusForMaterial("q235", 1), 206);
  assert.equal(youngModulusForMaterial("custom", 198.5), 198.5);
  assert.equal(youngModulusForMaterial("unknown", 199), 199);
});

test("构件材料标签按实际 E 匹配预设或标记为自定义", () => {
  assert.equal(materialLabelForYoungModulus(210), "Q345");
  assert.equal(materialLabelForYoungModulus(30), "C30");
  assert.equal(materialLabelForYoungModulus(198.5), "自定义");
  assert.equal(materialLabelForId("q235"), "Q235");
  assert.equal(materialLabelForId("custom"), "自定义");
  assert.equal(materialIdForMember({ materialId: "q235", E_GPa: 210 }), "q235");
  assert.equal(materialIdForMember({ E_GPa: 206 }), "q235");
  assert.equal(materialElasticityLabelForYoungModulus(210), "Q345 · E=210 GPa");
  assert.equal(materialElasticityLabelForYoungModulus(198.5), "自定义 E=198.5 GPa");
});

test("构件自定义弹性模量提示使用当前输入值而不是材料库默认值", () => {
  const note = memberMaterialEngineeringNote("custom", 198.5, "构件");

  assert.match(note, /当前构件使用自定义弹性模量 E=198\.5 GPa/u);
  assert.doesNotMatch(note, /E=206 GPa/u);
  assert.match(memberMaterialEngineeringNote("q345", 210, "杆件"), /Q345 低合金高强度结构钢/u);
});

test("构件和杆件材料截面字段显式保留工程单位", () => {
  assert.deepEqual(memberPropertyLabels("beam"), {
    youngModulus: "弹性模量（GPa）",
    momentOfInertia: "截面惯性矩（cm⁴）",
  });
  assert.deepEqual(memberPropertyLabels("frame"), {
    youngModulus: "弹性模量（GPa）",
    sectionArea: "截面面积（cm²）",
    momentOfInertia: "截面惯性矩（cm⁴）",
  });
  assert.deepEqual(memberPropertyLabels("truss"), {
    youngModulus: "弹性模量（GPa）",
    sectionArea: "截面面积（cm²）",
  });
});

test("材料预设提示明确只回填 E 且截面参数仍由构件维护", () => {
  assert.match(memberMaterialPresetHint("beam", "跨段"), /只回填 E/u);
  assert.match(memberMaterialPresetHint("beam", "跨段"), /截面惯性矩 I 按跨段维护/u);
  assert.match(memberMaterialPresetHint("frame", "构件"), /只回填 E/u);
  assert.match(memberMaterialPresetHint("frame", "构件"), /截面面积 A 和截面惯性矩 I/u);
  assert.match(memberMaterialPresetHint("truss", "杆件"), /截面面积 A 按杆件维护/u);
});

test("构件材料摘要按实际 E 分布说明刚度输入", () => {
  assert.equal(memberElasticityDistributionLabel([{ materialId: "q345", E_GPa: 210 }, { E_GPa: 210 }], "构件", "q345"), "");
  assert.equal(memberElasticityDistributionLabel([{ materialId: "c30", E_GPa: 30 }], "构件", "q345"), "C30 · E=30 GPa：1 个构件");
  assert.equal(
    memberElasticityDistributionLabel([{ materialId: "q345", E_GPa: 210 }, { materialId: "c30", E_GPa: 30 }, { E_GPa: 210 }], "构件"),
    "C30 · E=30 GPa：1 个构件；Q345 · E=210 GPa：2 个构件",
  );
  assert.equal(memberElasticityDistributionLabel([], "杆件"), "未设置杆件弹性模量");
});
