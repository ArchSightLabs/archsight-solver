# ArchSight Solver v1.8.4 发布验收记录

> 状态：发布候选准备中
> 目标版本：`v1.8.4`
> 验收原则：v1.8.4 只收口 v1.8.3 发布后的低风险契约、依赖边界、保存语义与可选 Cloud 入口；仓库版本、Git Tag、GitHub Release、阿里云镜像与线上容器分别验收，未完成项不得提前勾选。

## 发布范围与兼容边界

- 不新增结构类型、求解算法、数据库迁移、项目文件格式或 Host Protocol 版本，不改变既有一次分析、GNA/GNIA 和线性屈曲的数值适用范围。
- 未预期的服务端异常由 HTTP 400 修正为 HTTP 500；稳定请求错误仍为 4xx，调用方不得继续依赖旧的错误分类。
- 框架与桁架的 `reviewPoints` 对齐 JSON Schema、OpenAPI、生成 DTO 和 canonical 请求回显，但不改变数值结果。
- “前往云端保存”只在独立 Solver 且部署配置了 Cloud 地址时显示；入口只负责跳转，不静默上传当前本地工程。账号、订阅、租户和云项目存储继续由 Cloud 宿主负责。
- CalculationTrace canonical hash 语义迁移和共回转固定端位移 Level 3 数值工作继续 HOLD，不纳入 v1.8.4。

## Gate A：范围与版本事实源

- [x] `pyproject.toml`、`uv.lock`、前端包、Host Client、CHANGELOG、发行资产文档与生成发布说明统一为 `1.8.4`。
- [x] CHANGELOG 的重点改进不超过五条，并明确 HTTP 400 → 500 的可观察兼容变化、Cloud 可选边界和两项 HOLD。
- [x] `scripts/check_versions.py --expected-version 1.8.4` 通过，发布工程门禁在候选准备与 Tag 发布阶段分别执行对应严格度。

## Gate B：代码、契约与回归

- [x] 后端全量测试通过，覆盖错误契约、敏感性分析、`reviewPoints` Schema/OpenAPI/DTO 和架构边界。
- [x] 前端 lint、类型检查、单元测试与生产构建通过，生成契约和公开文档无未提交漂移。
- [x] wheel、sdist 与无运行时依赖的 Host Client tarball 构建、安装态/内容检查通过。
- [x] 本补丁未修改核心求解矩阵、边界条件、收敛算法、项目文件或 Host Protocol 1.0。

## Gate C：浏览器、容器与 Cloud 入口

- [x] Chromium、Firefox、WebKit 均验证：配置 Cloud 时独立站显示入口，未配置时隐藏，嵌入模式不重复显示。
- [x] 候选容器达到 `healthy`，HTTP/API、真实 Host 集成、真实 GNA 教学路径与导出回归通过。
- [x] 候选容器运行时同时投影 `cloudWorkspaceUrl=https://cloud.archsight.cn/solver` 与 `hostAllowedOrigins=https://cloud.archsight.cn`，首页 CSP 允许精确 Cloud origin。
- [x] Cloud `/solver` 登录续接、iframe 启动、Host Protocol 保存/打开链路以当前 Cloud 提交完成跨仓复核；Solver 本地工程不会在跳转时自动上传。

## Gate D：候选制品与回滚准备

- [ ] 阿里云候选/正式精确镜像绑定发布提交，推送后回拉核对 digest，并在不占用 `18082/18083` 的隔离端口预检。
- [ ] 升级前记录生产镜像、端口、健康状态与 `.env` 备份路径；直接回滚镜像固定为 `v1.8.3-5f4c544`。
- [x] v1.8.4 不含数据库迁移；镜像回滚不会产生数据格式恢复步骤。

## Gate E：候选确认与发布授权

- [ ] 功能候选提交推送到 `main`，精确 SHA 的后端、前端、Windows 原生构建、提交治理和 Docker 发布门禁全部通过；后续只记录发布证据的文档提交不得改变候选产品树。
- [ ] Cloud 提交 `5e304825836da4e423843b0a407cb97cdd1cb762` 使用 `--solver-ref <精确候选 SHA>` 完成 Chromium、Firefox、WebKit 全门禁，且 `solverWorktreeUnchanged=true`。
- [x] 维护者已明确授权“上线 v1.8.4”，版本号和外部状态变更边界清楚。
- [ ] 本次同日上线按补丁发布处理：没有新的数值或持久化范围，使用完整本地门禁、精确 SHA CI、隔离镜像预检与可回滚部署替代默认 24 小时候选观察；该例外不得解释为已完成 24 小时观察。

## Gate F：正式发布与线上验收

- [ ] 不可变 `v1.8.4` Tag 指向经验证的发布提交，GitHub Release 工作流成功，资产与 `SHA256SUMS` 核对通过。
- [ ] GHCR `v1.8.4` 与阿里云精确镜像摘要已记录，未推送或部署 `latest`。
- [ ] 正式部署继续使用 `127.0.0.1:18082 -> app:6240`，未占用或调整 Graphics 的 `18083`；容器 healthy、重启计数 0。
- [ ] `https://solver.archsight.cn/` 显示 v1.8.4，`runtime-config.js` 含 Cloud 工作区与宿主白名单，首页 CSP 允许 `https://cloud.archsight.cn`。
- [ ] 线上梁、桁架、框架、GNA/GNIA、线性屈曲、DOCX/XLSX/可信计算包与 Cloud Host 保存链路通过复核。
- [ ] v1.8.3 回滚镜像仍可拉取并完成隔离健康预检；生产 `.env` 备份和一条命令回滚路径已记录。

## 验收证据

截至 2026-09-01 的候选证据：后端 `748 passed, 2 skipped`；前端 `458 passed`，lint（含 `tsc --noEmit`）、生产构建与两档 npm audit 通过；三浏览器 Cloud 入口 `9 passed, 3 skipped`，其中 3 项为只在正式容器启用的预期跳过；wheel、sdist、Host Client tarball 的构建、安装态与内容检查通过；候选容器 `healthy`，正式容器 Cloud 入口 `1 passed`，真实 Host canonical 保存/重开 `1 passed`，真实 GNA 与图形路径 `5 passed`。Cloud 提交 `5e304825836da4e423843b0a407cb97cdd1cb762` 对当前 Solver 工作树完成登录续接、项目保存/打开、修订恢复和 Chromium/Firefox/WebKit 全门禁，且未放宽 600 秒上限；Cloud 提交保持本地未推送、未部署。

候选和正式发布证据在对应门禁实际完成后逐项追加；任何未运行项保持未勾选并明确记录 `NOT RUN`，不得用历史 v1.8.3 证据替代 v1.8.4 自身的构建、制品、镜像或线上验收。

## 延期与 HOLD

- CalculationTrace canonical 请求哈希未包含全部语义字段；后续若修复必须定义 CalculationResult/Trace 的兼容迁移和跨版本复算策略。
- 共回转固定端非零指定位移尚无 Level 3 数值实现与公开 benchmark；在完成可复现算例、数值容差和主控复核前继续 HOLD。
- GitHub Actions 依赖的 Node 20 运行时迁移提示计入 CI 维护备忘，不阻断本次补丁发布。
