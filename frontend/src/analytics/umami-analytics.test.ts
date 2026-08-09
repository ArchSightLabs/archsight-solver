import assert from "node:assert/strict";
import test from "node:test";
import {
  canUseUmamiAnalytics,
  loadUmamiAnalytics,
  trackSolverAnalyticsEvent,
  type UmamiAnalyticsConfig,
  type UmamiAnalyticsRuntime,
} from "./umami-analytics.ts";
import { APP_VERSION } from "../lib/app-metadata.ts";

const enabledConfig: UmamiAnalyticsConfig = {
  enabled: true,
  scriptUrl: "https://analytics.archsight.cn/script.js",
  websiteId: "21791f13-6214-44db-8724-0e1dcd656bfb",
  domains: ["solver.archsight.cn"],
  tag: "production",
};

function createRuntime(options: {
  doNotTrack?: string | null;
  embedded?: boolean;
  hostname?: string;
  scriptOutcome?: "load" | "error";
  tracker?: { track: (name: string, data?: Record<string, string | number | boolean>) => unknown };
} = {}) {
  let existingScript: globalThis.HTMLScriptElement | null = null;
  let appendedScript: globalThis.HTMLScriptElement | null = null;
  const listeners = new Map<string, () => void>();
  const script = {
    defer: false,
    src: "",
    dataset: {},
    addEventListener: (name: string, listener: () => void) => listeners.set(name, listener),
  } as unknown as globalThis.HTMLScriptElement;
  const runtime: UmamiAnalyticsRuntime = {
    hostname: options.hostname ?? "solver.archsight.cn",
    doNotTrack: options.doNotTrack ?? null,
    embedded: options.embedded ?? false,
    findScript: () => existingScript,
    createScript: () => script,
    appendScript: (nextScript) => {
      existingScript = nextScript;
      appendedScript = nextScript;
      const outcome = options.scriptOutcome;
      if (outcome) globalThis.queueMicrotask(() => listeners.get(outcome)?.());
    },
    getTracker: () => options.tracker,
  };
  return { runtime, appendedScript: () => appendedScript };
}

test("Umami 只在允许域名、有效 HTTPS 配置且未开启 DNT 时启用", () => {
  assert.equal(canUseUmamiAnalytics(enabledConfig, createRuntime().runtime), true);
  assert.equal(canUseUmamiAnalytics(enabledConfig, createRuntime({ hostname: "localhost" }).runtime), false);
  assert.equal(canUseUmamiAnalytics(enabledConfig, createRuntime({ doNotTrack: "1" }).runtime), false);
  assert.equal(canUseUmamiAnalytics({ ...enabledConfig, scriptUrl: "http://analytics.archsight.cn/script.js" }, createRuntime().runtime), false);
});

test("Umami tracker 脚本只加载一次并固化隐私属性", () => {
  const fixture = createRuntime();
  const first = loadUmamiAnalytics(enabledConfig, fixture.runtime);
  const second = loadUmamiAnalytics(enabledConfig, fixture.runtime);

  assert.equal(second, first);
  assert.equal(fixture.appendedScript(), first);
  assert.equal(first?.src, "https://analytics.archsight.cn/script.js");
  assert.equal(first?.dataset.websiteId, enabledConfig.websiteId);
  assert.equal(first?.dataset.domains, "solver.archsight.cn");
  assert.equal(first?.dataset.doNotTrack, "true");
  assert.equal(first?.dataset.excludeSearch, "true");
  assert.equal(first?.dataset.excludeHash, "true");
  assert.equal(first?.dataset.tag, "production");
});

test("关键行为事件只携带枚举字段和版本上下文", async () => {
  const calls: Array<{ name: string; data?: Record<string, string | number | boolean> }> = [];
  const fixture = createRuntime({
    embedded: true,
    tracker: {
      track: (name, data) => calls.push({ name, data }),
    },
  });

  const tracked = await trackSolverAnalyticsEvent(
    "calculation_completed",
    { analysis_mode: "frame" },
    enabledConfig,
    fixture.runtime,
  );

  assert.equal(tracked, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.name, "calculation_completed");
  assert.deepEqual(calls[0]?.data, {
    schema_version: 1,
    app_version: APP_VERSION,
    workspace_mode: "embedded",
    analysis_mode: "frame",
  });
  assert.doesNotMatch(JSON.stringify(calls), /project_name|file_name|model|result|error_message|user_id/u);
});

test("学习路径事件只携带分析类型和公共版本上下文", async () => {
  const calls: Array<{ name: string; data?: Record<string, string | number | boolean> }> = [];
  const fixture = createRuntime({
    tracker: {
      track: (name, data) => calls.push({ name, data }),
    },
  });

  for (const name of [
    "learning_path_opened",
    "learning_prediction_submitted",
    "learning_evidence_viewed",
    "learning_path_completed",
  ] as const) {
    assert.equal(
      await trackSolverAnalyticsEvent(name, { analysis_mode: "truss" }, enabledConfig, fixture.runtime),
      true,
    );
  }

  assert.deepEqual(calls.map((call) => call.name), [
    "learning_path_opened",
    "learning_prediction_submitted",
    "learning_evidence_viewed",
    "learning_path_completed",
  ]);
  assert.doesNotMatch(JSON.stringify(calls), /case_id|answer|option|prompt|project|model|result|file|user|identity/u);
});

test("统计服务异常不会传播到工作台", async () => {
  const fixture = createRuntime({
    tracker: {
      track: () => Promise.reject(new Error("analytics unavailable")),
    },
  });
  assert.equal(
    await trackSolverAnalyticsEvent("project_saved", { save_method: "download" }, enabledConfig, fixture.runtime),
    false,
  );
});

test("tracker 脚本加载失败时事件调用可收敛", async () => {
  const fixture = createRuntime({ scriptOutcome: "error" });
  assert.equal(
    await trackSolverAnalyticsEvent("project_opened", { project_source: "public_example" }, enabledConfig, fixture.runtime),
    false,
  );
});
