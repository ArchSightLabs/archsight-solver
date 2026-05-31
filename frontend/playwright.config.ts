import { defineConfig, devices } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));
const loopbackNoProxyHosts = ["127.0.0.1", "localhost", "::1"];

function mergeNoProxyHosts(currentValue: string | undefined) {
  const hosts = new Set((currentValue ?? "").split(",").map((host) => host.trim()).filter(Boolean));
  for (const host of loopbackNoProxyHosts) {
    hosts.add(host);
  }
  return Array.from(hosts).join(",");
}

process.env.NO_PROXY = mergeNoProxyHosts(process.env.NO_PROXY);
process.env.no_proxy = mergeNoProxyHosts(process.env.no_proxy);

export default defineConfig({
  testDir: "./tests/visual",
  outputDir: join(configDir, "test-results"),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  expect: {
    toHaveScreenshot: {
      timeout: 15_000,
    },
  },
  reporter: process.env.CI ? [["html", { open: "never", outputFolder: join(configDir, "playwright-report") }], ["list"]] : "list",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",
  use: {
    baseURL: "http://127.0.0.1:6241",
    colorScheme: "dark",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 6241",
    url: "http://127.0.0.1:6241",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 960 } },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 960 } },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1440, height: 960 } },
    },
  ],
});
