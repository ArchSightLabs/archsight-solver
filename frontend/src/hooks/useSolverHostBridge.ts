import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildProjectChangedMessage,
  buildSaveRequestMessage,
  buildSolverErrorMessage,
  buildSolverReadyMessage,
  HOST_SAVE_RESULT_MESSAGE,
  isHostOriginAllowed,
  normalizeHostOriginList,
  parseHostLaunchMessage,
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
  allowedOrigins,
}: UseSolverHostBridgeOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [nonce, setNonce] = useState<string | null>(null);
  const [mode, setMode] = useState<"editable" | "readonly">("editable");
  const [hostOrigin, setHostOrigin] = useState<string | null>(null);
  const projectRef = useRef(project);
  const allowedOriginList = useMemo(() => normalizeHostOriginList(allowedOrigins), [allowedOrigins]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    postToHost(buildSolverReadyMessage(sessionId, nonce), hostOrigin ?? "*");
  }, [hostOrigin, nonce, sessionId]);

  useEffect(() => {
    const handleMessage = (event: globalThis.MessageEvent) => {
      const message = event.data;
      try {
        if (!isHostOriginAllowed(event.origin, allowedOriginList)) {
          return;
        }
        const launch = parseHostLaunchMessage(message);
        if (launch) {
          setSessionId(launch.sessionId);
          setNonce(launch.nonce);
          setMode(launch.mode);
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
        if (message?.type === HOST_SAVE_RESULT_MESSAGE && message?.sessionId === sessionId && event.origin === hostOrigin && (!nonce || message?.nonce === nonce)) {
          const status = String(message.payload?.status ?? "saved");
          setFileStatusMessage(status === "saved" ? "外部宿主已保存工程。" : `外部宿主保存结果：${status}`);
        }
      } catch (error) {
        postToHost(buildSolverErrorMessage(sessionId, error instanceof Error ? error.message : "host bridge 处理失败。", nonce), hostOrigin ?? event.origin);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [allowedOriginList, hostOrigin, nonce, replaceProject, sessionId, setFileStatusMessage, syncRuntimeFromProject]);

  const emitProjectChanged = useCallback(() => {
    if (!sessionId || !hostOrigin || mode === "readonly") {
      return;
    }
    postToHost(buildProjectChangedMessage(sessionId, applyCurrentRuntimeToProject(projectRef.current), nonce), hostOrigin);
  }, [applyCurrentRuntimeToProject, hostOrigin, mode, nonce, sessionId]);

  const requestHostSave = useCallback(() => {
    if (!sessionId || !hostOrigin || mode === "readonly") {
      return false;
    }
    postToHost(buildSaveRequestMessage(sessionId, applyCurrentRuntimeToProject(projectRef.current), nonce), hostOrigin);
    return true;
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
