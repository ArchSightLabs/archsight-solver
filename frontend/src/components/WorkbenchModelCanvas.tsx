import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
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
import { GlassCard } from "./ui/GlassCard";
import { Button } from "./ui/button";
import { GridSnapControls } from "./GridSnapControls";
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
import type { WorkbenchSelection, WorkbenchSelectionOptions } from "../types/workbench-selection";
import type { ModelPreviewStyle } from "../types/beam";
import { modelObjectMetricRows } from "../lib/model-object-vocabulary";
import { modelCanvasBoardStyle, workbenchModelCanvasSize } from "../lib/model-canvas-sizing";
import type { ModelGeometryAction, ModelGeometryToolbarState } from "../lib/model-workflow-actions";
import {
  clampModelLabelOffsetToCanvas,
  modelLabelOffsetForMode,
  type ModelCanvasLabelDragPreview,
  type ModelLabelBounds,
  type ModelLabelOffset,
} from "../lib/model-label-overrides";
import { snapCoordinateToGrid } from "../lib/node-coordinate-snap";
import {
  frameCanvasPointToModel,
  trussCanvasPointToModel,
  beamCanvasPointToModel,
  type CanvasPoint,
  type ModelCanvasNodeDragPreview,
} from "../lib/model-canvas-projection";
import {
  selectionSetContains,
  uniqueWorkbenchSelections,
  workbenchSelectionFromCanvasDataset,
} from "../lib/workbench-selection-utils";

