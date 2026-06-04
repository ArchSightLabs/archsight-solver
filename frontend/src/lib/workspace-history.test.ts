import assert from "node:assert/strict";
import test from "node:test";

import {
  createEmptyWorkspaceHistory,
  pushWorkspaceHistory,
  redoWorkspaceHistory,
  undoWorkspaceHistory,
  workspaceStatesEqual,
} from "./workspace-history.ts";
import { cloneWorkspaceState, createDefaultWorkspaceState } from "./workspace-state.ts";

function workspaceWithFrameSpan(span: number) {
  const workspace = createDefaultWorkspaceState();
  workspace.analysisMode = "frame";
  workspace.frame.span = span;
  return workspace;
}

test("workspace history stores independent undo and redo snapshots", () => {
  const first = workspaceWithFrameSpan(6);
  const second = workspaceWithFrameSpan(8);
  const third = workspaceWithFrameSpan(10);
  const history = pushWorkspaceHistory(pushWorkspaceHistory(createEmptyWorkspaceHistory(), first, second), second, third);

  const undone = undoWorkspaceHistory(history, third);
  assert.ok(undone);
  assert.equal(undone.workspace.frame.span, 8);
  undone.workspace.frame.span = 99;
  assert.equal(history.past.at(-1)?.frame.span, 8);

  const redone = redoWorkspaceHistory(undone.history, second);
  assert.ok(redone);
  assert.equal(redone.workspace.frame.span, 10);
});

test("workspace history clears redo stack on new edit and ignores unchanged states", () => {
  const first = workspaceWithFrameSpan(6);
  const second = workspaceWithFrameSpan(8);
  const third = workspaceWithFrameSpan(10);
  const history = pushWorkspaceHistory(createEmptyWorkspaceHistory(), first, second);
  const undone = undoWorkspaceHistory(history, second);
  assert.ok(undone);

  const edited = pushWorkspaceHistory(undone.history, first, third);
  assert.equal(edited.future.length, 0);
  assert.equal(pushWorkspaceHistory(edited, third, cloneWorkspaceState(third)), edited);
});

test("workspaceStatesEqual compares model content rather than object identity", () => {
  const first = workspaceWithFrameSpan(6);
  const second = cloneWorkspaceState(first);
  assert.notEqual(first, second);
  assert.equal(workspaceStatesEqual(first, second), true);
  second.frame.span = 8;
  assert.equal(workspaceStatesEqual(first, second), false);
});
