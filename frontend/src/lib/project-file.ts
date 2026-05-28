import { normalizeSolverProject, type SolverProject } from "./solver-project.ts";

export const ARCHSIGHT_SOLVER_PROJECT_SCHEMA = "archsight-solver.project";
export const ARCHSIGHT_SOLVER_PRODUCT_ID = "archsight-solver";
export const ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION = "2.0.0";
export const ARCHSIGHT_SOLVER_PROJECT_EXTENSION = ".slv";
export const ARCHSIGHT_SOLVER_LEGACY_PROJECT_EXTENSIONS = [".aslv.json", ".json"] as const;
export const ARCHSIGHT_SOLVER_PROJECT_ACCEPT = [
  ARCHSIGHT_SOLVER_PROJECT_EXTENSION,
  ...ARCHSIGHT_SOLVER_LEGACY_PROJECT_EXTENSIONS,
  "application/json",
].join(",");

export interface ArchSightSolverProjectFile {
  schema: typeof ARCHSIGHT_SOLVER_PROJECT_SCHEMA;
  schemaVersion: typeof ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION;
  product: typeof ARCHSIGHT_SOLVER_PRODUCT_ID;
  appVersion: string;
  createdAt: string;
  updatedAt: string;
  project: SolverProject;
  units: {
    length: "m";
    force: "kN";
    stress: "MPa";
    modulus: "GPa";
    inertia: "cm4";
  };
}

export interface ProjectFileParseResult {
  ok: boolean;
  error?: string;
  value?: ArchSightSolverProjectFile;
}

export interface ProjectFileHandle {
  name: string;
  getFile: () => Promise<globalThis.File>;
  createWritable: () => Promise<{
    write: (data: globalThis.BlobPart) => Promise<void> | void;
    close: () => Promise<void> | void;
  }>;
}

export interface FileSystemAccessWindow extends globalThis.Window {
  showOpenFilePicker?: (options?: {
    id?: string;
    multiple?: boolean;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
    excludeAcceptAllOption?: boolean;
  }) => Promise<ProjectFileHandle[]>;
  showSaveFilePicker?: (options?: {
    id?: string;
    suggestedName?: string;
    types?: Array<{
      description?: string;
      accept: Record<string, string[]>;
    }>;
    excludeAcceptAllOption?: boolean;
  }) => Promise<ProjectFileHandle>;
}

export interface ProjectOpenResult {
  projectFile: ArchSightSolverProjectFile;
  handle: ProjectFileHandle | null;
  fileName: string;
}

export interface ProjectSaveResult {
  handle: ProjectFileHandle | null;
  fileName: string;
  savedAt: string;
  mode: "native" | "download";
}

const APP_VERSION = "0.2.0";
const PROJECT_FILE_INDENT = 2;
const PROJECT_PICKER_ID = "archsight-solver-project-file";
const PROJECT_PICKER_TYPES = [
  {
    description: "ArchSight Solver 工程文件",
    accept: {
      "application/json": [ARCHSIGHT_SOLVER_PROJECT_EXTENSION, ...ARCHSIGHT_SOLVER_LEGACY_PROJECT_EXTENSIONS],
    },
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sanitizeFileNameSegment(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
}

export function createArchSightSolverProjectFile(project: SolverProject, now = new Date()): ArchSightSolverProjectFile {
  const normalizedProject = normalizeSolverProject(project);
  const timestamp = now.toISOString();

  return {
    schema: ARCHSIGHT_SOLVER_PROJECT_SCHEMA,
    schemaVersion: ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION,
    product: ARCHSIGHT_SOLVER_PRODUCT_ID,
    appVersion: APP_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
    project: normalizedProject,
    units: {
      length: "m",
      force: "kN",
      stress: "MPa",
      modulus: "GPa",
      inertia: "cm4",
    },
  };
}

export function serializeArchSightSolverProjectFile(projectFile: ArchSightSolverProjectFile): string {
  return `${JSON.stringify(projectFile, null, PROJECT_FILE_INDENT)}\n`;
}

export function getArchSightSolverProjectFileName(project: SolverProject): string {
  const normalizedProject = normalizeSolverProject(project);
  const projectName = sanitizeFileNameSegment(normalizedProject.name) || "未命名结构项目";
  return `${projectName}${ARCHSIGHT_SOLVER_PROJECT_EXTENSION}`;
}

export function normalizeArchSightSolverProjectFileName(name: string): string {
  const sanitizedName = sanitizeFileNameSegment(name) || "未命名结构项目";
  return hasKnownProjectFileExtension(sanitizedName)
    ? sanitizedName
    : `${sanitizedName}${ARCHSIGHT_SOLVER_PROJECT_EXTENSION}`;
}

function hasKnownProjectFileExtension(name: string): boolean {
  const normalizedName = name.toLowerCase();
  return [ARCHSIGHT_SOLVER_PROJECT_EXTENSION, ...ARCHSIGHT_SOLVER_LEGACY_PROJECT_EXTENSIONS].some((extension) =>
    normalizedName.endsWith(extension)
  );
}

export function createArchSightSolverProjectFileBlob(projectFile: ArchSightSolverProjectFile): globalThis.Blob {
  return new window.Blob([serializeArchSightSolverProjectFile(projectFile)], { type: "application/json;charset=utf-8" });
}

export function parseArchSightSolverProjectFile(rawText: string): ProjectFileParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "项目文件不是合法的 JSON 文档。" };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: "项目文件顶层结构无效。" };
  }
  if (parsed.schema !== ARCHSIGHT_SOLVER_PROJECT_SCHEMA) {
    return { ok: false, error: "文件 schema 不是 archsight-solver.project。" };
  }
  if (parsed.product !== ARCHSIGHT_SOLVER_PRODUCT_ID) {
    return { ok: false, error: "文件 product 不是 archsight-solver。" };
  }
  if (parsed.schemaVersion !== ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION) {
    return { ok: false, error: `暂不支持 schemaVersion=${String(parsed.schemaVersion)} 的项目文件。` };
  }

  return {
    ok: true,
    value: {
      schema: ARCHSIGHT_SOLVER_PROJECT_SCHEMA,
      schemaVersion: ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION,
      product: ARCHSIGHT_SOLVER_PRODUCT_ID,
      appVersion: String(parsed.appVersion ?? ""),
      createdAt: String(parsed.createdAt ?? ""),
      updatedAt: String(parsed.updatedAt ?? ""),
      project: normalizeSolverProject(parsed.project),
      units: {
        length: "m",
        force: "kN",
        stress: "MPa",
        modulus: "GPa",
        inertia: "cm4",
      },
    },
  };
}

