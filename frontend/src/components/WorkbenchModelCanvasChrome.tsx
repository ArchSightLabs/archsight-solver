import {
  ArrowRight,
  ArrowUp,
  Copy,
  FlipHorizontal,
  FlipVertical,
  Link2,
  Maximize2,
  Minus,
  Plus,
  Redo2,
  RotateCcw,
  Tag,
  Trash2,
  Undo2,
  ZoomIn,
} from "lucide-react";
import { Button } from "./ui/button";
import {
  MODEL_CANVAS_BUTTON_ZOOM_STEP_PERCENT,
  MODEL_CANVAS_DEFAULT_ZOOM_PERCENT,
  MODEL_CANVAS_INPUT_ZOOM_STEP_PERCENT,
  MODEL_CANVAS_MAX_ZOOM_PERCENT,
  MODEL_CANVAS_MIN_ZOOM_PERCENT,
} from "../hooks/useModelCanvasZoom";
import type { ModelGeometryAction, ModelGeometryToolbarState } from "../lib/model-workflow-actions";
import type { WorkbenchSelection } from "../types/workbench-selection";

const GEOMETRY_ACTIONS: Array<{ id: ModelGeometryAction; label: string; shortLabel: string; icon: typeof Copy; transform: boolean }> = [
  { id: "copy", label: "复制当前几何对象", shortLabel: "复制", icon: Copy, transform: true },
  { id: "mirror-x", label: "按 X 轴镜像当前几何对象", shortLabel: "X 镜像", icon: FlipVertical, transform: true },
  { id: "mirror-y", label: "按 Y 轴镜像当前几何对象", shortLabel: "Y 镜像", icon: FlipHorizontal, transform: true },
  { id: "array-x", label: "沿 X 向生成阵列副本", shortLabel: "X 阵列", icon: ArrowRight, transform: true },
  { id: "array-y", label: "沿 Y 向生成阵列副本", shortLabel: "Y 阵列", icon: ArrowUp, transform: true },
  { id: "add-connected-node", label: "新增节点并连接", shortLabel: "连接", icon: Plus, transform: false },
];

export interface WorkbenchModelCanvasChromeProps {
  compact?: boolean;
  selection?: WorkbenchSelection | null;
  geometryToolbar?: ModelGeometryToolbarState | null;
  canDeleteSelection?: boolean;
  canRedoWorkspace?: boolean;
  canUndoWorkspace?: boolean;
  labelOffsetCount?: number;
  canResetSelectedLabel?: boolean;
  onDeleteSelection?: () => void;
  onGeometryAction?: (action: ModelGeometryAction) => void;
  onRedoWorkspace?: () => void;
  onResetAllLabels?: () => void;
  onResetSelectedLabel?: () => void;
  onUndoWorkspace?: () => void;
  showZoomControls: boolean;
  zoomPercent: number;
  zoomDraft: string;
  setZoomDraft: (value: string) => void;
  setShowZoomControls: (next: boolean | ((current: boolean) => boolean)) => void;
  commitZoomDraft: (nextValue: string) => void;
  commitZoomPercent: (nextPercent: number) => void;
  fitCanvasToViewport: () => void;
}

