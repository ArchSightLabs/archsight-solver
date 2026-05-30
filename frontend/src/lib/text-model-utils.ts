interface TextModelLineOptions {
  commentMarkers?: readonly string[];
}

interface TextModelNumberOptions {
  stripParentheses?: boolean;
}

interface TextModelIdOptions {
  preserveAnyLeadingAlpha?: boolean;
}

const DEFAULT_COMMENT_MARKERS = ["//", "#"] as const;
const TOKEN_SPLITTER = /[,\t，\s]+/u;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function cleanTextModelLine(line: string, options: TextModelLineOptions = {}): string {
  const markers = options.commentMarkers ?? DEFAULT_COMMENT_MARKERS;
  return markers
    .filter(Boolean)
    .reduce((current, marker) => current.replace(new RegExp(`${escapeRegExp(marker)}.*$`, "u"), ""), line)
    .trim();
}

export function splitTextModelTokens(line: string, options: TextModelLineOptions = {}): string[] {
  return cleanTextModelLine(line, options)
    .split(TOKEN_SPLITTER)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function parseTextModelNumber(value: string | undefined, options: TextModelNumberOptions = {}): number | null {
  if (value === undefined || value.trim() === "") {
    return null;
  }
  const normalized = options.stripParentheses ? value.replace(/[（）()]/gu, "") : value;
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

export function parseTextModelNumericCode(value: string): number | null {
  const match = value.trim().match(/-?\d+/u);
  if (!match) {
    return null;
  }
  const numeric = Number(match[0]);
  return Number.isFinite(numeric) ? numeric : null;
}

export function prefixTextModelId(value: string | undefined, fallback: string, prefix: string, options: TextModelIdOptions = {}): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return fallback;
  }
  const alreadyPrefixed = new RegExp(`^${escapeRegExp(prefix)}`, "iu").test(raw);
  if (alreadyPrefixed || (options.preserveAnyLeadingAlpha && /^[A-Z]/iu.test(raw))) {
    return raw.toUpperCase();
  }
  return `${prefix}${raw}`;
}

export function uniqueTextModelId(base: string, used: Set<string>): string {
  let candidate = base.trim() || "ID";
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}