export function supportsNativeProjectFiles(): boolean {
  const accessWindow = window as FileSystemAccessWindow;
  return typeof accessWindow.showOpenFilePicker === "function" && typeof accessWindow.showSaveFilePicker === "function";
}

export function isFilePickerAbort(error: unknown): boolean {
  return error instanceof globalThis.DOMException && error.name === "AbortError";
}

export function downloadArchSightSolverProjectFile(projectFile: ArchSightSolverProjectFile): ProjectSaveResult {
  const blob = createArchSightSolverProjectFileBlob(projectFile);
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const fileName = normalizeArchSightSolverProjectFileName(projectFile.project.name);
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
  return { handle: null, fileName, savedAt: projectFile.updatedAt, mode: "download" };
}

export async function saveArchSightSolverProjectFile(
  projectFile: ArchSightSolverProjectFile,
  handle: ProjectFileHandle | null,
  forceSaveAs = false
): Promise<ProjectSaveResult> {
  const blob = createArchSightSolverProjectFileBlob(projectFile);
  const accessWindow = window as FileSystemAccessWindow;

  if (accessWindow.showSaveFilePicker && (!handle || forceSaveAs)) {
    const nextHandle = await accessWindow.showSaveFilePicker({
      id: PROJECT_PICKER_ID,
      suggestedName: normalizeArchSightSolverProjectFileName(projectFile.project.name),
      types: PROJECT_PICKER_TYPES,
      excludeAcceptAllOption: false,
    });
    const writable = await nextHandle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { handle: nextHandle, fileName: nextHandle.name, savedAt: projectFile.updatedAt, mode: "native" };
  }

  if (handle) {
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return { handle, fileName: handle.name, savedAt: projectFile.updatedAt, mode: "native" };
  }

  return downloadArchSightSolverProjectFile(projectFile);
}

export async function readArchSightSolverProjectFile(file: globalThis.File): Promise<ArchSightSolverProjectFile> {
  const parsed = parseArchSightSolverProjectFile(await file.text());
  if (!parsed.ok || !parsed.value) {
    throw new Error(parsed.error ?? "项目文件读取失败。");
  }
  return parsed.value;
}

export async function openArchSightSolverProjectFileWithPicker(): Promise<ProjectOpenResult> {
  const accessWindow = window as FileSystemAccessWindow;
  if (!accessWindow.showOpenFilePicker) {
    throw new Error("当前浏览器不支持原生文件打开。");
  }

  const [handle] = await accessWindow.showOpenFilePicker({
    id: PROJECT_PICKER_ID,
    multiple: false,
    types: PROJECT_PICKER_TYPES,
    excludeAcceptAllOption: false,
  });
  const file = await handle.getFile();
  return {
    projectFile: await readArchSightSolverProjectFile(file),
    handle,
    fileName: handle.name,
  };
}
