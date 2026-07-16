# Host iframe Reference

这是 ArchSight Solver 的中性宿主参考实现。它使用两个真实 origin 演示 `launch -> ready -> project.changed -> host.requestSave -> project.saveRequest -> host.saveResult`，并用浏览器 `localStorage` 托管项目保存与刷新重开。宿主顶栏负责工程新建、打开、保存与只读审阅；iframe 通过 `embed=1` 只展示结构分析工作台。接入诊断面板默认收起，不代表最终产品界面。示例不包含学校、课程、账号、远程存储或商业平台概念。

本示例主要面向需要把 Solver 嵌入现有业务页面的前端接入开发者。它是本仓库自身的配套验收 DEMO，目标是证明基础接入链路可运行，不依赖 `archsight-solver-platform` 或其他外部项目，也不要求接入方复刻 Reference Host 的界面、localStorage 存储方式或诊断面板。

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

基础 DEMO 只需验证：加载示例工程、修改模型、宿主保存、刷新重开和只读审阅。保存超时、无效工程回滚、非法 origin 与协议漂移拒绝由自动化测试继续覆盖，不要求把这些诊断流程做成平台产品界面。

## 宿主与 Solver 的职责边界

- 宿主负责工程新建、打开、保存、身份权限、课程或项目管理、案例入口、提交审阅、主题和平台设置。
- Solver iframe 负责分析对象管理、参数建模、结构计算、敏感性分析、结果查看和计算书导出。
- 嵌入模式不使用 Solver 自身的项目自动草稿；宿主必须接收 `project.changed` 并承担持久化责任。
- `embed=1` 只移除独立应用外壳；`editable/readonly` 仍由 Host Protocol 会话约束，不能用隐藏按钮代替权限校验。
- Reference Host 使用 `theme=light` 与宿主界面保持一致；正式宿主也可传入 `theme=dark`。

容器镜像通过运行时环境变量配置允许的宿主，无需重新构建镜像：

```bash
ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS=https://classroom.example.edu,https://review.example.edu
```

该白名单同时驱动 Host Protocol 来源校验和 HTML 响应的 CSP `frame-ancestors`。未配置时正式镜像只允许同 origin 嵌入；`*`、子域通配、Unicode hostname 和带路径的 URL 会被忽略。国际化域名应填写浏览器解析后的 ASCII punycode。

## 最小接入顺序

```text
Host iframe load
  <- Solver: archsight.solver.ready (bootstrap capabilities)
  -> Host: 校验五项必要 capability
  -> Host: archsight.solver.host.launch (sessionId + nonce + projectDocument)
  <- Solver: archsight.solver.ready (同一 sessionId + nonce)
  <- Solver: archsight.solver.project.changed
  -> Host: archsight.solver.host.requestSave (requestId)
  <- Solver: archsight.solver.project.saveRequest (当前快照 + 同一 requestId)
  -> Host: archsight.solver.host.saveResult (同一 sessionId + nonce + requestId + revision)
```

当前 Reference Host 要求 `loadProjectDocument`、`emitProjectChanged`、`acceptHostSaveRequest`、`emitSaveRequest`、`acceptSaveResult` 均为 `true`。缺少任一能力时不得继续 launch；协议版本相同不代表保存工作流一定兼容。

Host Protocol 当前使用精确版本 `1.0.0`，Solver 产品版本升级不会自动改变协议版本。兼容增强只能增加可选字段或通过 capabilities 协商的新能力；改变既有必选字段、消息类型、安全约束或保存语义属于破坏性变更，必须升级协议主版本并提供迁移说明。完整规则见 [Agent 集成指南](../../docs/agent-integration.md#host-protocol-生命周期)。

宿主工具栏的保存动作不能直接持久化最后一次 `project.changed` 缓存；它必须先发送 `host.requestSave`，并保存 Solver 返回的确定快照。Solver 只会用匹配的 `requestId` 处理保存回执，且当回执对应的本地修订仍是当前修订时才清除“未保存”，从而避免延迟回执覆盖后续编辑。

Reference Host 对宿主发起的保存请求设置 8 秒超时。超时或返回缺少 `requestId` 时不会写入宿主存储，并保留原有 dirty / saved 状态；生产宿主应将超时、存储冲突和写入失败映射为自己的可恢复错误界面。

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
