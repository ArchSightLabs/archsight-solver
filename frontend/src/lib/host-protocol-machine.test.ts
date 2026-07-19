import test from "node:test";
import assert from "node:assert/strict";
import {
  createHostProtocolState,
  transitionHostProtocol,
} from "./host-protocol-machine.ts";

const binding = { sessionId: "session-1", nonce: "nonce-1" };

test("host protocol negotiates capabilities before activating an editable session", () => {
  const bootstrap = createHostProtocolState();
  assert.equal(bootstrap.phase, "bootstrap");

  const negotiating = transitionHostProtocol(bootstrap, { type: "announce-ready" });
  assert.equal(negotiating.accepted, true);
  assert.equal(negotiating.state.phase, "negotiating");

  const active = transitionHostProtocol(negotiating.state, { type: "launch", ...binding, mode: "editable" });
  assert.equal(active.accepted, true);
  assert.equal(active.state.phase, "active-editable");
  assert.equal(active.state.condition, "healthy");
});

test("duplicate launch is idempotent while a new binding replaces the session", () => {
  const active = transitionHostProtocol(createHostProtocolState(), { type: "launch", ...binding, mode: "editable" }).state;
  const duplicate = transitionHostProtocol(active, { type: "launch", ...binding, mode: "editable" });
  assert.equal(duplicate.accepted, true);
  assert.equal(duplicate.idempotent, true);
  assert.equal(duplicate.state, active);

  const replacement = transitionHostProtocol(active, {
    type: "launch",
    sessionId: "session-2",
    nonce: "nonce-2",
    mode: "readonly",
  });
  assert.equal(replacement.accepted, true);
  assert.equal(replacement.idempotent, false);
  assert.equal(replacement.state.phase, "active-readonly");
  assert.equal(replacement.state.sessionId, "session-2");
});

test("readonly sessions reject project changes and save requests without losing the session", () => {
  const readonly = transitionHostProtocol(createHostProtocolState(), { type: "launch", ...binding, mode: "readonly" }).state;
  const changed = transitionHostProtocol(readonly, { type: "project-changed", ...binding });
  assert.equal(changed.accepted, false);
  assert.equal(changed.state.phase, "active-readonly");
  assert.equal(changed.state.condition, "error");
  assert.equal(changed.code, "readonly-operation");

  const saving = transitionHostProtocol(readonly, { type: "request-save", ...binding, requestId: "save-1" });
  assert.equal(saving.accepted, false);
  assert.equal(saving.state.phase, "active-readonly");
  assert.equal(saving.code, "readonly-operation");
});

test("save correlation accepts only the active request and keeps stale replies invalid", () => {
  const active = transitionHostProtocol(createHostProtocolState(), { type: "launch", ...binding, mode: "editable" }).state;
  const saving = transitionHostProtocol(active, { type: "request-save", ...binding, requestId: "save-1" });
  assert.equal(saving.accepted, true);
  assert.equal(saving.state.phase, "saving");
  assert.equal(saving.state.pendingSaveRequestId, "save-1");

  const duplicate = transitionHostProtocol(saving.state, { type: "request-save", ...binding, requestId: "save-1" });
  assert.equal(duplicate.accepted, false);
  assert.equal(duplicate.code, "duplicate-save-request");
  assert.equal(duplicate.state.phase, "saving");

  const concurrent = transitionHostProtocol(saving.state, { type: "request-save", ...binding, requestId: "save-2" });
  assert.equal(concurrent.accepted, false);
  assert.equal(concurrent.code, "save-in-progress");
  assert.equal(concurrent.state.pendingSaveRequestId, "save-1");

  const stale = transitionHostProtocol(saving.state, { type: "save-result", ...binding, requestId: "save-old" });
  assert.equal(stale.accepted, false);
  assert.equal(stale.code, "stale-save-result");
  assert.equal(stale.state.phase, "saving");
  assert.equal(stale.state.condition, "invalid");

  const completed = transitionHostProtocol(stale.state, { type: "save-result", ...binding, requestId: "save-1" });
  assert.equal(completed.accepted, true);
  assert.equal(completed.state.phase, "active-editable");
  assert.equal(completed.state.pendingSaveRequestId, null);
});

test("wrong session binding is invalid and close is terminal", () => {
  const active = transitionHostProtocol(createHostProtocolState(), { type: "launch", ...binding, mode: "editable" }).state;
  const wrongBinding = transitionHostProtocol(active, {
    type: "request-save",
    sessionId: "session-other",
    nonce: "nonce-other",
    requestId: "save-1",
  });
  assert.equal(wrongBinding.accepted, false);
  assert.equal(wrongBinding.code, "session-binding-mismatch");
  assert.equal(wrongBinding.state.phase, "active-editable");
  assert.equal(wrongBinding.state.condition, "invalid");

  const closed = transitionHostProtocol(wrongBinding.state, { type: "close" });
  assert.equal(closed.accepted, true);
  assert.equal(closed.state.phase, "closed");
  assert.equal(closed.state.condition, "closed");

  const afterClose = transitionHostProtocol(closed.state, { type: "launch", ...binding, mode: "editable" });
  assert.equal(afterClose.accepted, false);
  assert.equal(afterClose.code, "session-closed");
  assert.equal(afterClose.state.phase, "closed");
});
