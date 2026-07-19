import test from "node:test";
import assert from "node:assert/strict";
import {
  HOST_LAUNCH_MESSAGE,
  HOST_REQUEST_SAVE_MESSAGE,
  HOST_SAVE_RESULT_MESSAGE,
  SOLVER_HOST_CAPABILITIES,
  SOLVER_PROJECT_CHANGED_MESSAGE,
  SOLVER_READY_MESSAGE,
  SOLVER_SAVE_REQUEST_MESSAGE,
  buildProjectChangedMessage,
  buildSaveRequestMessage,
  buildSolverReadyMessage,
  isHostOriginAllowed,
  normalizeHostOriginList,
  parseHostLaunchMessage,
  parseHostRequestSaveMessage,
  parseHostSaveResultMessage,
  resolveBootstrapHostOrigin,
} from "./host-bridge.ts";
import { createArchSightSolverProjectFile } from "./project-file.ts";
import { createDefaultSolverProject } from "./solver-project.ts";

test("parseHostLaunchMessage accepts a neutral host project document", () => {
  const project = createDefaultSolverProject(new Date("2026-07-04T00:00:00.000Z"));
  const projectFile = createArchSightSolverProjectFile(project, new Date("2026-07-04T00:01:00.000Z"));

  const launch = parseHostLaunchMessage({
    type: HOST_LAUNCH_MESSAGE,
    protocolVersion: "1.0.0",
    sessionId: "session-1",
    nonce: "nonce-1",
    payload: {
      mode: "readonly",
      fileName: "demo.slv",
      projectDocument: projectFile,
    },
  });

  assert.equal(launch?.sessionId, "session-1");
  assert.equal(launch?.nonce, "nonce-1");
  assert.equal(launch?.mode, "readonly");
  assert.equal(launch?.fileName, "demo.slv");
  assert.equal(launch?.projectFile.project.name, project.name);
});

test("host bridge emits ready and changed messages without platform concepts", () => {
  const project = createDefaultSolverProject(new Date("2026-07-04T00:00:00.000Z"));
  const ready = buildSolverReadyMessage("session-1", "nonce-1");
  const changed = buildProjectChangedMessage("session-1", project, "nonce-1");

  assert.equal(ready.type, SOLVER_READY_MESSAGE);
  assert.equal(ready.nonce, "nonce-1");
  assert.equal(changed.type, SOLVER_PROJECT_CHANGED_MESSAGE);
  assert.equal(changed.sessionId, "session-1");
  assert.equal(changed.nonce, "nonce-1");
  assert.equal((changed.payload as { projectDocument: { schema: string; manifest: { projectFileKind: string } } }).projectDocument.schema, "archsight-solver.project");
  assert.equal((changed.payload as { projectDocument: { manifest: { projectFileKind: string } } }).projectDocument.manifest.projectFileKind, "single-json");
  assert.equal(JSON.stringify(changed).includes("tenant"), false);
  assert.equal(JSON.stringify(changed).includes("license"), false);
  assert.deepEqual((ready.payload as { capabilities: unknown }).capabilities, SOLVER_HOST_CAPABILITIES);
});

