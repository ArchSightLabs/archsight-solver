import { type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type SVGProps } from "react";
import type { WorkbenchSelection } from "../../types/workbench-selection";
import { workbenchSelectionKey } from "../../lib/workbench-selection-utils";

export const SVG_TEXT_FONT = "Inter, Microsoft YaHei, system-ui, sans-serif";
export const MODEL_DIMENSION_TEXT_WEIGHT = 600;

export function formatMagnitude(value: number) {
  return Math.abs(value).toFixed(Math.abs(value) >= 10 ? 1 : 2);
}

export function formatSignedMagnitude(value: number) {
  const magnitude = formatMagnitude(value);
  if (Math.abs(value) < 1e-9) return magnitude;
  return value < 0 ? `-${magnitude}` : magnitude;
}

type SvgActivationEvent<T extends SVGElement> = ReactMouseEvent<T> | ReactKeyboardEvent<T>;

interface SvgCanvasSelectionDataProps {
  "data-canvas-selection-key": string;
  "data-canvas-mode": WorkbenchSelection["mode"];
  "data-canvas-type": WorkbenchSelection["type"];
  "data-canvas-id": string;
  "data-canvas-draggable-node"?: "true";
}

export function isAdditiveSelectionEvent(event: { shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean } | undefined): boolean {
  return Boolean(event?.shiftKey || event?.ctrlKey || event?.metaKey);
}

export function svgCanvasSelectionProps(selection: WorkbenchSelection, options: { draggableNode?: boolean } = {}): SvgCanvasSelectionDataProps {
  return {
    "data-canvas-selection-key": workbenchSelectionKey(selection),
    "data-canvas-mode": selection.mode,
    "data-canvas-type": selection.type,
    "data-canvas-id": selection.id,
    "data-canvas-draggable-node": options.draggableNode ? "true" : undefined,
  };
}

export function svgInteractiveProps<T extends SVGElement = SVGGElement>(
  label: string,
  onActivate: (event?: SvgActivationEvent<T>) => void,
): SVGProps<T> {
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    className: "model-canvas-interactive cursor-pointer",
    onClick: (event) => onActivate(event),
    onKeyDown: (event: ReactKeyboardEvent<T>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      onActivate(event);
    },
  };
}

export function clampRatio(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}
