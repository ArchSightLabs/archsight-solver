/** 无框架、无运行时依赖的 Host Protocol 1.0 浏览器客户端；同步产物供 Reference Host 直接导入。 */
export const SOLVER_HOST_CLIENT_PROTOCOL_VERSION = "1.0.0";
export const SOLVER_HOST_CLIENT_REQUIRED_CAPABILITIES = Object.freeze({
    loadProjectDocument: true,
    emitProjectChanged: true,
    acceptHostSaveRequest: true,
    emitSaveRequest: true,
    acceptSaveResult: true,
});
// Keep this list in lockstep with Solver's Host Portal allowlist.  Actions
// carry no document body; persistence still uses requestSave/saveResult.
export const SOLVER_HOST_PORTAL_ACTIONS = ["project", "new", "open", "save", "saveAs", "versions", "share"];
export class SolverHostClientError extends Error {
    constructor(code, message) {
        super(message);
        this.name = "SolverHostClientError";
        this.code = code;
    }
}
const DEFAULT_LAUNCH_TIMEOUT_MS = 30000;
const DEFAULT_LAUNCH_RETRY_MS = 1500;
const DEFAULT_SAVE_TIMEOUT_MS = 8000;
function asRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function normalizeOrigin(value) {
    const parsed = new URL(value);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || parsed.origin === "null") {
        throw new SolverHostClientError("invalid-solver-origin", "Solver origin 必须是有效的 http/https origin。");
    }
    return parsed.origin;
}
function defaultMessageTarget() {
    if (typeof window === "undefined") {
        throw new SolverHostClientError("missing-message-target", "非浏览器环境必须提供 messageTarget。");
    }
    return window;
}
function defaultId() {
    return globalThis.crypto.randomUUID();
}
function normalizeHostUiActions(value) {
    if (!Array.isArray(value))
        return [];
    return Array.from(new Set(value.filter((action) => (typeof action === "string" && SOLVER_HOST_PORTAL_ACTIONS.includes(action)))));
}
function parseTheme(value) {
    return value === "light" || value === "dark" ? value : null;
}
export class SolverHostClient {
    constructor(options) {
        this.state = {
            phase: "idle",
            sessionId: null,
            nonce: null,
            mode: null,
            pendingRequestId: null,
            compatible: null,
            theme: null,
        };
        this.pendingLaunch = null;
        this.pendingSave = null;
        this.expiredSaveRequestIds = new Set();
        this.consumedPortalActionRequestIds = new Set();
        this.activeHostUiActions = new Set();
        this.portalActionsSupported = false;
        this.themeStateSupported = false;
        this.handleMessage = (event) => {
            const solverWindow = this.getSolverWindow();
            if (!solverWindow || event.source !== solverWindow || event.origin !== this.solverOrigin)
                return;
            const message = asRecord(event.data);
            if (!message || typeof message.type !== "string")
                return;
            this.onMessage?.("solver.in", message);
            if (message.protocolVersion !== SOLVER_HOST_CLIENT_PROTOCOL_VERSION) {
                const error = this.error("protocol-version-mismatch", `Host Client 期望协议 ${SOLVER_HOST_CLIENT_PROTOCOL_VERSION}。`);
                this.failPending(error);
                return;
            }
            if (message.type === "archsight.solver.ready") {
                this.handleReady(message);
                return;
            }
            if (!this.isCurrentBinding(message))
                return;
            if (message.type === "archsight.solver.project.changed") {
                const projectDocument = message.payload?.projectDocument;
                if (projectDocument && (this.state.phase === "active-editable" || this.state.phase === "saving")) {
                    this.onProjectChanged?.(projectDocument);
                }
                return;
            }
            if (message.type === "archsight.solver.project.saveRequest") {
                this.handleSaveSnapshot(message);
                return;
            }
            if (message.type === "archsight.solver.portal.actionRequested") {
                this.handlePortalAction(message);
                return;
            }
            if (message.type === "archsight.solver.theme.changed") {
                this.handleThemeChanged(message);
                return;
            }
            if (message.type === "archsight.solver.error") {
                const error = this.error("solver-error", String(message.payload?.message || "Solver 拒绝了宿主操作。"));
                this.failPending(error);
            }
        };
        this.getSolverWindow = options.getSolverWindow;
        this.solverOrigin = normalizeOrigin(options.solverOrigin);
        this.messageTarget = options.messageTarget ?? defaultMessageTarget();
        this.requiredCapabilities = options.requiredCapabilities ?? Object.keys(SOLVER_HOST_CLIENT_REQUIRED_CAPABILITIES);
        this.createId = options.createId ?? defaultId;
        this.launchTimeoutMs = options.launchTimeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS;
        this.launchRetryMs = options.launchRetryMs ?? DEFAULT_LAUNCH_RETRY_MS;
        this.saveTimeoutMs = options.saveTimeoutMs ?? DEFAULT_SAVE_TIMEOUT_MS;
        this.onProjectChanged = options.onProjectChanged;
        this.onPortalActionRequested = options.onPortalActionRequested;
        this.onStateChange = options.onStateChange;
        this.onMessage = options.onMessage;
        this.onError = options.onError;
        this.messageTarget.addEventListener("message", this.handleMessage);
    }
    get snapshot() {
        return { ...this.state };
    }
    get supportsPortalActions() {
        return this.portalActionsSupported;
    }
    launch(input) {
        if (this.state.phase === "disposed")
            return Promise.reject(this.error("disposed", "Host Client 已释放。"));
        if (!input.projectDocument || typeof input.projectDocument !== "object") {
            return Promise.reject(this.error("invalid-project-document", "launch 必须提供结构化 projectDocument。"));
        }
        this.rejectPendingLaunch(this.error("launch-replaced", "新的 launch 已替换上一条待处理请求。"));
        this.rejectPendingSave(this.error("launch-replaced", "新的 launch 已取消待处理保存请求。"));
        const hostUiActions = normalizeHostUiActions(input.hostUiActions);
        this.activeHostUiActions = new Set(hostUiActions);
        this.consumedPortalActionRequestIds.clear();
        this.themeStateSupported = false;
        const mode = input.mode === "readonly" ? "readonly" : "editable";
        this.setState({
            phase: this.state.compatible === true ? "launching" : "negotiating",
            sessionId: `host-session-${this.createId()}`,
            nonce: `host-nonce-${this.createId()}`,
            mode,
            pendingRequestId: null,
            theme: null,
        });
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                const error = this.error("launch-timeout", "等待 Solver 确认 launch 超时。");
                this.rejectPendingLaunch(error);
                this.setState({ phase: "error" });
                this.onError?.(error);
            }, this.launchTimeoutMs);
            this.pendingLaunch = { input: { ...input, mode, hostUiActions }, resolve, reject, timeout, retry: null };
            if (this.state.compatible === true)
                this.sendPendingLaunch();
        });
    }
    requestSave(reason = "host-managed-persistence", requestId = `host-save-${this.createId()}`) {
        if (this.state.phase === "disposed")
            return Promise.reject(this.error("disposed", "Host Client 已释放。"));
        if (this.state.phase === "active-readonly")
            return Promise.reject(this.error("readonly-operation", "只读会话不能保存工程。"));
        if (this.state.phase === "saving" || this.pendingSave)
            return Promise.reject(this.error("save-in-progress", "已有保存请求正在处理。"));
        if (this.state.phase !== "active-editable" || !this.state.sessionId || !this.state.nonce) {
            return Promise.reject(this.error("session-not-active", "Host Client 尚未建立可编辑会话。"));
        }
        const normalizedRequestId = requestId.trim();
        if (!normalizedRequestId || normalizedRequestId.length > 200) {
            return Promise.reject(this.error("invalid-request-id", "保存请求必须提供不超过 200 字符的非空 requestId。"));
        }
        this.setState({ phase: "saving", pendingRequestId: normalizedRequestId });
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                if (this.pendingSave?.requestId !== normalizedRequestId)
                    return;
                const error = this.error("save-timeout", "保存请求超时，Solver 未返回工程快照。");
                this.expireSaveRequest(normalizedRequestId);
                this.pendingSave = null;
                this.setState({ phase: "active-editable", pendingRequestId: null });
                reject(error);
                this.onError?.(error);
            }, this.saveTimeoutMs);
            this.pendingSave = { requestId: normalizedRequestId, resolve, reject, timeout, snapshotReceived: false };
            this.post({
                type: "archsight.solver.host.requestSave",
                protocolVersion: SOLVER_HOST_CLIENT_PROTOCOL_VERSION,
                sessionId: this.state.sessionId,
                nonce: this.state.nonce,
                payload: { requestId: normalizedRequestId, reason },
            });
        });
    }
    sendSaveResult(result) {
        if (this.state.phase === "disposed")
            throw this.error("disposed", "Host Client 已释放。");
        if (!this.pendingSave || !this.pendingSave.snapshotReceived || this.pendingSave.requestId !== result.requestId) {
            throw this.error("stale-save-result", "saveResult 不匹配当前已返回快照的 requestId。");
        }
        if (!this.state.sessionId || !this.state.nonce)
            throw this.error("session-not-active", "Host Client 会话绑定缺失。");
        this.post({
            type: "archsight.solver.host.saveResult",
            protocolVersion: SOLVER_HOST_CLIENT_PROTOCOL_VERSION,
            sessionId: this.state.sessionId,
            nonce: this.state.nonce,
            payload: {
                requestId: result.requestId,
                status: result.status,
                ...(result.revision ? { revision: result.revision } : {}),
            },
        });
        clearTimeout(this.pendingSave.timeout);
        this.pendingSave = null;
        this.setState({ phase: "active-editable", pendingRequestId: null });
    }
    dispose() {
        if (this.state.phase === "disposed")
            return;
        const error = this.error("disposed", "Host Client 已释放。未完成操作已取消。");
        this.rejectPendingLaunch(error);
        this.rejectPendingSave(error);
        this.messageTarget.removeEventListener("message", this.handleMessage);
        this.setState({
            phase: "disposed",
            sessionId: null,
            nonce: null,
            mode: null,
            pendingRequestId: null,
            theme: null,
        });
    }
    focusSolver() {
        this.getSolverWindow()?.focus?.();
    }
    handleReady(message) {
        const hasSessionId = Boolean(String(message.sessionId ?? "").trim());
        const hasNonce = Boolean(String(message.nonce ?? "").trim());
        if (hasSessionId !== hasNonce) {
            this.failPending(this.error("invalid-ready-binding", "Solver ready 必须同时提供 sessionId 与 nonce。"));
            return;
        }
        const capabilities = asRecord(message.payload?.capabilities) ?? {};
        const missing = this.requiredCapabilities.filter((name) => capabilities[name] !== true);
        if (missing.length > 0) {
            this.setState({ compatible: false, phase: "error" });
            this.failPending(this.error("incompatible-capabilities", `Solver 缺少必要接入能力：${missing.join(", ")}`));
            return;
        }
        if (!hasSessionId) {
            // A delayed bootstrap ready must not replace the capability/theme state
            // of an established (or replacement-pending) bound session.
            if (this.state.sessionId || this.state.nonce)
                return;
            this.portalActionsSupported = capabilities.requestPortalAction === true;
            this.themeStateSupported = capabilities.emitThemeChanged === true;
            const theme = parseTheme(message.payload?.theme);
            this.setState({ compatible: true, ...(theme ? { theme } : {}) });
            if (this.pendingLaunch) {
                this.setState({ phase: "launching" });
                this.sendPendingLaunch();
            }
            return;
        }
        if (!this.isCurrentBinding(message))
            return;
        this.portalActionsSupported = capabilities.requestPortalAction === true;
        this.themeStateSupported = capabilities.emitThemeChanged === true;
        const theme = parseTheme(message.payload?.theme);
        if (theme)
            this.setState({ theme });
        if (!this.pendingLaunch)
            return;
        const pending = this.pendingLaunch;
        this.pendingLaunch = null;
        clearTimeout(pending.timeout);
        if (pending.retry)
            clearInterval(pending.retry);
        this.setState({ phase: this.state.mode === "readonly" ? "active-readonly" : "active-editable", compatible: true });
        pending.resolve();
    }
    handleThemeChanged(message) {
        if (!this.themeStateSupported)
            return;
        const theme = parseTheme(message.payload?.theme);
        if (theme)
            this.setState({ theme });
    }
    handleSaveSnapshot(message) {
        const requestId = String(message.payload?.requestId ?? "").trim();
        if (!requestId)
            return;
        if (this.expiredSaveRequestIds.has(requestId)) {
            this.onError?.(this.error("late-save-snapshot", "已忽略超时后返回的保存快照。"));
            return;
        }
        if (!this.pendingSave || this.pendingSave.requestId !== requestId || this.pendingSave.snapshotReceived)
            return;
        const projectDocument = message.payload?.projectDocument;
        if (!projectDocument || typeof projectDocument !== "object") {
            const error = this.error("invalid-save-snapshot", "Solver 保存快照缺少 projectDocument。");
            this.rejectPendingSave(error);
            this.setState({ phase: "active-editable", pendingRequestId: null });
            this.onError?.(error);
            return;
        }
        clearTimeout(this.pendingSave.timeout);
        this.pendingSave.snapshotReceived = true;
        this.pendingSave.resolve({ requestId, projectDocument });
    }
    handlePortalAction(message) {
        if (!this.portalActionsSupported
            || (this.state.phase !== "active-editable" && this.state.phase !== "active-readonly" && this.state.phase !== "saving"))
            return;
        const action = String(message.payload?.action ?? "").trim();
        const requestId = String(message.payload?.requestId ?? "").trim();
        if (!requestId || !this.activeHostUiActions.has(action))
            return;
        if (action === "save" && (this.state.phase === "active-readonly" || this.state.phase === "saving"))
            return;
        if (this.consumedPortalActionRequestIds.has(requestId))
            return;
        this.consumedPortalActionRequestIds.add(requestId);
        while (this.consumedPortalActionRequestIds.size > 50) {
            const oldest = this.consumedPortalActionRequestIds.values().next().value;
            if (typeof oldest !== "string")
                break;
            this.consumedPortalActionRequestIds.delete(oldest);
        }
        this.onPortalActionRequested?.({ action: action, requestId });
    }
    sendPendingLaunch() {
        if (!this.pendingLaunch || !this.state.sessionId || !this.state.nonce)
            return;
        const send = () => {
            if (!this.pendingLaunch)
                return;
            this.post({
                type: "archsight.solver.host.launch",
                protocolVersion: SOLVER_HOST_CLIENT_PROTOCOL_VERSION,
                sessionId: this.state.sessionId,
                nonce: this.state.nonce,
                payload: {
                    mode: this.state.mode,
                    ...(this.pendingLaunch.input.fileName ? { fileName: this.pendingLaunch.input.fileName } : {}),
                    ...(this.pendingLaunch.input.hostUiActions?.length ? { hostUiActions: this.pendingLaunch.input.hostUiActions } : {}),
                    projectDocument: this.pendingLaunch.input.projectDocument,
                },
            });
        };
        send();
        if (!this.pendingLaunch.retry)
            this.pendingLaunch.retry = setInterval(send, this.launchRetryMs);
    }
    post(message) {
        const solverWindow = this.getSolverWindow();
        if (!solverWindow)
            throw this.error("solver-window-unavailable", "Solver iframe window 尚不可用。");
        solverWindow.postMessage(message, this.solverOrigin);
        this.onMessage?.("host.out", message);
    }
    isCurrentBinding(message) {
        return Boolean(this.state.sessionId
            && this.state.nonce
            && message.sessionId === this.state.sessionId
            && message.nonce === this.state.nonce);
    }
    setState(update) {
        this.state = { ...this.state, ...update };
        this.onStateChange?.(this.snapshot);
    }
    rejectPendingLaunch(error) {
        if (!this.pendingLaunch)
            return;
        const pending = this.pendingLaunch;
        this.pendingLaunch = null;
        clearTimeout(pending.timeout);
        if (pending.retry)
            clearInterval(pending.retry);
        pending.reject(error);
    }
    rejectPendingSave(error) {
        if (!this.pendingSave)
            return;
        const pending = this.pendingSave;
        this.pendingSave = null;
        clearTimeout(pending.timeout);
        pending.reject(error);
    }
    failPending(error) {
        this.rejectPendingLaunch(error);
        this.rejectPendingSave(error);
        this.setState({ phase: "error", pendingRequestId: null });
        this.onError?.(error);
    }
    expireSaveRequest(requestId) {
        this.expiredSaveRequestIds.add(requestId);
        while (this.expiredSaveRequestIds.size > 20) {
            const oldest = this.expiredSaveRequestIds.values().next().value;
            if (typeof oldest !== "string")
                break;
            this.expiredSaveRequestIds.delete(oldest);
        }
    }
    error(code, message) {
        return new SolverHostClientError(code, message);
    }
}
