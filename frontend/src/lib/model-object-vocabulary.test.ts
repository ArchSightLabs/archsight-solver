import test from "node:test";
import assert from "node:assert/strict";

import { createDefaultFrameWorkspaceState, createDefaultTrussWorkspaceState, createDefaultBeamWorkspaceState } from "./workspace-state.ts";
import {
  modelObjectCountPhrase,
  modelObjectLabel,
  modelObjectLoadLabel,
  modelObjectMemberTerm,
  modelObjectMetricRows,
  modelObjectVocabulary,
} from "./model-object-vocabulary.ts";
import type { WorkspaceState } from "./workspace-state.ts";
import { readFileSync } from "node:fs";

function defaultWorkspace(): WorkspaceState {
  return {
    analysisMode: "beam",
    beam: createDefaultBeamWorkspaceState(),
    frame: createDefaultFrameWorkspaceState(),
    truss: createDefaultTrussWorkspaceState(),
  };
}

test("模型对象词表区分梁系、框架和桁架对象语义", () => {
  assert.match(modelObjectVocabulary("beam").navigatorDescription, /v \/ θz/u);
  assert.match(modelObjectVocabulary("frame").navigatorDescription, /ux \/ uy \/ rz/u);
  assert.match(modelObjectVocabulary("truss").navigatorDescription, /不输出弯矩主指标/u);
  assert.equal(modelObjectVocabulary("frame").memberGroupLabel, "构件");
  assert.equal(modelObjectVocabulary("truss").memberGroupLabel, "杆件");
});

test("模型画布摘要指标来自模型对象词表", () => {
  const workspace = defaultWorkspace();
  assert.deepEqual(modelObjectMetricRows(workspace, "beam").map((row) => row.label), ["杆件", "总长度", "支座节点"]);
  assert.deepEqual(modelObjectMetricRows(workspace, "frame").map((row) => row.label), ["节点", "构件", "支座节点", "荷载"]);
  assert.deepEqual(modelObjectMetricRows(workspace, "truss").map((row) => row.label), ["节点", "杆件", "支座节点", "荷载"]);
});

test("模型画布摘要支座节点计数包含刚性支座和有效弹性边界", () => {
  const workspace = defaultWorkspace();
  workspace.frame.customNodes = [
    { id: "N1", x: 0, y: 0, supportType: "pinned" },
    { id: "N2", x: 4, y: 0, supportType: "free", springs: [{ dof: "uy", stiffnessKnPerM: 12000 }] },
    { id: "N3", x: 4, y: 3, supportType: "free", springs: [{ dof: "ux", stiffnessKnPerM: 0 }] },
  ];
  workspace.truss.customNodes = [
    { id: "N1", x: 0, y: 0, supportType: "pinned" },
    { id: "N2", x: 4, y: 0, supportType: "roller" },
    { id: "N3", x: 2, y: 3, supportType: "free" },
  ];

  assert.equal(modelObjectMetricRows(workspace, "frame").find((row) => row.label === "支座节点")?.value, "2");
  assert.equal(modelObjectMetricRows(workspace, "truss").find((row) => row.label === "支座节点")?.value, "2");
});

test("模型对象词表提供统一的计数短语和作用对象荷载标签", () => {
  assert.equal(modelObjectLabel("frame", "support"), "支座节点");
  assert.equal(modelObjectCountPhrase("frame", "member", 3), "3 个构件");
  assert.equal(modelObjectCountPhrase("truss", "member", 5), "5 根杆件");
  assert.equal(modelObjectCountPhrase("beam", "load", 2), "2 条荷载");
  assert.equal(modelObjectLoadLabel("truss", "node"), "节点荷载");
  assert.equal(modelObjectLoadLabel("truss", "member"), "杆件荷载");
});

test("对象编辑器成员术语从共享模型对象词表派生", () => {
  assert.equal(modelObjectMemberTerm("beam"), "杆件");
  assert.equal(modelObjectMemberTerm("frame"), "构件");
  assert.equal(modelObjectMemberTerm("truss"), "杆件");

  const editorFiles = [
    "BeamSpanEditor.tsx",
    "FrameCustomModelEditor.tsx",
    "FrameObjectNavigator.tsx",
    "FrameTableSection.tsx",
    "FrameMemberEditor.tsx",
    "TrussCustomModelEditor.tsx",
    "TrussMemberEditor.tsx",
    "TrussObjectNavigator.tsx",
    "TrussTableSection.tsx",
    "FrameNodeEditor.tsx",
    "TrussNodeEditor.tsx",
  ];

  for (const fileName of editorFiles) {
    const source = readFileSync(new URL(`../components/${fileName}`, import.meta.url), "utf-8");
    assert.match(source, /modelObject(?:MemberTerm|Vocabulary)/u, `${fileName} 应从共享词表取得成员术语`);
    assert.doesNotMatch(source, /member(?:Term|Label)="(?:构件|杆件)"/u, `${fileName} 不应向共享子组件传入硬编码成员术语`);
    assert.doesNotMatch(source, /memberElasticityDistributionLabel\([^)]*,\s*"(?:构件|杆件)"/u, `${fileName} 不应向材料摘要传入硬编码成员术语`);
  }
});

