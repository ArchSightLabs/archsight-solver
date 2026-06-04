import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildBeamPayload, buildFramePayload, buildTrussPayload, validateCustomFrameWorkspace, validateCustomTrussWorkspace } from "../solver-payload.ts";
import {
  BEAM_MODEL_TEMPLATES,
  FRAME_MODEL_TEMPLATES,
  TRUSS_MODEL_TEMPLATES,
  applyBeamModelTemplate,
  applyFrameModelTemplate,
  applyTrussModelTemplate,
} from "./workbench-model-templates.ts";
import { createDefaultBeamWorkspaceState, createDefaultFrameWorkspaceState, createDefaultTrussWorkspaceState } from "./workspace-state.ts";

interface TemplateBenchmarkMap {
  templates: {
    module: "beam" | "frame" | "truss";
    templateId: string;
    templateTitle: string;
    validationRefs: { caseId: string; relation: string; note: string }[];
  }[];
}

const TEMPLATE_BENCHMARK_MAP = JSON.parse(
  readFileSync(new URL("../../../data/verification/template_benchmark_map.json", import.meta.url), "utf-8")
) as TemplateBenchmarkMap;
const TEMPLATE_SOURCE = readFileSync(new URL("./workbench-model-templates.ts", import.meta.url), "utf-8");

test("内置梁系典型案例可导入并构造求解载荷", () => {
  assert.ok(BEAM_MODEL_TEMPLATES.length >= 8);

  for (const template of BEAM_MODEL_TEMPLATES) {
    assert.ok(template.state.spans.length >= 1, `${template.title} 应包含跨段`);
    assert.doesNotMatch(template.title, /^\d{2}\s/u, `${template.title} 不应把列表编号写入模板名称`);

    const workspace = applyBeamModelTemplate(createDefaultBeamWorkspaceState(), template);
    assert.equal(workspace.projectName, template.state.projectName);
    assert.equal(workspace.compareEnabled, false);

    const payload = buildBeamPayload(workspace);
    assert.equal(payload.analysisType, "beam");
    assert.equal(payload.spans.length, template.state.spans.length);
  }
});

test("梁系公共模板覆盖公开验证课程中的通用工况", () => {
  assert.deepEqual(BEAM_MODEL_TEMPLATES.map((template) => template.id), [
    "simple-span-uniform",
    "simple-span-center-point",
    "cantilever-uniform",
    "cantilever-tip-load",
    "two-span-continuous",
    "three-span-continuous-uniform",
    "three-span-linear",
    "unequal-span-continuous-point",
    "fixed-fixed-uniform",
    "propped-cantilever-point",
  ]);

  const byId = new Map(BEAM_MODEL_TEMPLATES.map((template) => [template.id, template]));
  assert.equal(byId.get("simple-span-center-point")?.state.loadType, "point");
  assert.equal(byId.get("cantilever-uniform")?.state.loadType, "uniform");
  assert.equal(byId.get("three-span-continuous-uniform")?.state.spans.length, 3);
  assert.equal(byId.get("unequal-span-continuous-point")?.state.spans.length, 3);
  assert.doesNotMatch(BEAM_MODEL_TEMPLATES.map((template) => template.title).join("，"), /\b(?:4|6|8)m\b/iu);
});

test("内置模板均标注公开验证集映射", () => {
  const templates = [
    ...BEAM_MODEL_TEMPLATES.map((template) => ({ module: "beam", template })),
    ...FRAME_MODEL_TEMPLATES.map((template) => ({ module: "frame", template })),
    ...TRUSS_MODEL_TEMPLATES.map((template) => ({ module: "truss", template })),
  ];
  const templateKeys = new Set(templates.map(({ module, template }) => `${module}:${template.id}`));
  const mappingByTemplate = new Map(TEMPLATE_BENCHMARK_MAP.templates.map((item) => [`${item.module}:${item.templateId}`, item]));

  for (const { module, template } of templates) {
    assert.ok(template.validationRefs.length >= 1, `${template.id} 应标注 benchmark 映射`);
    for (const ref of template.validationRefs) {
      assert.ok(ref.caseId.trim(), `${template.id} 的 benchmark caseId 不能为空`);
      assert.equal(ref.relation, "对应", `${template.id} 应绑定直接 benchmark，不应只标注相近或相关案例`);
      assert.ok(ref.note.trim(), `${template.id} 的映射说明不能为空`);
    }
    const mapped = mappingByTemplate.get(`${module}:${template.id}`);
    assert.ok(mapped, `${template.id} 应写入 docs/verification 的模板映射事实源`);
    assert.equal(mapped.templateTitle, template.title, `${template.id} 的 benchmark 映射标题应与模板标题一致`);
    assert.deepEqual(
      template.validationRefs.map((ref) => ref.caseId),
      mapped.validationRefs.map((ref) => ref.caseId)
    );
  }
  assert.deepEqual(new Set(mappingByTemplate.keys()), templateKeys);
});

