export type HostTheme = "light" | "dark" | null;

export interface WorkbenchPresentation {
  embedded: boolean;
  theme: HostTheme;
}

export function resolveHostAllowedOrigins(runtimeValue: string | null | undefined, buildValue: string | null | undefined) {
  return runtimeValue?.trim() || buildValue?.trim() || "";
}

export function resolveCloudWorkspaceUrl(
  runtimeValue: string | null | undefined,
  buildValue: string | null | undefined,
) {
  const candidate = runtimeValue?.trim() || buildValue?.trim() || "";
  if (!candidate) return null;
  try {
    const url = new globalThis.URL(candidate);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:")
      || !url.hostname
      || url.username
      || url.password
      || url.search
      || url.hash
    ) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
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
