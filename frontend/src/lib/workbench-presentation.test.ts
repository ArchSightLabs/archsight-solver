import assert from "node:assert/strict";
import test from "node:test";

import { resolveHostAllowedOrigins, resolveWorkbenchPresentation } from "./workbench-presentation.ts";

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
