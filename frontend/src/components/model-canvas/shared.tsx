import { type KeyboardEvent as ReactKeyboardEvent, type SVGProps } from "react";

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

export function svgInteractiveProps<T extends SVGElement = SVGGElement>(label: string, onActivate: () => void): SVGProps<T> {
  return {
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    className: "model-canvas-interactive cursor-pointer",
    onClick: onActivate,
    onKeyDown: (event: ReactKeyboardEvent<T>) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      onActivate();
    },
  };
}

export function clampRatio(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback;
}
