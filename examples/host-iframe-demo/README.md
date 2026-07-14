# Host iframe Reference

这是 ArchSight Solver 的中性宿主参考实现。它使用两个真实 origin 演示 `launch -> ready -> project.changed -> saveRequest -> saveResult`，并用浏览器 `localStorage` 托管项目保存与刷新重开。示例不包含学校、课程、账号、权限、远程存储或商业平台概念。

## 一条命令启动

完成仓库依赖安装后，在仓库根目录运行：

```bash
python scripts/run_host_iframe_demo.py
```

启动器默认提供：

- Solver：`http://127.0.0.1:6241`
- Reference Host：`http://127.0.0.1:6250`

浏览器访问 Reference Host 即可。宿主页会在 iframe 加载后主动发送 `launch`，因此即使浏览器不提供 `document.referrer`，接入仍然可靠。也可只启动宿主并连接已有 Solver：

```bash
python scripts/run_host_iframe_demo.py --host-only --solver-url http://127.0.0.1:6241
```

不要直接以 `file://` 打开 `index.html`；文件 URL 的 origin 是 opaque `null`，会被 Solver 的精确 origin 白名单拒绝。

## 最小接入顺序

```text
Host iframe load
  -> Host: archsight.solver.host.launch (sessionId + nonce + projectDocument)
  <- Solver: archsight.solver.ready (同一 sessionId + nonce)
  <- Solver: archsight.solver.project.changed
  <- Solver: archsight.solver.project.saveRequest
  -> Host: archsight.solver.host.saveResult (同一 sessionId + nonce + revision)
```

宿主必须同时检查 `event.source === iframe.contentWindow` 和 `event.origin === solverOrigin`，发送消息时必须使用精确 `targetOrigin`：

```js
iframe.contentWindow.postMessage({
  type: "archsight.solver.host.launch",
  protocolVersion: "1.0.0",
  sessionId,
  nonce,
  payload: { mode: "editable", projectDocument },
}, new URL(iframe.src).origin);
```

`sample-project.slv` 是纳入前后端自动化验证的 canonical 示例。接入方还可运行：

```bash
python -m backend.capabilities.solver_cli project_document_health --input examples/host-iframe-demo/sample-project.slv --pretty
```
