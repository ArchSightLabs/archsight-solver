# TypeScript Host Client

`SolverHostClient` 是本仓库为 Host Protocol 1.0 提供的轻量浏览器客户端。它无框架依赖、无新增运行时依赖，统一管理精确 `solverOrigin`、capability 协商、`sessionId`、`nonce`、`requestId`、launch 重试、保存超时、陈旧快照和 `dispose`。

TypeScript 事实源位于 `frontend/src/lib/solver-host-client.ts`。`npm run sync:host-client` 将它编译为 `examples/host-iframe-demo/solver-host-client.js`，Reference Host 直接导入该产物；`npm run build` 会先自动同步，避免 DEMO 与类型源漂移。

## 最小接入

```ts
import { SolverHostClient } from "./solver-host-client";

const iframe = document.querySelector<HTMLIFrameElement>("#solverFrame")!;
const client = new SolverHostClient({
  getSolverWindow: () => iframe.contentWindow,
  solverOrigin: "https://solver.example.cn",
  onProjectChanged(projectDocument) {
    // 只缓存为当前未保存工程；保存时仍应请求确定快照。
    renderProjectSummary(projectDocument);
  },
});

await client.launch({
  mode: "editable",
  fileName: "project.slv",
  projectDocument,
});
```

`launch()` 会先等待无会话 `solver.ready` 并检查五项 Protocol 1.0 必要能力，再生成新的 `sessionId + nonce`、发送 launch 并等待同绑定 ready。打开另一工程或切换 editable/readonly 时再次调用 `launch()`；Client 会取消旧 pending 工作并使用新绑定。

## 保存闭环

```ts
const snapshot = await client.requestSave("host-toolbar");

try {
  const revision = await persistProject(snapshot.projectDocument);
  client.sendSaveResult({
    requestId: snapshot.requestId,
    status: "saved",
    revision,
  });
} catch (error) {
  client.sendSaveResult({
    requestId: snapshot.requestId,
    status: "failed",
  });
  throw error;
}
```

`requestSave()` 只在 editable active 状态可用，并在收到匹配 `project.saveRequest` 前保持超时。超时快照、错误来源、错误 origin、错误会话或不匹配的 `requestId` 不会交给持久化回调。宿主完成或放弃持久化后必须调用一次匹配的 `sendSaveResult()`。

## 状态与清理

`client.snapshot.phase` 可能为 `idle`、`negotiating`、`launching`、`active-editable`、`active-readonly`、`saving`、`error` 或 `disposed`。可通过 `onStateChange` 驱动按钮禁用和状态提示，通过 `onMessage` 记录接入诊断，通过 `onError` 处理 capability 不兼容、launch/save 超时和迟到快照。

iframe 重载、页面卸载或宿主不再使用 Solver 时调用：

```ts
client.dispose();
```

这会移除 message listener、清理定时器并拒绝所有 pending Promise。完整协议状态和兼容承诺见 [`host-protocol-1.md`](host-protocol-1.md)，可运行实现见 [`../examples/host-iframe-demo/`](../examples/host-iframe-demo/)。
