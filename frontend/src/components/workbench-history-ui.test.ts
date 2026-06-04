import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf-8");
}

test("workspace undo and redo controls are wired into the header", () => {
  const appHeader = source("./AppHeader.tsx");
  assert.match(appHeader, /Undo2/u);
  assert.match(appHeader, /Redo2/u);
  assert.match(appHeader, /canUndoWorkspace/u);
  assert.match(appHeader, /canRedoWorkspace/u);
  assert.match(appHeader, /onUndoWorkspace/u);
  assert.match(appHeader, /onRedoWorkspace/u);
  assert.match(appHeader, /disabled=\{!canUndoWorkspace\}/u);
  assert.match(appHeader, /disabled=\{!canRedoWorkspace\}/u);
});

test("workspace history is exposed by the project document hook", () => {
  const hook = source("../hooks/useSolverProjectDocument.ts");
  assert.match(hook, /pushWorkspaceHistory/u);
  assert.match(hook, /undoWorkspaceHistory/u);
  assert.match(hook, /redoWorkspaceHistory/u);
  assert.match(hook, /resetWorkspaceHistory/u);
  assert.match(hook, /canUndoWorkspace: workspaceHistory\.past\.length > 0/u);
  assert.match(hook, /canRedoWorkspace: workspaceHistory\.future\.length > 0/u);
});

test("workspace undo and redo buttons plus keyboard shortcuts are connected in App", () => {
  const app = source("../App.tsx");
  assert.match(app, /onUndoWorkspace=\{undoWorkspaceChange\}/u);
  assert.match(app, /onRedoWorkspace=\{redoWorkspaceChange\}/u);
  assert.match(app, /canUndoWorkspace=\{canUndoWorkspace\}/u);
  assert.match(app, /canRedoWorkspace=\{canRedoWorkspace\}/u);
  assert.match(app, /event\.ctrlKey \|\| event\.metaKey/u);
  assert.match(app, /key === "z" && event\.shiftKey/u);
  assert.match(app, /key === "y"/u);
});
