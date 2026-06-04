export interface CoordinateSnapOptions {
  enabled: boolean;
  stepM: number;
}

export function normalizeGridSnapStep(stepM: number, fallback = 0.5): number {
  if (!Number.isFinite(stepM) || stepM <= 0) return fallback;
  return Number(Math.max(0.01, stepM).toFixed(3));
}

export function snapCoordinateToGrid(value: number, options: CoordinateSnapOptions): number {
  if (!options.enabled) return value;
  const stepM = normalizeGridSnapStep(options.stepM);
  return Number((Math.round(value / stepM) * stepM).toFixed(6));
}
