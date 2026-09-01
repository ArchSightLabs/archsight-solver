# ArchSight Solver v1.9.0 发布验收记录

> 状态：已发布
> 未验证项：生产真实微信会话内的 Cloud 写入复验仍待补充
> 目标版本：产品 SemVer 与首次正式发行 Tag 均为 `v1.9.0`
> 验收原则：v1.9.0 只扩展可嵌入产品外壳与 Host Protocol 可选能力；仓库版本、部署源码提交、镜像 revision、线上容器、公网验收与 annotated Tag 分别核对，未完成项不得提前勾选。

## 发布范围与兼容边界

- 不新增结构类型、求解算法、数据库迁移、项目文件格式或 Host Protocol 主版本，不改变既有一次分析、GNA/GNIA、线性屈曲和导出数值。
- 独立 Solver 继续使用完整原生页头；`embed=1` 由 Solver 自己呈现唯一的 Host Portal 页头，保留真实版本、公开案例、验证投稿、主题与系统设置。
- Cloud 只管理工程、保存、版本和分享。Solver 不接收 Cloud 凭据，不调用 Cloud 存储 API，也不拥有用户、租户或订阅。
- Host Protocol 保持 `1.0.0`，只新增可选 capability `requestPortalAction` 与受 allowlist 约束的 portal action；新旧 Host/Solver 必须可回退互操作。

## Gate A：范围与版本事实源

- [x] `pyproject.toml`、`uv.lock`、前端包、Host Client、CHANGELOG、公开发布说明与生成契约统一为 `1.9.0`。
- [x] Host Protocol 主版本保持 `1.0.0`，portal action 只作为可选加法能力，不形成第二套保存协议。
- [x] `scripts/check_versions.py --expected-version 1.9.0` 与当前版本发布工程门禁通过。

## Gate B：代码、契约与回归

- [x] 前端 lint / TypeScript、461 项单元测试、生产构建与 Host Client dist 通过。
- [x] Host Protocol JSON Schema 41 项通过，生成契约无漂移；保存继续复用 `requestSave -> saveRequest -> createRevision -> saveResult`。
- [x] 本版本未修改核心求解矩阵、边界条件、收敛算法、项目文件 Schema 或导出格式。

## Gate C：浏览器与 Cloud 双域工作台

- [x] 独立 Solver 保留文件、本地保存、公开案例、验证投稿、主题和系统设置；嵌入模式只显示一排 Solver Host Portal 页头与完整工作台。
- [x] Chromium Host/embed 回归 18 项通过，1 项按候选容器条件跳过；Cloud 双域本地工作台的编辑、保存、版本、恢复、分享、主题、设置与刷新恢复通过。
- [x] 新 Solver 遇到旧 Host 不发送 portal action；Cloud 检测不到 `requestPortalAction` 时显示不遮挡工作台的最小 fallback。

## Gate D：候选制品与回滚准备

- [x] 精确镜像采用 `v1.9.0-<sourceCommit>`，构建脚本只推送不可变标签；不使用或部署 `latest`。
- [x] 生产现状已只读冻结：Solver 使用 `127.0.0.1:18082 -> app:6240`，Graphics 继续使用 `18083`，正式切换前必须备份 `.env` 与 Compose。
- [x] v1.9.0 不含数据库迁移；直接回滚基线为现网已验证镜像 `v1.8.4-3d85db3`，回滚不需要数据格式恢复。

## Gate E：候选确认与发布授权

- [x] Solver 与 Cloud 的实现提交均已推送到各自 `main`，工作树干净，当前候选的相关单元、构建、契约和本地双域浏览器门禁通过。
- [x] 维护者已明确授权提交、推送、按 Solver 后 Cloud 的顺序上线并创建对应精确版本 Tag。
- [x] 发布顺序固定为：Solver 精确镜像预检与上线、公网验收、Solver annotated Tag；随后 Cloud 精确镜像上线、公网验收、Cloud annotated Tag。

## Gate F：正式发布与线上验收