test("内置模板的 benchmark 引用只从数据事实源注入", () => {
  assert.match(TEMPLATE_SOURCE, /template_benchmark_map\.json/u);
  assert.doesNotMatch(TEMPLATE_SOURCE, /caseId:\s*["']/u);
  assert.doesNotMatch(TEMPLATE_SOURCE, /validationRefs:\s*\[/u);
});

test("内置模板描述的成员术语从共享模型对象词表派生", () => {
  assert.match(TEMPLATE_SOURCE, /modelObjectMemberTerm/u);
  assert.doesNotMatch(TEMPLATE_SOURCE, /斜撑构件|拉压杆件/u);
});

test("默认连续梁工作区包含中间支座", () => {
  const workspace = createDefaultBeamWorkspaceState();

  assert.equal(workspace.beamType, "continuous");
  assert.equal(workspace.spans.length, 2);
  assert.equal(workspace.supports.length, 3);
  assert.equal(workspace.supports[1].x, workspace.spans[0].length);
});

test("内置框架典型案例提供可计算的显式模型", () => {
  assert.ok(FRAME_MODEL_TEMPLATES.length >= 7);

  for (const template of FRAME_MODEL_TEMPLATES) {
    assert.ok(template.nodes.length >= 2, `${template.title} 应包含节点`);
    assert.ok(template.members.length >= 1, `${template.title} 应包含构件`);
    assert.ok(template.loads.length >= 1, `${template.title} 应包含荷载`);
    assert.doesNotMatch(template.title, /^\d{2}\s/u, `${template.title} 不应把列表编号写入模板名称`);

    const workspace = applyFrameModelTemplate(createDefaultFrameWorkspaceState(), template);
    assert.equal(workspace.frameMode, "custom");
    assert.equal(validateCustomFrameWorkspace(workspace), null);

    const payload = buildFramePayload(workspace);
    assert.ok(payload);
    assert.equal(payload.structure.template, "explicit");
    assert.equal(payload.structure.nodes.length, template.nodes.length);
  }
});

test("平面框架公共模板覆盖公开验证课程中的通用工况", () => {
  assert.deepEqual(FRAME_MODEL_TEMPLATES.map((template) => template.id), [
    "portal-single-bay",
    "portal-rotational-spring",
    "frame-two-bay",
    "frame-two-story",
    "braced-frame",
    "inclined-member-local-load",
    "frame-member-point-load",
    "gable-frame",
  ]);

  const byId = new Map(FRAME_MODEL_TEMPLATES.map((template) => [template.id, template]));
  assert.ok(byId.get("portal-rotational-spring")?.nodes.some((node) => node.springs?.some((spring) => spring.dof === "rz")));
  assert.ok(byId.get("inclined-member-local-load")?.loads.every((load) => load.type === "distributed" && load.direction === "local_y"));
  assert.ok(byId.get("frame-member-point-load")?.loads.some((load) => load.type === "member_point"));
  assert.doesNotMatch(FRAME_MODEL_TEMPLATES.map((template) => template.title).join("，"), /退化梁|简支梁|悬臂梁/u);
});

test("内置桁架典型案例提供可计算的显式模型", () => {
  assert.deepEqual(TRUSS_MODEL_TEMPLATES.map((template) => template.id), [
    "simple-roof-truss",
    "pratt-truss",
    "warren-truss",
    "howe-roof-truss",
    "cantilever-truss",
    "parallel-chord-truss",
  ]);

  for (const template of TRUSS_MODEL_TEMPLATES) {
    assert.ok(template.nodes.length >= 2, `${template.title} 应包含节点`);
    assert.ok(template.members.length >= 1, `${template.title} 应包含杆件`);
    assert.ok(template.loads.length >= 1, `${template.title} 应包含荷载`);

    const workspace = applyTrussModelTemplate(createDefaultTrussWorkspaceState(), template);
    assert.equal(validateCustomTrussWorkspace(workspace), null);

    const payload = buildTrussPayload(workspace);
    assert.ok(payload);
    assert.equal(payload.structure.template, "explicit");
    assert.equal(payload.structure.members.length, template.members.length);
  }
});

test("悬臂桁架典型案例使用双节点铰约束形成稳定左端边界", () => {
  const template = TRUSS_MODEL_TEMPLATES.find((item) => item.id === "cantilever-truss");
  assert.ok(template);
  const leftBoundary = template.nodes.filter((node) => node.x === 0);
  assert.equal(leftBoundary.length, 2);
  assert.equal(leftBoundary.filter((node) => node.supportType === "pinned").length, 2);
});
