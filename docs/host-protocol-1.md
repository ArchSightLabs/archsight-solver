# Host Protocol 1.0

ArchSight Solver Host Protocol 1.0 用于把本仓库的结构分析工作台嵌入一个独立宿主页。宿主负责工程文件的打开、保存和业务页面外壳；Solver 负责建模、计算、结果审阅和导出。协议不包含账号、租户、订阅或 `archsight-solver-platform` 业务。

当前线协议版本固定为 `1.0.0`。每条消息必须使用精确的 `targetOrigin`，Solver 只接收来自 `window.parent` 且命中 allowlist 的消息。

## 状态机

| 阶段 | 含义 | 允许的后续动作 |
| --- | --- | --- |
| `bootstrap` | iframe 已创建，尚未发布能力 | 发布无会话绑定的 `solver.ready` |
| `negotiating` | Solver 已声明 Protocol 1.0 capabilities，等待宿主决定是否兼容 | `host.launch` |
| `active-editable` | `sessionId + nonce` 已绑定，可修改工程 | `project.changed`、`host.requestSave`、使用新绑定重新 `launch` |
| `active-readonly` | 会话已绑定，但所有工程修改和保存入口关闭 | 使用新绑定重新 `launch` |
| `saving` | 一个 `requestId` 正在等待 `host.saveResult` | `project.changed`、匹配的 `host.saveResult`、使用新绑定重新 `launch` |
| `closed` | iframe 卸载或桥接释放 | 无；必须创建新的桥接实例 |

`error` 和 `invalid` 是非终止的转移状态，不会销毁当前有效会话。`error` 表示当前状态不允许该动作，例如只读保存或并发保存；`invalid` 表示关联字段不可信，例如错误会话、重复请求或陈旧回执。下一条合法且匹配当前会话的消息可以恢复为健康状态。安全校验失败的来源或 origin 会被直接忽略，不向非可信窗口回传细节。

## 消息与状态

| 方向 | 消息 | 必需关联 | 状态规则 |
| --- | --- | --- | --- |
| Solver -> Host | `archsight.solver.ready` | bootstrap 时无绑定；launch 后必须带 `sessionId + nonce` | 声明完整 capability 集；会话 ready 表示 launch 已生效 |
| Host -> Solver | `archsight.solver.host.launch` | `sessionId + nonce` | 新绑定创建或替换会话；同绑定同模式为幂等重试；同绑定切换模式被拒绝 |
| Solver -> Host | `archsight.solver.project.changed` | `sessionId + nonce` | 仅 editable；saving 期间的后续编辑仍正常发出 |
| Host -> Solver | `archsight.solver.host.requestSave` | `sessionId + nonce + requestId` | 仅 active-editable；进入 saving；重复或并发请求被拒绝 |
| Solver -> Host | `archsight.solver.project.saveRequest` | `sessionId + nonce + requestId` | 返回该请求时刻的确定工程快照 |
| Host -> Solver | `archsight.solver.host.saveResult` | `sessionId + nonce + requestId` | 只接受当前 pending request；陈旧回执不清除未保存状态 |
| Solver -> Host | `archsight.solver.error` | 可确定会话时带 `sessionId + nonce` | 回传可解释的协议拒绝原因，当前有效会话保留 |

Protocol 1.0 的 `solver.ready` 必须声明以下五项能力均为 `true`：

- `loadProjectDocument`
- `emitProjectChanged`
- `acceptHostSaveRequest`
- `emitSaveRequest`
- `acceptSaveResult`

宿主不能只比较 `protocolVersion`；缺少任一必要能力时不得发送 launch。

## 确定行为

- 重复 `launch`：相同 `sessionId + nonce + mode` 只重发 ready，不再次覆盖当前工作区；打开另一工程或切换只读模式必须生成新绑定。
- 重复保存：同一 `requestId` 或保存尚未结束时的另一 `requestId` 均被拒绝，不生成第二份不确定快照。
- 陈旧回执：不匹配当前 pending `requestId` 的 `saveResult` 被标记为 invalid；当前保存仍可由正确回执完成。
- 会话替换：使用新的 `sessionId + nonce` launch 会清除旧会话的 pending 保存关联，旧回执随后无效。
- 协议错误：错误 `protocolVersion`、空绑定、空 `requestId` 或未知保存状态会产生协议错误，不执行部分操作。

## 兼容与弃用承诺

- Solver `1.x` 生命周期内继续支持 Host Protocol `1.0.0` 的既有消息、字段和语义。
- 对现有消息增加可选字段必须保持旧宿主可忽略；新增能力必须 capability-gated，不能借同一版本静默改变保存或安全语义。
- 删除字段、改变必需字段含义、放宽 origin/source 约束或改变状态转移属于破坏性变更，只能进入新的协议主版本。
- 若未来提供新的 Host Protocol 版本，`1.0.0` 的弃用会至少提前一个 Solver 次版本在 CHANGELOG、Reference Host 和本文件中说明；移除不早于 Solver `2.0.0`。
- 当前运行时严格匹配 `1.0.0`。未来版本协商必须显式实现，接入方不应自行把其他 `1.x` 字符串当作兼容。

JSON Schema 的事实源为 `solver-host-message`，TypeScript 运行时事实源为 `frontend/src/lib/host-bridge.ts` 与 `frontend/src/lib/host-protocol-machine.ts`。可运行示例见 `examples/host-iframe-demo/`。

宿主接入应优先使用 [`host-client.md`](host-client.md) 中的 `SolverHostClient`，避免在业务页面重复实现消息关联、超时和能力协商。
