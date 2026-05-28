const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const RESULT_DISPLAY_DECIMALS = positiveInt(viteEnv.VITE_RESULT_DISPLAY_DECIMALS, 4);

export function formatEngineeringNumber(value: number, decimals = RESULT_DISPLAY_DECIMALS) {
  return value.toFixed(decimals).replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

export function formatEngineeringValue(value: number | null | undefined, unit = "", decimals = RESULT_DISPLAY_DECIMALS) {
  const numeric = Number(value ?? 0);
  const suffix = unit ? ` ${unit}` : "";
  if (!Number.isFinite(numeric)) return `--${suffix}`;
  const threshold = 10 ** -decimals;
  const magnitude = Math.abs(numeric);
  if (magnitude > 0 && magnitude < threshold) {
    const sign = numeric < 0 ? "-" : "";
    return `${sign}<${threshold.toFixed(decimals)}${suffix}`;
  }
  return `${formatEngineeringNumber(numeric, decimals)}${suffix}`;
}
