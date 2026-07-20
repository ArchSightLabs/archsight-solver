import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildProjectChangedMessage,
  buildSaveRequestMessage,
  buildSolverErrorMessage,
  buildSolverReadyMessage,
  HOST_LAUNCH_MESSAGE,
  isHostOriginAllowed,
  normalizeHostOriginList,
  parseHostLaunchMessage,
  parseHostRequestSaveMessage,
  parseHostSaveResultMessage,
  resolveBootstrapHostOrigin,
  type SolverHostMessage,
} from "../lib/host-bridge.ts";
import {
  createHostProtocolState,
  hostProtocolIssueMessage,
  transitionHostProtocol,
} from "../lib/host-protocol-machine.ts";
import type { ProjectFileHandle } from "../lib/project-file.ts";
import type { SolverProject } from "../lib/solver-project.ts";

interface UseSolverHostBridgeOptions {
  project: SolverProject;
  replaceProject: (
    nextProject: SolverProject,
    fileName: string | null,
    handle: ProjectFileHandle | null,
    savedAt: string | null,
    message: string,
  ) => void;
  setFileStatusMessage: (message: string) => void;
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
  project,
  replaceProject,
  setFileStatusMessage,
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
  const protocolStateRef = useRef(createHostProtocolState());
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
    protocolStateRef.current = createHostProtocolState();
    return () => {
      protocolStateRef.current = transitionHostProtocol(protocolStateRef.current, { type: "close" }).state;
    };
  }, []);

  const requestHostSave = useCallback((requestedId?: string, commandBinding?: { sessionId: string; nonce: string }) => {
    const protocolState = protocolStateRef.current;
    if (!protocolState.sessionId || !protocolState.nonce || !hostOrigin) {
      return false;
    }
    const requestId = requestedId?.trim() || globalThis.crypto.randomUUID();
    const transition = transitionHostProtocol(protocolState, {
      type: "request-save",
      sessionId: commandBinding?.sessionId ?? protocolState.sessionId,
      nonce: commandBinding?.nonce ?? protocolState.nonce,
      requestId,
    });
    protocolStateRef.current = transition.state;
    if (!transition.accepted) {
      if (transition.code) setFileStatusMessage(hostProtocolIssueMessage(transition.code));
      return false;
    }
    pendingSaveRequestsRef.current.set(requestId, getProjectRevision());
    postToHost(
      buildSaveRequestMessage(protocolState.sessionId, projectRef.current, protocolState.nonce, requestId),
      hostOrigin,
    );
    return true;
  }, [getProjectRevision, hostOrigin, setFileStatusMessage]);

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
          const transition = transitionHostProtocol(protocolStateRef.current, {
            type: "launch",
            sessionId: launch.sessionId,
            nonce: launch.nonce,
            mode: launch.mode,
          });
          protocolStateRef.current = transition.state;
          if (!transition.accepted) {
            throw new Error(transition.code ? hostProtocolIssueMessage(transition.code) : "Host Protocol launch 被拒绝。");
          }
          if (transition.idempotent) {
            postToHost(buildSolverReadyMessage(launch.sessionId, launch.nonce), event.origin);
            return;
          }
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
          return;
        }
        const requestSave = parseHostRequestSaveMessage(message);
        if (requestSave) {
          if (event.origin !== hostOrigin) return;
          if (!requestHostSave(requestSave.requestId, requestSave)) {
            const issue = protocolStateRef.current.lastIssue;
            throw new Error(issue ? hostProtocolIssueMessage(issue) : "Host Protocol 保存请求被拒绝。");
          }
          return;
        }
        const saveResult = parseHostSaveResultMessage(message);
        if (saveResult) {
          if (event.origin !== hostOrigin) return;
          const transition = transitionHostProtocol(protocolStateRef.current, {
            type: "save-result",
            sessionId: saveResult.sessionId,
            nonce: saveResult.nonce,
            requestId: saveResult.requestId,
          });
          protocolStateRef.current = transition.state;
          if (!transition.accepted) {
            throw new Error(transition.code ? hostProtocolIssueMessage(transition.code) : "Host Protocol 保存回执被拒绝。");
          }
          const projectRevision = pendingSaveRequestsRef.current.get(saveResult.requestId) ?? null;
          pendingSaveRequestsRef.current.delete(saveResult.requestId);
          setFileStatusMessage(saveResult.status === "saved" ? "外部宿主已保存工程。" : `外部宿主保存结果：${saveResult.status}`);
          onHostSaveResult?.(saveResult.status, projectRevision);
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
  }, [allowedOriginList, hostOrigin, nonce, onHostModeChange, onHostSaveResult, replaceProject, requestHostSave, sessionId, setFileStatusMessage]);

  useEffect(() => {
    // React 按声明顺序执行 effect。必须先注册上方的 message listener，再向宿主宣布 ready；
    // 否则宿主同步回发 launch 时，WebKit 可能在监听器安装前丢失该消息。
    if (sessionId && nonce && hostOrigin) {
      protocolStateRef.current = transitionHostProtocol(protocolStateRef.current, { type: "announce-ready" }).state;
      postToHost(buildSolverReadyMessage(sessionId, nonce), hostOrigin);
      return;
    }
    if (bootstrapHostOrigin) {
      protocolStateRef.current = transitionHostProtocol(protocolStateRef.current, { type: "announce-ready" }).state;
      postToHost(buildSolverReadyMessage(null), bootstrapHostOrigin);
    }
  }, [bootstrapHostOrigin, hostOrigin, nonce, sessionId]);

  const emitProjectChanged = useCallback(() => {
    const protocolState = protocolStateRef.current;
    if (!protocolState.sessionId || !protocolState.nonce || !hostOrigin) return;
    const transition = transitionHostProtocol(protocolState, {
      type: "project-changed",
      sessionId: protocolState.sessionId,
      nonce: protocolState.nonce,
    });
    protocolStateRef.current = transition.state;
    if (!transition.accepted) return;
    postToHost(
      buildProjectChangedMessage(protocolState.sessionId, projectRef.current, protocolState.nonce),
      hostOrigin,
    );
  }, [hostOrigin]);

  return {
    hostSessionId: sessionId,
    hostMode: mode,
    hostOrigin,
    hostNonce: nonce,
    emitProjectChanged,
    requestHostSave,
  };
}
