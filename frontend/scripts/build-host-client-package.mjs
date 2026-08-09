import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";


const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = resolve(SCRIPT_DIR, "..");
const REPOSITORY_ROOT = resolve(FRONTEND_ROOT, "..");
const PACKAGE_ROOT = resolve(REPOSITORY_ROOT, "packages/solver-host-client");
const TYPESCRIPT = resolve(FRONTEND_ROOT, "node_modules/typescript/bin/tsc");
const SOURCE = resolve(FRONTEND_ROOT, "src/lib/solver-host-client.ts");
const OUTPUT = resolve(PACKAGE_ROOT, "dist");

await mkdir(OUTPUT, { recursive: true });
const result = spawnSync(process.execPath, [
  TYPESCRIPT,
  SOURCE,
  "--target", "ES2020",
  "--module", "ES2020",
  "--moduleResolution", "Bundler",
  "--lib", "ES2020,DOM",
  "--strict",
  "--skipLibCheck",
  "--declaration",
  "--outDir", OUTPUT,
], {
  cwd: REPOSITORY_ROOT,
  stdio: "inherit",
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

await copyFile(resolve(REPOSITORY_ROOT, "LICENSE"), resolve(PACKAGE_ROOT, "LICENSE"));
console.log("已构建 @archsight/solver-host-client ESM 与类型声明。");