test("bound host save commands require exact protocol correlation fields", () => {
  assert.deepEqual(parseHostRequestSaveMessage({
    type: HOST_REQUEST_SAVE_MESSAGE,
    protocolVersion: "1.0.0",
    sessionId: "session-1",
    nonce: "nonce-1",
    payload: { requestId: "request-1" },
  }), { sessionId: "session-1", nonce: "nonce-1", requestId: "request-1" });

  assert.deepEqual(parseHostSaveResultMessage({
    type: HOST_SAVE_RESULT_MESSAGE,
    protocolVersion: "1.0.0",
    sessionId: "session-1",
    nonce: "nonce-1",
    payload: { requestId: "request-1", status: "conflict" },
  }), { sessionId: "session-1", nonce: "nonce-1", requestId: "request-1", status: "conflict" });

  assert.throws(() => parseHostRequestSaveMessage({
    type: HOST_REQUEST_SAVE_MESSAGE,
    protocolVersion: "0.9.0",
    sessionId: "session-1",
    nonce: "nonce-1",
    payload: { requestId: "request-1" },
  }), /协议版本不匹配/u);
  assert.throws(() => parseHostSaveResultMessage({
    type: HOST_SAVE_RESULT_MESSAGE,
    protocolVersion: "1.0.0",
    sessionId: "session-1",
    nonce: "nonce-1",
    payload: { status: "saved" },
  }), /requestId/u);
  assert.throws(() => parseHostSaveResultMessage({
    type: HOST_SAVE_RESULT_MESSAGE,
    protocolVersion: "1.0.0",
    sessionId: "session-1",
    nonce: "nonce-1",
    payload: { requestId: "request-1", status: "unknown" },
  }), /status/u);
});

test("host save request carries a correlation id for stale acknowledgement protection", () => {
  const project = createDefaultSolverProject(new Date("2026-07-04T00:00:00.000Z"));
  const message = buildSaveRequestMessage("session-1", project, "nonce-1", "request-1");

  assert.equal(message.type, SOLVER_SAVE_REQUEST_MESSAGE);
  assert.equal((message.payload as { requestId: string }).requestId, "request-1");
});

test("host origin helpers support allowlist checks without platform concepts", () => {
  const origins = normalizeHostOriginList("https://lms.example.edu, https://portal.example.edu/, *, *.example.edu, https://portal.example.edu/path, null");

  assert.deepEqual(origins, ["https://lms.example.edu", "https://portal.example.edu"]);
  assert.equal(isHostOriginAllowed("https://lms.example.edu", origins, "https://solver.example.cn"), true);
  assert.equal(isHostOriginAllowed("https://evil.example.edu", origins, "https://solver.example.cn"), false);
  assert.equal(isHostOriginAllowed("null", origins, "https://solver.example.cn"), false);
  assert.equal(isHostOriginAllowed("https://solver.example.cn", origins, "https://solver.example.cn"), true);
  assert.equal(isHostOriginAllowed("https://solver.example.cn", [], "https://solver.example.cn"), true);
  assert.equal(resolveBootstrapHostOrigin("https://lms.example.edu/course/1", origins, "https://solver.example.cn"), "https://lms.example.edu");
  assert.equal(resolveBootstrapHostOrigin("https://evil.example.edu/course/1", origins, "https://solver.example.cn"), null);
  assert.equal(resolveBootstrapHostOrigin("", origins, "https://solver.example.cn"), null);
});

test("bootstrap ready omits session binding while session ready includes it", () => {
  const bootstrapReady = buildSolverReadyMessage(null);
  const sessionReady = buildSolverReadyMessage("session-1", "nonce-1");

  assert.equal("sessionId" in bootstrapReady, false);
  assert.equal("nonce" in bootstrapReady, false);
  assert.equal(sessionReady.sessionId, "session-1");
  assert.equal(sessionReady.nonce, "nonce-1");
});

test("host launch rejects missing session binding and protocol drift", () => {
  const project = createDefaultSolverProject(new Date("2026-07-04T00:00:00.000Z"));
  const projectDocument = createArchSightSolverProjectFile(project, new Date("2026-07-04T00:01:00.000Z"));

  assert.throws(() => parseHostLaunchMessage({
    type: HOST_LAUNCH_MESSAGE,
    protocolVersion: "1.0.0",
    payload: { projectDocument },
  }), /sessionId.*nonce/u);

  assert.throws(() => parseHostLaunchMessage({
    type: HOST_LAUNCH_MESSAGE,
    protocolVersion: "2.0.0",
    sessionId: "session-1",
    nonce: "nonce-1",
    payload: { projectDocument },
  }), /协议版本不匹配/u);
});