test("计算书图形和导出计划成员术语从共享模型对象词表派生", () => {
  const reportFiles = ["report-structure-images.ts", "report-image-plan.ts"];

  for (const fileName of reportFiles) {
    const source = readFileSync(new URL(`./${fileName}`, import.meta.url), "utf-8");
    assert.match(source, /modelObjectMemberTerm/u, `${fileName} 应从共享词表取得成员术语`);
    assert.doesNotMatch(source, /memberTerm:\s*"(?:构件|杆件)"/u, `${fileName} 不应硬编码报告图形成员术语`);
    assert.doesNotMatch(source, /label:\s*`构件/u, `${fileName} 不应硬编码框架导出图形成员标签`);
    assert.doesNotMatch(source, /(?:构件|杆件) \$\{(?:extreme|controlAxial)\.memberId\}/u, `${fileName} 不应硬编码控制成员编号前缀`);
  }
});

test("主控校核和基本页成员术语从共享模型对象词表派生", () => {
  const sources = [
    ["solver-payload.ts", readFileSync(new URL("../solver-payload.ts", import.meta.url), "utf-8")],
    ["FrameBasicSection.tsx", readFileSync(new URL("../components/FrameBasicSection.tsx", import.meta.url), "utf-8")],
    ["TrussBasicSection.tsx", readFileSync(new URL("../components/TrussBasicSection.tsx", import.meta.url), "utf-8")],
    ["FrameCustomModelEditor.tsx", readFileSync(new URL("../components/FrameCustomModelEditor.tsx", import.meta.url), "utf-8")],
    ["TrussCustomModelEditor.tsx", readFileSync(new URL("../components/TrussCustomModelEditor.tsx", import.meta.url), "utf-8")],
  ];

  for (const [fileName, source] of sources) {
    assert.match(source, /modelObject(?:CountPhrase|MemberTerm|Vocabulary)/u, `${fileName} 应从共享词表取得成员术语`);
    assert.doesNotMatch(source, /构件|杆件/u, `${fileName} 不应在主控文案中硬编码成员术语`);
  }
});

test("结构预览和主控画布成员术语从共享模型对象词表派生", () => {
  const sources = [
    ["FramePreview.tsx", readFileSync(new URL("../components/FramePreview.tsx", import.meta.url), "utf-8")],
    ["TrussPreview.tsx", readFileSync(new URL("../components/TrussPreview.tsx", import.meta.url), "utf-8")],
    ["BeamSketch.tsx", readFileSync(new URL("../components/model-canvas/BeamSketch.tsx", import.meta.url), "utf-8")],
    ["FrameSketch.tsx", readFileSync(new URL("../components/model-canvas/FrameSketch.tsx", import.meta.url), "utf-8")],
    ["TrussSketch.tsx", readFileSync(new URL("../components/model-canvas/TrussSketch.tsx", import.meta.url), "utf-8")],
    ["truss-preview-utils.ts", readFileSync(new URL("../components/truss-preview-utils.ts", import.meta.url), "utf-8")],
  ];

  for (const [fileName, source] of sources) {
    assert.match(source, /modelObject(?:MemberTerm|Vocabulary)/u, `${fileName} 应从共享词表取得成员术语`);
    assert.doesNotMatch(source, /构件|杆件/u, `${fileName} 不应在图形文案中硬编码成员术语`);
  }
});

test("结果页和计算书选项成员术语从共享模型对象词表派生", () => {
  const sources = [
    ["FrameMemberDiagrams.tsx", readFileSync(new URL("../components/FrameMemberDiagrams.tsx", import.meta.url), "utf-8")],
    ["TrussResultDiagrams.tsx", readFileSync(new URL("../components/TrussResultDiagrams.tsx", import.meta.url), "utf-8")],
    ["workbench-result-metrics.ts", readFileSync(new URL("../components/workbench-result-metrics.ts", import.meta.url), "utf-8")],
    ["workbench-result-model.ts", readFileSync(new URL("../components/workbench-result-model.ts", import.meta.url), "utf-8")],
    ["report-options.ts", readFileSync(new URL("./report-options.ts", import.meta.url), "utf-8")],
  ];

  for (const [fileName, source] of sources) {
    assert.match(source, /modelObjectMemberTerm/u, `${fileName} 应从共享词表取得成员术语`);
    assert.doesNotMatch(source, /(?:最大|控制|查看|中的|与|tooltipXLabel:\s*")(?:(?:构件)|(?:杆件))/u, `${fileName} 不应在结果文案中硬编码成员术语`);
  }
});

test("荷载编辑器成员和荷载标签从共享模型对象词表派生", () => {
  const sources = [
    ["FrameLoadEditor.tsx", readFileSync(new URL("../components/FrameLoadEditor.tsx", import.meta.url), "utf-8")],
    ["TrussLoadEditor.tsx", readFileSync(new URL("../components/TrussLoadEditor.tsx", import.meta.url), "utf-8")],
    ["truss-editor-model.ts", readFileSync(new URL("./truss-editor-model.ts", import.meta.url), "utf-8")],
  ];

  for (const [fileName, source] of sources) {
    assert.match(source, /modelObject(?:MemberTerm|LoadLabel)/u, `${fileName} 应从共享词表取得荷载作用对象术语`);
    assert.doesNotMatch(source, /作用(?:构件|杆件)|(?:构件|杆件)荷载/u, `${fileName} 不应硬编码荷载作用对象术语`);
  }
});
