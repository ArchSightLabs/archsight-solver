import { normalizeSolverProject, type SolverProject } from "./solver-project.ts";
import { APP_VERSION } from "./app-metadata.ts";

export const ARCHSIGHT_SOLVER_PROJECT_SCHEMA = "archsight-solver.project";
export const ARCHSIGHT_SOLVER_PRODUCT_ID = "archsight-solver";
export const ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION = "2.0.0";
export const ARCHSIGHT_SOLVER_ASMS_SCHEMA_VERSION = "2026-05-30";
export const ARCHSIGHT_SOLVER_PROJECT_MANIFEST_VERSION = "1.0.0";
export const ARCHSIGHT_SOLVER_PROJECT_CONTAINER_VERSION = "1.0.0";
export const ARCHSIGHT_SOLVER_SUPPORTED_PROJECT_FILE_VERSIONS = ["1.0.0", ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION] as const;
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
  contract: {
    asmsJsonSchemaVersion: typeof ARCHSIGHT_SOLVER_ASMS_SCHEMA_VERSION;
    projectFileSchemaVersion: typeof ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION;
    modelRoundTrip: "normalized";
  };
  manifest: {
    manifestVersion: typeof ARCHSIGHT_SOLVER_PROJECT_MANIFEST_VERSION;
    projectFileKind: "single-json" | "zip-container" | "project-folder";
    containerVersion: typeof ARCHSIGHT_SOLVER_PROJECT_CONTAINER_VERSION;
    entries: Array<{
      path: string;
      role: "projectDocument" | "projectManifest" | string;
      mediaType: string;
      required: boolean;
    }>;
    contract: {
      asmsJsonSchemaVersion: typeof ARCHSIGHT_SOLVER_ASMS_SCHEMA_VERSION;
      projectFileSchemaVersion: typeof ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION;
    };
    containerCapabilities: Record<string, boolean>;
  };
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
  diagnostics?: ProjectFileDiagnostic[];
}

export type ProjectFileDiagnosticSeverity = "info" | "warning" | "error";

export interface ProjectFileDiagnostic {
  code: string;
  severity: ProjectFileDiagnosticSeverity;
  title: string;
  detail: string;
  suggestion: string;
}

export interface ProjectFileParseResult {
  ok: boolean;
  error?: string;
  value?: ArchSightSolverProjectFile;
  diagnostics: ProjectFileDiagnostic[];
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

function diagnostic(code: string, severity: ProjectFileDiagnosticSeverity, title: string, detail: string, suggestion: string): ProjectFileDiagnostic {
  return { code, severity, title, detail, suggestion };
}

function isSupportedProjectFileVersion(value: unknown): value is typeof ARCHSIGHT_SOLVER_SUPPORTED_PROJECT_FILE_VERSIONS[number] {
  return ARCHSIGHT_SOLVER_SUPPORTED_PROJECT_FILE_VERSIONS.includes(value as typeof ARCHSIGHT_SOLVER_SUPPORTED_PROJECT_FILE_VERSIONS[number]);
}

function compareSemver(left: string, right: string): number {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10) || 0);
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const diff = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function sanitizeFileNameSegment(value: string): string {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80)
    .trim();
}

function createProjectFileManifest(): ArchSightSolverProjectFile["manifest"] {
  return {
    manifestVersion: ARCHSIGHT_SOLVER_PROJECT_MANIFEST_VERSION,
    projectFileKind: "single-json",
    containerVersion: ARCHSIGHT_SOLVER_PROJECT_CONTAINER_VERSION,
    entries: [
      {
        path: "project.json",
        role: "projectDocument",
        mediaType: "application/json",
        required: true,
      },
      {
        path: "manifest.json",
        role: "projectManifest",
        mediaType: "application/json",
        required: false,
      },
    ],
    contract: {
      asmsJsonSchemaVersion: ARCHSIGHT_SOLVER_ASMS_SCHEMA_VERSION,
      projectFileSchemaVersion: ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION,
    },
    containerCapabilities: {
      "single-json": true,
      "zip-container": false,
      "project-folder": false,
    },
  };
}

function normalizeProjectFileManifest(value: unknown): ArchSightSolverProjectFile["manifest"] {
  const manifest = createProjectFileManifest();
  if (!isRecord(value)) {
    return manifest;
  }
  const rawKind = String(value.projectFileKind ?? "single-json");
  const projectFileKind = rawKind === "zip-container" || rawKind === "project-folder" ? rawKind : "single-json";
  return {
    ...manifest,
    projectFileKind,
    containerCapabilities: {
      ...manifest.containerCapabilities,
      [projectFileKind]: projectFileKind === "single-json",
    },
  };
}

