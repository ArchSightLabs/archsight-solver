export type HostTheme = "light" | "dark" | null;

export interface WorkbenchPresentation {
  embedded: boolean;
  theme: HostTheme;
}

export function resolveHostAllowedOrigins(runtimeValue: string | null | undefined, buildValue: string | null | undefined) {
  return runtimeValue?.trim() || buildValue?.trim() || "";
}

export function resolveWorkbenchPresentation(search: string): WorkbenchPresentation {
  const params = new globalThis.URLSearchParams(search);
  const embedValue = params.get("embed")?.trim().toLowerCase();
  const embedded = embedValue === "1" || embedValue === "true";
  if (!embedded) {
    return { embedded: false, theme: null };
  }
  const themeValue = params.get("theme")?.trim().toLowerCase();
  return {
    embedded: true,
    theme: themeValue === "light" || themeValue === "dark" ? themeValue : null,
  };
}
