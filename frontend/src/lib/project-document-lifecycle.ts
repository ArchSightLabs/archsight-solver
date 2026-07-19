export interface ProjectDocumentLifecycle {
  generation: number;
  revision: number;
  savedRevision: number | null;
  lastSavedAt: string | null;
}

interface CreateProjectDocumentLifecycleOptions {
  dirty?: boolean;
  lastSavedAt?: string | null;
}

export interface ProjectDocumentSaveCompletion {
  accepted: boolean;
  lifecycle: ProjectDocumentLifecycle;
}

export interface ProjectDocumentSnapshot {
  generation: number;
  revision: number;
}

export function createProjectDocumentLifecycle({
  dirty = false,
  lastSavedAt = null,
}: CreateProjectDocumentLifecycleOptions = {}): ProjectDocumentLifecycle {
  return {
    generation: 0,
    revision: 0,
    savedRevision: dirty ? null : 0,
    lastSavedAt: dirty ? null : lastSavedAt,
  };
}

export function captureProjectDocumentSnapshot(
  lifecycle: ProjectDocumentLifecycle,
): ProjectDocumentSnapshot {
  return {
    generation: lifecycle.generation,
    revision: lifecycle.revision,
  };
}

export function isSameProjectDocument(
  lifecycle: ProjectDocumentLifecycle,
  snapshot: ProjectDocumentSnapshot,
): boolean {
  return lifecycle.generation === snapshot.generation;
}

export function isProjectDocumentDirty(lifecycle: ProjectDocumentLifecycle): boolean {
  return lifecycle.savedRevision !== lifecycle.revision;
}

export function advanceProjectDocumentRevision(
  lifecycle: ProjectDocumentLifecycle,
): ProjectDocumentLifecycle {
  return {
    ...lifecycle,
    revision: lifecycle.revision + 1,
    lastSavedAt: null,
  };
}

export function replaceProjectDocumentRevision(
  lifecycle: ProjectDocumentLifecycle,
  lastSavedAt: string | null,
): ProjectDocumentLifecycle {
  const revision = lifecycle.revision + 1;
  return {
    generation: lifecycle.generation + 1,
    revision,
    savedRevision: revision,
    lastSavedAt,
  };
}

export function completeProjectDocumentSave(
  lifecycle: ProjectDocumentLifecycle,
  expectedRevision: number,
  savedAt: string,
): ProjectDocumentSaveCompletion {
  if (expectedRevision !== lifecycle.revision) {
    return { accepted: false, lifecycle };
  }
  return {
    accepted: true,
    lifecycle: {
      ...lifecycle,
      savedRevision: lifecycle.revision,
      lastSavedAt: savedAt,
    },
  };
}
