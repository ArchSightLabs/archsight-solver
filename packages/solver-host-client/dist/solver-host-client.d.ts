/** 无框架、无运行时依赖的 Host Protocol 1.0 浏览器客户端；同步产物供 Reference Host 直接导入。 */
export declare const SOLVER_HOST_CLIENT_PROTOCOL_VERSION = "1.0.0";
export declare const SOLVER_HOST_CLIENT_REQUIRED_CAPABILITIES: Readonly<{
    loadProjectDocument: true;
    emitProjectChanged: true;
    acceptHostSaveRequest: true;
    emitSaveRequest: true;
    acceptSaveResult: true;
}>;
export type SolverHostClientPhase = "idle" | "negotiating" | "launching" | "active-editable" | "active-readonly" | "saving" | "error" | "disposed";
export interface SolverHostClientSnapshot {
    phase: SolverHostClientPhase;
    sessionId: string | null;
    nonce: string | null;
    mode: "editable" | "readonly" | null;
    pendingRequestId: string | null;
    compatible: boolean | null;
}
export interface SolverHostClientMessageEvent {
    data: unknown;
    origin: string;
    source: unknown;
}
export interface SolverHostClientMessageTarget {
    addEventListener(type: "message", listener: (event: SolverHostClientMessageEvent) => void): void;
    removeEventListener(type: "message", listener: (event: SolverHostClientMessageEvent) => void): void;
}
export interface SolverHostClientWindow {
    postMessage(message: unknown, targetOrigin: string): void;
    focus?(): void;
}
export declare const SOLVER_HOST_PORTAL_ACTIONS: readonly ["project", "save", "versions", "share"];
export type SolverHostPortalAction = (typeof SOLVER_HOST_PORTAL_ACTIONS)[number];
export interface SolverHostClientLaunchOptions {
    projectDocument: unknown;
    mode?: "editable" | "readonly";
    fileName?: string;
    hostUiActions?: readonly SolverHostPortalAction[];
}
export interface SolverHostClientPortalActionRequest {
    action: SolverHostPortalAction;
    requestId: string;
}
export interface SolverHostClientSaveSnapshot {
    requestId: string;
    projectDocument: unknown;
}
export interface SolverHostClientSaveResult {
    requestId: string;
    status: "saved" | "failed" | "conflict";
    revision?: string;
}
export interface SolverHostClientOptions {
    getSolverWindow: () => SolverHostClientWindow | null;
    solverOrigin: string;
    messageTarget?: SolverHostClientMessageTarget;
    requiredCapabilities?: readonly string[];
    createId?: () => string;
    launchTimeoutMs?: number;
    launchRetryMs?: number;
    saveTimeoutMs?: number;
    onProjectChanged?: (projectDocument: unknown) => void;
    onPortalActionRequested?: (request: SolverHostClientPortalActionRequest) => void;
    onStateChange?: (snapshot: SolverHostClientSnapshot) => void;
    onMessage?: (direction: "host.out" | "solver.in", message: Record<string, unknown>) => void;
    onError?: (error: SolverHostClientError) => void;
}
export declare class SolverHostClientError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
}
export declare class SolverHostClient {
    onProjectChanged?: (projectDocument: unknown) => void;
    onPortalActionRequested?: (request: SolverHostClientPortalActionRequest) => void;
    onStateChange?: (snapshot: SolverHostClientSnapshot) => void;
    onMessage?: (direction: "host.out" | "solver.in", message: Record<string, unknown>) => void;
    onError?: (error: SolverHostClientError) => void;
    private readonly getSolverWindow;
    private readonly solverOrigin;
    private readonly messageTarget;
    private readonly requiredCapabilities;
    private readonly createId;
    private readonly launchTimeoutMs;
    private readonly launchRetryMs;
    private readonly saveTimeoutMs;
    private state;
    private pendingLaunch;
    private pendingSave;
    private readonly expiredSaveRequestIds;
    private readonly consumedPortalActionRequestIds;
    private activeHostUiActions;
    private portalActionsSupported;
    constructor(options: SolverHostClientOptions);
    get snapshot(): SolverHostClientSnapshot;
    get supportsPortalActions(): boolean;
    launch(input: SolverHostClientLaunchOptions): Promise<void>;
    requestSave(reason?: string, requestId?: string): Promise<SolverHostClientSaveSnapshot>;
    sendSaveResult(result: SolverHostClientSaveResult): void;
    dispose(): void;
    focusSolver(): void;
    private readonly handleMessage;
    private handleReady;
    private handleSaveSnapshot;
    private handlePortalAction;
    private sendPendingLaunch;
    private post;
    private isCurrentBinding;
    private setState;
    private rejectPendingLaunch;
    private rejectPendingSave;
    private failPending;
    private expireSaveRequest;
    private error;
}
