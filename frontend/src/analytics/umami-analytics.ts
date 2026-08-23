import { APP_VERSION } from "../lib/app-metadata.ts";
import type { AnalysisMode } from "../types/structure.ts";

type UmamiEventValue = string | number | boolean;
type UmamiEventData = Record<string, UmamiEventValue>;

type UmamiTracker = {
  readonly track: (name: string, data?: UmamiEventData) => unknown;
};

type RuntimeEnvironment = {
  readonly VITE_UMAMI_ENABLED?: string;
  readonly VITE_UMAMI_SCRIPT_URL?: string;
  readonly VITE_UMAMI_WEBSITE_ID?: string;
  readonly VITE_UMAMI_DOMAINS?: string;
  readonly VITE_UMAMI_TAG?: string;
};

export interface UmamiAnalyticsConfig {
  readonly enabled: boolean;
  readonly scriptUrl: string;
  readonly websiteId: string;
  readonly domains: readonly string[];
  readonly tag: string;
}

export interface UmamiAnalyticsRuntime {
  readonly hostname: string;
  readonly doNotTrack: string | null;
  readonly embedded: boolean;
  readonly findScript: () => globalThis.HTMLScriptElement | null;
  readonly createScript: () => globalThis.HTMLScriptElement;
  readonly appendScript: (script: globalThis.HTMLScriptElement) => void;
  readonly getTracker: () => UmamiTracker | undefined;
}

export type SolverAnalyticsEventName =
  | "workbench_ready"
  | "entry_selected"
  | "calculation_requested"
  | "calculation_blocked"
  | "calculation_started"
  | "calculation_completed"
  | "calculation_failed"
  | "calculation_cancelled"
  | "calculation_stale"
  | "sensitivity_started"
  | "sensitivity_completed"
  | "sensitivity_failed"
  | "results_viewed"
  | "calculation_trace_viewed"
  | "review_point_added"
  | "snapshot_saved"
  | "snapshot_compared"
  | "critical_points_viewed"
  | "governing_source_inspected"
  | "report_export_requested"
  | "export_started"
  | "export_completed"
  | "export_failed"
  | "project_opened"
  | "project_saved"
  | "learning_path_opened"
  | "learning_prediction_submitted"
  | "learning_evidence_viewed"
  | "learning_path_completed";

export interface SolverAnalyticsEventData {
  readonly analysis_mode?: AnalysisMode;
  readonly entry_source?: "native_file" | "file_input" | "public_example" | "host" | "template";
  readonly export_format?: "docx" | "xlsx" | "verification-package";
  readonly failure_kind?: "api" | "client" | "validation" | "diagnostic" | "superseded" | "active_object_changed";
  readonly project_source?: "native_file" | "file_input" | "public_example";
  readonly save_method?: "native" | "download";
}

const runtimeEnvironment =
  (import.meta as ImportMeta & { readonly env?: RuntimeEnvironment }).env ?? {};

export const UMAMI_ANALYTICS_CONFIG: UmamiAnalyticsConfig = {
  enabled: runtimeEnvironment.VITE_UMAMI_ENABLED === "true",
  scriptUrl: runtimeEnvironment.VITE_UMAMI_SCRIPT_URL?.trim() ?? "",
  websiteId: runtimeEnvironment.VITE_UMAMI_WEBSITE_ID?.trim() ?? "",
  domains: (runtimeEnvironment.VITE_UMAMI_DOMAINS ?? "")
    .split(",")
    .map((domain) => domain.trim().toLowerCase())
    .filter(Boolean),
  tag: runtimeEnvironment.VITE_UMAMI_TAG?.trim() || "production",
};

const SCRIPT_SELECTOR = "script[data-archsight-umami]";
const ANALYTICS_SCHEMA_VERSION = 1;
const UMAMI_WEBSITE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const trackerReadyByScript = new WeakMap<globalThis.HTMLScriptElement, Promise<UmamiTracker | null>>();

