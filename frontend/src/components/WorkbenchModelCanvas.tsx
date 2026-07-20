import { GlassCard } from "./ui/GlassCard";
import { WorkbenchModelCanvasChrome } from "./WorkbenchModelCanvasChrome";
import { GridSnapControls } from "./GridSnapControls";
import { BeamSketch } from "./model-canvas/BeamSketch";
import { FrameSketch } from "./model-canvas/FrameSketch";
import { TrussSketch } from "./model-canvas/TrussSketch";
import type { WorkspaceState } from "../lib/workspace-state";
import { useWorkbenchModelCanvasInteractions } from "../hooks/useWorkbenchModelCanvasInteractions";
import type { AnalysisMode } from "../types/structure";
import type { WorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection";
import type { ModelPreviewStyle } from "../types/beam";
import type { ModelGeometryAction, ModelGeometryToolbarState } from "../lib/model-workflow-actions";
import type { CanvasPoint } from "../lib/model-canvas-projection";
import type { ModelLabelOffset } from "../lib/model-label-overrides";

interface WorkbenchModelCanvasProps {
  workspace: WorkspaceState;
  mode: AnalysisMode;
  compact?: boolean;
  modelPreviewStyle?: ModelPreviewStyle;
  controller?: WorkbenchModelCanvasController;
}

export interface WorkbenchModelCanvasController {
  selection?: WorkbenchSelection | null;
  selectionSet?: WorkbenchSelection[];
  canDeleteSelection?: boolean;
  canRedoWorkspace?: boolean;
  canUndoWorkspace?: boolean;
  geometryToolbar?: ModelGeometryToolbarState | null;
  gridSnapEnabled?: boolean;
  gridSnapStepM?: number;
  labelOffsetCount?: number;
  canResetSelectedLabel?: boolean;
  onDeleteSelection?: () => void;
  onGeometryAction?: (action: ModelGeometryAction) => void;
  onGridSnapEnabledChange?: (enabled: boolean) => void;
  onGridSnapStepChange?: (stepM: number) => void;
  onMoveLabel?: (mode: AnalysisMode, labelId: string, offset: ModelLabelOffset) => void;
  onMoveNode?: (mode: AnalysisMode, nodeId: string, point: CanvasPoint) => void;
  onRedoWorkspace?: () => void;
  onResetAllLabels?: () => void;
  onResetSelectedLabel?: () => void;
  onSelect?: (next: WorkbenchSelection, options?: WorkbenchSelectionOptions) => void;
  onSelectionSetChange?: (next: WorkbenchSelection[], options?: WorkbenchSelectionOptions) => void;
  onUndoWorkspace?: () => void;
}

export function WorkbenchModelCanvas({
  workspace,
  mode,
  compact = false,
  modelPreviewStyle = "simple",
  controller = {},
}: WorkbenchModelCanvasProps) {
  const {
    selection,
    selectionSet = [],
    canDeleteSelection = false,
    canRedoWorkspace = false,
    canUndoWorkspace = false,
    geometryToolbar,
    gridSnapEnabled = false,
    gridSnapStepM = 0.5,
    labelOffsetCount = 0,
    canResetSelectedLabel = false,
    onDeleteSelection,
    onGeometryAction,
    onGridSnapEnabledChange,
    onGridSnapStepChange,
    onRedoWorkspace,
    onResetAllLabels,
    onResetSelectedLabel,
    onSelect,
    onUndoWorkspace,
  } = controller;

  const {
    surfaceRef,
    boardRef,
    marqueeStyle,
    labelDragPreview,
    nodeDragPreview,
    cursorPoint,
    canvasScrollRef,
    showZoomControls,
    zoomPercent,
    zoomDraft,
    setZoomDraft,
    setShowZoomControls,
    commitZoomDraft,
    commitZoomPercent,
    handleCanvasClickCapture,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    handleCanvasPointerUp,
    handleCanvasPointerCancel,
    fitCanvasToViewport,
    metrics,
    canvasSize,
    boardStyle,
    canShowGridSnapTool,
    canvasCursorClass,
  } = useWorkbenchModelCanvasInteractions({ workspace, mode, controller });

  return (
    <GlassCard className="overflow-hidden">
      <div ref={surfaceRef} className={`model-canvas-surface relative flex flex-col gap-3 px-4 py-4 ${compact ? "h-[340px]" : "h-[560px]"}`} data-preview-style={modelPreviewStyle}>
        <WorkbenchModelCanvasChrome
          compact={compact}
          selection={selection}
          geometryToolbar={geometryToolbar}
          canDeleteSelection={canDeleteSelection}
          canRedoWorkspace={canRedoWorkspace}
          canUndoWorkspace={canUndoWorkspace}
          labelOffsetCount={labelOffsetCount}
          canResetSelectedLabel={canResetSelectedLabel}
          onDeleteSelection={onDeleteSelection}
          onGeometryAction={onGeometryAction}
          onRedoWorkspace={onRedoWorkspace}
          onResetAllLabels={onResetAllLabels}
          onResetSelectedLabel={onResetSelectedLabel}
          onUndoWorkspace={onUndoWorkspace}
          showZoomControls={showZoomControls}
          zoomPercent={zoomPercent}
          zoomDraft={zoomDraft}
          setZoomDraft={setZoomDraft}
          setShowZoomControls={setShowZoomControls}
          commitZoomDraft={commitZoomDraft}
          commitZoomPercent={commitZoomPercent}
          fitCanvasToViewport={fitCanvasToViewport}
        />
        <div
          ref={canvasScrollRef}
          data-model-canvas-scroll="true"
          className={`min-h-0 flex-1 overflow-auto ${canvasCursorClass}`}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerCancel}
          onPointerLeave={handleCanvasPointerCancel}
          onClickCapture={handleCanvasClickCapture}
        >
          <div ref={boardRef} data-model-canvas-board="true" className="model-canvas-board" style={boardStyle}>
            {mode === "beam" ? (
              <BeamSketch
                beam={workspace.beam}
                canvasSize={canvasSize}
                modelPreviewStyle={modelPreviewStyle}
                selection={selection}
                selectionSet={selectionSet}
                dragPreview={nodeDragPreview}
                labelDragPreview={labelDragPreview}
                onSelect={onSelect}
              />
            ) : mode === "frame" ? (
              <FrameSketch
                workspace={workspace}
                canvasSize={canvasSize}
                selection={selection}
                selectionSet={selectionSet}
                dragPreview={nodeDragPreview}
                labelDragPreview={labelDragPreview}
                onSelect={onSelect}
              />
            ) : (
              <TrussSketch
                workspace={workspace}
                canvasSize={canvasSize}
                selection={selection}
                selectionSet={selectionSet}
                dragPreview={nodeDragPreview}
                labelDragPreview={labelDragPreview}
                onSelect={onSelect}
              />
            )}
          </div>
        </div>
        {marqueeStyle ? <div aria-hidden="true" data-model-canvas-marquee="true" className="pointer-events-none absolute rounded-sm border border-sky-500/80 bg-sky-400/10 shadow-[0_0_0_1px_rgba(14,165,233,0.22)]" style={marqueeStyle} /> : null}
      </div>
      <div className="flex h-7 shrink-0 items-center justify-between border-t border-slate-200/50 bg-white/[0.05] px-3 text-[10px] font-mono tracking-wide text-slate-500 backdrop-blur-md dark:border-white/10 dark:text-slate-400">
        <div className="flex items-center gap-6">
          {canShowGridSnapTool ? (
            <GridSnapControls
              enabled={gridSnapEnabled}
              stepM={gridSnapStepM}
              variant="statusbar"
              compact={true}
              onEnabledChange={(next) => onGridSnapEnabledChange?.(next)}
              onStepChange={(next) => onGridSnapStepChange?.(next)}
            />
          ) : null}
          {metrics.length > 0 ? (
            <div className="flex items-center gap-4 border-l border-slate-300/30 pl-4 dark:border-white/10">
              {metrics.map((item) => (
                <div key={item.label} className="flex items-baseline gap-1.5">
                  <span className="font-sans font-black tracking-widest opacity-60">{item.label}</span>
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{item.value}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-4">
          {cursorPoint ? (
            <span className="font-bold opacity-70">
              {mode === "beam"
                ? `站点 X: ${cursorPoint.x.toFixed(3)} m`
                : `X: ${cursorPoint.x.toFixed(3)} m   Y: ${cursorPoint.y.toFixed(3)} m`}
            </span>
          ) : null}
        </div>
      </div>
    </GlassCard>
  );
}
