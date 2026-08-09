import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";


const ROOT = resolve(import.meta.dirname, "../../..");
const PACKAGE_ROOT = resolve(ROOT, "packages/solver-host-client");


test("Host Client npm 包公开 ESM、类型声明和 Apache-2.0 许可文件", async () => {
  const packageJson = JSON.parse(await readFile(resolve(PACKAGE_ROOT, "package.json"), "utf8"));
  const frontendPackage = JSON.parse(await readFile(resolve(ROOT, "frontend/package.json"), "utf8"));

  assert.equal(packageJson.name, "@archsight/solver-host-client");
  assert.equal(packageJson.version, frontendPackage.version);
  assert.equal(packageJson.type, "module");
  assert.equal(packageJson.license, "Apache-2.0");
  assert.equal(packageJson.exports["."].import, "./dist/solver-host-client.js");
  assert.equal(packageJson.exports["."].types, "./dist/solver-host-client.d.ts");
  assert.equal(packageJson.sideEffects, false);

  const [runtime, declarations, license, notice] = await Promise.all([
    readFile(resolve(PACKAGE_ROOT, "dist/solver-host-client.js"), "utf8"),
    readFile(resolve(PACKAGE_ROOT, "dist/solver-host-client.d.ts"), "utf8"),
    readFile(resolve(PACKAGE_ROOT, "LICENSE"), "utf8"),
    readFile(resolve(PACKAGE_ROOT, "NOTICE.md"), "utf8"),
  ]);
  assert.match(runtime, /export class SolverHostClient/);
  assert.match(declarations, /export declare class SolverHostClient/);
  assert.match(license, /Apache License/);
  assert.match(notice, /ArchSight Solver/);
});
