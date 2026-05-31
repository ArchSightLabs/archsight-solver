import { useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

export const MODEL_CANVAS_MIN_ZOOM_PERCENT = 25;
export const MODEL_CANVAS_MAX_ZOOM_PERCENT = 400;
export const MODEL_CANVAS_BUTTON_ZOOM_STEP_PERCENT = 10;
export const MODEL_CANVAS_INPUT_ZOOM_STEP_PERCENT = 5;
export const MODEL_CANVAS_DEFAULT_ZOOM_PERCENT = 100;
const MODEL_CANVAS_DRAG_THRESHOLD_PX = 8;

export function useModelCanvasZoom() {
  const [zoomPercent, setZoomPercent] = useState(MODEL_CANVAS_DEFAULT_ZOOM_PERCENT);
  const [zoomDraft, setZoomDraft] = useState(String(MODEL_CANVAS_DEFAULT_ZOOM_PERCENT));
  const [showZoomControls, setShowZoomControls] = useState(false);
  const [isCanvasDragging, setIsCanvasDragging] = useState(false);
  const canvasScrollRef = useRef<HTMLDivElement | null>(null);
  const canvasDragRef = useRef<{ pointerId: number; startX: number; startY: number; lastX: number; lastY: number; active: boolean } | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const commitZoomPercent = (nextPercent: number) => {
    if (!Number.isFinite(nextPercent)) {
      setZoomDraft(String(zoomPercent));
      return;
    }
    const clamped = Math.min(MODEL_CANVAS_MAX_ZOOM_PERCENT, Math.max(MODEL_CANVAS_MIN_ZOOM_PERCENT, Math.round(nextPercent)));
    setZoomPercent(clamped);
    setZoomDraft(String(clamped));
  };

  const commitZoomDraft = (rawValue: string) => {
    if (!rawValue.trim()) {
      setZoomDraft(String(zoomPercent));
      return;
    }
    commitZoomPercent(Number(rawValue));
  };

  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scrollArea = canvasScrollRef.current;
    if (event.button !== 0 || !scrollArea) return;
    const canPan =
      scrollArea.scrollWidth > scrollArea.clientWidth + 1 ||
      scrollArea.scrollHeight > scrollArea.clientHeight + 1;
    if (!canPan) return;

    canvasDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      active: false,
    };
  };

  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = canvasDragRef.current;
    const scrollArea = canvasScrollRef.current;
    if (!drag || !scrollArea || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.lastX;
    const dy = event.clientY - drag.lastY;
    if (!drag.active && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < MODEL_CANVAS_DRAG_THRESHOLD_PX) {
      return;
    }
    if (!drag.active) {
      drag.active = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setIsCanvasDragging(true);
    }
    scrollArea.scrollLeft -= dx;
    scrollArea.scrollTop -= dy;
    drag.lastX = event.clientX;
    drag.lastY = event.clientY;
    event.preventDefault();
  };

  const finishCanvasDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = canvasDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressCanvasClickRef.current = drag.active;
    canvasDragRef.current = null;
    setIsCanvasDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleCanvasClickCapture = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressCanvasClickRef.current) return;
    suppressCanvasClickRef.current = false;
    event.preventDefault();
    event.stopPropagation();
  };

  return {
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
  };
}