- [x] 阿里云精确镜像已绑定最终发布源码提交，推送后回拉核对 digest，并在不占用 `18082/18083` 的隔离端口达到 healthy、HTTP 200、重启 0。
- [x] 正式 Solver 容器已切换到同一精确镜像，继续使用 `127.0.0.1:18082 -> app:6240`；Graphics、Cloud、IAM 等同机服务未被改动且保持 healthy。
- [x] `https://solver.archsight.cn/` 显示 v1.9.0；运行时 Cloud 地址、宿主白名单、CSP、独立页头与 Host Portal 候选镜像门禁通过公网/精确镜像组合复核。
- [x] Cloud v1.4.0 已使用同一 Solver source provenance 上线；公网 `/solver` 的匿名登录回跳与嵌入配置通过，同一最终镜像的本地完整工作台已覆盖工程、保存、版本、分享、主题、设置与旧 capability fallback。
- [x] annotated `v1.9.0` Tag 精确指向线上部署源码提交并已推送；GitHub Release 工作流与资产校验通过，历史 Tag 未移动。
- [x] `v1.8.4-3d85db3` 回滚镜像仍可拉取并完成隔离健康预检；生产备份和一条命令回滚路径已记录。

未验证项：本轮没有新的真实微信登录会话，未在生产环境重放新建工程、保存 revision 与分享；该缺口不以匿名入口或本地浏览器证据替代。

## 候选证据

- Solver 实现提交 `f9276435f0ca5d79f902073dab5bf520ed26ec12` 已推送到 `main`；前端 lint / TypeScript、461 项单元测试、生产构建、版本检查、Host Schema 41 项和 Host/embed Chromium 回归通过。
- Cloud 实现提交 `e09961f905d57a8ed6196528214a55590ee91175` 已推送到 `main`；前端 lint / typecheck、41 项单元测试、7 项后端纵向测试、生产构建、4 条关键 Chromium E2E 与 v1.4.0 源码门禁通过。
- Chrome 人工验收确认 `cloud.archsight.cn/solver` 的本地同构页面只有一排 Solver 页头、显示 v1.9.0 且完整画布可用；编辑、保存、版本恢复、刷新恢复、主题、系统设置和公开案例通过。

## 2026-09-02 发布证据

- 线上 Solver 源码为 `969bf47049a4b798b2df0d0981c243628f39c1be`，阿里云镜像为 `v1.9.0-969bf47`，registry digest 为 `sha256:b7cc9d1e833908332708dabae679dec6665122e4219b5d1048b2db3b7fca73fb`，容器镜像 ID 为 `sha256:35f4b77192f8cc74020650dee5a84869b863642a16c03360883490f372692ba3`。
- 生产容器保持 `127.0.0.1:18082 -> 6240`、`healthy`、重启计数 `0`；公网 Chrome 显示 `v1.9.0`，独立文件/保存、云端入口、公开案例、验证投稿、主题与系统设置均存在，控制台无警告或错误；CSP 为 `frame-ancestors 'self' https://cloud.archsight.cn`。
- `v1.8.4-3d85db3` 在隔离端口重新达到 `healthy`、HTTP 200、重启计数 `0`；部署前 `.env` 与 Compose 副本位于 `/root/archsight-solver`，可直接恢复旧 tag 后重新执行 `deploy.sh`。
- annotated `v1.9.0` 精确解引用到上述源码；GitHub Actions [Release 33531717095](https://github.com/ArchSightLabs/archsight-solver/actions/runs/33531717095) 全绿并发布 [GitHub Release v1.9.0](https://github.com/ArchSightLabs/archsight-solver/releases/tag/v1.9.0)，包含离线镜像、wheel、sdist、Host Client、SPDX SBOM、Trivy 报告与 SHA256SUMS。
- Cloud `v1.4.0` 已以源码 `b5d5c6a7e22c35872be4ff26cd7d8a184be66579`、镜像 digest `sha256:60040e01d242e533d5052386d035dbc834fc174e3aa78370ce3682320883fd39` 上线；公开 Solver config 精确返回 `https://solver.archsight.cn/?embed=1` 与 Host Protocol `1.0.0`。

## 发布后记录边界

Gate F 只在镜像、容器、公网、Tag、GitHub Release 和回滚事实实际发生后勾选。后续证据提交不得移动 `v1.9.0`，也不得把仅更新文档的提交表述为线上源码。
