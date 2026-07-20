import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), "utf-8");
}

test("workspace undo and redo controls are moved out of the global header", () => {
  const appHeader = source("./AppHeader.tsx");
  assert.doesNotMatch(appHeader, /Undo2/u);
  assert.doesNotMatch(appHeader, /Redo2/u);
  assert.doesNotMatch(appHeader, /canUndoWorkspace/u);
  assert.doesNotMatch(appHeader, /canRedoWorkspace/u);
  assert.doesNotMatch(appHeader, /onUndoWorkspace/u);
  assert.doesNotMatch(appHeader, /onRedoWorkspace/u);
});

test("workspace undo and redo controls are wired into the parameter modeling toolbar", () => {
  const modelCanvas = source("./WorkbenchModelCanvasChrome.tsx");
  assert.match(modelCanvas, /Undo2/u);
  assert.match(modelCanvas, /Redo2/u);
  assert.match(modelCanvas, /canUndoWorkspace/u);
  assert.match(modelCanvas, /canRedoWorkspace/u);
  assert.match(modelCanvas, /onUndoWorkspace/u);
  assert.match(modelCanvas, /onRedoWorkspace/u);
  assert.match(modelCanvas, /role="toolbar" aria-label="建模历史"/u);
  assert.match(modelCanvas, /disabled=\{!canUndoWorkspace\}/u);
  assert.match(modelCanvas, /disabled=\{!canRedoWorkspace\}/u);
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
  const controllerHook = source("../hooks/useWorkbenchModelCanvasController.ts");
  const chromeHook = source("../hooks/useWorkbenchAppChrome.ts");
  assert.match(app, /canUndoWorkspace,/u);
  assert.match(app, /canRedoWorkspace,/u);
  assert.match(app, /useWorkbenchModelCanvasController/u);
  assert.match(controllerHook, /onUndoWorkspace: undoWorkspaceChange/u);
  assert.match(controllerHook, /onRedoWorkspace: redoWorkspaceChange/u);
  assert.match(chromeHook, /event\.ctrlKey \|\| event\.metaKey/u);
  assert.match(chromeHook, /key === ['"]z['"] && event\.shiftKey/u);
  assert.match(chromeHook, /key === ['"]y['"]/u);
});
