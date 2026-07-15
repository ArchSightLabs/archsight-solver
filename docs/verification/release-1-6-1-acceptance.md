# v1.6.1 发布验收清单

v1.6.1 验证 v1.6 Host Protocol 1.0 能被独立第三方宿主真实接入。本版不新增求解对象，不包含学校、课程、学生、账号、云存储或私有 Platform 1.0。

## 自动化门禁

```bash
python scripts/check_versions.py --expected-version 1.6.1
python scripts/check_release_gate.py
python -m pytest backend/tests -q
npm --prefix frontend run lint
npm --prefix frontend run test:unit
npm --prefix frontend run build
npm --prefix frontend run test:visual -- release-1-6-1-host-reference.spec.ts --project=chromium --workers=1
npm --prefix frontend run test:visual -- release-1-6-host-integration.spec.ts --project=chromium --workers=1
```

## Reference Host 验收

- [x] `python scripts/run_host_iframe_demo.py` 启动 `127.0.0.1:6241` Solver 与 `127.0.0.1:6250` Host。
- [x] Reference Host 直接读取 canonical `sample-project.slv`，不在 HTML 中手写项目契约。
- [x] editable 模式收到项目变更；宿主保存先发送 `host.requestSave`，再持久化 Solver 返回的确定快照并用同一 `requestId` 回传 saveResult。
- [x] `embed=1` 只呈现结构分析工作台，不渲染文件菜单、公开案例、验证投稿、主题切换或系统设置。
- [x] 工程新建、打开、保存和只读审阅入口由 Reference Host 提供；只有匹配当前本地修订的 Host 保存结果会清除 Solver 未保存状态，陈旧回执保持 dirty。
- [x] Host 打开无效工程时显示失败信息、回滚候选文档并恢复原工程会话。
- [x] 嵌入模式不读写 Solver origin 的项目自动草稿，避免宿主工程污染独立工具或其他宿主会话。
- [x] 刷新宿主页后重新 launch，项目名称、活动对象和修改后的均布荷载保持一致。
- [x] readonly 模式锁定建模和保存入口。
- [x] allowlist 外 origin、非父窗口来源、错误 session/nonce 和协议漂移被拒绝。
- [x] bootstrap ready 与 session ready 均通过公开 JSON Schema。
- [x] `frontend/` 与 `examples/` 不存在向 `*` 发送 `postMessage` 的调用。
- [x] 正式镜像通过 `ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS` 在运行时读取精确宿主白名单，不要求为接入方重新构建前端。
- [x] Reference Host 在 launch 前校验五项必要 capability；缺少 `acceptHostSaveRequest` 的旧 Solver 显示不兼容并禁用保存。
- [x] Host 发起保存后若 Solver 8 秒内未返回确定快照，会显示超时且不写入宿主存储。
- [x] 正式 HTML 响应的 CSP `frame-ancestors` 与运行时 allowlist 使用同一份归一化 origin 列表。
- [x] CI 与 tag release 对构建后的 Docker 镜像运行独立 Host 浏览器测试，覆盖握手、保存和刷新重开。

## 发布边界

- 版本号、CHANGELOG、release notes、部署示例与容器标签必须一致为 `1.6.1`。
- CI 和 tag release 必须运行真实双 origin Reference Host spec，并保留 v1.6/v1.5 回归。
- 嵌入展示模式与权限模式必须分离；`embed=1` 不能替代 launch 的 `editable/readonly` 权限约束。
- 发布说明只能声称“独立参考宿主已验证”，不得声称学校平台、私有 Platform 或第三方生产部署已经发布。
- 私有 `archsight-solver-platform` 的现有 0.1.0 技术试点只用于第二消费者回归；v1.6.1 发布前不得提前声称其已升级或对外发布。
