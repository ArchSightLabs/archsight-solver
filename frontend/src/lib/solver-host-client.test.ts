import test from "node:test";
import assert from "node:assert/strict";
import {
  SOLVER_HOST_CLIENT_REQUIRED_CAPABILITIES,
  SolverHostClient,
  SolverHostClientError,
  type SolverHostClientMessageEvent,
  type SolverHostClientMessageTarget,
} from "./solver-host-client.ts";
import { SOLVER_HOST_CAPABILITIES } from "./host-bridge.ts";

class FakeMessageTarget implements SolverHostClientMessageTarget {
  private listeners = new Set<(event: SolverHostClientMessageEvent) => void>();

  addEventListener(_type: "message", listener: (event: SolverHostClientMessageEvent) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "message", listener: (event: SolverHostClientMessageEvent) => void) {
    this.listeners.delete(listener);
  }

  emit(event: SolverHostClientMessageEvent) {
    for (const listener of this.listeners) listener(event);
  }
}

function setup(options: { launchTimeoutMs?: number; saveTimeoutMs?: number } = {}) {
  const messageTarget = new FakeMessageTarget();
  const outgoing: Array<{ message: Record<string, unknown>; targetOrigin: string }> = [];
  const solverWindow = {
    postMessage(message: unknown, targetOrigin: string) {
      outgoing.push({ message: message as Record<string, unknown>, targetOrigin });
    },
  };
  let sequence = 0;
  const client = new SolverHostClient({
    getSolverWindow: () => solverWindow,
    messageTarget,
    solverOrigin: "https://solver.example.cn",
    createId: () => `id-${++sequence}`,
    launchTimeoutMs: options.launchTimeoutMs,
    saveTimeoutMs: options.saveTimeoutMs,
  });
  const emit = (data: Record<string, unknown>, source: unknown = solverWindow, origin = "https://solver.example.cn") => {
    messageTarget.emit({ data, origin, source });
  };
  return { client, emit, outgoing, solverWindow };
}

function emitReady(emit: (data: Record<string, unknown>) => void, binding?: { sessionId: string; nonce: string }) {
  emit({
    type: "archsight.solver.ready",
    protocolVersion: "1.0.0",
    ...binding,
    payload: { capabilities: SOLVER_HOST_CLIENT_REQUIRED_CAPABILITIES },
  });
}

async function launchEditable(context: ReturnType<typeof setup>) {
  const promise = context.client.launch({ projectDocument: { schema: "archsight-solver.project" }, mode: "editable" });
  emitReady(context.emit);
  const launch = context.outgoing.at(-1)?.message as { sessionId: string; nonce: string };
  emitReady(context.emit, { sessionId: launch.sessionId, nonce: launch.nonce });
  await promise;
  return { sessionId: launch.sessionId, nonce: launch.nonce };
}

test("Host Client negotiates capabilities and binds launch to the exact solver origin", async () => {
  assert.deepEqual(SOLVER_HOST_CLIENT_REQUIRED_CAPABILITIES, SOLVER_HOST_CAPABILITIES);
  const context = setup();
  const launchPromise = context.client.launch({
    projectDocument: { schema: "archsight-solver.project" },
    mode: "editable",
    fileName: "demo.slv",
  });
  assert.equal(context.outgoing.length, 0);

  context.emit({ type: "archsight.solver.ready", protocolVersion: "1.0.0", payload: { capabilities: {} } }, {});
  assert.equal(context.outgoing.length, 0, "wrong message source must be ignored");
  emitReady(context.emit);
  const launch = context.outgoing.at(-1)!;
  assert.equal(launch.targetOrigin, "https://solver.example.cn");
  assert.equal(launch.message.type, "archsight.solver.host.launch");
  assert.equal(launch.message.protocolVersion, "1.0.0");

  emitReady(context.emit, { sessionId: String(launch.message.sessionId), nonce: String(launch.message.nonce) });
  await launchPromise;
  assert.equal(context.client.snapshot.phase, "active-editable");
  assert.equal(context.client.snapshot.sessionId, launch.message.sessionId);
  context.client.dispose();
});

test("Host Client reports launch timeout when Solver never announces capabilities", async () => {
  const context = setup({ launchTimeoutMs: 10 });
  await assert.rejects(
    context.client.launch({ projectDocument: {}, mode: "editable" }),
    (error: unknown) => error instanceof SolverHostClientError && error.code === "launch-timeout",
  );
  assert.equal(context.client.snapshot.phase, "error");
  context.client.dispose();
});

