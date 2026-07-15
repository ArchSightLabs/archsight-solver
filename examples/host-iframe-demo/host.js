const PROTOCOL_VERSION = "1.0.0";
const HOST_REQUEST_SAVE_MESSAGE = "archsight.solver.host.requestSave";
const STORAGE_KEY = "archsight-solver.reference-host.project.v1";
const SAVE_REQUEST_TIMEOUT_MS = 8_000;
const REQUIRED_CAPABILITIES = [
  "loadProjectDocument",
  "emitProjectChanged",
  "acceptHostSaveRequest",
  "emitSaveRequest",
  "acceptSaveResult",
];
const params = new URLSearchParams(window.location.search);
const solverUrl = new URL(params.get("solverUrl") || "http://127.0.0.1:6241");

if (!/^https?:$/.test(solverUrl.protocol)) {
  throw new Error("Solver URL 必须使用 http 或 https 协议。");
}
solverUrl.searchParams.set("embed", "1");
if (!solverUrl.searchParams.has("theme")) {
  solverUrl.searchParams.set("theme", "light");
}

const solverOrigin = solverUrl.origin;
const frame = document.querySelector("#solverFrame");
const log = document.querySelector("#log");
const status = document.querySelector("#connectionStatus");
const fileInput = document.querySelector("#projectFileInput");
const diagnostics = document.querySelector("#diagnostics");
const operationNotice = document.querySelector("#operationNotice");
let sessionId = "";
let nonce = "";
let canonicalProjectDocument = null;
let latestProjectDocument = null;
let revision = 0;
let mode = "editable";
let dirty = false;
let launchPending = false;
let sessionBound = false;
let launchRetryTimer = null;
let pendingLaunchRollback = null;
let solverCompatible = null;
let pendingSaveRequest = null;
const expiredSaveRequestIds = new Set();

document.querySelector("#hostOrigin").textContent = window.location.origin;
document.querySelector("#solverOrigin").textContent = solverOrigin;

function cloneDocument(value) {
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function appendLog(direction, message) {
  const line = `[${new Date().toISOString()}] ${direction}\n${JSON.stringify(message, null, 2)}\n\n`;
  log.textContent = `${line}${log.textContent}`;
}

function setConnected(label = "已建立会话") {
  status.textContent = label;
  status.dataset.connected = "true";
}

function setHostError(message) {
  status.textContent = message;
  status.dataset.connected = "false";
}

function setOperationNotice(message = "") {
  operationNotice.textContent = message;
  operationNotice.hidden = !message;
}

function updateActionAvailability() {
  const sessionActions = ["newProject", "openProject", "launchReadonly", "launchEditable"];
  for (const id of sessionActions) {
    document.querySelector(`#${id}`).disabled = !sessionBound;
  }
  document.querySelector("#hostSave").disabled = !sessionBound || mode === "readonly" || Boolean(pendingSaveRequest);
}

function clearPendingSaveRequest(requestId = null) {
  if (!pendingSaveRequest || (requestId && pendingSaveRequest.requestId !== requestId)) return false;
  window.clearTimeout(pendingSaveRequest.timer);
  pendingSaveRequest = null;
  updateActionAvailability();
  return true;
}

function getMissingCapabilities(message) {
  const capabilities = message?.payload?.capabilities;
  return REQUIRED_CAPABILITIES.filter((capability) => capabilities?.[capability] !== true);
}

function rejectIncompatibleSolver(missingCapabilities) {
  solverCompatible = false;
  launchPending = false;
  sessionBound = false;
  if (launchRetryTimer) window.clearTimeout(launchRetryTimer);
  clearPendingSaveRequest();
  setHostError("Solver 版本不兼容");
  setOperationNotice(`缺少必要接入能力：${missingCapabilities.join(", ")}`);
  updateActionAvailability();
}

function updateProjectSummary() {
  const objects = latestProjectDocument?.project?.objects || [];
  const activeObject = objects.find((item) => item.id === latestProjectDocument?.project?.activeObjectId) || objects[0];
  document.querySelector("#revision").textContent = String(revision);
  document.querySelector("#mode").textContent = mode;
  document.querySelector("#projectName").textContent = latestProjectDocument?.project?.name || "未命名工程";
  document.querySelector("#uniformLoad").textContent = Number.isFinite(activeObject?.state?.q)
    ? `均布荷载 ${activeObject.state.q} kN/m`
    : "均布荷载 -";
  document.querySelector("#saveState").textContent = dirty ? "有未保存更改" : "已保存";
}

function readSavedProject() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (saved?.projectDocument?.schema !== "archsight-solver.project") return null;
    revision = Number(saved.revision || 0);
    return saved.projectDocument;
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

async function loadInitialProject() {
  const response = await fetch("./sample-project.slv", { cache: "no-store" });
  if (!response.ok) throw new Error(`无法读取 sample-project.slv: HTTP ${response.status}`);
  canonicalProjectDocument = await response.json();
  latestProjectDocument = readSavedProject() || cloneDocument(canonicalProjectDocument);
  dirty = false;
  updateProjectSummary();
}

function postToSolver(message) {
  if (!frame.contentWindow) return;
  frame.contentWindow.postMessage(message, solverOrigin);
  appendLog("host.out", message);
}

function scheduleLaunchRetry() {
  if (launchRetryTimer) window.clearTimeout(launchRetryTimer);
  launchRetryTimer = window.setTimeout(() => {
    if (solverCompatible && !sessionBound) {
      launchPending = false;
      sendLaunch();
    }
  }, 1500);
}

function sendLaunch() {
  if (!latestProjectDocument || solverCompatible !== true) return;
  launchPending = true;
  updateProjectSummary();
  postToSolver({
    type: "archsight.solver.host.launch",
    protocolVersion: PROTOCOL_VERSION,
    sessionId,
    nonce,
    payload: {
      mode,
      fileName: "host-reference-project.slv",
      projectDocument: latestProjectDocument,
    },
  });
  scheduleLaunchRetry();
}

function beginLaunch(nextMode = mode, rollback = null) {
  mode = nextMode;
  pendingLaunchRollback = rollback;
  renewSession();
  sessionBound = false;
  launchPending = false;
  status.textContent = "等待 Solver";
  status.dataset.connected = "false";
  updateActionAvailability();
  sendLaunch();
}

function persistProject(projectDocument, requestId) {
  clearPendingSaveRequest(requestId);
  setOperationNotice();
  latestProjectDocument = projectDocument;
  revision += 1;
  dirty = false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    revision,
    savedAt: new Date().toISOString(),
    projectDocument,
  }));
  updateProjectSummary();
  postToSolver({
    type: "archsight.solver.host.saveResult",
    protocolVersion: PROTOCOL_VERSION,
    sessionId,
    nonce,
    payload: { status: "saved", revision: `local-${revision}`, requestId },
  });
}

