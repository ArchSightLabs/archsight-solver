const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\"": "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ESCAPE_MAP[char] ?? char);
}

export function safeCssHexColor(value: string, fallback = "#0ea5e9"): string {
  const normalized = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) {
    return normalized;
  }
  if (/^#[0-9a-f]{3}$/i.test(normalized)) {
    return `#${normalized.slice(1).split("").map((char) => `${char}${char}`).join("")}`;
  }
  return fallback;
}
