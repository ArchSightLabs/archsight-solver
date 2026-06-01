import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function componentSource(fileName: string) {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf-8");
}

test("对象页默认不铺开对象建模说明段落", () => {
  const source = componentSource("ModelObjectGuide.tsx");

  assert.match(source, /showDescription = false/u);
  assert.match(source, /navigatorDescription/u);
});

test("对象页选中编辑器不显示材料库长说明", () => {
  const sources = [
    componentSource("BeamSpanEditor.tsx"),
    componentSource("MemberMaterialPresetField.tsx"),
    componentSource("FrameMemberEditor.tsx"),
    componentSource("TrussMemberEditor.tsx"),
  ].join("\n");

  assert.doesNotMatch(sources, /materialNote|memberMaterialEngineeringNote|showHint=\{isSelectedVariant\}/u);
  assert.doesNotMatch(sources, /材料参数用于线弹性刚度计算|强度、稳定、连接和规范设计/u);
});

test("工程材料管理入口归属工程树而不是系统设置", () => {
  const projectTree = componentSource("ProjectTreePanel.tsx");
  const systemSettings = componentSource("SystemSettingsPanel.tsx");

  assert.match(projectTree, /ProjectMaterialManager/u);
  assert.doesNotMatch(systemSettings, /工程自定义材料|新增或更新材料|onCustomMaterialsChange/u);
});

test("对象导航芯片不再把成员截面摘要作为可见第二行", () => {
  const sources = [
    componentSource("BeamObjectNavigator.tsx"),
    componentSource("FrameObjectNavigator.tsx"),
    componentSource("TrussObjectNavigator.tsx"),
  ].join("\n");

  assert.doesNotMatch(sources, /block pt-0\.5 font-mono text-\[10px\]/u);
  assert.match(sources, /title=\{(?:beamSpanChipSummary|frameMemberChipSummary|trussMemberChipSummary)/u);
});

test("框架和桁架对象列表只显示对象定位短标签", () => {
  const sources = [
    componentSource("FrameObjectNavigator.tsx"),
    componentSource("TrussObjectNavigator.tsx"),
  ].join("\n");

  assert.doesNotMatch(sources, /\{node\.id\} · \{(?:frameNodeSupportSummary|trussSupportSummary)/u);
  assert.doesNotMatch(sources, /\{member\.id\} · \{member\.start\}-\{member\.end\}/u);
  assert.match(sources, /title=\{(?:frameNodeSupportSummary\(node\)|trussSupportSummary\(node\.supportType\))/u);
  assert.match(sources, /title=\{`\$\{member\.start\}-\$\{member\.end\} · \$\{(?:frameMemberChipSummary|trussMemberChipSummary)\(member(?:, materialLibrary)?\)\}`\}/u);
});

test("梁系支座芯片按编号、类型、坐标排序", () => {
  const source = componentSource("BeamObjectNavigator.tsx");

  assert.match(source, /`\$\{support\.id\} · \$\{beamSupportLabel\(support\.type\)\} · x=\$\{formatCompactLength\(support\.x\)\} m`/u);
  assert.doesNotMatch(source, /`\$\{support\.id\} · x=/u);
});
