import assert from "node:assert/strict";
import test from "node:test";
import {
  addAnalysisObjectToProject,
  createAnalysisObject,
  createDefaultSolverProject,
  createWorkspaceFromProject,
  getActiveAnalysisObject,
  normalizeSolverProject,
  removeAnalysisObjectFromProject,
  updateActiveAnalysisObjectWorkspace,
} from "./solver-project.ts";

test("默认求解器项目包含一个梁系分析对象", () => {
  const project = createDefaultSolverProject(new Date("2026-05-21T12:00:00.000Z"));
  assert.equal(project.objects.length, 1);
  assert.equal(project.objects[0].type, "beam");
  assert.equal(project.activeObjectId, project.objects[0].id);
  assert.equal(getActiveAnalysisObject(project).name, "连续梁-1");
  assert.equal(project.settings.projectInfo.name, "新建结构分析项目");
  assert.equal(project.settings.reportExportOptions.template, "standard");
});

test("新建项目可一次性写入项目级工程信息", () => {
  const project = createDefaultSolverProject({
    name: "某教学楼结构复核",
    address: "上海市浦东新区",
    developerUnit: "建设单位 A",
  });
  assert.equal(project.name, "某教学楼结构复核");
  assert.equal(project.settings.projectInfo.name, "某教学楼结构复核");
  assert.equal(project.settings.projectInfo.address, "上海市浦东新区");
  assert.equal(project.settings.projectInfo.developerUnit, "建设单位 A");
  assert.equal(getActiveAnalysisObject(project).name, "连续梁-1");
});

test("可创建不同类型的独立分析对象", () => {
  assert.equal(createAnalysisObject("beam", "").name, "连续梁-1");
  assert.equal(createAnalysisObject("frame", "").name, "平面框架-1");
  assert.equal(createAnalysisObject("truss", "").name, "平面桁架-1");
});

test("添加分析对象后自动激活新对象并保留原对象", () => {
  const project = createDefaultSolverProject();
  const next = addAnalysisObjectToProject(project, "frame", "A轴框架");
  assert.equal(next.objects.length, 2);
  assert.equal(getActiveAnalysisObject(next).name, "A轴框架");
  assert.equal(next.objects[0].type, "beam");
});

test("更新活动对象工作台状态不会修改其他分析对象", () => {
  const project = addAnalysisObjectToProject(createDefaultSolverProject(), "frame", "A轴框架");
  const workspace = createWorkspaceFromProject(project);
  workspace.frame.span = 9.5;
  const next = updateActiveAnalysisObjectWorkspace(project, workspace);
  assert.equal(getActiveAnalysisObject(next).type, "frame");
  assert.equal(createWorkspaceFromProject(next).frame.span, 9.5);
  assert.equal(next.objects.find((object) => object.type === "beam")?.name, "连续梁-1");
});

test("删除活动对象后切换到剩余对象，单对象项目不删除", () => {
  const project = addAnalysisObjectToProject(createDefaultSolverProject(), "truss", "屋架方案");
  const removed = removeAnalysisObjectFromProject(project, project.activeObjectId);
  assert.equal(removed.objects.length, 1);
  assert.equal(getActiveAnalysisObject(removed).type, "beam");

  const unchanged = removeAnalysisObjectFromProject(removed, removed.activeObjectId);
  assert.equal(unchanged.objects.length, 1);
  assert.equal(unchanged.activeObjectId, removed.activeObjectId);
});

test("规范化项目时保留公开验证算例元数据", () => {
  const project = createDefaultSolverProject(new Date("2026-05-21T12:00:00.000Z"));
  const normalized = normalizeSolverProject({
    ...project,
    objects: [
      {
        ...project.objects[0],
        benchmark: {
          caseId: "beam-simply-supported-uniform",
          category: "beam",
          title: "简支梁均布荷载",
          purpose: "验证基础梁系求解。",
          sourceType: "textbook-analytical",
          sourceLabel: "教材解析解",
          reference: "delta_max = 5qL^4/(384EI)",
          method: "按最大挠度校核",
          sourceLinks: ["https://example.com/reference"],
          checkedMetrics: ["最大挠度"],
          metricSummary: "最大挠度 1.1565 mm",
          expected: { maxDeflectionMm: 1.1565 },
          tolerances: { maxDeflectionMm: 0.01 },
        },
      },
    ],
  });

  assert.equal(normalized.objects[0].benchmark?.caseId, "beam-simply-supported-uniform");
  assert.equal(normalized.objects[0].benchmark?.sourceLabel, "教材解析解");
  assert.deepEqual(normalized.objects[0].benchmark?.checkedMetrics, ["最大挠度"]);
});
