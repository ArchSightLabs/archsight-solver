import {
  createArchSightSolverProjectFile,
  parseArchSightSolverProjectFile,
  serializeArchSightSolverProjectFile,
  type ArchSightSolverProjectFile,
} from "./project-file.ts";
import type { SolverProject } from "./solver-project.ts";

export const SOLVER_HOST_PROTOCOL_VERSION = "1.0.0";
export const HOST_LAUNCH_MESSAGE = "archsight.solver.host.launch";
export const HOST_SAVE_RESULT_MESSAGE = "archsight.solver.host.saveResult";
export const SOLVER_READY_MESSAGE = "archsight.solver.ready";
export const SOLVER_PROJECT_CHANGED_MESSAGE = "archsight.solver.project.changed";
export const SOLVER_SAVE_REQUEST_MESSAGE = "archsight.solver.project.saveRequest";
export const SOLVER_ERROR_MESSAGE = "archsight.solver.error";

export interface SolverHostMessage<TPayload = unknown> {
  type: string;
  protocolVersion?: string;
  sessionId?: string;
  nonce?: string;
  payload?: TPayload;
}

export interface HostLaunchPayload {
  projectDocument?: ArchSightSolverProjectFile | string;
  mode?: "editable" | "readonly";
  fileName?: string;
  nonce?: string;
}

export interface HostLaunchResult {
  sessionId: string;
  nonce: string | null;
  mode: "editable" | "readonly";
  projectFile: ArchSightSolverProjectFile;
  fileName: string | null;
}

export function normalizeHostOriginList(value: string | readonly string[] | null | undefined): string[] {
  const items = Array.isArray(value) ? value : String(value ?? "").split(",");
  return items
    .map((item) => item.trim())
    .filter(Boolean);
}

export function isHostOriginAllowed(origin: string, allowedOrigins: readonly string[]): boolean {
  if (allowedOrigins.length === 0) {
    return true;
  }
  return allowedOrigins.includes(origin);
}

export function isSolverHostMessage(value: unknown): value is SolverHostMessage {
  return Boolean(value) && typeof value === "object" && typeof (value as SolverHostMessage).type === "string";
}

export function parseHostLaunchMessage(value: unknown): HostLaunchResult | null {
  if (!isSolverHostMessage(value) || value.type !== HOST_LAUNCH_MESSAGE) {
    return null;
  }
  const payload = value.payload && typeof value.payload === "object" ? value.payload as HostLaunchPayload : {};
  const rawDocument = payload.projectDocument;
  if (!rawDocument) {
    throw new Error("host launch 缺少 projectDocument。");
  }
  const parsed = typeof rawDocument === "string"
    ? parseArchSightSolverProjectFile(rawDocument)
    : parseArchSightSolverProjectFile(serializeArchSightSolverProjectFile(rawDocument));
  if (!parsed.ok || !parsed.value) {
    throw new Error(parsed.error ?? "host launch 项目文件无效。");
  }
  return {
    sessionId: value.sessionId || `host-session-${Date.now()}`,
    nonce: value.nonce || payload.nonce || null,
    mode: payload.mode === "readonly" ? "readonly" : "editable",
    projectFile: parsed.value,
    fileName: payload.fileName || null,
  };
}

export function buildSolverReadyMessage(sessionId: string | null, nonce: string | null = null): SolverHostMessage {
  return {
    type: SOLVER_READY_MESSAGE,
    protocolVersion: SOLVER_HOST_PROTOCOL_VERSION,
    sessionId: sessionId ?? undefined,
    nonce: nonce ?? undefined,
    payload: {
      capabilities: {
        loadProjectDocument: true,
        emitProjectChanged: true,
        emitSaveRequest: true,
        acceptSaveResult: true,
      },
    },
  };
}

export function buildProjectChangedMessage(sessionId: string, project: SolverProject, nonce: string | null = null): SolverHostMessage {
  return {
    type: SOLVER_PROJECT_CHANGED_MESSAGE,
    protocolVersion: SOLVER_HOST_PROTOCOL_VERSION,
    sessionId,
    nonce: nonce ?? undefined,
    payload: {
      projectDocument: createArchSightSolverProjectFile(project),
    },
  };
}

export function buildSaveRequestMessage(sessionId: string, project: SolverProject, nonce: string | null = null): SolverHostMessage {
  return {
    type: SOLVER_SAVE_REQUEST_MESSAGE,
    protocolVersion: SOLVER_HOST_PROTOCOL_VERSION,
    sessionId,
    nonce: nonce ?? undefined,
    payload: {
      projectDocument: createArchSightSolverProjectFile(project),
      reason: "host-managed-persistence",
    },
  };
}

export function buildSolverErrorMessage(sessionId: string | null, message: string, nonce: string | null = null): SolverHostMessage {
  return {
    type: SOLVER_ERROR_MESSAGE,
    protocolVersion: SOLVER_HOST_PROTOCOL_VERSION,
    sessionId: sessionId ?? undefined,
    nonce: nonce ?? undefined,
    payload: { message },
  };
}
