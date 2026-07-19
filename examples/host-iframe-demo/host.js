import { SolverHostClient, SolverHostClientError } from "./solver-host-client.js";

const STORAGE_KEY = "archsight-solver.reference-host.project.v1";
const params = new URLSearchParams(window.location.search);
const solverUrl = new URL(params.get("solverUrl") || "http://127.0.0.1:6241");

if (!/^https?:$/.test(solverUrl.protocol)) {
  throw new Error("Solver URL 必须使用 http 或 https 协议。");
}
solverUrl.searchParams.set("embed", "1");
if (!solverUrl.searchParams.has("theme")) solverUrl.searchParams.set("theme", "light");

const solverOrigin = solverUrl.origin;
const frame = document.querySelector("#solverFrame");
const log = document.querySelector("#log");
const status = document.querySelector("#connectionStatus");
const fileInput = document.querySelector("#projectFileInput");
const diagnostics = document.querySelector("#diagnostics");
const operationNotice = document.querySelector("#operationNotice");
let canonicalProjectDocument = null;
let latestProjectDocument = null;
let revision = 0;
let mode = "editable";
let dirty = false;
let sessionBound = false;
let pendingLaunchRollback = null;
let client = null;

document.querySelector("#hostOrigin").textContent = window.location.origin;
document.querySelector("#solverOrigin").textContent = solverOrigin;

function cloneDocument(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value));
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
  const active = sessionBound && client && ["active-editable", "active-readonly", "saving"].includes(client.snapshot.phase);
  for (const id of ["newProject", "openProject", "launchReadonly", "launchEditable"]) {
    document.querySelector(`#${id}`).disabled = !active;
  }
  document.querySelector("#hostSave").disabled = !active || mode === "readonly" || client?.snapshot.phase === "saving";
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

function createClient() {
  client?.dispose();
  const nextClient = new SolverHostClient({
    getSolverWindow: () => frame.contentWindow,
    solverOrigin,
    onMessage: appendLog,
    onProjectChanged(projectDocument) {
      if (client !== nextClient) return;
      latestProjectDocument = projectDocument;
      dirty = true;
      updateProjectSummary();
    },
    onStateChange(snapshot) {
      if (client !== nextClient && client !== null) return;
      if (snapshot.sessionId) document.querySelector("#sessionId").textContent = snapshot.sessionId;
      if (snapshot.mode) mode = snapshot.mode;
      updateProjectSummary();
      updateActionAvailability();
    },
    onError(error) {
      if (client !== nextClient) return;
      if (error.code === "late-save-snapshot") {
        setOperationNotice("已忽略超时后返回的保存快照；工程仍保持未保存状态。");
      }
    },
  });
  client = nextClient;
}

async function beginLaunch(nextMode = mode, rollback = null) {
  if (!client || !latestProjectDocument) return;
  const launchClient = client;
  mode = nextMode;
  pendingLaunchRollback = rollback;
  sessionBound = false;
  setHostError("等待 Solver");
  updateProjectSummary();
  updateActionAvailability();
  try {
    await launchClient.launch({
      mode,
      fileName: "host-reference-project.slv",
      projectDocument: latestProjectDocument,
    });
    if (client !== launchClient) return;
    sessionBound = true;
    pendingLaunchRollback = null;
    setConnected();
    updateActionAvailability();
  } catch (error) {
    if (client !== launchClient || (error instanceof SolverHostClientError && error.code === "launch-replaced")) return;
    sessionBound = false;
    const errorMessage = error instanceof Error ? error.message : "Solver 拒绝了宿主操作。";
    if (error instanceof SolverHostClientError && error.code === "incompatible-capabilities") {
      setHostError("Solver 版本不兼容");
      setOperationNotice(errorMessage);
      updateActionAvailability();
      return;
    }
    if (pendingLaunchRollback) {
      const previous = pendingLaunchRollback;
      pendingLaunchRollback = null;
      latestProjectDocument = previous.projectDocument;
      revision = previous.revision;
      dirty = previous.dirty;
      mode = previous.mode;
      updateProjectSummary();
      setOperationNotice(`打开工程失败：${errorMessage}`);
      window.setTimeout(() => void beginLaunch(mode), 0);
      return;
    }
    setOperationNotice(errorMessage);
    setHostError("宿主操作失败");
    updateActionAvailability();
  }
}

function persistProject(projectDocument, requestId) {
  const nextRevision = revision + 1;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      revision: nextRevision,
      savedAt: new Date().toISOString(),
      projectDocument,
    }));
    latestProjectDocument = projectDocument;
    revision = nextRevision;
    client.sendSaveResult({ requestId, status: "saved", revision: `local-${revision}` });
    dirty = false;
    setOperationNotice();
    updateProjectSummary();
  } catch (error) {
    client.sendSaveResult({ requestId, status: "failed" });
    throw error;
  }
}

async function requestProjectSave() {
  if (!client || !sessionBound) {
    setOperationNotice("Solver 会话尚未建立，暂不能保存工程。");
    return;
  }
  if (mode === "readonly") {
    setOperationNotice("当前为只读审阅会话，不能保存工程。");
    return;
  }
  setOperationNotice();
  updateActionAvailability();
  try {
    const snapshot = await client.requestSave("host-toolbar");
    persistProject(snapshot.projectDocument, snapshot.requestId);
  } catch (error) {
    if (error instanceof SolverHostClientError && error.code === "save-timeout") {
      setOperationNotice("保存请求超时，Solver 未返回工程；本次未写入宿主存储。");
    } else {
      setOperationNotice(error instanceof Error ? error.message : "宿主保存失败。");
    }
  } finally {
    updateActionAvailability();
  }
}

function loadFrame() {
  sessionBound = false;
  setHostError("等待 Solver");
  createClient();
  frame.src = solverUrl.href;
  updateActionAvailability();
  void beginLaunch(mode);
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
  void beginLaunch("editable");
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
  void beginLaunch("editable", rollback);
}

function setDiagnosticsOpen(open) {
  diagnostics.hidden = !open;
  document.querySelector("#toggleDiagnostics").setAttribute("aria-expanded", String(open));
}

document.querySelector("#newProject").addEventListener("click", createNewProject);
document.querySelector("#openProject").addEventListener("click", () => fileInput.click());
document.querySelector("#hostSave").addEventListener("click", () => void requestProjectSave());
document.querySelector("#launchEditable").addEventListener("click", () => void beginLaunch("editable"));
document.querySelector("#launchReadonly").addEventListener("click", () => void beginLaunch("readonly"));
document.querySelector("#reloadFrame").addEventListener("click", loadFrame);
document.querySelector("#clearSaved").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  latestProjectDocument = cloneDocument(canonicalProjectDocument);
  revision = 0;
  dirty = false;
  setOperationNotice();
  void beginLaunch(mode);
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

await loadInitialProject();
updateActionAvailability();
loadFrame();