function requestProjectSave() {
  if (!sessionBound) {
    setOperationNotice("Solver 会话尚未建立，暂不能保存工程。");
    return;
  }
  if (mode === "readonly") {
    setOperationNotice("当前为只读审阅会话，不能保存工程。");
    return;
  }
  if (pendingSaveRequest) {
    setOperationNotice("已有保存请求正在等待 Solver 返回工程。");
    return;
  }
  setOperationNotice();
  const requestId = `host-save-${crypto.randomUUID()}`;
  postToSolver({
    type: HOST_REQUEST_SAVE_MESSAGE,
    protocolVersion: PROTOCOL_VERSION,
    sessionId,
    nonce,
    payload: { requestId, reason: "host-toolbar" },
  });
  pendingSaveRequest = {
    requestId,
    timer: window.setTimeout(() => {
      if (!clearPendingSaveRequest(requestId)) return;
      expiredSaveRequestIds.add(requestId);
      if (expiredSaveRequestIds.size > 20) {
        expiredSaveRequestIds.delete(expiredSaveRequestIds.values().next().value);
      }
      setOperationNotice("保存请求超时，Solver 未返回工程；本次未写入宿主存储。");
    }, SAVE_REQUEST_TIMEOUT_MS),
  };
  updateActionAvailability();
}

function renewSession() {
  clearPendingSaveRequest();
  expiredSaveRequestIds.clear();
  sessionId = `host-session-${crypto.randomUUID()}`;
  nonce = `host-nonce-${crypto.randomUUID()}`;
  document.querySelector("#sessionId").textContent = sessionId;
}

function loadFrame() {
  renewSession();
  sessionBound = false;
  launchPending = false;
  solverCompatible = null;
  if (launchRetryTimer) window.clearTimeout(launchRetryTimer);
  status.textContent = "等待 Solver";
  status.dataset.connected = "false";
  updateActionAvailability();
  frame.src = solverUrl.href;
}

function createNewProject() {
  if (!canonicalProjectDocument) return;
  const now = new Date().toISOString();
  latestProjectDocument = cloneDocument(canonicalProjectDocument);
  latestProjectDocument.project.id = `host-project-${crypto.randomUUID()}`;
  latestProjectDocument.project.name = "Host 新建结构分析工程";
  latestProjectDocument.project.updatedAt = now;
  if (latestProjectDocument.project.settings?.projectInfo) {
    latestProjectDocument.project.settings.projectInfo.name = latestProjectDocument.project.name;
  }
  latestProjectDocument.updatedAt = now;
  revision = 0;
  dirty = true;
  localStorage.removeItem(STORAGE_KEY);
  setOperationNotice();
  beginLaunch("editable");
}