export function createArchSightSolverProjectFile(project: SolverProject, now = new Date()): ArchSightSolverProjectFile {
  const normalizedProject = normalizeSolverProject(project);
  const timestamp = now.toISOString();

  return {
    schema: ARCHSIGHT_SOLVER_PROJECT_SCHEMA,
    schemaVersion: ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION,
    product: ARCHSIGHT_SOLVER_PRODUCT_ID,
    appVersion: APP_VERSION,
    contract: {
      asmsJsonSchemaVersion: ARCHSIGHT_SOLVER_ASMS_SCHEMA_VERSION,
      projectFileSchemaVersion: ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION,
      modelRoundTrip: "normalized",
    },
    manifest: createProjectFileManifest(),
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
  const diagnostics: ProjectFileDiagnostic[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: "项目文件不是合法的 JSON 文档。", diagnostics };
  }

  if (!isRecord(parsed)) {
    return { ok: false, error: "项目文件顶层结构无效。", diagnostics };
  }
  if (parsed.schema !== ARCHSIGHT_SOLVER_PROJECT_SCHEMA) {
    return { ok: false, error: "文件 schema 不是 archsight-solver.project。", diagnostics };
  }
  if (parsed.product !== ARCHSIGHT_SOLVER_PRODUCT_ID) {
    return { ok: false, error: "文件 product 不是 archsight-solver。", diagnostics };
  }
  const schemaVersion = String(parsed.schemaVersion ?? "");
  if (!isSupportedProjectFileVersion(schemaVersion)) {
    if (compareSemver(schemaVersion, ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION) > 0) {
      return { ok: false, error: `项目文件 schemaVersion=${schemaVersion} 高于当前支持版本 ${ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION}。`, diagnostics };
    }
    return { ok: false, error: `暂不支持 schemaVersion=${schemaVersion || "未声明"} 的项目文件。`, diagnostics };
  }
  if (schemaVersion !== ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION) {
    diagnostics.push(diagnostic(
      "PROJECT_FILE_SCHEMA_MIGRATED",
      "warning",
      "项目文件已按当前版本迁移",
      `原始 schemaVersion=${schemaVersion}，已按 ${ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION} 归一化导入。`,
      "保存项目文件后会写入当前项目文件 schemaVersion。",
    ));
  }
  const contract = isRecord(parsed.contract) ? parsed.contract : {};
  if (contract.asmsJsonSchemaVersion !== ARCHSIGHT_SOLVER_ASMS_SCHEMA_VERSION) {
    diagnostics.push(diagnostic(
      "ASMS_SCHEMA_VERSION_RECORDED",
      contract.asmsJsonSchemaVersion ? "warning" : "info",
      "ASMS-JSON 契约版本已校准",
      contract.asmsJsonSchemaVersion
        ? `文件声明的 ASMS-JSON 契约版本为 ${String(contract.asmsJsonSchemaVersion)}，当前版本为 ${ARCHSIGHT_SOLVER_ASMS_SCHEMA_VERSION}。`
        : `文件未声明 ASMS-JSON 契约版本，已按 ${ARCHSIGHT_SOLVER_ASMS_SCHEMA_VERSION} 归一化。`,
      "导入后保存项目文件即可写入当前 ASMS 契约版本。",
    ));
  }
  const normalizedProject = normalizeSolverProject(parsed.project);
  if (JSON.stringify(parsed.project ?? null) !== JSON.stringify(normalizedProject)) {
    diagnostics.push(diagnostic(
      "PROJECT_MODEL_NORMALIZED",
      "info",
      "项目模型已执行归一化",
      "导入时已补齐缺省设置、材料目录、计算书选项和各分析对象工作台状态。",
      "建议打开模型诊断并重新保存项目文件，形成可追踪的当前格式快照。",
    ));
  }

  return {
    ok: true,
    value: {
      schema: ARCHSIGHT_SOLVER_PROJECT_SCHEMA,
      schemaVersion: ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION,
      product: ARCHSIGHT_SOLVER_PRODUCT_ID,
      appVersion: String(parsed.appVersion ?? ""),
      contract: {
        asmsJsonSchemaVersion: ARCHSIGHT_SOLVER_ASMS_SCHEMA_VERSION,
        projectFileSchemaVersion: ARCHSIGHT_SOLVER_PROJECT_FILE_VERSION,
        modelRoundTrip: "normalized",
      },
      manifest: normalizeProjectFileManifest(parsed.manifest),
      createdAt: String(parsed.createdAt ?? ""),
      updatedAt: String(parsed.updatedAt ?? ""),
      project: normalizedProject,
      units: {
        length: "m",
        force: "kN",
        stress: "MPa",
        modulus: "GPa",
        inertia: "cm4",
      },
      diagnostics,
    },
    diagnostics,
  };
}

export function projectFileDiagnosticsMessage(diagnostics: readonly ProjectFileDiagnostic[]): string {
  if (!diagnostics.length) return "";
  const warningCount = diagnostics.filter((item) => item.severity === "warning").length;
  const infoCount = diagnostics.filter((item) => item.severity === "info").length;
  if (warningCount) return `已导入并完成契约迁移诊断：${warningCount} 项需复核，${infoCount} 项提示。`;
  return `已导入并完成契约迁移诊断：${infoCount} 项提示。`;
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
