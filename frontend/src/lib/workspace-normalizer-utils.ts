export function normalizeTextId(candidate: unknown, fallback: string, seen: Set<string>, prefix: string, index: number): string {
  const base = String(candidate ?? "").trim() || fallback || `${prefix}${index + 1}`;
  let next = base;
  let suffix = 2;
  while (seen.has(next)) {
    next = `${base}-${suffix}`;
    suffix += 1;
  }
  seen.add(next);
  return next;
}

export function pickExistingId(candidate: unknown, available: string[], fallback: string): string {
  const normalized = String(candidate ?? "").trim();
  if (normalized && available.includes(normalized)) {
    return normalized;
  }
  if (available.includes(fallback)) {
    return fallback;
  }
  return available[0] ?? normalized ?? fallback;
}
