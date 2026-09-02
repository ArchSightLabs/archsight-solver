# ArchSight Solver v1.9.1 发布验收记录

> 状态：Solver 已上线并推送精确 annotated Tag；GitHub Release 工作流完成且全部通过
> 目标版本：产品 SemVer、线上源码与 annotated Tag 均为 `v1.9.1`
> 验收原则：本文件区分候选源码、镜像、线上容器、公网验收与 Tag；未完成项不得提前勾选或称为已发布。

## 发布范围与兼容边界

- v1.9.1 是 v1.9.0 的补丁发布，收口首次 Host 握手、受信主题同步、Cloud 文件动作、保存状态反馈和嵌入参数面板聚焦问题。
- Host Protocol 保持 `1.0.0`；`Host Portal` 与可选 `requestPortalAction` 仍由 Solver 呈现和协商，Solver 不接收 Cloud token、不拥有 IAM、用户、租户、订阅或远程存储。
- 不新增结构类型、求解算法、数据库迁移、项目文件 Schema、计算书或可信计算包格式，不改变既有数值结果。
- 线上更新只允许替换 `archsight-solver-app`，继续使用 `127.0.0.1:18082 -> app:6240`；不调整 Nginx、Cloud、IAM、Science、Graphics 或其他同机服务。

## Gate A：版本与发布工程

- [x] `pyproject.toml`、`uv.lock`、前端包、Host Client、CHANGELOG、公开安装文档与部署样例统一为 `1.9.1`。
- [x] v1.9.0 的 annotated Tag 和发布记录保持不可变；annotated `v1.9.1` 已推送，tag object 为 `ea4afe01ad63b021792c359af95941365622ec61`，精确指向线上源码 `ae566a7de188c9b1c3bcbd47a8830c8661407a7f`。
- [x] `scripts/check_versions.py --expected-version 1.9.1`、当前版本发布工程门禁与生成的公开文档通过。

## Gate B：代码与回归

- [x] 前端 lint / TypeScript、466 项单元测试、生产构建与 Host Client dist 通过。
- [x] 后端 752 passed / 2 skipped，版本相关断言与打包检查通过；保留既有 `asyncio_mode` 配置警告。
- [x] 已保存、保存中、待保存和只读的嵌入保存按钮状态通过本地真实 Cloud–Solver Chromium 联调；专用 Host spec 为 Chromium 6/6、Firefox 6/6，新增嵌入只读场景的 WebKit 通过。
- [x] `main` CI `33608474377` 的五项检查通过；GitHub Release `33609276683` 全部通过，包括发布测试、浏览器 smoke、容器与真实后端门禁、Trivy、SBOM 和制品推送。

## Gate D：候选制品与回滚准备

- [x] 本版不含数据库迁移；候选源码只包含 Host Protocol 兼容修正、保存状态反馈与版本材料，不触及求解核心。
- [x] `v1.9.0-969bf47` 是已知直接镜像回滚基线，旧镜像已在独立端口健康预检通过；部署前后快照与恢复步骤限定为 `archsight-solver-app`，不应影响其他服务。未触发回滚或完整恢复。
- [x] 维护者已明确授权按 Solver、再 Cloud 的顺序构建、推送、上线并在公网验收后创建精确 Tag；此授权不包含修改 IAM 或 Science。

## Gate F：正式发布与线上验收

- [x] 生产 `archsight-solver-app` 已切换到 `v1.9.1-ae566a7`：镜像 digest `sha256:4bfa9984c4065a8aba2c67f6d3cdbf394f1ac9252cd7f884771be25a3a1419a7`，image ID `sha256:a4b955eca0bf92b91eef7a21064420b17ce44629d570ee69bcfc0905d80e3b95`，线上源码为 `ae566a7de188c9b1c3bcbd47a8830c8661407a7f`。其余 11 个容器、Nginx 与 compose 配置未变化。
- [x] 公网 Solver 与真实 Cloud origin 的无登录、无云数据写入内存探针通过：Host 协商、文件菜单、主题与原位公开案例加载均通过。
- [x] annotated `v1.9.1` 已在上线和公网验收后创建并推送，精确指向实际部署源码。
- [x] `v1.9.0-969bf47` 保留为直接镜像回滚基线，并已完成独立端口健康预检；未以未发生的恢复宣称完整回滚验收。

## 发布证据

- [发布工作流](https://github.com/ArchSightLabs/archsight-solver/actions/runs/33609276683) 与 [v1.9.1 Release](https://github.com/ArchSightLabs/archsight-solver/releases/tag/v1.9.1)：08:46:35Z 发布 7 项资产（SDK tgz、Python wheel/sdist、镜像归档、SPDX SBOM、Trivy 报告、SHA256SUMS）。GHCR 发行镜像与线上阿里云镜像来自各自构建，不混用 digest。
- 脱敏部署与备份证据保存在 Cloud 发布工作区：`../archsight-cloud/.tmp/release-public-142-191/solver-final-deployment.json`。
- 公网 Solver 探针证据同目录 `solver-report.json`；Cloud 上线后的配对探针为 `report.json`。
- 本次浏览器验证的 WebKit 默认预算为 3/6（总计 15/18）；默认 30 秒预算下失败的三条旧路径均以仅 CLI `--timeout=120000` 的诊断重跑通过：editable 保存 54.6 秒、standalone readonly 32.9 秒、攻击者拒绝 33.6 秒。该诊断不修改正式测试超时，也不把默认预算结果改写为全绿。

## 当前未验证项

- Cloud 已获用户追加确认并上线 `1.4.2 / e4769fbca683b04d291ec913995c20cff506b7c6`，精确 annotated `v1.4.2` 已推送；公网 health/readiness、登录入口和配对内存 Host 探针通过，Science 产品端保存仍待接入。
- Cloud 真实账户的工程写入、版本、分享操作仍未验证；本记录仅记录无登录、无云数据写入探针，不以匿名页面或模拟数据替代真实写入验收。