export function resolveUmamiAnalyticsRuntime(): UmamiAnalyticsRuntime | null {
  if (typeof document === "undefined" || typeof window === "undefined" || typeof navigator === "undefined") {
    return null;
  }
  const analyticsWindow = window as globalThis.Window & { readonly umami?: UmamiTracker; readonly doNotTrack?: string | null };
  return {
    hostname: window.location.hostname.toLowerCase(),
    doNotTrack: navigator.doNotTrack ?? analyticsWindow.doNotTrack ?? null,
    embedded: window.top !== window.self,
    findScript: () => document.querySelector<globalThis.HTMLScriptElement>(SCRIPT_SELECTOR),
    createScript: () => document.createElement("script"),
    appendScript: (script) => document.head.appendChild(script),
    getTracker: () => analyticsWindow.umami,
  };
}

export function canUseUmamiAnalytics(
  config: UmamiAnalyticsConfig,
  runtime: Pick<UmamiAnalyticsRuntime, "hostname" | "doNotTrack">,
): boolean {
  if (
    !config.enabled ||
    config.domains.length === 0 ||
    !config.domains.includes(runtime.hostname.toLowerCase()) ||
    runtime.doNotTrack === "1" ||
    runtime.doNotTrack?.toLowerCase() === "yes" ||
    !UMAMI_WEBSITE_ID_PATTERN.test(config.websiteId)
  ) {
    return false;
  }
  try {
    return new URL(config.scriptUrl).protocol === "https:";
  } catch {
    return false;
  }
}

export function isUmamiAnalyticsEnabled(
  config: UmamiAnalyticsConfig = UMAMI_ANALYTICS_CONFIG,
  runtime: UmamiAnalyticsRuntime | null = resolveUmamiAnalyticsRuntime(),
): boolean {
  return runtime !== null && canUseUmamiAnalytics(config, runtime);
}

export function loadUmamiAnalytics(
  config: UmamiAnalyticsConfig = UMAMI_ANALYTICS_CONFIG,
  runtime: UmamiAnalyticsRuntime | null = resolveUmamiAnalyticsRuntime(),
): globalThis.HTMLScriptElement | null {
  if (runtime === null || !canUseUmamiAnalytics(config, runtime)) return null;
  const existing = runtime.findScript();
  if (existing !== null) return existing;

  const script = runtime.createScript();
  script.defer = true;
  script.src = config.scriptUrl;
  script.dataset.archsightUmami = "true";
  script.dataset.websiteId = config.websiteId;
  script.dataset.domains = config.domains.join(",");
  script.dataset.doNotTrack = "true";
  script.dataset.excludeSearch = "true";
  script.dataset.excludeHash = "true";
  script.dataset.tag = config.tag;
  trackerReadyByScript.set(script, new Promise((resolve) => {
    script.addEventListener("load", () => resolve(runtime.getTracker() ?? null), { once: true });
    script.addEventListener("error", () => resolve(null), { once: true });
  }));
  runtime.appendScript(script);
  return script;
}

export async function trackSolverAnalyticsEvent(
  name: SolverAnalyticsEventName,
  data: SolverAnalyticsEventData = {},
  config: UmamiAnalyticsConfig = UMAMI_ANALYTICS_CONFIG,
  runtime: UmamiAnalyticsRuntime | null = resolveUmamiAnalyticsRuntime(),
): Promise<boolean> {
  if (runtime === null || !canUseUmamiAnalytics(config, runtime)) return false;
  const tracker = await resolveTracker(config, runtime);
  if (tracker === null) return false;
  try {
    await tracker.track(name, {
      schema_version: ANALYTICS_SCHEMA_VERSION,
      app_version: APP_VERSION,
      workspace_mode: runtime.embedded ? "embedded" : "standalone",
      ...data,
    });
    return true;
  } catch {
    return false;
  }
}

async function resolveTracker(
  config: UmamiAnalyticsConfig,
  runtime: UmamiAnalyticsRuntime,
): Promise<UmamiTracker | null> {
  const currentTracker = runtime.getTracker();
  if (currentTracker !== undefined) return currentTracker;
  const script = loadUmamiAnalytics(config, runtime);
  if (script === null) return null;

  const trackerAfterLoad = runtime.getTracker();
  if (trackerAfterLoad !== undefined) return trackerAfterLoad;
  return trackerReadyByScript.get(script) ?? null;
}
