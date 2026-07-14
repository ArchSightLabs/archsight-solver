const PROTOCOL_VERSION = "1.0.0";
const STORAGE_KEY = "archsight-solver.reference-host.project.v1";
const params = new URLSearchParams(window.location.search);
const solverUrl = new URL(params.get("solverUrl") || "http://127.0.0.1:6241");

if (!/^https?:$/.test(solverUrl.protocol)) {
  throw new Error("Solver URL 必须使用 http 或 https 协议。");
}

const solverOrigin = solverUrl.origin;
const sessionId = `host-session-${crypto.randomUUID()}`;
const nonce = `host-nonce-${crypto.randomUUID()}`;
const frame = document.querySelector("#solverFrame");
const log = document.querySelector("#log");
const status = document.querySelector("#connectionStatus");
let latestProjectDocument = null;
let revision = 0;
let mode = "editable";
let launchPending = false;
let sessionBound = false;
let fallbackLaunchTimer = null;

document.querySelector("#hostOrigin").textContent = window.location.origin;
document.querySelector("#solverOrigin").textContent = solverOrigin;
document.querySelector("#sessionId").textContent = sessionId;

function appendLog(direction, message) {
  const line = `[${new Date().toISOString()}] ${direction}\n${JSON.stringify(message, null, 2)}\n\n`;
  log.textContent = `${line}${log.textContent}`;
}

function setConnected(label = "已建立会话") {
  status.textContent = label;
  status.dataset.connected = "true";
}

function updateProjectSummary() {
  const objects = latestProjectDocument?.project?.objects || [];
  const activeObject = objects.find((item) => item.id === latestProjectDocument?.project?.activeObjectId) || objects[0];
  document.querySelector("#revision").textContent = String(revision);
  document.querySelector("#mode").textContent = mode;
  document.querySelector("#projectName").textContent = latestProjectDocument?.project?.name || "未命名项目";
  document.querySelector("#uniformLoad").textContent = Number.isFinite(activeObject?.state?.q)
    ? `${activeObject.state.q} kN/m`
    : "-";
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
  const saved = readSavedProject();
  if (saved) {
    latestProjectDocument = saved;
    updateProjectSummary();
    return;
  }
  const response = await fetch("./sample-project.slv", { cache: "no-store" });
  if (!response.ok) throw new Error(`无法读取 sample-project.slv: HTTP ${response.status}`);
  latestProjectDocument = await response.json();
  revision = 0;
  updateProjectSummary();
}

function postToSolver(message) {
  if (!frame.contentWindow) return;
  frame.contentWindow.postMessage(message, solverOrigin);
  appendLog("host.out", message);
}

function launch(nextMode = mode) {
  if (!latestProjectDocument) return;
  mode = nextMode;
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
}

function persistProject(projectDocument) {
  latestProjectDocument = projectDocument;
  revision += 1;
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
    payload: { status: "saved", revision: `local-${revision}` },
  });
}

function loadFrame() {
  sessionBound = false;
  launchPending = false;
  if (fallbackLaunchTimer) window.clearTimeout(fallbackLaunchTimer);
  status.textContent = "等待 Solver";
  status.dataset.connected = "false";
  frame.src = solverUrl.href;
}

frame.addEventListener("load", () => {
  fallbackLaunchTimer = window.setTimeout(() => {
    if (!sessionBound && !launchPending) launch(mode);
  }, 750);
});
document.querySelector("#launchEditable").addEventListener("click", () => launch("editable"));
document.querySelector("#launchReadonly").addEventListener("click", () => launch("readonly"));
document.querySelector("#reloadFrame").addEventListener("click", loadFrame);
document.querySelector("#clearSaved").addEventListener("click", async () => {
  localStorage.removeItem(STORAGE_KEY);
  await loadInitialProject();
  launch(mode);
});

window.addEventListener("message", (event) => {
  if (event.source !== frame.contentWindow || event.origin !== solverOrigin) return;
  const message = event.data;
  if (!message || message.protocolVersion !== PROTOCOL_VERSION) return;
  appendLog("solver.in", message);

  if (message.type === "archsight.solver.ready") {
    if (!message.sessionId) {
      setConnected("Solver 已就绪");
      if (!launchPending) launch(mode);
    } else if (message.sessionId === sessionId && message.nonce === nonce) {
      launchPending = false;
      sessionBound = true;
      setConnected("已建立会话");
    }
    return;
  }
  if (message.sessionId !== sessionId || message.nonce !== nonce) return;
  if (message.type === "archsight.solver.project.changed" && message.payload?.projectDocument) {
    latestProjectDocument = message.payload.projectDocument;
    updateProjectSummary();
  }
  if (message.type === "archsight.solver.project.saveRequest" && message.payload?.projectDocument) {
    persistProject(message.payload.projectDocument);
  }
});

await loadInitialProject();
loadFrame();
