import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ARCHSIGHT_SOLVER_ASMS_SCHEMA_VERSION,
  ARCHSIGHT_SOLVER_LEGACY_PROJECT_EXTENSIONS,
  ARCHSIGHT_SOLVER_PROJECT_EXTENSION,
  ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION,
  ARCHSIGHT_SOLVER_PROJECT_SCHEMA,
  createArchSightSolverProjectFile,
  getArchSightSolverProjectFileName,
  normalizeArchSightSolverProjectFileName,
  parseArchSightSolverProjectFile,
  serializeArchSightSolverProjectFile,
} from "./project-file.ts";
import { APP_VERSION } from "./app-metadata.ts";
import { addAnalysisObjectToProject, createDefaultSolverProject } from "./solver-project.ts";
import type { FrameWorkspaceState } from "../types/structure.ts";
import { createResultProvenance } from "./result-provenance.ts";

test("创建 ArchSight Solver 项目文件时写入专属 schema 和 .slv 文件名", () => {
  const project = createDefaultSolverProject(new Date("2026-05-21T12:00:00.000Z"));
  project.name = "门式刚架: 方案 A";
  project.settings.projectInfo.name = "门式刚架: 方案 A";

  const projectFile = createArchSightSolverProjectFile(project, new Date("2026-05-21T12:00:00.000Z"));

  assert.equal(projectFile.schema, ARCHSIGHT_SOLVER_PROJECT_SCHEMA);
  assert.equal(projectFile.product, "archsight-solver");
  assert.equal(projectFile.appVersion, APP_VERSION);
  assert.equal(projectFile.schemaVersion, "2.0.0");
  assert.equal(projectFile.contract.asmsJsonSchemaVersion, ARCHSIGHT_SOLVER_ASMS_SCHEMA_VERSION);
  assert.equal(projectFile.contract.projectFileSchemaVersion, ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION);
  assert.equal(projectFile.contract.modelRoundTrip, "normalized");
  assert.equal(projectFile.manifest.manifestVersion, "1.0.0");
  assert.equal(projectFile.manifest.projectFileKind, "single-json");
  assert.equal(projectFile.manifest.contract.asmsJsonSchemaVersion, ARCHSIGHT_SOLVER_ASMS_SCHEMA_VERSION);
  assert.equal(projectFile.manifest.containerCapabilities["single-json"], true);
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
    reviewStatus: "ready_for_review",
  };

  const raw = serializeArchSightSolverProjectFile(createArchSightSolverProjectFile(project));
  const parsed = parseArchSightSolverProjectFile(raw);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value?.project.name, "结构复核");
  assert.equal(parsed.value?.project.settings.projectInfo.address, "上海市浦东新区");
  assert.equal(parsed.value?.project.settings.projectInfo.projectManager, "张工");
  assert.equal(parsed.value?.project.settings.reportExportOptions.figureScope, "all");
  assert.equal(parsed.value?.project.settings.reportExportOptions.reviewStatus, "ready_for_review");
  assert.equal(parsed.value?.project.objects.length, 4);
  assert.ok(parsed.value?.project.objects.some((object) => object.type === "truss" && object.name === "屋架复核"));
});

test("项目文件往返保留计算结果的分析对象、模型签名和工程修订", () => {
  const project = createDefaultSolverProject();
  const object = project.objects[0];
  object.resultProvenance = createResultProvenance({
    analysisObjectId: object.id,
    analysisType: "beam",
    payload: { analysisType: "beam", spans: [4, 4], q: 10 },
    projectRevision: 9,
    solvedAt: "2026-07-19T12:00:00.000Z",
  });

  const parsed = parseArchSightSolverProjectFile(serializeArchSightSolverProjectFile(createArchSightSolverProjectFile(project)));

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value?.project.objects[0].resultProvenance?.analysisObjectId, object.id);
  assert.equal(parsed.value?.project.objects[0].resultProvenance?.projectRevision, 9);
  assert.match(parsed.value?.project.objects[0].resultProvenance?.modelSignature ?? "", /^fnv1a64:/);
});

test("解析旧项目文件时保留迁移诊断并写回当前契约版本", () => {
  const projectFile = createArchSightSolverProjectFile(createDefaultSolverProject());
  const raw = serializeArchSightSolverProjectFile({
    ...projectFile,
    schemaVersion: "1.0.0" as typeof ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION,
    contract: undefined as never,
  });

  const parsed = parseArchSightSolverProjectFile(raw);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value?.schemaVersion, ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION);
  assert.equal(parsed.value?.contract.asmsJsonSchemaVersion, ARCHSIGHT_SOLVER_ASMS_SCHEMA_VERSION);
  assert.equal(parsed.value?.manifest.projectFileKind, "single-json");
  assert.equal(parsed.diagnostics.some((item) => item.code === "PROJECT_FILE_SCHEMA_MIGRATED"), true);
  assert.equal(parsed.diagnostics.some((item) => item.code === "ASMS_SCHEMA_VERSION_RECORDED"), true);
});

test("解析预留容器 manifest 时只识别契约不承诺写入容器", () => {
  const projectFile = createArchSightSolverProjectFile(createDefaultSolverProject());
  const raw = serializeArchSightSolverProjectFile({
    ...projectFile,
    manifest: {
      ...projectFile.manifest,
      projectFileKind: "zip-container",
      containerCapabilities: {
        "single-json": true,
        "zip-container": true,
      },
    },
  });

  const parsed = parseArchSightSolverProjectFile(raw);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value?.manifest.projectFileKind, "zip-container");
  assert.equal(parsed.value?.manifest.containerCapabilities["single-json"], true);
  assert.equal(parsed.value?.manifest.containerCapabilities["zip-container"], false);
});

test("项目文件往返保留工程级自定义材料", () => {
  const project = createDefaultSolverProject();
  project.settings.customMaterials = [
    { id: "timber-c24", name: "C24 结构木材", youngModulus: 11, density: 420, category: "custom" },
  ];

  const raw = serializeArchSightSolverProjectFile(createArchSightSolverProjectFile(project));
  const parsed = parseArchSightSolverProjectFile(raw);

  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value?.project.settings.customMaterials.map((material) => material.id), ["timber-c24"]);
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

test("公开 Host Reference 示例可被前端按当前项目契约解析", () => {
  const raw = readFileSync(new URL("../../../examples/host-iframe-demo/sample-project.slv", import.meta.url), "utf8");
  const parsed = parseArchSightSolverProjectFile(raw);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.value?.project.name, "Host Reference 梁系项目");
  assert.equal(parsed.value?.manifest.projectFileKind, "single-json");
  assert.equal(parsed.value?.project.objects.length, 3);
});