test("Host Client owns requestSave, snapshot correlation and saveResult", async () => {
  const context = setup();
  const binding = await launchEditable(context);
  const snapshotPromise = context.client.requestSave("host-toolbar");
  const request = context.outgoing.at(-1)!.message as { payload: { requestId: string } };
  assert.equal(context.client.snapshot.phase, "saving");

  context.emit({
    type: "archsight.solver.project.saveRequest",
    protocolVersion: "1.0.0",
    sessionId: binding.sessionId,
    nonce: binding.nonce,
    payload: { requestId: request.payload.requestId, projectDocument: { schema: "archsight-solver.project", project: { name: "Demo" } } },
  });
  const snapshot = await snapshotPromise;
  assert.equal((snapshot.projectDocument as { project: { name: string } }).project.name, "Demo");
  assert.equal(context.client.snapshot.phase, "saving");

  context.client.sendSaveResult({ requestId: snapshot.requestId, status: "saved", revision: "local-1" });
  const saveResult = context.outgoing.at(-1)!.message as { type: string; payload: { requestId: string; status: string } };
  assert.equal(saveResult.type, "archsight.solver.host.saveResult");
  assert.deepEqual(saveResult.payload, { requestId: snapshot.requestId, status: "saved", revision: "local-1" });
  assert.equal(context.client.snapshot.phase, "active-editable");
  context.client.dispose();
});

test("Host Client rejects incompatible capabilities, readonly save and invalid project launch", async () => {
  const incompatible = setup();
  const incompatibleLaunch = incompatible.client.launch({ projectDocument: {}, mode: "editable" });
  incompatible.emit({
    type: "archsight.solver.ready",
    protocolVersion: "1.0.0",
    payload: { capabilities: { loadProjectDocument: true } },
  });
  await assert.rejects(incompatibleLaunch, (error: unknown) => (
    error instanceof SolverHostClientError && error.code === "incompatible-capabilities"
  ));
  incompatible.client.dispose();

  const readonly = setup();
  const readonlyLaunch = readonly.client.launch({ projectDocument: {}, mode: "readonly" });
  emitReady(readonly.emit);
  const readonlyLaunchMessage = readonly.outgoing.at(-1)!.message as { sessionId: string; nonce: string };
  emitReady(readonly.emit, { sessionId: readonlyLaunchMessage.sessionId, nonce: readonlyLaunchMessage.nonce });
  await readonlyLaunch;
  await assert.rejects(readonly.client.requestSave(), (error: unknown) => (
    error instanceof SolverHostClientError && error.code === "readonly-operation"
  ));
  readonly.client.dispose();

  const invalid = setup();
  const invalidLaunch = invalid.client.launch({ projectDocument: {}, mode: "editable" });
  emitReady(invalid.emit);
  const invalidLaunchMessage = invalid.outgoing.at(-1)!.message as { sessionId: string; nonce: string };
  const invalidBinding = { sessionId: invalidLaunchMessage.sessionId, nonce: invalidLaunchMessage.nonce };
  invalid.emit({
    type: "archsight.solver.error",
    protocolVersion: "1.0.0",
    ...invalidBinding,
    payload: { message: "工程文件无效" },
  });
  await assert.rejects(invalidLaunch, /工程文件无效/u);
  assert.equal(invalid.client.snapshot.phase, "error");
  invalid.client.dispose();
});

test("Host Client expires save requests and ignores late snapshots", async () => {
  const context = setup({ saveTimeoutMs: 10 });
  const errors: SolverHostClientError[] = [];
  context.client.onError = (error) => errors.push(error);
  const binding = await launchEditable(context);
  const snapshotPromise = context.client.requestSave();
  const request = context.outgoing.at(-1)!.message as { payload: { requestId: string } };
  await assert.rejects(snapshotPromise, (error: unknown) => (
    error instanceof SolverHostClientError && error.code === "save-timeout"
  ));
  assert.equal(context.client.snapshot.phase, "active-editable");

  context.emit({
    type: "archsight.solver.project.saveRequest",
    protocolVersion: "1.0.0",
    ...binding,
    payload: { requestId: request.payload.requestId, projectDocument: { schema: "archsight-solver.project" } },
  });
  assert.equal(context.client.snapshot.phase, "active-editable");
  assert.equal(errors.at(-1)?.code, "late-save-snapshot");
  context.client.dispose();
});

test("Host Client emits project changes and dispose rejects pending work", async () => {
  const changed: unknown[] = [];
  const context = setup();
  const binding = await launchEditable(context);
  context.client.onProjectChanged = (projectDocument) => changed.push(projectDocument);
  context.emit({
    type: "archsight.solver.project.changed",
    protocolVersion: "1.0.0",
    ...binding,
    payload: { projectDocument: { schema: "archsight-solver.project", project: { name: "Changed" } } },
  });
  assert.equal(changed.length, 1);

  const pendingSave = context.client.requestSave();
  context.client.dispose();
  await assert.rejects(pendingSave, (error: unknown) => (
    error instanceof SolverHostClientError && error.code === "disposed"
  ));
  assert.equal(context.client.snapshot.phase, "disposed");
});
