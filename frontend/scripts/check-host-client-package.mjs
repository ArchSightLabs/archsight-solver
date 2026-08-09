import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";


const tarball = process.argv[2] ? resolve(process.argv[2]) : null;
if (!tarball?.endsWith(".tgz")) {
  console.error("用法: node check-host-client-package.mjs <package.tgz>");
  process.exit(2);
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TYPESCRIPT = resolve(SCRIPT_DIR, "../node_modules/typescript/bin/tsc");
const temporaryRoot = await mkdtemp(join(tmpdir(), "archsight-host-client-"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: temporaryRoot,
    encoding: "utf8",
    stdio: "pipe",
    ...options,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    process.exitCode = result.status ?? 1;
    throw new Error(`${command} ${args.join(" ")} 执行失败`);
  }
  return result;
}

try {
  await writeFile(join(temporaryRoot, "package.json"), JSON.stringify({ name: "host-client-smoke", private: true, type: "module" }, null, 2));
  run("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], { shell: process.platform === "win32" });

  const installedPackage = JSON.parse(await readFile(join(temporaryRoot, "node_modules/@archsight/solver-host-client/package.json"), "utf8"));
  const packageEntry = pathToFileURL(join(temporaryRoot, "node_modules/@archsight/solver-host-client/dist/solver-host-client.js")).href;
  const hostClient = await import(packageEntry);
  assert.equal(hostClient.SOLVER_HOST_CLIENT_PROTOCOL_VERSION, "1.0.0");
  assert.equal(installedPackage.name, "@archsight/solver-host-client");
  assert.deepEqual(installedPackage.dependencies ?? {}, {});

  const listeners = new Set();
  const client = new hostClient.SolverHostClient({
    getSolverWindow: () => ({ postMessage() {} }),
    solverOrigin: "https://solver.example.com",
    messageTarget: {
      addEventListener(_type, listener) { listeners.add(listener); },
      removeEventListener(_type, listener) { listeners.delete(listener); },
    },
    createId: () => "smoke",
  });
  assert.equal(client.snapshot.phase, "idle");
  client.dispose();
  assert.equal(client.snapshot.phase, "disposed");
  assert.equal(listeners.size, 0);

  await writeFile(join(temporaryRoot, "consumer.ts"), `
import { SolverHostClient, type SolverHostClientSnapshot } from "@archsight/solver-host-client";
declare const client: SolverHostClient;
const snapshot: SolverHostClientSnapshot = client.snapshot;
console.log(snapshot.phase);
`);
  run(process.execPath, [
    TYPESCRIPT,
    "consumer.ts",
    "--noEmit",
    "--strict",
    "--target", "ES2020",
    "--module", "NodeNext",
    "--moduleResolution", "NodeNext",
    "--skipLibCheck",
  ]);

  console.log(JSON.stringify({
    tarball: basename(tarball),
    name: installedPackage.name,
    version: installedPackage.version,
    runtimeImport: "pass",
    typeImport: "pass",
    protocolVersion: hostClient.SOLVER_HOST_CLIENT_PROTOCOL_VERSION,
  }, null, 2));
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
