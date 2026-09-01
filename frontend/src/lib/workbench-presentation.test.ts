import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCloudWorkspaceUrl,
  resolveHostAllowedOrigins,
  resolveWorkbenchPresentation,
} from "./workbench-presentation.ts";

test("embedded presentation is opt-in and accepts a host-owned theme", () => {
  assert.deepEqual(resolveWorkbenchPresentation("?embed=1&theme=light"), {
    embedded: true,
    theme: "light",
  });
  assert.deepEqual(resolveWorkbenchPresentation("?embed=true&theme=dark"), {
    embedded: true,
    theme: "dark",
  });
});

test("standalone presentation ignores host theme hints", () => {
  assert.deepEqual(resolveWorkbenchPresentation("?theme=light"), {
    embedded: false,
    theme: null,
  });
  assert.deepEqual(resolveWorkbenchPresentation("?embed=0&theme=dark"), {
    embedded: false,
    theme: null,
  });
});

test("runtime host allowlist overrides the static build fallback", () => {
  assert.equal(
    resolveHostAllowedOrigins(" https://host.example.edu ", "https://build.example.edu"),
    "https://host.example.edu",
  );
  assert.equal(resolveHostAllowedOrigins("", "https://build.example.edu"), "https://build.example.edu");
});

test("cloud workspace entry is optional and runtime-configurable", () => {
  assert.equal(
    resolveCloudWorkspaceUrl(" https://cloud.archsight.cn/solver ", "https://build.example.edu/solver"),
    "https://cloud.archsight.cn/solver",
  );
  assert.equal(resolveCloudWorkspaceUrl("", "https://build.example.edu/solver"), "https://build.example.edu/solver");
  assert.equal(resolveCloudWorkspaceUrl("", ""), null);
});

test("cloud workspace entry rejects unsafe outbound URLs", () => {
  assert.equal(resolveCloudWorkspaceUrl("javascript:alert(1)", ""), null);
  assert.equal(resolveCloudWorkspaceUrl("https://user:secret@cloud.example/solver", ""), null);
  assert.equal(resolveCloudWorkspaceUrl("https://cloud.example/solver?token=secret", ""), null);
  assert.equal(resolveCloudWorkspaceUrl("https://cloud.example/solver#token", ""), null);
});
