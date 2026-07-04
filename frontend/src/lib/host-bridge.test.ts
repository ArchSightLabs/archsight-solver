import test from "node:test";
import assert from "node:assert/strict";
import {
  HOST_LAUNCH_MESSAGE,
  SOLVER_PROJECT_CHANGED_MESSAGE,
  SOLVER_READY_MESSAGE,
  buildProjectChangedMessage,
  buildSolverReadyMessage,
  isHostOriginAllowed,
  normalizeHostOriginList,
  parseHostLaunchMessage,
} from "./host-bridge.ts";
import { createArchSightSolverProjectFile } from "./project-file.ts";
import { createDefaultSolverProject } from "./solver-project.ts";

test("parseHostLaunchMessage accepts a neutral host project document", () => {
  const project = createDefaultSolverProject(new Date("2026-07-04T00:00:00.000Z"));
  const projectFile = createArchSightSolverProjectFile(project, new Date("2026-07-04T00:01:00.000Z"));

  const launch = parseHostLaunchMessage({
    type: HOST_LAUNCH_MESSAGE,
    sessionId: "session-1",
    payload: {
      mode: "readonly",
      fileName: "demo.slv",
      projectDocument: projectFile,
    },
  });

  assert.equal(launch?.sessionId, "session-1");
  assert.equal(launch?.mode, "readonly");
  assert.equal(launch?.fileName, "demo.slv");
  assert.equal(launch?.projectFile.project.name, project.name);
});

test("host bridge emits ready and changed messages without platform concepts", () => {
  const project = createDefaultSolverProject(new Date("2026-07-04T00:00:00.000Z"));
  const ready = buildSolverReadyMessage("session-1");
  const changed = buildProjectChangedMessage("session-1", project);

  assert.equal(ready.type, SOLVER_READY_MESSAGE);
  assert.equal(changed.type, SOLVER_PROJECT_CHANGED_MESSAGE);
  assert.equal(changed.sessionId, "session-1");
  assert.equal((changed.payload as { projectDocument: { schema: string } }).projectDocument.schema, "archsight-solver.project");
  assert.equal(JSON.stringify(changed).includes("tenant"), false);
  assert.equal(JSON.stringify(changed).includes("license"), false);
});

test("host origin helpers support allowlist checks without platform concepts", () => {
  const origins = normalizeHostOriginList("https://lms.example.edu, https://portal.example.edu");

  assert.deepEqual(origins, ["https://lms.example.edu", "https://portal.example.edu"]);
  assert.equal(isHostOriginAllowed("https://lms.example.edu", origins), true);
  assert.equal(isHostOriginAllowed("https://evil.example.edu", origins), false);
  assert.equal(isHostOriginAllowed("https://any.example.edu", []), true);
});