interface WorkbenchModelCanvasProps {
  workspace: WorkspaceState;
  mode: AnalysisMode;
  compact?: boolean;
  modelPreviewStyle?: ModelPreviewStyle;
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

interface MarqueeSelectionState {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  currentClientX: number;
  currentClientY: number;
  additive: boolean;
  active: boolean;
}

interface NodeDragState {
  pointerId: number;
  mode: AnalysisMode;
  nodeId: string;
  svg: globalThis.SVGSVGElement;
  lastPoint: CanvasPoint;
  moved: boolean;
}

interface LabelDragState {
  pointerId: number;
  mode: AnalysisMode;
  labelId: string;
  svg: globalThis.SVGSVGElement;
  labelBounds: ModelLabelBounds | null;
  startPoint: CanvasPoint;
  startOffset: ModelLabelOffset;
  lastOffset: ModelLabelOffset;
  moved: boolean;
}

const GEOMETRY_ACTIONS: Array<{ id: ModelGeometryAction; label: string; shortLabel: string; icon: typeof Copy; transform: boolean }> = [
  { id: "copy", label: "复制当前几何对象", shortLabel: "复制", icon: Copy, transform: true },
  { id: "mirror-x", label: "按 X 轴镜像当前几何对象", shortLabel: "X 镜像", icon: FlipVertical, transform: true },
  { id: "mirror-y", label: "按 Y 轴镜像当前几何对象", shortLabel: "Y 镜像", icon: FlipHorizontal, transform: true },
  { id: "array-x", label: "沿 X 向生成阵列副本", shortLabel: "X 阵列", icon: ArrowRight, transform: true },
  { id: "array-y", label: "沿 Y 向生成阵列副本", shortLabel: "Y 阵列", icon: ArrowUp, transform: true },
  { id: "add-connected-node", label: "新增节点并连接", shortLabel: "连接", icon: Plus, transform: false },
];

function clientPointToSvgPoint(pointLike: Pick<ReactPointerEvent<HTMLElement>, "clientX" | "clientY">, svg: globalThis.SVGSVGElement): CanvasPoint | null {
  const matrix = svg.getScreenCTM();
  if (!matrix) return null;
  const point = svg.createSVGPoint();
  point.x = pointLike.clientX;
  point.y = pointLike.clientY;
  const next = point.matrixTransform(matrix.inverse());
  return { x: next.x, y: next.y };
}

function clientRectFromMarquee(marquee: MarqueeSelectionState) {
  const left = Math.min(marquee.startClientX, marquee.currentClientX);
  const top = Math.min(marquee.startClientY, marquee.currentClientY);
  const right = Math.max(marquee.startClientX, marquee.currentClientX);
  const bottom = Math.max(marquee.startClientY, marquee.currentClientY);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

type ClientRectLike = ReturnType<typeof clientRectFromMarquee>;

function intersectClientRects(left: globalThis.DOMRect, right: globalThis.DOMRect): ClientRectLike {
  const rectLeft = Math.max(left.left, right.left);
  const rectTop = Math.max(left.top, right.top);
  const rectRight = Math.min(left.right, right.right);
  const rectBottom = Math.min(left.bottom, right.bottom);
  return {
    left: rectLeft,
    top: rectTop,
    right: Math.max(rectLeft, rectRight),
    bottom: Math.max(rectTop, rectBottom),
    width: Math.max(0, rectRight - rectLeft),
    height: Math.max(0, rectBottom - rectTop),
  };
}

function clampClientRect(rect: ClientRectLike, boundary: ClientRectLike): ClientRectLike {
  const left = Math.max(rect.left, boundary.left);
  const top = Math.max(rect.top, boundary.top);
  const right = Math.min(rect.right, boundary.right);
  const bottom = Math.min(rect.bottom, boundary.bottom);
  return {
    left,
    top,
    right: Math.max(left, right),
    bottom: Math.max(top, bottom),
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

function rectsIntersect(left: globalThis.DOMRect, right: ClientRectLike): boolean {
  return left.right >= right.left && left.left <= right.right && left.bottom >= right.top && left.top <= right.bottom;
}

function isSelectionModifier(event: ReactPointerEvent<HTMLElement>) {
  return event.shiftKey || event.ctrlKey || event.metaKey;
}

function nodeDragIdForSelection(selection: WorkbenchSelection): string | null {
  if (selection.mode === "beam" && selection.type === "support") {
    const match = /^support-(\d+)$/.exec(selection.id);
    return match ? `node-${match[1]}` : null;
  }
  return selection.id;
}

function isCanvasControlTarget(target: globalThis.EventTarget | null): boolean {
  return target instanceof globalThis.Element && Boolean(target.closest("button,input,textarea,select,[role='toolbar']"));
}

export function WorkbenchModelCanvas({
  workspace,
  mode,
  compact = false,
  modelPreviewStyle = "simple",
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
  onMoveLabel,
  onMoveNode,
  onRedoWorkspace,
  onResetAllLabels,
  onResetSelectedLabel,
  onSelect,
  onSelectionSetChange,
  onUndoWorkspace,
}: WorkbenchModelCanvasProps) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);
  const marqueeRef = useRef<MarqueeSelectionState | null>(null);
  const labelDragRef = useRef<LabelDragState | null>(null);
  const nodeDragRef = useRef<NodeDragState | null>(null);
  const [marqueeStyle, setMarqueeStyle] = useState<CSSProperties | null>(null);
  const [labelDragPreview, setLabelDragPreview] = useState<ModelCanvasLabelDragPreview | null>(null);
  const [nodeDragPreview, setNodeDragPreview] = useState<ModelCanvasNodeDragPreview | null>(null);
  const [cursorPoint, setCursorPoint] = useState<CanvasPoint | null>(null);
  const {
    canvasScrollRef,
    commitZoomDraft,
    commitZoomPercent,
    finishCanvasDrag,
    handleCanvasClickCapture,
    handleCanvasPointerDown,
    handleCanvasPointerMove,
    isCanvasDragging,
    canvasViewportSize,
    setShowZoomControls,
    setZoomDraft,
    showZoomControls,
    zoomDraft,
    zoomPercent,
  } = useModelCanvasZoom();
  const metrics = modelObjectMetricRows(workspace, mode);
  const canvasSize = workbenchModelCanvasSize(workspace, mode);
  const boardStyle = modelCanvasBoardStyle(canvasSize, zoomPercent, canvasViewportSize);
  const hasHistoryActions = Boolean(onUndoWorkspace && onRedoWorkspace);
  const canShowGridSnapTool = Boolean(onGridSnapEnabledChange && onGridSnapStepChange);
  const hasLabelTools = Boolean(onMoveLabel) && (selection?.type === "label" || labelOffsetCount > 0);
  const canMarqueeSelect = Boolean(onSelectionSetChange);
  const canvasCursorClass = isCanvasDragging
    ? "cursor-grabbing"
    : canMarqueeSelect
      ? "cursor-crosshair"
      : showZoomControls
        ? "cursor-grab"
        : "";
  const marqueeStyleFromState = (nextMarquee: MarqueeSelectionState): CSSProperties | null => {
    if (!nextMarquee.active) return null;
    const surface = surfaceRef.current;
    const board = boardRef.current;
    const scrollArea = canvasScrollRef.current;
    if (!surface || !board || !scrollArea) return null;
    const boundary = intersectClientRects(board.getBoundingClientRect(), scrollArea.getBoundingClientRect());
    const rect = clampClientRect(clientRectFromMarquee(nextMarquee), boundary);
    if (rect.width <= 0 || rect.height <= 0) return null;
    const surfaceRect = surface.getBoundingClientRect();
    return {
      position: "absolute",
      left: rect.left - surfaceRect.left,
      top: rect.top - surfaceRect.top,
      width: rect.width,
      height: rect.height,
    };
  };

  const selectFromMarquee = (nextMarquee: MarqueeSelectionState) => {
    const board = boardRef.current;
    const scrollArea = canvasScrollRef.current;
    if (!board || !onSelectionSetChange) return;
    const rect = scrollArea
      ? clampClientRect(
          clientRectFromMarquee(nextMarquee),
          intersectClientRects(board.getBoundingClientRect(), scrollArea.getBoundingClientRect()),
        )
      : clientRectFromMarquee(nextMarquee);
    const selected = Array.from(board.querySelectorAll<globalThis.SVGGraphicsElement>("[data-canvas-selection-key]"))
      .filter((element) => element.dataset.canvasMode === mode)
      .filter((element) => rectsIntersect(element.getBoundingClientRect(), rect))
      .map((element) => workbenchSelectionFromCanvasDataset(element.dataset))
      .filter((item): item is WorkbenchSelection => item !== null && item.type !== "label");
    const next = nextMarquee.additive
      ? uniqueWorkbenchSelections([...selectionSet.filter((item) => item.type !== "label"), ...selected])
      : uniqueWorkbenchSelections(selected);
    onSelectionSetChange(next, { openEditor: false });
  };

  const snapModelPoint = (point: CanvasPoint): CanvasPoint => ({
    x: Number(snapCoordinateToGrid(point.x, { enabled: gridSnapEnabled, stepM: gridSnapStepM }).toFixed(3)),
    y: Number(snapCoordinateToGrid(point.y, { enabled: gridSnapEnabled, stepM: gridSnapStepM }).toFixed(3)),
  });

  const svgRectFromClientRect = (rect: globalThis.DOMRect, svg: globalThis.SVGSVGElement): ModelLabelBounds | null => {
    const points = [
      clientPointToSvgPoint({ clientX: rect.left, clientY: rect.top }, svg),
      clientPointToSvgPoint({ clientX: rect.right, clientY: rect.top }, svg),
      clientPointToSvgPoint({ clientX: rect.right, clientY: rect.bottom }, svg),
      clientPointToSvgPoint({ clientX: rect.left, clientY: rect.bottom }, svg),
    ].filter((point): point is CanvasPoint => Boolean(point));
    if (points.length === 0) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const left = Math.min(...xs);
    const top = Math.min(...ys);
    const right = Math.max(...xs);
    const bottom = Math.max(...ys);
    return {
      x: left,
      y: top,
      width: right - left,
      height: bottom - top,
    };
  };

  const labelBaseBounds = (target: globalThis.SVGGraphicsElement, svg: globalThis.SVGSVGElement, offset: ModelLabelOffset): ModelLabelBounds | null => {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const currentBounds = svgRectFromClientRect(rect, svg);
    return currentBounds
      ? {
          ...currentBounds,
          x: currentBounds.x - offset.dx,
          y: currentBounds.y - offset.dy,
        }
      : null;
  };

  const startLabelDrag = (event: ReactPointerEvent<HTMLDivElement>): boolean => {
    if (event.button !== 0 || !onMoveLabel) return false;
    if (!(event.target instanceof globalThis.Element)) return false;
    const target = event.target.closest<globalThis.SVGGraphicsElement>("[data-canvas-draggable-label='true']");
    const svg = target?.ownerSVGElement;
    if (!target || !svg) return false;
    const draggedSelection = workbenchSelectionFromCanvasDataset(target.dataset);
    if (!draggedSelection || draggedSelection.type !== "label") return false;
    const svgPoint = clientPointToSvgPoint(event, svg);
    if (!svgPoint) return false;
    const startOffset = modelLabelOffsetForMode(workspace, draggedSelection.mode, draggedSelection.id);
    const labelBounds = labelBaseBounds(target, svg, startOffset);

    labelDragRef.current = {
      pointerId: event.pointerId,
      mode: draggedSelection.mode,
      labelId: draggedSelection.id,
      svg,
      labelBounds,
      startPoint: svgPoint,
      startOffset,
      lastOffset: startOffset,
      moved: false,
    };
    setLabelDragPreview({ mode: draggedSelection.mode, labelId: draggedSelection.id, offset: startOffset });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!selectionSetContains(selectionSet, draggedSelection)) {
      onSelect?.(draggedSelection, { additive: isSelectionModifier(event), openEditor: false });
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const startNodeDrag = (event: ReactPointerEvent<HTMLDivElement>): boolean => {
    if (event.button !== 0 || !onMoveNode) return false;
    if (!(event.target instanceof globalThis.Element)) return false;
    const target = event.target.closest<globalThis.SVGGraphicsElement>("[data-canvas-draggable-node='true']");
    const svg = target?.ownerSVGElement;
    if (!target || !svg) return false;
    const draggedSelection = workbenchSelectionFromCanvasDataset(target.dataset);
    if (!draggedSelection || draggedSelection.mode !== mode || (draggedSelection.type !== "node" && draggedSelection.type !== "support")) return false;
    const dragNodeId = nodeDragIdForSelection(draggedSelection);
    if (!dragNodeId) return false;
    const svgPoint = clientPointToSvgPoint(event, svg);
    if (!svgPoint) return false;
    const modelPoint = mode === "frame"
      ? frameCanvasPointToModel(workspace, canvasSize, svgPoint)
      : mode === "truss"
      ? trussCanvasPointToModel(workspace, canvasSize, svgPoint)
      : beamCanvasPointToModel(workspace, canvasSize, svgPoint);
    const nextPoint = snapModelPoint(modelPoint);

    nodeDragRef.current = {
      pointerId: event.pointerId,
      mode,
      nodeId: dragNodeId,
      svg,
      lastPoint: nextPoint,
      moved: false,
    };
    setNodeDragPreview({ mode, nodeId: dragNodeId, ...nextPoint });
    event.currentTarget.setPointerCapture(event.pointerId);
    if (!selectionSetContains(selectionSet, draggedSelection)) {
      onSelect?.(draggedSelection, { additive: isSelectionModifier(event), openEditor: false });
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const startMarqueeSelection = (event: ReactPointerEvent<HTMLDivElement>): boolean => {
    if (event.button !== 0 || !onSelectionSetChange || isCanvasControlTarget(event.target)) return false;
    if (!(event.target instanceof globalThis.Element) || event.target.closest("[data-canvas-selection-key]")) return false;
    if (!event.target.closest(".model-canvas-board")) return false;
    const next: MarqueeSelectionState = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      currentClientX: event.clientX,
      currentClientY: event.clientY,
      additive: isSelectionModifier(event),
      active: false,
    };
    marqueeRef.current = next;
    setMarqueeStyle(null);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    return true;
  };

  const finishNodeDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = nodeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    if (drag.moved) {
      onMoveNode?.(drag.mode, drag.nodeId, drag.lastPoint);
    }
    nodeDragRef.current = null;
    setNodeDragPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const finishLabelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = labelDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return false;
    if (drag.moved) {
      onMoveLabel?.(drag.mode, drag.labelId, drag.lastOffset);
    }
    labelDragRef.current = null;
    setLabelDragPreview(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const finishMarqueeSelection = (event: ReactPointerEvent<HTMLDivElement>) => {
    const nextMarquee = marqueeRef.current;
    if (!nextMarquee || nextMarquee.pointerId !== event.pointerId) return false;
    if (nextMarquee.active) {
      selectFromMarquee(nextMarquee);
    } else if (!nextMarquee.additive) {
      onSelectionSetChange?.([], { openEditor: false });
    }
    marqueeRef.current = null;
    setMarqueeStyle(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
    return true;
  };

  const handleWorkbenchCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (startLabelDrag(event)) return;
    if (startNodeDrag(event)) return;
    if (startMarqueeSelection(event)) return;
    handleCanvasPointerDown(event);
  };

  const handleWorkbenchCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const svg = boardRef.current?.querySelector("svg");
    if (svg) {
      const svgPoint = clientPointToSvgPoint(event, svg);
      if (svgPoint) {
        if (mode === "frame") {
          setCursorPoint(frameCanvasPointToModel(workspace, canvasSize, svgPoint));
        } else if (mode === "truss") {
          setCursorPoint(trussCanvasPointToModel(workspace, canvasSize, svgPoint));
        } else if (mode === "beam") {
          setCursorPoint(beamCanvasPointToModel(workspace, canvasSize, svgPoint));
        } else {
          setCursorPoint(null);
        }
      } else {
        setCursorPoint(null);
      }
    }

    const labelDrag = labelDragRef.current;
    if (labelDrag && labelDrag.pointerId === event.pointerId) {
      const svgPoint = clientPointToSvgPoint(event, labelDrag.svg);
      if (!svgPoint) return;
      const nextOffset = {
        dx: Number((labelDrag.startOffset.dx + svgPoint.x - labelDrag.startPoint.x).toFixed(2)),
        dy: Number((labelDrag.startOffset.dy + svgPoint.y - labelDrag.startPoint.y).toFixed(2)),
      };
      const boundedOffset = clampModelLabelOffsetToCanvas(nextOffset, labelDrag.labelBounds, canvasSize);
      labelDrag.lastOffset = boundedOffset;
      labelDrag.moved = labelDrag.moved || Math.hypot(svgPoint.x - labelDrag.startPoint.x, svgPoint.y - labelDrag.startPoint.y) >= 2;
      setLabelDragPreview({ mode: labelDrag.mode, labelId: labelDrag.labelId, offset: boundedOffset });
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const drag = nodeDragRef.current;
    if (drag && drag.pointerId === event.pointerId) {
      const svgPoint = clientPointToSvgPoint(event, drag.svg);
      if (!svgPoint) return;
      const modelPoint = drag.mode === "frame"
        ? frameCanvasPointToModel(workspace, canvasSize, svgPoint)
        : drag.mode === "truss"
        ? trussCanvasPointToModel(workspace, canvasSize, svgPoint)
        : beamCanvasPointToModel(workspace, canvasSize, svgPoint);
      const nextPoint = snapModelPoint(modelPoint);
      drag.lastPoint = nextPoint;
      drag.moved = true;
      setNodeDragPreview({ mode: drag.mode, nodeId: drag.nodeId, ...nextPoint });
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const nextMarquee = marqueeRef.current;
    if (nextMarquee && nextMarquee.pointerId === event.pointerId) {
      const active = nextMarquee.active || Math.hypot(event.clientX - nextMarquee.startClientX, event.clientY - nextMarquee.startClientY) >= 4;
      const updated = {
        ...nextMarquee,
        currentClientX: event.clientX,
        currentClientY: event.clientY,
        active,
      };
      marqueeRef.current = updated;
      setMarqueeStyle(marqueeStyleFromState(updated));
      event.preventDefault();
      return;
    }

    handleCanvasPointerMove(event);
  };

  const handleWorkbenchCanvasPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishLabelDrag(event)) return;
    if (finishNodeDrag(event)) return;
    if (finishMarqueeSelection(event)) return;
    finishCanvasDrag(event);
  };

  const handleWorkbenchCanvasPointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    setCursorPoint(null);
    if (nodeDragRef.current?.pointerId === event.pointerId) {
      nodeDragRef.current = null;
      setNodeDragPreview(null);
    }
    if (labelDragRef.current?.pointerId === event.pointerId) {
      labelDragRef.current = null;
      setLabelDragPreview(null);
    }
    if (marqueeRef.current?.pointerId === event.pointerId) {
      marqueeRef.current = null;
      setMarqueeStyle(null);
    }
    finishCanvasDrag(event);
  };

  const fitCanvasToViewport = () => {
    const scrollArea = canvasScrollRef.current;
    const viewportWidth = canvasViewportSize?.width ?? scrollArea?.clientWidth ?? 0;
    const viewportHeight = canvasViewportSize?.height ?? scrollArea?.clientHeight ?? 0;
    if (viewportWidth <= 0 || viewportHeight <= 0) {
      commitZoomPercent(MODEL_CANVAS_DEFAULT_ZOOM_PERCENT);
      return;
    }
    const fitPercent = Math.floor(
      Math.min(
        MODEL_CANVAS_DEFAULT_ZOOM_PERCENT,
        ((viewportWidth - 24) / canvasSize.width) * MODEL_CANVAS_DEFAULT_ZOOM_PERCENT,
        ((viewportHeight - 24) / canvasSize.height) * MODEL_CANVAS_DEFAULT_ZOOM_PERCENT,
      ),
    );
    commitZoomPercent(Math.max(MODEL_CANVAS_MIN_ZOOM_PERCENT, fitPercent));
    setShowZoomControls(true);
    window.requestAnimationFrame(() => {
      if (!scrollArea) return;
      scrollArea.scrollLeft = 0;
      scrollArea.scrollTop = 0;
    });
  };

  return (
    <GlassCard className="overflow-hidden">
      <div ref={surfaceRef} className={`model-canvas-surface relative flex flex-col gap-3 px-4 py-4 ${compact ? "h-[340px]" : "h-[560px]"}`} data-preview-style={modelPreviewStyle}>
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
        <div
          ref={canvasScrollRef}
          data-model-canvas-scroll="true"
          className={`min-h-0 flex-1 overflow-auto ${canvasCursorClass}`}
          onPointerDown={handleWorkbenchCanvasPointerDown}
          onPointerMove={handleWorkbenchCanvasPointerMove}
          onPointerUp={handleWorkbenchCanvasPointerUp}
          onPointerCancel={handleWorkbenchCanvasPointerCancel}
          onPointerLeave={() => setCursorPoint(null)}
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
        {marqueeStyle ? (
          <div
            aria-hidden="true"
            data-model-canvas-marquee="true"
            className="pointer-events-none absolute rounded-sm border border-sky-500/80 bg-sky-400/10 shadow-[0_0_0_1px_rgba(14,165,233,0.22)]"
            style={marqueeStyle}
          />
        ) : null}
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
