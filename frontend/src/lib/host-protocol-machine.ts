export type HostProtocolPhase =
  | "bootstrap"
  | "negotiating"
  | "active-editable"
  | "active-readonly"
  | "saving"
  | "closed";

export type HostProtocolCondition = "healthy" | "error" | "invalid" | "closed";

export type HostProtocolIssueCode =
  | "session-closed"
  | "invalid-session-binding"
  | "session-binding-mismatch"
  | "session-binding-reused"
  | "session-not-active"
  | "readonly-operation"
  | "invalid-request-id"
  | "duplicate-save-request"
  | "save-in-progress"
  | "stale-save-result";

export interface HostProtocolState {
  phase: HostProtocolPhase;
  condition: HostProtocolCondition;
  sessionId: string | null;
  nonce: string | null;
  mode: "editable" | "readonly" | null;
  pendingSaveRequestId: string | null;
  lastIssue: HostProtocolIssueCode | null;
}

type BoundEvent = { sessionId: string; nonce: string };

export type HostProtocolEvent =
  | { type: "announce-ready" }
  | ({ type: "launch"; mode: "editable" | "readonly" } & BoundEvent)
  | ({ type: "request-save"; requestId: string } & BoundEvent)
  | ({ type: "save-result"; requestId: string } & BoundEvent)
  | ({ type: "project-changed" } & BoundEvent)
  | { type: "close" };

export interface HostProtocolTransition {
  accepted: boolean;
  idempotent: boolean;
  code: HostProtocolIssueCode | null;
  state: HostProtocolState;
}

export function createHostProtocolState(): HostProtocolState {
  return {
    phase: "bootstrap",
    condition: "healthy",
    sessionId: null,
    nonce: null,
    mode: null,
    pendingSaveRequestId: null,
    lastIssue: null,
  };
}

function accepted(state: HostProtocolState, idempotent = false): HostProtocolTransition {
  return { accepted: true, idempotent, code: null, state };
}

function rejected(
  state: HostProtocolState,
  code: HostProtocolIssueCode,
  condition: "error" | "invalid" = "invalid",
): HostProtocolTransition {
  if (state.phase === "closed") {
    return { accepted: false, idempotent: false, code, state };
  }
  return {
    accepted: false,
    idempotent: false,
    code,
    state: { ...state, condition, lastIssue: code },
  };
}

function healthy(state: HostProtocolState): HostProtocolState {
  return state.condition === "healthy" && state.lastIssue === null
    ? state
    : { ...state, condition: "healthy", lastIssue: null };
}

function hasValidBinding(event: BoundEvent): boolean {
  return Boolean(event.sessionId.trim() && event.nonce.trim());
}

function bindingMatches(state: HostProtocolState, event: BoundEvent): boolean {
  return state.sessionId === event.sessionId && state.nonce === event.nonce;
}

export function transitionHostProtocol(
  state: HostProtocolState,
  event: HostProtocolEvent,
): HostProtocolTransition {
  if (event.type === "close") {
    if (state.phase === "closed") return accepted(state, true);
    return accepted({
      phase: "closed",
      condition: "closed",
      sessionId: null,
      nonce: null,
      mode: null,
      pendingSaveRequestId: null,
      lastIssue: null,
    });
  }

  if (state.phase === "closed") {
    return rejected(state, "session-closed");
  }

  if (event.type === "announce-ready") {
    if (state.phase !== "bootstrap") return accepted(healthy(state), true);
    return accepted({ ...state, phase: "negotiating", condition: "healthy", lastIssue: null });
  }

  if (!hasValidBinding(event)) {
    return rejected(state, "invalid-session-binding");
  }

  if (event.type === "launch") {
    if (bindingMatches(state, event)) {
      if (state.mode !== event.mode) {
        return rejected(state, "session-binding-reused", "error");
      }
      return accepted(state, true);
    }
    return accepted({
      phase: event.mode === "readonly" ? "active-readonly" : "active-editable",
      condition: "healthy",
      sessionId: event.sessionId,
      nonce: event.nonce,
      mode: event.mode,
      pendingSaveRequestId: null,
      lastIssue: null,
    });
  }

  if (!bindingMatches(state, event)) {
    return rejected(state, "session-binding-mismatch");
  }

  if (event.type === "project-changed") {
    if (state.phase === "active-readonly") {
      return rejected(state, "readonly-operation", "error");
    }
    if (state.phase !== "active-editable" && state.phase !== "saving") {
      return rejected(state, "session-not-active", "error");
    }
    return accepted(healthy(state));
  }

  const requestId = event.requestId.trim();
  if (!requestId) {
    return rejected(state, "invalid-request-id", "error");
  }

  if (event.type === "request-save") {
    if (state.phase === "active-readonly") {
      return rejected(state, "readonly-operation", "error");
    }
    if (state.phase === "saving") {
      return rejected(
        state,
        state.pendingSaveRequestId === requestId ? "duplicate-save-request" : "save-in-progress",
        state.pendingSaveRequestId === requestId ? "invalid" : "error",
      );
    }
    if (state.phase !== "active-editable") {
      return rejected(state, "session-not-active", "error");
    }
    return accepted({
      ...state,
      phase: "saving",
      condition: "healthy",
      pendingSaveRequestId: requestId,
      lastIssue: null,
    });
  }

  if (state.phase !== "saving" || state.pendingSaveRequestId !== requestId) {
    return rejected(state, "stale-save-result");
  }
  return accepted({
    ...state,
    phase: "active-editable",
    condition: "healthy",
    pendingSaveRequestId: null,
    lastIssue: null,
  });
}

export function hostProtocolIssueMessage(code: HostProtocolIssueCode): string {
  const messages: Record<HostProtocolIssueCode, string> = {
    "session-closed": "Host Protocol 会话已经关闭。",
    "invalid-session-binding": "Host Protocol 消息必须提供非空 sessionId 与 nonce。",
    "session-binding-mismatch": "Host Protocol 消息不属于当前 sessionId 与 nonce。",
    "session-binding-reused": "同一 sessionId 与 nonce 不得切换 editable/readonly 模式。",
    "session-not-active": "Host Protocol 会话尚未进入可操作状态。",
    "readonly-operation": "只读 Host Protocol 会话不允许修改或保存工程。",
    "invalid-request-id": "Host Protocol 保存消息必须提供非空 requestId。",
    "duplicate-save-request": "相同 requestId 的保存请求正在处理中。",
    "save-in-progress": "已有 Host Protocol 保存请求正在处理中。",
    "stale-save-result": "Host Protocol 保存回执不匹配当前 requestId，已作为陈旧回执忽略。",
  };
  return messages[code];
}