async function openProjectFile(file) {
  const parsed = JSON.parse(await file.text());
  if (parsed?.schema !== "archsight-solver.project" || !parsed.project) {
    throw new Error("所选文件不是 ArchSight Solver 项目文件。");
  }
  const rollback = {
    projectDocument: cloneDocument(latestProjectDocument),
    revision,
    dirty,
    mode,
  };
  latestProjectDocument = parsed;
  revision = 0;
  dirty = true;
  localStorage.removeItem(STORAGE_KEY);
  setOperationNotice();
  beginLaunch("editable", rollback);
}

function setDiagnosticsOpen(open) {
  diagnostics.hidden = !open;
  document.querySelector("#toggleDiagnostics").setAttribute("aria-expanded", String(open));
}

frame.addEventListener("load", () => {
  window.setTimeout(() => {
    if (solverCompatible && !sessionBound && !launchPending) sendLaunch();
  }, 250);
});
document.querySelector("#newProject").addEventListener("click", createNewProject);
document.querySelector("#openProject").addEventListener("click", () => fileInput.click());
document.querySelector("#hostSave").addEventListener("click", requestProjectSave);
document.querySelector("#launchEditable").addEventListener("click", () => beginLaunch("editable"));
document.querySelector("#launchReadonly").addEventListener("click", () => beginLaunch("readonly"));
document.querySelector("#reloadFrame").addEventListener("click", loadFrame);
document.querySelector("#clearSaved").addEventListener("click", async () => {
  localStorage.removeItem(STORAGE_KEY);
  latestProjectDocument = cloneDocument(canonicalProjectDocument);
  revision = 0;
  dirty = false;
  setOperationNotice();
  beginLaunch(mode);
});
document.querySelector("#toggleDiagnostics").addEventListener("click", () => setDiagnosticsOpen(diagnostics.hidden));
document.querySelector("#closeDiagnostics").addEventListener("click", () => setDiagnosticsOpen(false));
fileInput.addEventListener("change", async () => {
  const [file] = fileInput.files || [];
  if (!file) return;
  try {
    await openProjectFile(file);
  } catch (error) {
    setHostError(error instanceof Error ? error.message : "工程文件打开失败");
  } finally {
    fileInput.value = "";
  }
});

window.addEventListener("message", (event) => {
  if (event.source !== frame.contentWindow || event.origin !== solverOrigin) return;
  const message = event.data;
  if (!message || message.protocolVersion !== PROTOCOL_VERSION) return;
  appendLog("solver.in", message);

  if (message.type === "archsight.solver.ready") {
    const missingCapabilities = getMissingCapabilities(message);
    if (missingCapabilities.length > 0) {
      rejectIncompatibleSolver(missingCapabilities);
      return;
    }
    solverCompatible = true;
    if (!message.sessionId) {
      setConnected("Solver 已就绪");
      if (!launchPending) sendLaunch();
    } else if (message.sessionId === sessionId && message.nonce === nonce) {
      launchPending = false;
      sessionBound = true;
      pendingLaunchRollback = null;
      if (launchRetryTimer) window.clearTimeout(launchRetryTimer);
      setConnected("已建立会话");
      updateActionAvailability();
    }
    return;
  }
  if (message.sessionId !== sessionId || message.nonce !== nonce) return;
  if (message.type === "archsight.solver.project.changed" && message.payload?.projectDocument) {
    latestProjectDocument = message.payload.projectDocument;
    dirty = true;
    updateProjectSummary();
  }
  if (message.type === "archsight.solver.project.saveRequest" && message.payload?.projectDocument) {
    const requestId = String(message.payload.requestId || "").trim();
    if (!requestId) {
      setOperationNotice("Solver 保存请求缺少 requestId，宿主未写入工程。");
      return;
    }
    if (expiredSaveRequestIds.delete(requestId)) {
      setOperationNotice("已忽略超时后返回的保存快照；工程仍保持未保存状态。");
      return;
    }
    persistProject(message.payload.projectDocument, requestId);
    return;
  }
  if (message.type === "archsight.solver.error") {
    const errorMessage = String(message.payload?.message || "Solver 拒绝了宿主操作。");
    if (launchRetryTimer) window.clearTimeout(launchRetryTimer);
    launchPending = false;
    sessionBound = false;
    clearPendingSaveRequest();
    if (pendingLaunchRollback) {
      const rollback = pendingLaunchRollback;
      pendingLaunchRollback = null;
      latestProjectDocument = rollback.projectDocument;
      revision = rollback.revision;
      dirty = rollback.dirty;
      mode = rollback.mode;
      updateProjectSummary();
      setOperationNotice(`打开工程失败：${errorMessage}`);
      window.setTimeout(() => beginLaunch(mode), 0);
    } else {
      setOperationNotice(errorMessage);
      setHostError("宿主操作失败");
    }
  }
});

await loadInitialProject();
updateActionAvailability();
loadFrame();
