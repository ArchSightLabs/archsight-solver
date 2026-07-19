import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceProjectDocumentRevision,
  captureProjectDocumentSnapshot,
  completeProjectDocumentSave,
  createProjectDocumentLifecycle,
  isProjectDocumentDirty,
  isSameProjectDocument,
  replaceProjectDocumentRevision,
} from "./project-document-lifecycle.ts";

test("工程生命周期以修订号统一 dirty 与保存状态", () => {
  const initial = createProjectDocumentLifecycle({ dirty: false, lastSavedAt: null });
  assert.equal(initial.revision, 0);
  assert.equal(isProjectDocumentDirty(initial), false);

  const changed = advanceProjectDocumentRevision(initial);
  assert.equal(changed.revision, 1);
  assert.equal(changed.lastSavedAt, null);
  assert.equal(isProjectDocumentDirty(changed), true);

  const completed = completeProjectDocumentSave(changed, changed.revision, "2026-07-19T10:00:00.000Z");
  assert.equal(completed.accepted, true);
  assert.equal(completed.lifecycle.savedRevision, changed.revision);
  assert.equal(completed.lifecycle.lastSavedAt, "2026-07-19T10:00:00.000Z");
  assert.equal(isProjectDocumentDirty(completed.lifecycle), false);
});

test("陈旧保存确认不得清除当前 dirty 或覆盖当前修订", () => {
  const firstChange = advanceProjectDocumentRevision(createProjectDocumentLifecycle({ dirty: false }));
  const secondChange = advanceProjectDocumentRevision(firstChange);

  const completed = completeProjectDocumentSave(secondChange, firstChange.revision, "2026-07-19T10:00:00.000Z");

  assert.equal(completed.accepted, false);
  assert.deepEqual(completed.lifecycle, secondChange);
  assert.equal(isProjectDocumentDirty(completed.lifecycle), true);
});

test("打开或新建工程建立新的干净修订边界", () => {
  const dirty = advanceProjectDocumentRevision(createProjectDocumentLifecycle({ dirty: true }));
  const previousSnapshot = captureProjectDocumentSnapshot(dirty);
  const replaced = replaceProjectDocumentRevision(dirty, "2026-07-19T11:00:00.000Z");

  assert.equal(replaced.revision, dirty.revision + 1);
  assert.equal(replaced.generation, dirty.generation + 1);
  assert.equal(replaced.savedRevision, replaced.revision);
  assert.equal(replaced.lastSavedAt, "2026-07-19T11:00:00.000Z");
  assert.equal(isProjectDocumentDirty(replaced), false);
  assert.equal(isSameProjectDocument(replaced, previousSnapshot), false);
});

test("同一工程的后续编辑保留代际，工程替换才切换代际", () => {
  const initial = createProjectDocumentLifecycle();
  const snapshot = captureProjectDocumentSnapshot(initial);
  const changed = advanceProjectDocumentRevision(initial);

  assert.equal(isSameProjectDocument(changed, snapshot), true);
  assert.equal(changed.generation, initial.generation);
});

test("恢复的本地草稿从首个渲染开始就是未保存状态", () => {
  const restored = createProjectDocumentLifecycle({ dirty: true, lastSavedAt: "2026-07-18T08:00:00.000Z" });

  assert.equal(restored.savedRevision, null);
  assert.equal(restored.lastSavedAt, null);
  assert.equal(isProjectDocumentDirty(restored), true);
});
