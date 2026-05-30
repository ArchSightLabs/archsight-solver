import assert from "node:assert/strict";
import test from "node:test";
import {
  addAnalysisObjectToProject,
  createAnalysisObject,
  createDefaultSolverProject,
  createWorkspaceFromProject,
  getAnalysisObjectDisplayName,
  getActiveAnalysisObject,
  normalizeSolverProject,
  removeAnalysisObjectFromProject,
  updateActiveAnalysisObjectWorkspace,
} from "./solver-project.ts";
import { MAX_BEAM_SPANS, MAX_FRAME_MEMBERS, MAX_FRAME_NODES, MAX_TRUSS_MEMBERS, MAX_TRUSS_NODES } from "./solver-limits.ts";
import { normalizeBeamWorkspaceState, normalizeFrameWorkspaceState, normalizeTrussWorkspaceState } from "./workspace-state.ts";

test("默认求解器项目包含三类分析对象并激活梁系", () => {
  const project = createDefaultSolverProject(new Date("2026-05-21T12:00:00.000Z"));
  assert.equal(project.objects.length, 3);
  assert.deepEqual(project.objects.map((object) => object.type), ["beam", "frame", "truss"]);
  assert.deepEqual(project.objects.map((object) => object.name), ["梁系-1", "平面框架-1", "平面桁架-1"]);
  assert.equal(project.activeObjectId, project.objects[0].id);
  assert.equal(getActiveAnalysisObject(project).name, "梁系-1");
  assert.equal(project.settings.projectInfo.name, "新建结构分析项目");
  assert.equal(project.settings.modelPreviewStyle, "color");
  assert.equal(project.settings.reportExportOptions.template, "standard");
});

test("项目级建模图显示样式兼容旧梁系设置字段", () => {
  const project = createDefaultSolverProject(new Date("2026-05-21T12:00:00.000Z"));
  const normalized = normalizeSolverProject({
    ...project,
    settings: {
      ...project.settings,
      modelPreviewStyle: undefined,
      beamPreviewStyle: "simple",
    },
  });

  assert.equal(normalized.settings.modelPreviewStyle, "simple");
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
  assert.equal(getActiveAnalysisObject(project).name, "梁系-1");
});

test("可创建不同类型的独立分析对象", () => {
  assert.equal(createAnalysisObject("beam", "").name, "梁系-1");
  assert.equal(createAnalysisObject("frame", "").name, "平面框架-1");
  assert.equal(createAnalysisObject("truss", "").name, "平面桁架-1");
});

test("添加分析对象后自动激活新对象并保留原对象", () => {
  const project = createDefaultSolverProject();
  const next = addAnalysisObjectToProject(project, "frame", "A轴框架");
  assert.equal(next.objects.length, 4);
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
  assert.equal(next.objects.find((object) => object.type === "beam")?.name, "梁系-1");
});

