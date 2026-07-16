# v1.6.1 发布验收清单

v1.6.1 面向需要把 Solver 嵌入现有业务页面的前端接入开发者，通过本仓库内置 Reference Host DEMO 验证 v1.6 Host Protocol 1.0 的基础接入闭环。本版验收不依赖 `archsight-solver-platform` 或其他外部项目，不新增求解对象，也不包含学校、课程、学生、账号或云存储。

## 产品验收口径

本版不以第三方团队数量、陌生工程师接入耗时或商业试点作为发布门槛。配套 Reference Host DEMO 能稳定完成以下基础流程，即达到产品层面的最小接入目标：

1. 一条命令启动两个真实 origin，并建立 Host Protocol 会话。
2. 宿主加载 canonical `.slv` 工程，Solver 进入可编辑工作台。
3. Solver 修改模型后，宿主收到项目变更并显示未保存状态。
4. 宿主发起保存，持久化确定快照；刷新宿主页后能重新打开相同工程。
5. 宿主以 readonly 模式重新打开工程，Solver 锁定建模与保存入口。

安全拒绝、错误恢复、超时和协议漂移继续由自动化测试覆盖，但不扩大 DEMO 的基础产品范围。

## 自动化门禁

```bash
python scripts/check_versions.py
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
- 正式发布提交形成前，CHANGELOG 与 README 保持“发布候选”；创建 `v1.6.1` tag 前必须改成实际发布日期、同步 release notes，并通过正式版本门禁。
- tag 发布工作流使用 `python scripts/check_versions.py --expected-version 1.6.1`；候选状态必须被拒绝，只有正式发布日期状态可以进入制品生成与 GitHub Release。
- CI 和 tag release 必须运行真实双 origin Reference Host spec，并保留 v1.6/v1.5 回归。
- 嵌入展示模式与权限模式必须分离；`embed=1` 不能替代 launch 的 `editable/readonly` 权限约束。
- 发布说明只能声称“仓库内置 Reference Host 基础闭环已验证”，不得声称任何外部宿主、学校平台或第三方生产部署已经完成接入。
