# ArchSight Solver v1.9.1 发布验收记录

> 状态：发布候选就绪
> 目标版本：产品 SemVer 与未来 annotated Tag 均为 `v1.9.1`
> 验收原则：本文件区分候选源码、镜像、线上容器、公网验收与 Tag；未完成项不得提前勾选或称为已发布。

## 发布范围与兼容边界

- v1.9.1 是 v1.9.0 的补丁发布，收口首次 Host 握手、受信主题同步、Cloud 文件动作、保存状态反馈和嵌入参数面板聚焦问题。
- Host Protocol 保持 `1.0.0`；`Host Portal` 与可选 `requestPortalAction` 仍由 Solver 呈现和协商，Solver 不接收 Cloud token、不拥有 IAM、用户、租户、订阅或远程存储。
- 不新增结构类型、求解算法、数据库迁移、项目文件 Schema、计算书或可信计算包格式，不改变既有数值结果。
- 线上更新只允许替换 `archsight-solver-app`，继续使用 `127.0.0.1:18082 -> app:6240`；不调整 Nginx、Cloud、IAM、Science、Graphics 或其他同机服务。

## Gate A：版本与发布工程

- [x] `pyproject.toml`、`uv.lock`、前端包、Host Client、CHANGELOG、公开安装文档与部署样例统一为 `1.9.1`。
- [x] v1.9.0 的 annotated Tag 和发布记录保持不可变；v1.9.1 尚未创建 Tag。
- [x] `scripts/check_versions.py --expected-version 1.9.1`、当前版本发布工程门禁与生成的公开文档通过。

## Gate B：代码与回归

- [x] 前端 lint / TypeScript、466 项单元测试、生产构建与 Host Client dist 通过。
- [x] 后端 752 passed / 2 skipped，版本相关断言与打包检查通过；保留既有 `asyncio_mode` 配置警告。
- [x] 已保存、保存中、待保存和只读的嵌入保存按钮状态通过本地真实 Cloud–Solver Chromium 联调。

## Gate D：候选制品与回滚准备

- [x] 本版不含数据库迁移；候选源码只包含 Host Protocol 兼容修正、保存状态反馈与版本材料，不触及求解核心。
- [x] `v1.9.0-969bf47` 是已知直接镜像回滚基线；部署前后快照与恢复步骤限定为 `archsight-solver-app`，不应影响其他服务。
- [x] 维护者已明确授权按 Solver、再 Cloud 的顺序构建、推送、上线并在公网验收后创建精确 Tag；此授权不包含修改 IAM 或 Science。

## Gate F：正式发布与线上验收

- [ ] 生产容器仅切换到已预检的精确镜像，线上版本、源码 revision、容器健康与其他服务不变性均已核对。
- [ ] 公网 `https://solver.archsight.cn/` 与 Cloud 嵌入页面通过最小 smoke；真实已授权 Cloud 写入若无法执行，必须明确标记为未验证。
- [ ] 仅在上线和公网验收后创建 annotated `v1.9.1`，精确指向实际部署源码并推送。
- [ ] 保留 `v1.9.0-969bf47` 作为直接镜像回滚基线，并验证恢复命令不会影响其他服务。

## 当前未验证项

- 镜像构建、镜像推送、生产切换、公网验收、Tag 与 GitHub Release 尚未执行。
- Cloud 真实账户的工程写入、版本、分享操作必须复用已授权会话；本记录不以匿名页面或模拟数据替代。
