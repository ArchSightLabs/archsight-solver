import { useCallback, useEffect, useRef, useState } from "react";
import {
  buildProjectChangedMessage,
  buildSaveRequestMessage,
  buildSolverErrorMessage,
  buildSolverReadyMessage,
  HOST_SAVE_RESULT_MESSAGE,
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
}

function postToHost(message: SolverHostMessage) {
  if (typeof window === "undefined" || window.parent === window) {
    return;
  }
  window.parent.postMessage(message, "*");
}

export function useSolverHostBridge({
  applyCurrentRuntimeToProject,
  project,
  replaceProject,
  setFileStatusMessage,
  syncRuntimeFromProject,
}: UseSolverHostBridgeOptions) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<"editable" | "readonly">("editable");
  const projectRef = useRef(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    postToHost(buildSolverReadyMessage(sessionId));
  }, [sessionId]);

  useEffect(() => {
    const handleMessage = (event: globalThis.MessageEvent) => {
      const message = event.data;
      try {
        const launch = parseHostLaunchMessage(message);
        if (launch) {
          setSessionId(launch.sessionId);
          setMode(launch.mode);
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
        if (message?.type === HOST_SAVE_RESULT_MESSAGE && message?.sessionId === sessionId) {
          const status = String(message.payload?.status ?? "saved");
          setFileStatusMessage(status === "saved" ? "外部宿主已保存工程。" : `外部宿主保存结果：${status}`);
        }
      } catch (error) {
        postToHost(buildSolverErrorMessage(sessionId, error instanceof Error ? error.message : "host bridge 处理失败。"));
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [replaceProject, sessionId, setFileStatusMessage, syncRuntimeFromProject]);

  const emitProjectChanged = useCallback(() => {
    if (!sessionId || mode === "readonly") {
      return;
    }
    postToHost(buildProjectChangedMessage(sessionId, applyCurrentRuntimeToProject(projectRef.current)));
  }, [applyCurrentRuntimeToProject, mode, sessionId]);

  const requestHostSave = useCallback(() => {
    if (!sessionId || mode === "readonly") {
      return false;
    }
    postToHost(buildSaveRequestMessage(sessionId, applyCurrentRuntimeToProject(projectRef.current)));
    return true;
  }, [applyCurrentRuntimeToProject, mode, sessionId]);

  return {
    hostSessionId: sessionId,
    hostMode: mode,
    emitProjectChanged,
    requestHostSave,
  };
}
