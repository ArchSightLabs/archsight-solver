import {
  createArchSightSolverProjectFile,
  parseArchSightSolverProjectFile,
  serializeArchSightSolverProjectFile,
  type ArchSightSolverProjectFile,
} from "./project-file.ts";
import type { SolverProject } from "./solver-project.ts";
import {
  SOLVER_HOST_CAPABILITIES,
  SOLVER_HOST_PROTOCOL_VERSION,
} from "./generated/solver-contract.ts";

export { SOLVER_HOST_CAPABILITIES, SOLVER_HOST_PROTOCOL_VERSION };
export const HOST_LAUNCH_MESSAGE = "archsight.solver.host.launch";
export const HOST_REQUEST_SAVE_MESSAGE = "archsight.solver.host.requestSave";
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
  nonce: string;
  mode: "editable" | "readonly";
  projectFile: ArchSightSolverProjectFile;
  fileName: string | null;
}

export interface HostRequestSaveCommand {
  sessionId: string;
  nonce: string;
  requestId: string;
}

export interface HostSaveResultCommand extends HostRequestSaveCommand {
  status: "saved" | "failed" | "conflict";
}

export function normalizeHostOriginList(value: string | readonly string[] | null | undefined): string[] {
  const items = Array.isArray(value) ? value : String(value ?? "").split(",");
  return Array.from(new Set(items
    .map((item) => normalizeHttpOrigin(item))
    .filter((item): item is string => Boolean(item))));
}

function normalizeHttpOrigin(value: string): string | null {
  const candidate = value.trim();
  if (!candidate) {
    return null;
  }
  try {
    const parsed = new URL(candidate);
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      || parsed.origin === "null"
      || parsed.username
      || parsed.password
      || (parsed.pathname !== "/" && parsed.pathname !== "")
      || parsed.search
      || parsed.hash
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isHostOriginAllowed(
  origin: string,
  allowedOrigins: readonly string[],
  solverOrigin = typeof window !== "undefined" ? window.location.origin : "",
): boolean {
  const normalizedOrigin = normalizeHttpOrigin(origin);
  if (!normalizedOrigin || normalizedOrigin !== origin) {
    return false;
  }
  const normalizedSolverOrigin = normalizeHttpOrigin(solverOrigin);
  if (normalizedSolverOrigin && normalizedOrigin === normalizedSolverOrigin) {
    return true;
  }
  return allowedOrigins.includes(normalizedOrigin);
}

export function resolveBootstrapHostOrigin(
  referrer: string,
  allowedOrigins: readonly string[],
  solverOrigin: string,
): string | null {
  if (!referrer) {
    return null;
  }
  try {
    const origin = new URL(referrer).origin;
    return isHostOriginAllowed(origin, allowedOrigins, solverOrigin) ? origin : null;
  } catch {
    return null;
  }
}

export function isSolverHostMessage(value: unknown): value is SolverHostMessage {
  return Boolean(value) && typeof value === "object" && typeof (value as SolverHostMessage).type === "string";
}

export function parseHostLaunchMessage(value: unknown): HostLaunchResult | null {
  if (!isSolverHostMessage(value) || value.type !== HOST_LAUNCH_MESSAGE) {
    return null;
  }
  if (value.protocolVersion !== SOLVER_HOST_PROTOCOL_VERSION) {
    throw new Error(`host 协议版本不匹配，期望 ${SOLVER_HOST_PROTOCOL_VERSION}。`);
  }
  const sessionId = String(value.sessionId ?? "").trim();
  const nonce = String(value.nonce ?? "").trim();
  if (!sessionId || !nonce) {
    throw new Error("host launch 必须提供非空 sessionId 与 nonce。");
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
    sessionId,
    nonce,
    mode: payload.mode === "readonly" ? "readonly" : "editable",
    projectFile: parsed.value,
    fileName: payload.fileName || null,
  };
}

function parseBoundHostCommand(value: unknown, expectedType: string): {
  message: SolverHostMessage<Record<string, unknown>>;
  sessionId: string;
  nonce: string;
  requestId: string;
} | null {
  if (!isSolverHostMessage(value) || value.type !== expectedType) return null;
  if (value.protocolVersion !== SOLVER_HOST_PROTOCOL_VERSION) {
    throw new Error(`host 协议版本不匹配，期望 ${SOLVER_HOST_PROTOCOL_VERSION}。`);
  }
  const sessionId = String(value.sessionId ?? "").trim();
  const nonce = String(value.nonce ?? "").trim();
  if (!sessionId || !nonce) throw new Error("host 消息必须提供非空 sessionId 与 nonce。");
  const payload = value.payload && typeof value.payload === "object"
    ? value.payload as Record<string, unknown>
    : {};
  const requestId = String(payload.requestId ?? "").trim();
  if (!requestId) throw new Error(`${expectedType} 必须提供非空 requestId。`);
  return { message: { ...value, payload }, sessionId, nonce, requestId };
}

export function parseHostRequestSaveMessage(value: unknown): HostRequestSaveCommand | null {
  const command = parseBoundHostCommand(value, HOST_REQUEST_SAVE_MESSAGE);
  if (!command) return null;
  return { sessionId: command.sessionId, nonce: command.nonce, requestId: command.requestId };
}

export function parseHostSaveResultMessage(value: unknown): HostSaveResultCommand | null {
  const command = parseBoundHostCommand(value, HOST_SAVE_RESULT_MESSAGE);
  if (!command) return null;
  const rawStatus = String(command.message.payload?.status ?? "").trim();
  if (rawStatus !== "saved" && rawStatus !== "failed" && rawStatus !== "conflict") {
    throw new Error(`${HOST_SAVE_RESULT_MESSAGE} status 必须是 saved、failed 或 conflict。`);
  }
  return { sessionId: command.sessionId, nonce: command.nonce, requestId: command.requestId, status: rawStatus };
}

export function buildSolverReadyMessage(sessionId: string | null, nonce: string | null = null): SolverHostMessage {
  const sessionBinding = sessionId?.trim() && nonce?.trim()
    ? { sessionId: sessionId.trim(), nonce: nonce.trim() }
    : {};
  return {
    type: SOLVER_READY_MESSAGE,
    protocolVersion: SOLVER_HOST_PROTOCOL_VERSION,
    ...sessionBinding,
    payload: {
      capabilities: SOLVER_HOST_CAPABILITIES,
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

export function buildSaveRequestMessage(
  sessionId: string,
  project: SolverProject,
  nonce: string | null = null,
  requestId: string | null = null,
): SolverHostMessage {
  return {
    type: SOLVER_SAVE_REQUEST_MESSAGE,
    protocolVersion: SOLVER_HOST_PROTOCOL_VERSION,
    sessionId,
    nonce: nonce ?? undefined,
    payload: {
      projectDocument: createArchSightSolverProjectFile(project),
      reason: "host-managed-persistence",
      ...(requestId ? { requestId } : {}),
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
