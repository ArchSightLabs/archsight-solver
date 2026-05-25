import assert from "node:assert/strict";
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

test("内置梁系典型案例可导入并构造求解载荷", () => {
  assert.ok(BEAM_MODEL_TEMPLATES.length >= 4);

  for (const template of BEAM_MODEL_TEMPLATES) {
    assert.ok(template.state.spans.length >= 1, `${template.title} 应包含跨段`);

    const workspace = applyBeamModelTemplate(createDefaultBeamWorkspaceState(), template);
    assert.equal(workspace.projectName, template.state.projectName);
    assert.equal(workspace.compareEnabled, false);

    const payload = buildBeamPayload(workspace);
    assert.equal(payload.analysisType, "beam");
    assert.equal(payload.spans.length, template.state.spans.length);
  }
});

test("默认连续梁工作区包含中间支座", () => {
  const workspace = createDefaultBeamWorkspaceState();

  assert.equal(workspace.beamType, "continuous");
  assert.equal(workspace.spans.length, 2);
  assert.equal(workspace.supports.length, 3);
  assert.equal(workspace.supports[1].x, workspace.spans[0].length);
});

test("内置框架典型案例提供可计算的显式模型", () => {
  assert.ok(FRAME_MODEL_TEMPLATES.length >= 4);

  for (const template of FRAME_MODEL_TEMPLATES) {
    assert.ok(template.nodes.length >= 2, `${template.title} 应包含节点`);
    assert.ok(template.members.length >= 1, `${template.title} 应包含构件`);
    assert.ok(template.loads.length >= 1, `${template.title} 应包含荷载`);

    const workspace = applyFrameModelTemplate(createDefaultFrameWorkspaceState(), template);
    assert.equal(workspace.frameMode, "custom");
    assert.equal(validateCustomFrameWorkspace(workspace), null);

    const payload = buildFramePayload(workspace);
    assert.ok(payload);
    assert.equal(payload.structure.template, "explicit");
    assert.equal(payload.structure.nodes.length, template.nodes.length);
  }
});

test("内置桁架典型案例提供可计算的显式模型", () => {
  assert.ok(TRUSS_MODEL_TEMPLATES.length >= 4);

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