export function WorkbenchModelCanvasChrome({
  compact = false,
  selection,
  geometryToolbar,
  canDeleteSelection = false,
  canRedoWorkspace = false,
  canUndoWorkspace = false,
  labelOffsetCount = 0,
  canResetSelectedLabel = false,
  onDeleteSelection,
  onGeometryAction,
  onRedoWorkspace,
  onResetAllLabels,
  onResetSelectedLabel,
  onUndoWorkspace,
  showZoomControls,
  zoomPercent,
  zoomDraft,
  setZoomDraft,
  setShowZoomControls,
  commitZoomDraft,
  commitZoomPercent,
  fitCanvasToViewport,
}: WorkbenchModelCanvasChromeProps) {
  const hasHistoryActions = Boolean(onUndoWorkspace && onRedoWorkspace);
  const hasLabelTools = Boolean(onResetAllLabels || onResetSelectedLabel) && (selection?.type === "label" || labelOffsetCount > 0);

  return (
    <>
      <div className="flex min-h-8 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {hasHistoryActions ? (
            <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-white/[0.88] p-1 shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-950/[0.82]" role="toolbar" aria-label="建模历史">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onUndoWorkspace}
                disabled={!canUndoWorkspace}
                aria-label="撤销建模编辑"
                title="撤销建模编辑"
                className="h-7 w-7 rounded-lg"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onRedoWorkspace}
                disabled={!canRedoWorkspace}
                aria-label="重做建模编辑"
                title="重做建模编辑"
                className="h-7 w-7 rounded-lg"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null}
          {geometryToolbar && onGeometryAction ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-white/[0.88] p-1 shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-950/[0.82]" role="toolbar" aria-label="几何建模工具">
              <span className="hidden max-w-24 truncate px-2 text-[10px] font-black text-slate-500 dark:text-slate-400 sm:inline" title={geometryToolbar.targetLabel}>
                {geometryToolbar.targetLabel}
              </span>
              {GEOMETRY_ACTIONS.map((item) => {
                const Icon = item.id === "add-connected-node" && geometryToolbar.connectsSelectedNodes ? Link2 : item.icon;
                const disabled = item.transform ? !geometryToolbar.canTransform : !geometryToolbar.canAddConnectedNode;
                const label = item.id === "add-connected-node" ? geometryToolbar.addConnectedNodeLabel : item.label;
                return (
                  <Button
                    key={item.id}
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => onGeometryAction(item.id)}
                    disabled={disabled}
                    aria-label={label}
                    title={label}
                    className="h-7 w-7 rounded-lg text-slate-700 dark:text-slate-200"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </Button>
                );
              })}
              {onDeleteSelection ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onDeleteSelection}
                  disabled={!canDeleteSelection}
                  aria-label="删除所选对象"
                  title="删除所选对象（Delete）"
                  className="h-7 w-7 rounded-lg text-rose-700 hover:text-rose-800 dark:text-rose-200 dark:hover:text-rose-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              ) : null}
            </div>
          ) : null}
          {hasLabelTools ? (
            <div className="flex min-w-0 flex-wrap items-center gap-1 rounded-xl border border-slate-200/80 bg-white/[0.88] p-1 shadow-sm backdrop-blur dark:border-slate-700/80 dark:bg-slate-950/[0.82]" role="toolbar" aria-label="标注工具">
              <span className="hidden max-w-24 truncate px-2 text-[10px] font-black text-slate-500 dark:text-slate-400 sm:inline" title={selection?.type === "label" ? selection.id : `${labelOffsetCount} 个已微调标注`}>
                {selection?.type === "label" ? "当前标注" : `标注 ${labelOffsetCount}`}
              </span>
              <Button
                type="button"
                variant="ghost"
                size={compact ? "icon" : "sm"}
                onClick={onResetSelectedLabel}
                disabled={!canResetSelectedLabel}
                aria-label="重置所选标注位置"
                title="重置所选标注位置"
                className={`${compact ? "h-7 w-7" : "h-7 px-2"} rounded-lg text-[11px] font-bold`}
              >
                <Tag className={`${compact ? "" : "mr-1.5"} h-3.5 w-3.5`} />
                {compact ? <span className="sr-only">重置所选</span> : "重置所选"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size={compact ? "icon" : "sm"}
                onClick={onResetAllLabels}
                disabled={labelOffsetCount === 0}
                aria-label="重置全部标注位置"
                title="重置全部标注位置"
                className={`${compact ? "h-7 w-7" : "h-7 px-2"} rounded-lg text-[11px] font-bold`}
              >
                <RotateCcw className={`${compact ? "" : "mr-1.5"} h-3.5 w-3.5`} />
                {compact ? <span className="sr-only">全部重置</span> : "全部重置"}
              </Button>
            </div>
          ) : null}
        </div>
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
            className="h-7 w-7 rounded-lg"
            aria-label="适应视图"
            title="适应视图"
            onClick={fitCanvasToViewport}
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </Button>
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
    </>
  );
}