test("删除活动对象后切换到剩余对象，单对象项目不删除", () => {
  const project = addAnalysisObjectToProject(createDefaultSolverProject(), "truss", "屋架方案");
  const removed = removeAnalysisObjectFromProject(project, project.activeObjectId);
  assert.equal(removed.objects.length, 3);
  assert.equal(getActiveAnalysisObject(removed).type, "beam");

  const singleObjectProject = normalizeSolverProject({
    ...removed,
    activeObjectId: removed.objects[0].id,
    objects: [removed.objects[0]],
  });
  const unchanged = removeAnalysisObjectFromProject(singleObjectProject, singleObjectProject.activeObjectId);
  assert.equal(unchanged.objects.length, 1);
  assert.equal(unchanged.activeObjectId, singleObjectProject.activeObjectId);
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

test("公开验证算例展示名自动补两位连续编号", () => {
  const object = {
    ...createAnalysisObject("truss", "Warren 型屋架"),
    benchmark: {
      caseId: "truss-warren-roof",
      category: "truss",
      title: "Warren 型屋架",
      purpose: "验证桁架杆件轴力。",
      sourceType: "internal-regression",
      sourceLabel: "内部回归算例",
      reference: "",
      method: "",
      sourceLinks: [],
      checkedMetrics: ["最大杆件轴力"],
      metricSummary: "最大杆件轴力 43.33 kN",
      expectedSummary: "标准值：最大杆件轴力 43.33 kN",
      toleranceSummary: "容许误差：杆件轴力容差 0.02 kN",
      expected: { maxAxialForceKn: 43.33 },
      tolerances: { memberAxialForceKn: 0.02 },
    },
  };

  assert.equal(getAnalysisObjectDisplayName(object, 3), "04 Warren 型屋架");
  assert.equal(getAnalysisObjectDisplayName({ ...object, name: "04 Warren 型屋架" }, 3), "04 Warren 型屋架");
});

test("规范化梁工作台时保留超过 64 跨的连续梁模型", () => {
  const spans = Array.from({ length: 72 }, () => ({
    length: 4,
    E: 210,
    I: 6000,
    materialId: "q345",
  }));

  const normalized = normalizeBeamWorkspaceState({ spans });

  assert.equal(normalized.spans.length, 72);
});

test("规范化梁工作台时按显式上限截断超大跨段模型", () => {
  const spans = Array.from({ length: MAX_BEAM_SPANS + 12 }, (_, index) => ({
    length: 3 + (index % 4) * 0.5,
    E: 210,
    I: 6000,
    materialId: "q345",
  }));

  const normalized = normalizeBeamWorkspaceState({ spans });

  assert.equal(normalized.spans.length, MAX_BEAM_SPANS);
  assert.equal(normalized.spans.at(-1)?.length, spans[MAX_BEAM_SPANS - 1].length);
});

test("规范化框架工作台时保留超过 60 根自定义构件", () => {
  const customNodes = Array.from({ length: 72 }, (_, index) => ({
    id: `N${index + 1}`,
    x: index,
    y: index % 2 === 0 ? 0 : 3,
    supportType: index < 2 ? "fixed" as const : "free" as const,
  }));
  const customMembers = Array.from({ length: 72 }, (_, index) => ({
    id: `M${index + 1}`,
    start: `N${index + 1}`,
    end: `N${index + 2 > customNodes.length ? customNodes.length : index + 2}`,
    E_GPa: 210,
    A_cm2: 120,
    I_cm4: 8000,
    kind: "generic",
  }));

  const normalized = normalizeFrameWorkspaceState({
    frameMode: "custom",
    customNodes,
    customMembers,
    customLoads: [],
  });

  assert.equal(normalized.customNodes.length, 72);
  assert.equal(normalized.customMembers.length, 72);
  assert.equal(normalized.customMembers[71].id, "M72");
});

test("规范化桁架工作台时保留超过 60 根自定义杆件", () => {
  const customNodes = Array.from({ length: 72 }, (_, index) => ({
    id: `N${index + 1}`,
    x: index,
    y: index % 2 === 0 ? 0 : 3,
    supportType: index === 0 ? "pinned" as const : index === 1 ? "roller" as const : "free" as const,
  }));
  const customMembers = Array.from({ length: 72 }, (_, index) => ({
    id: `M${index + 1}`,
    start: `N${index + 1}`,
    end: `N${index + 2 > customNodes.length ? customNodes.length : index + 2}`,
    E_GPa: 210,
    A_cm2: 24,
    kind: "generic",
  }));

  const normalized = normalizeTrussWorkspaceState({
    customNodes,
    customMembers,
    customLoads: [],
  });

  assert.equal(normalized.customNodes.length, 72);
  assert.equal(normalized.customMembers.length, 72);
  assert.equal(normalized.customMembers[71].id, "M72");
});

test("规范化桁架工作台时将旧 fixed 支座映射为铰支座", () => {
  const normalized = normalizeTrussWorkspaceState({
    customNodes: [
      { id: "N1", x: 0, y: 0, supportType: "fixed" },
      { id: "N2", x: 4, y: 0, supportType: "roller" },
    ],
    customMembers: [
      { id: "M1", start: "N1", end: "N2", E_GPa: 210, A_cm2: 24, kind: "generic" },
    ],
    customLoads: [],
  });

  assert.equal(normalized.customNodes[0].supportType, "pinned");
  assert.equal(normalized.customNodes[1].supportType, "roller");
});

test("规范化框架工作台时按显式上限截断超大模型", () => {
  const customNodes = Array.from({ length: MAX_FRAME_NODES + 12 }, (_, index) => ({
    id: `N${index + 1}`,
    x: index,
    y: index % 2 === 0 ? 0 : 3,
    supportType: index < 2 ? "fixed" as const : "free" as const,
  }));
  const customMembers = Array.from({ length: MAX_FRAME_MEMBERS + 12 }, (_, index) => {
    const startIndex = (index % MAX_FRAME_NODES) + 1;
    const endIndex = (startIndex % MAX_FRAME_NODES) + 1;
    return {
      id: `M${index + 1}`,
      start: `N${startIndex}`,
      end: `N${endIndex}`,
      E_GPa: 210,
      A_cm2: 120,
      I_cm4: 8000,
      kind: "generic",
    };
  });

  const normalized = normalizeFrameWorkspaceState({
    frameMode: "custom",
    customNodes,
    customMembers,
    customLoads: [],
  });

  assert.equal(normalized.customNodes.length, MAX_FRAME_NODES);
  assert.equal(normalized.customMembers.length, MAX_FRAME_MEMBERS);
  assert.equal(normalized.customNodes.at(-1)?.id, `N${MAX_FRAME_NODES}`);
  assert.equal(normalized.customMembers.at(-1)?.id, `M${MAX_FRAME_MEMBERS}`);
});

test("规范化桁架工作台时按显式上限截断超大模型", () => {
  const customNodes = Array.from({ length: MAX_TRUSS_NODES + 12 }, (_, index) => ({
    id: `N${index + 1}`,
    x: index,
    y: index % 2 === 0 ? 0 : 3,
    supportType: index === 0 ? "pinned" as const : index === 1 ? "roller" as const : "free" as const,
  }));
  const customMembers = Array.from({ length: MAX_TRUSS_MEMBERS + 12 }, (_, index) => {
    const startIndex = (index % MAX_TRUSS_NODES) + 1;
    const endIndex = (startIndex % MAX_TRUSS_NODES) + 1;
    return {
      id: `M${index + 1}`,
      start: `N${startIndex}`,
      end: `N${endIndex}`,
      E_GPa: 210,
      A_cm2: 24,
      kind: "generic",
    };
  });

  const normalized = normalizeTrussWorkspaceState({
    customNodes,
    customMembers,
    customLoads: [],
  });

  assert.equal(normalized.customNodes.length, MAX_TRUSS_NODES);
  assert.equal(normalized.customMembers.length, MAX_TRUSS_MEMBERS);
  assert.equal(normalized.customNodes.at(-1)?.id, `N${MAX_TRUSS_NODES}`);
  assert.equal(normalized.customMembers.at(-1)?.id, `M${MAX_TRUSS_MEMBERS}`);
});
