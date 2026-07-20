import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(fileName: string) {
  return readFileSync(new URL(fileName, import.meta.url), "utf-8");
}

test("计算结果只由分析对象持有，工作台动作不再维护结果副本", () => {
  const actions = source("./useWorkbenchActions.ts");
  const runtime = source("./useWorkbenchRuntime.ts");
  const document = source("./useSolverProjectDocument.ts");

  assert.doesNotMatch(actions, /useState<AnalysisResults>/u);
  assert.doesNotMatch(actions, /useState<SensitivityResults/u);
  assert.doesNotMatch(actions, /setAnalysisData|setSensitivityData|setResultProvenance/u);
  assert.match(runtime, /const analysisData = activeAnalysisObject\.results/u);
  assert.match(runtime, /const sensitivityData = activeAnalysisObject\.sensitivityResults/u);
  assert.match(document, /commitAnalysisObjectResult\(current, objectId, result, provenance\)/u);
  assert.match(document, /commitAnalysisObjectSensitivity\(current, objectId, result, provenance\)/u);
});

test("保存与宿主边界直接读取项目事实源，不再冲刷运行时副本", () => {
  const combined = [
    source("./useWorkbenchRuntime.ts"),
    source("./useProjectFileActions.ts"),
    source("./useSolverHostBridge.ts"),
    source("./useAnalysisObjectManager.ts"),
  ].join("\n");

  assert.doesNotMatch(combined, /applyCurrentRuntimeToProject/u);
  assert.doesNotMatch(combined, /syncRuntimeFromAnalysisObject/u);
  assert.doesNotMatch(combined, /markRuntimePersisted|skipNextRuntimePersistRef/u);
  assert.match(source("./useSolverHostBridge.ts"), /buildSaveRequestMessage\(protocolState\.sessionId, projectRef\.current/u);
});

test("工作台视图属于对象页状态，画布交互通过单一控制器边界接入", () => {
  const app = source("../App.tsx");
  const canvas = source("../components/WorkbenchModelCanvas.tsx");

  assert.match(app, /workbenchView\?: WorkbenchView/u);
  assert.match(app, /useWorkbenchModelCanvasController/u);
  assert.match(app, /WorkbenchMainArea/u);
  assert.match(app, /modelCanvasController=\{modelCanvasController\}/u);
  assert.match(canvas, /export interface WorkbenchModelCanvasController/u);
  assert.doesNotMatch(app, /workbenchView: resolvedView[\s\S]{0,200}markProjectDirty/u);
});

test("P1 hotspot facade 不得重新吸收已拆出的 Implementation", () => {
  const lineBudgets = new Map<string, number>([
    ["../App.tsx", 650],
    ["../components/WorkbenchModelCanvas.tsx", 300],
    ["../lib/model-workflow-actions.ts", 250],
  ]);

  const violations = Array.from(lineBudgets, ([fileName, budget]) => {
    const lineCount = source(fileName).split(/\r?\n/u).length;
    return lineCount > budget ? `${fileName}: ${lineCount} > ${budget}` : null;
  }).filter((item): item is string => item !== null);

  assert.deepEqual(violations, []);
});
