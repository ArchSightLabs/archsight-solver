import assert from "node:assert/strict";
import test from "node:test";
import {
  ARCHSIGHT_SOLVER_LEGACY_PROJECT_EXTENSIONS,
  ARCHSIGHT_SOLVER_PROJECT_EXTENSION,
  ARCHSIGHT_SOLVER_PROJECT_SCHEMA,
  createArchSightSolverProjectFile,
  getArchSightSolverProjectFileName,
  normalizeArchSightSolverProjectFileName,
  parseArchSightSolverProjectFile,
  serializeArchSightSolverProjectFile,
} from "./project-file.ts";
import { addAnalysisObjectToProject, createDefaultSolverProject } from "./solver-project.ts";
import type { FrameWorkspaceState } from "../types/structure.ts";

test("创建 ArchSight Solver 项目文件时写入专属 schema 和 .slv 文件名", () => {
  const project = createDefaultSolverProject(new Date("2026-05-21T12:00:00.000Z"));
  project.name = "门式刚架: 方案 A";
  project.settings.projectInfo.name = "门式刚架: 方案 A";

  const projectFile = createArchSightSolverProjectFile(project, new Date("2026-05-21T12:00:00.000Z"));

  assert.equal(projectFile.schema, ARCHSIGHT_SOLVER_PROJECT_SCHEMA);
  assert.equal(projectFile.product, "archsight-solver");
  assert.equal(projectFile.schemaVersion, "2.0.0");
  assert.equal(projectFile.project.name, "门式刚架: 方案 A");
  assert.equal(projectFile.project.objects.length, 3);
  assert.deepEqual(projectFile.project.objects.map((object) => object.type), ["beam", "truss", "frame"]);
  assert.equal(ARCHSIGHT_SOLVER_PROJECT_EXTENSION, ".slv");
  assert.deepEqual([...ARCHSIGHT_SOLVER_LEGACY_PROJECT_EXTENSIONS], [".aslv.json", ".json"]);
  assert.equal(getArchSightSolverProjectFileName(project), `门式刚架- 方案 A${ARCHSIGHT_SOLVER_PROJECT_EXTENSION}`);
});

test("规范化工程文件名时保留新版和旧版兼容后缀", () => {
  assert.equal(normalizeArchSightSolverProjectFileName("门式刚架"), "门式刚架.slv");
  assert.equal(normalizeArchSightSolverProjectFileName("门式刚架.slv"), "门式刚架.slv");
  assert.equal(normalizeArchSightSolverProjectFileName("门式刚架.aslv.json"), "门式刚架.aslv.json");
  assert.equal(normalizeArchSightSolverProjectFileName("门式刚架.json"), "门式刚架.json");
});

test("序列化后的项目文件可以恢复为规范化工作台状态", () => {
  let project = createDefaultSolverProject();
  project = addAnalysisObjectToProject(project, "truss", "屋架复核");
  project.name = "结构复核";
  project.settings.projectInfo = {
    name: "结构复核",
    address: "上海市浦东新区",
    projectType: "公共建筑",
    scale: "地上 5 层，建筑面积 12000 m2",
    projectManager: "张工",
    constructionUnit: "施工总承包单位",
    developerUnit: "建设单位",
    supervisionUnit: "监理单位",
  };
  project.settings.reportExportOptions = {
    template: "complete",
    figureMode: "both",
    figureScope: "all",
  };

  const raw = serializeArchSightSolverProjectFile(createArchSightSolverProjectFile(project));
  const parsed = parseArchSightSolverProjectFile(raw);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value?.project.name, "结构复核");
  assert.equal(parsed.value?.project.settings.projectInfo.address, "上海市浦东新区");
  assert.equal(parsed.value?.project.settings.projectInfo.projectManager, "张工");
  assert.equal(parsed.value?.project.settings.reportExportOptions.figureScope, "all");
  assert.equal(parsed.value?.project.objects.length, 4);
  assert.ok(parsed.value?.project.objects.some((object) => object.type === "truss" && object.name === "屋架复核"));
});

test("项目文件往返保留框架荷载组合标签", () => {
  let project = createDefaultSolverProject();
  project = addAnalysisObjectToProject(project, "frame", "组合标签复核");
  const frameObject = project.objects.find((object) => object.name === "组合标签复核");
  assert.ok(frameObject);
  const frameState = frameObject.state as FrameWorkspaceState;
  frameObject.state = {
    ...frameState,
    frameMode: "custom",
    customLoadCases: [{ id: " DL ", title: "恒载", loads: [{ type: "nodal", node: "N4", fxKn: 0, fyKn: -10, mzKnM: 0 }] }],
    customLoadCombinations: [{ id: " ULS1 ", title: "基本组合", factors: { " DL ": 1.2 }, tags: [" ULS ", "包络", "ULS", ""] }],
  };

  const raw = serializeArchSightSolverProjectFile(createArchSightSolverProjectFile(project));
  const parsed = parseArchSightSolverProjectFile(raw);

  assert.equal(parsed.ok, true);
  const restoredFrame = parsed.value?.project.objects.find((object) => object.name === "组合标签复核");
  assert.ok(restoredFrame);
  assert.deepEqual((restoredFrame.state as { customLoadCombinations: Array<{ tags?: string[] }> }).customLoadCombinations[0].tags, ["ULS", "包络"]);
});

test("解析项目文件时拒绝非 ArchSight Solver schema", () => {
  const parsed = parseArchSightSolverProjectFile(JSON.stringify({
    schema: "archsight-graphics.project",
    schemaVersion: "1.0.0",
    product: "archsight-graphics",
    workspace: {},
  }));

  assert.equal(parsed.ok, false);
  assert.equal(parsed.error, "文件 schema 不是 archsight-solver.project。");
});
