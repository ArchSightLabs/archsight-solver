import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function componentSource(fileName: string) {
  return readFileSync(new URL(`./${fileName}`, import.meta.url), "utf-8");
}

test("参数建模内部工具栏接入框架复制、镜像和阵列动作", () => {
  const toolbar = componentSource("WorkbenchModelCanvasChrome.tsx");
  const actions = readFileSync(new URL("../lib/model-workflow-actions-frame.ts", import.meta.url), "utf-8");
  const frameEditor = componentSource("FrameCustomModelEditor.tsx");

  assert.match(toolbar, /role="toolbar" aria-label="几何建模工具"/u);
  assert.match(toolbar, /ModelGeometryAction/u);
  assert.match(actions, /copyFrameCollections\(collections/u);
  assert.match(actions, /mirrorFrameCollections\(collections/u);
  assert.match(actions, /arrayFrameCollections\(collections/u);
  assert.match(actions, /selectGeneratedFrameGeometry/u);
  assert.match(actions, /applyFrameConnectedNode/u);
  assert.doesNotMatch(frameEditor, /复制 \[实验性\]/u);
  assert.doesNotMatch(frameEditor, /X 镜像 \[实验性\]/u);
  assert.doesNotMatch(frameEditor, /Y 阵列 \[实验性\]/u);
});

test("结果预览和模型叠加工程图同步建模标注偏移", () => {
  const resultContent = componentSource("WorkbenchResultContent.tsx");
  const beamPreview = componentSource("BeamPreview.tsx");
  const beamDiagrams = componentSource("BeamResultDiagrams.tsx");
  const framePreview = componentSource("FramePreview.tsx");
  const frameDiagrams = componentSource("FrameMemberDiagrams.tsx");
  const trussPreview = componentSource("TrussPreview.tsx");
  const trussDiagrams = componentSource("TrussResultDiagrams.tsx");

  assert.match(resultContent, /modelLabelOffsets=\{workspace\.beam\.modelLabelOffsets\}/u);
  assert.match(resultContent, /modelLabelOffsets=\{workspace\.frame\.modelLabelOffsets\}/u);
  assert.match(resultContent, /modelLabelOffsets=\{workspace\.truss\.modelLabelOffsets\}/u);

  for (const source of [beamPreview, beamDiagrams, framePreview, frameDiagrams, trussPreview, trussDiagrams]) {
    assert.match(source, /modelLabelTransformFromOffsets/u);
    assert.match(source, /data-result-label-id="dimension-legend"/u);
    assert.match(source, /data-result-surface=/u);
  }

  assert.match(beamPreview, /member:\$\{dimension\.memberId\}/u);
  assert.match(beamDiagrams, /node:\$\{node\.id \?\? `\$\{node\.index \+ 1\}`\}/u);
  assert.match(framePreview, /frameResultLoadLabelId/u);
  assert.match(frameDiagrams, /member:\$\{member\.id\}/u);
  assert.match(trussPreview, /load:\$\{load\.key\.replace\("-", ":"\)\}/u);
  assert.match(trussDiagrams, /node:\$\{node\.id\}/u);
});

test("参数建模内部工具栏接入桁架复制、镜像和阵列动作", () => {
  const toolbar = componentSource("WorkbenchModelCanvasChrome.tsx");
  const actions = readFileSync(new URL("../lib/model-workflow-actions-truss.ts", import.meta.url), "utf-8");
  const trussEditor = componentSource("TrussCustomModelEditor.tsx");

  assert.match(toolbar, /role="toolbar" aria-label="几何建模工具"/u);
  assert.match(actions, /copyTrussCollections\(collections/u);
  assert.match(actions, /mirrorTrussCollections\(collections/u);
  assert.match(actions, /arrayTrussCollections\(collections/u);
  assert.match(actions, /selectGeneratedTrussGeometry/u);
  assert.match(actions, /applyTrussConnectedNode/u);
  assert.doesNotMatch(trussEditor, /复制 \[实验性\]/u);
  assert.doesNotMatch(trussEditor, /X 镜像 \[实验性\]/u);
  assert.doesNotMatch(trussEditor, /Y 阵列 \[实验性\]/u);
});

test("框架和桁架表格页使用可回写的批量编辑器", () => {
  const frameTable = componentSource("FrameTableSection.tsx");
  const trussTable = componentSource("TrussTableSection.tsx");
  const frameEditor = componentSource("FrameCustomModelEditor.tsx");
  const trussEditor = componentSource("TrussCustomModelEditor.tsx");

  assert.match(frameTable, /FrameNodeEditor/u);
  assert.match(frameTable, /FrameMemberEditor/u);
  assert.match(frameTable, /FrameLoadEditor/u);
  assert.match(frameTable, /variant="table"/u);
  assert.match(frameTable, /onNodeUpdate\(index, patch\)/u);
  assert.match(frameTable, /onMemberUpdate\(index, patch\)/u);
  assert.match(frameTable, /onLoadUpdate\(index, patch\)/u);
  assert.match(frameEditor, /onNodeUpdate=\{updateNode\}/u);
  assert.match(frameEditor, /onMemberUpdate=\{updateMember\}/u);
  assert.match(frameEditor, /onLoadUpdate=\{updateLoad\}/u);

  assert.match(trussTable, /TrussNodeEditor/u);
  assert.match(trussTable, /TrussMemberEditor/u);
  assert.match(trussTable, /TrussLoadEditor/u);
  assert.match(trussTable, /variant="table"/u);
  assert.match(trussTable, /onNodeUpdate\(index, patch\)/u);
  assert.match(trussTable, /onMemberUpdate\(index, patch\)/u);
  assert.match(trussTable, /onLoadUpdate\(index, patch\)/u);
  assert.match(trussEditor, /onNodeUpdate=\{updateNode\}/u);
  assert.match(trussEditor, /onMemberUpdate=\{updateMember\}/u);
  assert.match(trussEditor, /onLoadUpdate=\{updateLoad\}/u);
});

test("框架和桁架坐标编辑共享主控画布网格吸附工具", () => {
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf-8");
  const controllerHook = componentSource("../hooks/useWorkbenchModelCanvasController.ts");
  const interactionsHook = componentSource("../hooks/useWorkbenchModelCanvasInteractions.ts");
  const toolbar = componentSource("WorkbenchModelCanvas.tsx");
  const frameEditor = componentSource("FrameCustomModelEditor.tsx");
  const trussEditor = componentSource("TrussCustomModelEditor.tsx");
  const frameTable = componentSource("FrameTableSection.tsx");
  const trussTable = componentSource("TrussTableSection.tsx");
  const gridSnapControls = componentSource("GridSnapControls.tsx");
  const frameNodeEditor = componentSource("FrameNodeEditor.tsx");
  const trussNodeEditor = componentSource("TrussNodeEditor.tsx");

  assert.match(app, /const \[gridSnapEnabled, setGridSnapEnabled\] = useState\(false\)/u);
  assert.match(app, /useWorkbenchModelCanvasController/u);
  assert.match(controllerHook, /onGridSnapEnabledChange: setGridSnapEnabled/u);
  assert.match(toolbar, /<GridSnapControls/u);
  assert.match(toolbar, /variant="statusbar"/u);
  assert.match(interactionsHook, /snapCoordinateToGrid/u);
  assert.match(interactionsHook, /const snapModelPoint/u);
  assert.match(gridSnapControls, /role=\{isToolbar \|\| isStatusbar \? "toolbar" : undefined\}/u);
  assert.match(gridSnapControls, /aria-label=\{isToolbar \|\| isStatusbar \? "网格吸附工具" : undefined\}/u);
  assert.match(gridSnapControls, /min="0\.01"/u);
  assert.match(gridSnapControls, /step="0\.01"/u);

  assert.doesNotMatch(frameEditor, /<GridSnapControls/u);
  assert.match(frameEditor, /gridSnapEnabled/u);
  assert.match(frameEditor, /gridSnapStepM/u);
  assert.doesNotMatch(trussEditor, /<GridSnapControls/u);
  assert.match(trussEditor, /gridSnapEnabled/u);
  assert.match(trussEditor, /gridSnapStepM/u);

  assert.doesNotMatch(frameTable, /GridSnapControls/u);
  assert.match(frameTable, /gridSnapEnabled=\{gridSnapEnabled\}/u);
  assert.doesNotMatch(trussTable, /GridSnapControls/u);
  assert.match(trussTable, /gridSnapEnabled=\{gridSnapEnabled\}/u);

  assert.match(frameNodeEditor, /snapCoordinateToGrid/u);
  assert.match(frameNodeEditor, /gridSnapEnabled/u);
  assert.match(frameNodeEditor, /onBlur=\{\(event\) => commitCoordinate\("x", event\.target\.value\)\}/u);
  assert.match(trussNodeEditor, /snapCoordinateToGrid/u);
  assert.match(trussNodeEditor, /gridSnapEnabled/u);
  assert.match(trussNodeEditor, /onBlur=\{\(event\) => commitCoordinate\("x", event\.target\.value\)\}/u);
});

test("frame node editor wires support displacement field", () => {
  const frameNodeEditor = componentSource("FrameNodeEditor.tsx");
  const supportDisplacementField = componentSource("FrameSupportDisplacementField.tsx");

  assert.match(frameNodeEditor, /FrameSupportDisplacementField/u);
  assert.match(frameNodeEditor, /supportDisplacements/u);
  assert.match(supportDisplacementField, /frameSupportDisplacementOptions/u);
  assert.match(supportDisplacementField, /支座位移/u);
});

test("主控建模画布暴露框选、拖动节点和删除入口", () => {
  const toolbar = componentSource("WorkbenchModelCanvas.tsx");
  const chrome = componentSource("WorkbenchModelCanvasChrome.tsx");
  const interactionsHook = componentSource("../hooks/useWorkbenchModelCanvasInteractions.ts");
  const shared = componentSource("model-canvas/shared.tsx");
  const frameSketch = componentSource("model-canvas/FrameSketch.tsx");
  const trussSketch = componentSource("model-canvas/TrussSketch.tsx");
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf-8");
  const controllerHook = componentSource("../hooks/useWorkbenchModelCanvasController.ts");

  assert.match(toolbar, /data-model-canvas-marquee/u);
  assert.match(interactionsHook, /cursor-crosshair/u);
  assert.match(interactionsHook, /clampClientRect\(clientRectFromMarquee\(nextMarquee\), boundary\)/u);
  assert.match(interactionsHook, /position: "absolute"/u);
  assert.doesNotMatch(interactionsHook, /position: "fixed"/u);
  assert.match(interactionsHook, /data-canvas-draggable-node/u);
  assert.match(shared, /data-canvas-draggable-node/u);
  assert.match(interactionsHook, /onMoveNode/u);
  assert.match(interactionsHook, /onSelectionSetChange/u);
  assert.match(chrome, /删除所选对象/u);
  assert.match(frameSketch, /selectionSet/u);
  assert.match(frameSketch, /svgCanvasSelectionProps\(nodeSelection, \{ draggableNode: true \}\)/u);
  assert.match(trussSketch, /selectionSet/u);
  assert.match(trussSketch, /svgCanvasSelectionProps\(nodeSelection, \{ draggableNode: true \}\)/u);
  assert.match(app, /useWorkbenchModelCanvasController/u);
  assert.match(controllerHook, /deleteModelSelections/u);
  assert.match(controllerHook, /moveModelCanvasNode/u);
  assert.match(controllerHook, /onSelect,\s+onSelectionSetChange,/u);
  assert.match(toolbar, /data-model-canvas-marquee/u);
});

test("主控建模画布支持标注对象拖动和重置", () => {
  const chrome = componentSource("WorkbenchModelCanvasChrome.tsx");
  const interactionsHook = componentSource("../hooks/useWorkbenchModelCanvasInteractions.ts");
  const shared = componentSource("model-canvas/shared.tsx");
  const beamSketch = componentSource("model-canvas/BeamSketch.tsx");
  const frameSketch = componentSource("model-canvas/FrameSketch.tsx");
  const trussSketch = componentSource("model-canvas/TrussSketch.tsx");
  const structureTypes = readFileSync(new URL("../types/structure.ts", import.meta.url), "utf-8");
  const beamTypes = readFileSync(new URL("../types/beam.ts", import.meta.url), "utf-8");
  const app = readFileSync(new URL("../App.tsx", import.meta.url), "utf-8");
  const controllerHook = componentSource("../hooks/useWorkbenchModelCanvasController.ts");

  assert.match(structureTypes, /export type ModelLabelOffsets/u);
  assert.match(beamTypes, /modelLabelOffsets/u);
  assert.match(shared, /data-canvas-draggable-label/u);
  assert.match(shared, /svgLabelInteractiveProps/u);
  assert.match(interactionsHook, /startLabelDrag/u);
  assert.match(interactionsHook, /clampModelLabelOffsetToCanvas/u);
  assert.match(interactionsHook, /labelBaseBounds/u);
  assert.match(interactionsHook, /ModelCanvasLabelDragPreview/u);
  assert.match(interactionsHook, /item\.type !== "label"/u);
  assert.match(app, /useWorkbenchModelCanvasController/u);
  assert.match(controllerHook, /handleMoveWorkbenchLabel/u);
  assert.match(controllerHook, /updateModelLabelOffsets/u);
  assert.match(chrome, /aria-label="标注工具"/u);
  assert.match(chrome, /重置所选标注位置/u);
  assert.match(chrome, /重置全部标注位置/u);

  assert.match(beamSketch, /labelProps\("dimension-legend"/u);
  assert.match(beamSketch, /modelLabelTransform/u);
  assert.match(frameSketch, /labelProps\("dimension-legend"/u);
  assert.match(frameSketch, /load:\$\{index\}:temperature/u);
  assert.match(trussSketch, /labelProps\("dimension-legend"/u);
  assert.match(trussSketch, /load:\$\{index\}:member/u);
});
