import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultWorkspaceState } from "./workspace-state.ts";

test("new workspaces show engineering control labels on all three structure previews", () => {
  const workspace = createDefaultWorkspaceState();
  assert.equal(workspace.beam.viewSettings?.showExtremeLabel, true);
  assert.equal(workspace.frame.viewSettings?.showExtremeLabel, true);
  assert.equal(workspace.truss.viewSettings?.showExtremeLabel, true);
});
