import {
  createArchSightSolverProjectFile,
  parseArchSightSolverProjectFile,
  serializeArchSightSolverProjectFile,
  type ArchSightSolverProjectFile,
} from "./project-file.ts";
import type { SolverProject } from "./solver-project.ts";

export const PROJECT_AUTOSAVE_STORAGE_KEY = "archsight-solver.project-autosave.v1";
const PROJECT_AUTOSAVE_SCHEMA = "archsight-solver.project-autosave";

export interface ProjectAutosaveDraft {
  schema: typeof PROJECT_AUTOSAVE_SCHEMA;
  updatedAt: string;
  fileName: string | null;
  savedAt: string | null;
  projectFile: ArchSightSolverProjectFile;
}

export interface ProjectAutosaveReadResult {
  ok: boolean;
  draft?: ProjectAutosaveDraft;
  error?: string;
}

function safeParseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export function createProjectAutosaveDraft(
  project: SolverProject,
  fileName: string | null,
  savedAt: string | null,
  now = new Date()
): ProjectAutosaveDraft {
  return {
    schema: PROJECT_AUTOSAVE_SCHEMA,
    updatedAt: now.toISOString(),
    fileName,
    savedAt,
    projectFile: createArchSightSolverProjectFile(project, now),
  };
}

export function serializeProjectAutosaveDraft(draft: ProjectAutosaveDraft): string {
  return JSON.stringify({
    schema: draft.schema,
    updatedAt: draft.updatedAt,
    fileName: draft.fileName,
    savedAt: draft.savedAt,
    projectFileText: serializeArchSightSolverProjectFile(draft.projectFile),
  });
}

export function parseProjectAutosaveDraft(raw: string): ProjectAutosaveReadResult {
  const parsed = safeParseObject(raw);
  if (!parsed || parsed.schema !== PROJECT_AUTOSAVE_SCHEMA) {
    return { ok: false, error: "本地工程草稿格式无效。" };
  }
  const projectFileText = typeof parsed.projectFileText === "string" ? parsed.projectFileText : "";
  const projectFile = parseArchSightSolverProjectFile(projectFileText);
  if (!projectFile.ok || !projectFile.value) {
    return { ok: false, error: projectFile.error ?? "本地工程草稿内容无效。" };
  }
  return {
    ok: true,
    draft: {
      schema: PROJECT_AUTOSAVE_SCHEMA,
      updatedAt: String(parsed.updatedAt ?? projectFile.value.updatedAt),
      fileName: typeof parsed.fileName === "string" && parsed.fileName ? parsed.fileName : null,
      savedAt: typeof parsed.savedAt === "string" && parsed.savedAt ? parsed.savedAt : null,
      projectFile: projectFile.value,
    },
  };
}

export function readProjectAutosaveDraft(storage: globalThis.Storage): ProjectAutosaveReadResult {
  const raw = storage.getItem(PROJECT_AUTOSAVE_STORAGE_KEY);
  return raw ? parseProjectAutosaveDraft(raw) : { ok: false };
}

export function writeProjectAutosaveDraft(storage: globalThis.Storage, draft: ProjectAutosaveDraft): void {
  storage.setItem(PROJECT_AUTOSAVE_STORAGE_KEY, serializeProjectAutosaveDraft(draft));
}

export function clearProjectAutosaveDraft(storage: globalThis.Storage): void {
  storage.removeItem(PROJECT_AUTOSAVE_STORAGE_KEY);
}
