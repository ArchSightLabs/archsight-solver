import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildProjectChangedMessage,
  buildSaveRequestMessage,
  buildSolverErrorMessage,
  buildSolverReadyMessage,
  HOST_LAUNCH_MESSAGE,
  HOST_REQUEST_SAVE_MESSAGE,
  HOST_SAVE_RESULT_MESSAGE,
  isHostOriginAllowed,
  normalizeHostOriginList,
  parseHostLaunchMessage,
  resolveBootstrapHostOrigin,
  type SolverHostMessage,
} from "../lib/host-bridge.ts";
import type { ProjectFileHandle } from "../lib/project-file.ts";
import type { SolverProject } from "../lib/solver-project.ts";

interface UseSolverHostBridgeOptions {
  applyCurrentRuntimeToProject: (sourceProject: SolverProject) => SolverProject;
  project: SolverProject;
  replaceProject: (
    nextProject: SolverProject,
    fileName: string | null,
    handle: ProjectFileHandle | null,
    savedAt: string | null,
    message: string,
  ) => void;
  setFileStatusMessage: (message: string) => void;
  syncRuntimeFromProject: (project: SolverProject) => void;
  onHostModeChange?: (mode: "editable" | "readonly") => void;
  getProjectRevision: () => number;
  onHostSaveResult?: (status: string, projectRevision: number | null) => void;
  allowedOrigins?: string | readonly string[] | null;
}

function postToHost(message: SolverHostMessage, targetOrigin: string) {
  if (typeof window === "undefined" || window.parent === window) {
    return;
  }
  window.parent.postMessage(message, targetOrigin);
}

export function useSolverHostBridge({
  applyCurrentRuntimeToProject,
  project,
  replaceProject,
  setFileStatusMessage,
  syncRuntimeFromProject,
  onHostModeChange,
  getProjectRevision,
  onHostSaveResult,
  allowedOrigins,
}: UseSolverHostBridgeOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);
  const [mode, setMode] = useState<"editable" | "readonly">("editable");
  const [hostOrigin, setHostOrigin] = useState<string | null>(null);
  const projectRef = useRef(project);
  const pendingSaveRequestsRef = useRef(new Map<string, number>());
  const allowedOriginList = useMemo(() => normalizeHostOriginList(allowedOrigins), [allowedOrigins]);
  const bootstrapHostOrigin = useMemo(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return resolveBootstrapHostOrigin(document.referrer, allowedOriginList, window.location.origin);
  }, [allowedOriginList]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    if (sessionId && nonce && hostOrigin) {
      postToHost(buildSolverReadyMessage(sessionId, nonce), hostOrigin);
      return;
    }
    if (bootstrapHostOrigin) {
      postToHost(buildSolverReadyMessage(null), bootstrapHostOrigin);
    }
  }, [bootstrapHostOrigin, hostOrigin, nonce, sessionId]);

  const requestHostSave = useCallback((requestedId?: string) => {
    if (!sessionId || !hostOrigin || mode === "readonly") {
      return false;
    }
    const requestId = requestedId?.trim() || globalThis.crypto.randomUUID();
    pendingSaveRequestsRef.current.set(requestId, getProjectRevision());
    postToHost(
      buildSaveRequestMessage(sessionId, applyCurrentRuntimeToProject(projectRef.current), nonce, requestId),
      hostOrigin,
    );
    return true;
  }, [applyCurrentRuntimeToProject, getProjectRevision, hostOrigin, mode, nonce, sessionId]);

  useEffect(() => {
    const handleMessage = (event: globalThis.MessageEvent) => {
      const message = event.data;
      try {
        if (event.source !== window.parent) {
          return;
        }
        if (!isHostOriginAllowed(event.origin, allowedOriginList)) {
          return;
        }
        const launch = parseHostLaunchMessage(message);
        if (launch) {
          pendingSaveRequestsRef.current.clear();
          setSessionId(launch.sessionId);
          setNonce(launch.nonce);
          setMode(launch.mode);
          onHostModeChange?.(launch.mode);
          setHostOrigin(event.origin);
          replaceProject(
            launch.projectFile.project,
            launch.fileName,
            null,
            launch.projectFile.updatedAt,
            launch.mode === "readonly" ? "已从外部宿主加载只读工程。" : "已从外部宿主加载工程。"
          );
          syncRuntimeFromProject(launch.projectFile.project);
          return;
        }
        if (
          message?.type === HOST_REQUEST_SAVE_MESSAGE
          && message?.protocolVersion === "1.0.0"
          && message?.sessionId === sessionId
          && message?.nonce === nonce
          && event.origin === hostOrigin
        ) {
          const requestId = String(message.payload?.requestId ?? "").trim();
          if (!requestId) {
            throw new Error("host requestSave 必须提供非空 requestId。");
          }
          requestHostSave(requestId);
          return;
        }
        if (
          message?.type === HOST_SAVE_RESULT_MESSAGE
          && message?.protocolVersion === "1.0.0"
          && message?.sessionId === sessionId
          && message?.nonce === nonce
          && event.origin === hostOrigin
        ) {
          const status = String(message.payload?.status ?? "saved");
          const requestId = String(message.payload?.requestId ?? "").trim();
          const projectRevision = requestId
            ? pendingSaveRequestsRef.current.get(requestId) ?? null
            : null;
          if (requestId) {
            pendingSaveRequestsRef.current.delete(requestId);
          }
          setFileStatusMessage(status === "saved" ? "外部宿主已保存工程。" : `外部宿主保存结果：${status}`);
          onHostSaveResult?.(status, projectRevision);
        }
      } catch (error) {
        const messageSessionId = typeof message?.sessionId === "string" ? message.sessionId.trim() : "";
        const messageNonce = typeof message?.nonce === "string" ? message.nonce.trim() : "";
        const isLaunchError = message?.type === HOST_LAUNCH_MESSAGE;
        const errorSessionId = isLaunchError ? messageSessionId : sessionId ?? messageSessionId;
        const errorNonce = isLaunchError ? messageNonce : nonce ?? messageNonce;
        if (errorSessionId && errorNonce) {
          postToHost(
            buildSolverErrorMessage(errorSessionId, error instanceof Error ? error.message : "host bridge 处理失败。", errorNonce),
            hostOrigin ?? event.origin,
          );
        }
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [allowedOriginList, hostOrigin, nonce, onHostModeChange, onHostSaveResult, replaceProject, requestHostSave, sessionId, setFileStatusMessage, syncRuntimeFromProject]);

  const emitProjectChanged = useCallback(() => {
    if (!sessionId || !hostOrigin || mode === "readonly") {
      return;
    }
    postToHost(buildProjectChangedMessage(sessionId, applyCurrentRuntimeToProject(projectRef.current), nonce), hostOrigin);
  }, [applyCurrentRuntimeToProject, hostOrigin, mode, nonce, sessionId]);

  return {
    hostSessionId: sessionId,
    hostMode: mode,
    hostOrigin,
    hostNonce: nonce,
    emitProjectChanged,
    requestHostSave,
  };
}
