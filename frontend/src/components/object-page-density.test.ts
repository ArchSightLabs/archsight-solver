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

test("工程设置入口归属工程树，工程材料并入同一设置弹窗", () => {
  const projectTree = componentSource("ProjectTreePanel.tsx");
  const projectInfoDialog = componentSource("ProjectInfoDialog.tsx");
  const systemSettings = componentSource("SystemSettingsPanel.tsx");

  assert.match(projectTree, /工程设置/u);
  assert.doesNotMatch(projectTree, /ProjectMaterialManager|工程材料库/u);
  assert.match(projectInfoDialog, /ProjectMaterialPanel/u);
  assert.match(projectInfoDialog, /工程信息/u);
  assert.match(projectInfoDialog, /工程材料/u);
  assert.match(projectInfoDialog, /role="tablist"/u);
  assert.doesNotMatch(systemSettings, /工程自定义材料|新增或更新材料|onCustomMaterialsChange/u);
});

test("模板库弹窗沿用工作台紧凑弹窗和列表行风格", () => {
  const appSource = componentSource("GlobalDialogs.tsx");
  const templateLibrary = componentSource("TemplateLibraryPanel.tsx");

  assert.match(appSource, /template-library-dialog-title/u);
  assert.match(appSource, /border-b border-slate-200 px-4 py-3\.5/u);
  assert.doesNotMatch(templateLibrary, /GlassCard|GlassHeader|rounded-3xl|grid-cols-2 gap-2/u);
  assert.match(templateLibrary, /aria-label="模板列表"/u);
  assert.match(templateLibrary, /lg:grid-cols-\[minmax\(0,1fr\)_auto\]/u);
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
