import assert from "node:assert/strict";
import test from "node:test";
import { addAnalysisObjectToProject, createDefaultSolverProject } from "./solver-project.ts";
import { buildProjectContractSummary } from "./project-health.ts";

test("项目契约摘要暴露文件契约、对象分布和宿主托管状态", () => {
  let project = createDefaultSolverProject();
  project = addAnalysisObjectToProject(project, "truss", "屋架复核");
  project.activeObjectId = project.objects.find((item) => item.name === "屋架复核")?.id ?? project.activeObjectId;

  const summary = buildProjectContractSummary(project, new Date("2026-07-04T00:00:00.000Z"));

  assert.equal(summary.healthStatus, "ready");
  assert.equal(summary.schema, "archsight-solver.project");
  assert.equal(summary.schemaVersion, "2.0.0");
  assert.equal(summary.projectFileKind, "single-json");
  assert.equal(summary.asmsJsonSchemaVersion, "2026-05-30");
  assert.equal(summary.objectCount, 4);
  assert.equal(summary.objectTypeCounts.beam, 1);
  assert.equal(summary.objectTypeCounts.truss, 2);
  assert.equal(summary.objectTypeCounts.frame, 1);
  assert.equal(summary.activeObject?.name, "屋架复核");
  assert.equal(summary.hostReadiness.canHostPersist, true);
  assert.equal(summary.hostReadiness.canUseSingleJson, true);
  assert.equal(summary.hostReadiness.requiresMigration, false);
});
