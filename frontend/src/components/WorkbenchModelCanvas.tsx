import { Minus, Plus, RotateCcw, ZoomIn } from "lucide-react";
import { GlassCard } from "./ui/GlassCard";
import { Button } from "./ui/button";
import { BeamSketch } from "./model-canvas/BeamSketch";
import { FrameSketch } from "./model-canvas/FrameSketch";
import { TrussSketch } from "./model-canvas/TrussSketch";
import type { WorkspaceState } from "../lib/workspace-state";
import {
  MODEL_CANVAS_BUTTON_ZOOM_STEP_PERCENT,
  MODEL_CANVAS_DEFAULT_ZOOM_PERCENT,
  MODEL_CANVAS_INPUT_ZOOM_STEP_PERCENT,
  MODEL_CANVAS_MAX_ZOOM_PERCENT,
  MODEL_CANVAS_MIN_ZOOM_PERCENT,
  useModelCanvasZoom,
} from "../hooks/useModelCanvasZoom";
import type { AnalysisMode } from "../types/structure";
import type { WorkbenchSelection } from "../types/workbench-selection";
import type { ModelPreviewStyle } from "../types/beam";
import { modelObjectMetricRows } from "../lib/model-object-vocabulary";
import { modelCanvasBoardStyle, workbenchModelCanvasSize } from "../lib/model-canvas-sizing";
interface WorkbenchModelCanvasProps {
  workspace: WorkspaceState;
  mode: AnalysisMode;
  compact?: boolean;
  modelPreviewStyle?: ModelPreviewStyle;
  selection?: WorkbenchSelection | null;
  onSelect?: (next: WorkbenchSelection) => void;
}

export function WorkbenchModelCanvas({ workspace, mode, compact = false, modelPreviewStyle = "simple", selection, onSelect }: WorkbenchModelCanvasProps) {
  const {
    canvasScrollRef,
    commitZoomDraft,
    commitZoomPercent,
    finishCanvasDrag,
    handleCanvasClickCapture,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    isCanvasDragging,
    setShowZoomControls,
    setZoomDraft,
    showZoomControls,
    zoomDraft,
    zoomPercent,
  } = useModelCanvasZoom();
  const metrics = modelObjectMetricRows(workspace, mode);
  const canvasSize = workbenchModelCanvasSize(workspace, mode);
  const boardStyle = modelCanvasBoardStyle(canvasSize, zoomPercent);

  return (
    <GlassCard className="overflow-hidden">
      <div className={`model-canvas-surface relative flex flex-col gap-3 px-4 py-4 ${compact ? "h-[260px]" : "h-[360px]"}`} data-preview-style={modelPreviewStyle}>
        <div className="flex h-8 items-center justify-end">
          <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/[0.88] p-1 shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-950/[0.82]">
            {showZoomControls ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  aria-label="缩小工作台"
                  title="缩小工作台"
                  onClick={() => commitZoomPercent(zoomPercent - MODEL_CANVAS_BUTTON_ZOOM_STEP_PERCENT)}
                  disabled={zoomPercent <= MODEL_CANVAS_MIN_ZOOM_PERCENT}
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <div className="flex items-center">
                  <input
                    aria-label="工作台缩放百分比"
                    type="number"
                    min={MODEL_CANVAS_MIN_ZOOM_PERCENT}
                    max={MODEL_CANVAS_MAX_ZOOM_PERCENT}
                    step={MODEL_CANVAS_INPUT_ZOOM_STEP_PERCENT}
                    value={zoomDraft}
                    onChange={(event) => setZoomDraft(event.target.value)}
                    onFocus={(event) => event.currentTarget.select()}
                    onBlur={(event) => commitZoomDraft(event.currentTarget.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        commitZoomDraft(event.currentTarget.value);
                        event.currentTarget.blur();
                      }
                      if (event.key === "Escape") {
                        setZoomDraft(String(zoomPercent));
                        event.currentTarget.blur();
                      }
                    }}
                    className="h-7 w-12 rounded-md border border-transparent bg-transparent px-1 text-center font-mono text-[11px] font-bold text-slate-700 outline-none focus:border-sky-400/50 focus:bg-white/80 dark:text-slate-200 dark:focus:bg-slate-900/80"
                  />
                  <span className="pr-1 font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200">%</span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  aria-label="放大工作台"
                  title="放大工作台"
                  onClick={() => commitZoomPercent(zoomPercent + MODEL_CANVAS_BUTTON_ZOOM_STEP_PERCENT)}
                  disabled={zoomPercent >= MODEL_CANVAS_MAX_ZOOM_PERCENT}
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 rounded-lg"
                  aria-label="重置工作台缩放"
                  title="重置工作台缩放"
                  onClick={() => commitZoomPercent(MODEL_CANVAS_DEFAULT_ZOOM_PERCENT)}
                  disabled={zoomPercent === MODEL_CANVAS_DEFAULT_ZOOM_PERCENT}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`h-7 w-7 rounded-lg ${showZoomControls ? "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-100" : ""}`}
              aria-label={showZoomControls ? "隐藏工作台缩放" : "显示工作台缩放"}
              aria-pressed={showZoomControls}
              title={`${showZoomControls ? "隐藏" : "显示"}工作台缩放（${zoomPercent}%）`}
              onClick={() => setShowZoomControls((current) => !current)}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <div
          ref={canvasScrollRef}
          className={`min-h-0 flex-1 overflow-auto ${zoomPercent > MODEL_CANVAS_DEFAULT_ZOOM_PERCENT ? (isCanvasDragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={finishCanvasDrag}
          onPointerCancel={finishCanvasDrag}
          onClickCapture={handleCanvasClickCapture}
        >
          <div className="model-canvas-board" style={boardStyle}>
            {mode === "beam" ? (
              <BeamSketch beam={workspace.beam} canvasSize={canvasSize} modelPreviewStyle={modelPreviewStyle} selection={selection} onSelect={onSelect} />
            ) : mode === "frame" ? (
              <FrameSketch workspace={workspace} canvasSize={canvasSize} selection={selection} onSelect={onSelect} />
            ) : (
              <TrussSketch workspace={workspace} canvasSize={canvasSize} selection={selection} onSelect={onSelect} />
            )}
          </div>
        </div>
      </div>
      <div className="grid gap-px border-t border-slate-200/70 bg-slate-200/70 dark:border-slate-700/70 dark:bg-slate-700/70 sm:grid-cols-3">
        {metrics.map((item) => (
          <div key={item.label} className="bg-white/[0.82] px-4 py-3 sm:px-5 sm:py-4 dark:bg-slate-900/[0.62]">
            <div className="eyebrow mb-1 text-slate-500 dark:text-slate-400">{item.label}</div>
            <div className="font-mono text-sm font-bold text-slate-950 dark:text-slate-100">{item.value}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
