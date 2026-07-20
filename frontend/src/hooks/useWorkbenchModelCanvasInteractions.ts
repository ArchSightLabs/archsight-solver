import { useCallback, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { WorkspaceState } from "../lib/workspace-state.ts";
import type { AnalysisMode } from "../types/structure.ts";
import type { WorkbenchSelection } from "../types/workbench-selection.ts";
import { modelObjectMetricRows } from "../lib/model-object-vocabulary.ts";
import { modelCanvasBoardStyle, workbenchModelCanvasSize } from "../lib/model-canvas-sizing.ts";
import {
  clampModelLabelOffsetToCanvas,
  modelLabelOffsetForMode,
  type ModelCanvasLabelDragPreview,
  type ModelLabelBounds,
  type ModelLabelOffset,
} from "../lib/model-label-overrides.ts";
import { snapCoordinateToGrid } from "../lib/node-coordinate-snap.ts";
import {
  frameCanvasPointToModel,
  trussCanvasPointToModel,
  beamCanvasPointToModel,
  type CanvasPoint,
  type ModelCanvasNodeDragPreview,
} from "../lib/model-canvas-projection.ts";
import {
  selectionSetContains,
  uniqueWorkbenchSelections,
  workbenchSelectionFromCanvasDataset,
} from "../lib/workbench-selection-utils.ts";
import {
  MODEL_CANVAS_DEFAULT_ZOOM_PERCENT,
  MODEL_CANVAS_MIN_ZOOM_PERCENT,
  useModelCanvasZoom,
} from "./useModelCanvasZoom.ts";
import type { WorkbenchModelCanvasController } from "../components/WorkbenchModelCanvas.tsx";
import {
  clientPointToSvgPoint,
  clientRectFromMarquee,
  clampClientRect,
  isCanvasControlTarget,
  isSelectionModifier,
  labelBaseBounds,
  MarqueeSelectionState,
  nodeDragIdForSelection,
  rectsIntersect,
  intersectClientRects,
} from "./workbench-model-canvas-interaction-utils.ts";

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

interface UseWorkbenchModelCanvasInteractionsOptions {
  workspace: WorkspaceState;
  mode: AnalysisMode;
  controller?: WorkbenchModelCanvasController;
}

export interface WorkbenchCanvasInteractions {
  surfaceRef: RefObject<HTMLDivElement | null>;
  boardRef: RefObject<HTMLDivElement | null>;
  marqueeStyle: CSSProperties | null;
  labelDragPreview: ModelCanvasLabelDragPreview | null;
  nodeDragPreview: ModelCanvasNodeDragPreview | null;
  cursorPoint: CanvasPoint | null;
  canvasScrollRef: RefObject<HTMLDivElement | null>;
  showZoomControls: boolean;
  zoomPercent: number;
  zoomDraft: string;
  setZoomDraft: (value: string) => void;
  setShowZoomControls: (next: boolean | ((current: boolean) => boolean)) => void;
  commitZoomDraft: (nextValue: string) => void;
  commitZoomPercent: (nextPercent: number) => void;
  handleCanvasClickCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleCanvasPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleCanvasPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleCanvasPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  handleCanvasPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => void;
  fitCanvasToViewport: () => void;
  metrics: ReturnType<typeof modelObjectMetricRows>;
  canvasSize: ReturnType<typeof workbenchModelCanvasSize>;
  boardStyle: CSSProperties;
  hasHistoryActions: boolean;
  canShowGridSnapTool: boolean;
  hasLabelTools: boolean;
  canvasCursorClass: string;
}

export function useWorkbenchModelCanvasInteractions({
  workspace,
  mode,
  controller = {},
}: UseWorkbenchModelCanvasInteractionsOptions): WorkbenchCanvasInteractions {
  const {
    selection,
    selectionSet = [],
    gridSnapEnabled = false,
    gridSnapStepM = 0.5,
    labelOffsetCount = 0,
    onGridSnapEnabledChange,
    onGridSnapStepChange,
    onMoveLabel,
    onMoveNode,
    onRedoWorkspace,
    onSelect,
    onSelectionSetChange,
    onUndoWorkspace,
  } = controller;
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

  const marqueeStyleFromState = useCallback((nextMarquee: MarqueeSelectionState): CSSProperties | null => {
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
  }, [canvasScrollRef]);

  const selectFromMarquee = useCallback((nextMarquee: MarqueeSelectionState) => {
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
  }, [canvasScrollRef, mode, onSelectionSetChange, selectionSet]);

  const snapModelPoint = useCallback((point: CanvasPoint): CanvasPoint => ({
    x: Number(snapCoordinateToGrid(point.x, { enabled: gridSnapEnabled, stepM: gridSnapStepM }).toFixed(3)),
    y: Number(snapCoordinateToGrid(point.y, { enabled: gridSnapEnabled, stepM: gridSnapStepM }).toFixed(3)),
  }), [gridSnapEnabled, gridSnapStepM]);

  const startLabelDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>): boolean => {
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
  }, [onMoveLabel, onSelect, selectionSet, workspace]);

  const startNodeDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>): boolean => {
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
  }, [canvasSize, mode, onMoveNode, onSelect, selectionSet, snapModelPoint, workspace]);

  const startMarqueeSelection = useCallback((event: ReactPointerEvent<HTMLDivElement>): boolean => {
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
  }, [onSelectionSetChange]);

  const finishNodeDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
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
  }, [onMoveNode]);

  const finishLabelDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
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
  }, [onMoveLabel]);

  const finishMarqueeSelection = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
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
  }, [onSelectionSetChange, selectFromMarquee]);

  const handleWorkbenchCanvasPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (startLabelDrag(event)) return;
    if (startNodeDrag(event)) return;
    if (startMarqueeSelection(event)) return;
    handleCanvasPointerDown(event);
  }, [handleCanvasPointerDown, startLabelDrag, startMarqueeSelection, startNodeDrag]);

  const handleWorkbenchCanvasPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
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
  }, [canvasSize, handleCanvasPointerMove, marqueeStyleFromState, mode, snapModelPoint, workspace]);

  const handleWorkbenchCanvasPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (finishLabelDrag(event)) return;
    if (finishNodeDrag(event)) return;
    if (finishMarqueeSelection(event)) return;
    finishCanvasDrag(event);
  }, [finishCanvasDrag, finishLabelDrag, finishMarqueeSelection, finishNodeDrag]);

  const handleWorkbenchCanvasPointerCancel = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
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
  }, [finishCanvasDrag]);

  const fitCanvasToViewport = useCallback(() => {
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
  }, [canvasScrollRef, canvasSize.height, canvasSize.width, canvasViewportSize?.height, canvasViewportSize?.width, commitZoomPercent, setShowZoomControls]);

  return {
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
    handleCanvasPointerDown: handleWorkbenchCanvasPointerDown,
    handleCanvasPointerMove: handleWorkbenchCanvasPointerMove,
    handleCanvasPointerUp: handleWorkbenchCanvasPointerUp,
    handleCanvasPointerCancel: handleWorkbenchCanvasPointerCancel,
    fitCanvasToViewport,
    metrics,
    canvasSize,
    boardStyle,
    hasHistoryActions,
    canShowGridSnapTool,
    hasLabelTools,
    canvasCursorClass,
  };
}
