const viteEnv = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

export const MAX_BEAM_SPANS = positiveInt(viteEnv.VITE_MAX_BEAM_SPANS, 64);
