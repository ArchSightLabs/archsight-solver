import assert from "node:assert/strict";
import test from "node:test";

import {
  clearProjectAutosaveDraft,
  createProjectAutosaveDraft,
  PROJECT_AUTOSAVE_STORAGE_KEY,
  readProjectAutosaveDraft,
  writeProjectAutosaveDraft,
} from "./project-autosave.ts";
import { createDefaultSolverProject } from "./solver-project.ts";

class MemoryStorage implements globalThis.Storage {
  private readonly items = new Map<string, string>();

  get length() {
    return this.items.size;
  }

  clear(): void {
    this.items.clear();
  }

  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.items.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.items.delete(key);
  }

  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

test("浏览器本地工程草稿保留工程信息和工程材料", () => {
  const storage = new MemoryStorage();
  const project = createDefaultSolverProject({
    name: "某教学楼结构复核",
    address: "上海市浦东新区",
    developerUnit: "建设单位 A",
  });
  project.settings.customMaterials = [
    { id: "timber-c24", name: "C24 结构木材", youngModulus: 11, density: 420, category: "custom" },
  ];

  writeProjectAutosaveDraft(storage, createProjectAutosaveDraft(project, null, null, new Date("2026-06-01T08:00:00.000Z")));
  const restored = readProjectAutosaveDraft(storage);

  assert.equal(restored.ok, true);
  assert.equal(restored.draft?.fileName, null);
  assert.equal(restored.draft?.projectFile.project.settings.projectInfo.address, "上海市浦东新区");
  assert.deepEqual(restored.draft?.projectFile.project.settings.customMaterials.map((material) => material.id), ["timber-c24"]);
});

test("正式保存或打开项目后可以清除本地工程草稿", () => {
  const storage = new MemoryStorage();
  const project = createDefaultSolverProject();

  writeProjectAutosaveDraft(storage, createProjectAutosaveDraft(project, "临时工程.slv", null, new Date("2026-06-01T08:00:00.000Z")));
  assert.notEqual(storage.getItem(PROJECT_AUTOSAVE_STORAGE_KEY), null);

  clearProjectAutosaveDraft(storage);
  assert.equal(readProjectAutosaveDraft(storage).ok, false);
});
