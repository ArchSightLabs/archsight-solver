import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const SRC_DIR = "src";

async function collectTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return collectTestFiles(path);
    }
    return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
  }));
  return files.flat();
}

const testFiles = (await collectTestFiles(SRC_DIR))
  .map((file) => relative(process.cwd(), file).replaceAll("\\", "/"))
  .sort();

if (testFiles.length === 0) {
  console.error("未找到前端单元测试文件。");
  process.exit(1);
}

const result = spawnSync(process.execPath, [
  "--test",
  "--experimental-strip-types",
  "--experimental-specifier-resolution=node",
  ...testFiles,
], {
  cwd: process.cwd(),
  stdio: "inherit",
});

process.exit(result.status ?? 1);
