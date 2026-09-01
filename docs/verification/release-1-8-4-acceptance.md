# ArchSight Solver v1.8.4 发布验收记录

> 状态：已发布
> 目标版本：产品 SemVer `v1.8.4`；正式发行修订 `v1.8.4-r1`
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

- [x] 阿里云候选/正式精确镜像绑定修复后的发行提交，推送后回拉核对 digest，并在不占用 `18082/18083` 的隔离端口预检。
- [x] 升级前记录生产镜像、端口、健康状态与 `.env` 备份路径；直接回滚镜像固定为现网已验证修订 `v1.8.3-8317ec9`，不可变发布基线 `v1.8.3-5f4c544` 同时保留。
- [x] v1.8.4 不含数据库迁移；镜像回滚不会产生数据格式恢复步骤。

## Gate E：候选确认与发布授权

- [x] 功能候选提交推送到 `main`，精确 SHA 的后端、前端、Windows 原生构建、提交治理和 Docker 发布门禁全部通过；后续只记录发布证据的文档提交不得改变候选产品树。
- [x] Cloud 提交 `5e304825836da4e423843b0a407cb97cdd1cb762` 使用 `--solver-ref <精确候选 SHA>` 完成 Chromium、Firefox、WebKit 全门禁，且 `solverWorktreeUnchanged=true`。
- [x] 维护者已明确授权“上线 v1.8.4”，版本号和外部状态变更边界清楚。
- [x] 发行恢复提交推送到 `main` 后，其精确 SHA 的提交治理、版本门禁、后端、前端、Windows 原生构建和 Docker 发布门禁全部通过；未完成前不得创建 `v1.8.4-r1` Tag。
- [x] 本次同日上线按补丁发布处理：没有新的数值或持久化范围，使用完整本地门禁、精确 SHA CI、修复后镜像的隔离预检与可回滚部署替代默认 24 小时候选观察；该例外不得解释为已完成 24 小时观察。

## Gate F：正式发布与线上验收

- [x] 不可变 `v1.8.4` 首次 Tag 保持失败现场不移动；独立发行修订 Tag `v1.8.4-r1` 指向修复后的候选证据提交，GitHub Release 工作流成功，资产与 `SHA256SUMS` 核对通过。
- [x] GHCR `v1.8.4-r1` 与修复后的阿里云精确镜像摘要已记录，未推送或部署 `latest`。
- [x] 正式部署继续使用 `127.0.0.1:18082 -> app:6240`，未占用或调整 Graphics 的 `18083`；容器 healthy、重启计数 0。
- [x] `https://solver.archsight.cn/` 显示 v1.8.4，`runtime-config.js` 含 Cloud 工作区与宿主白名单，首页 CSP 允许 `https://cloud.archsight.cn`。
- [x] 线上梁、桁架、框架、GNA/GNIA、线性屈曲、DOCX/XLSX/可信计算包通过复核；Cloud 线上入口和 Host 配置可达，当前 Cloud 提交与同一 Solver 产品树的 Host 保存/重开链路已用精确归档完成跨仓复核。
- [x] v1.8.3 回滚镜像仍可拉取并完成隔离健康预检；生产 `.env`/Compose 备份和一条命令回滚路径已记录。

## 验收证据

截至 2026-09-01 的候选证据：后端 `748 passed, 2 skipped`；前端 `458 passed`，lint（含 `tsc --noEmit`）、生产构建与两档 npm audit 通过；三浏览器 Cloud 入口 `9 passed, 3 skipped`，其中 3 项为只在正式容器启用的预期跳过；wheel、sdist、Host Client tarball 的构建、安装态与内容检查通过；候选容器 `healthy`，正式容器 Cloud 入口 `1 passed`，真实 Host canonical 保存/重开 `1 passed`，真实 GNA 与图形路径 `5 passed`。

- 功能候选提交 `8bdd706fc0ce1ea78242922a604a078f0134ef9c` 已推送；[main CI 33480197675](https://github.com/ArchSightLabs/archsight-solver/actions/runs/33480197675) 的提交治理、后端、前端、Windows 原生构建和 Docker 发布门禁全部通过。
- Cloud 提交 `5e304825836da4e423843b0a407cb97cdd1cb762` 使用 `--solver-ref 8bdd706fc0ce1ea78242922a604a078f0134ef9c` 完成精确归档门禁：Chromium、Firefox、WebKit 全通过，耗时 318.939 秒，归档 SHA256 为 `92c0f4fbdaeaf7ccd9074d7807ed16b29c94dad49760964ec12d29d6335e5621`，`solverWorktreeUnchanged=true`；该 Cloud 提交已按 Cloud 任务中的独立用户授权推送，但未部署 Cloud。
- 阿里云候选镜像 `v1.8.4-8bdd706` 已推送并在本地、生产机回拉核对，仓库摘要为 `sha256:bf7538572f2f5c28e50740580c13ecc598afe97f1b51544569e0eca7b727bf29`，镜像 ID 为 `sha256:f2f712836017bd0b1367abc8e4af0a57b55b5d61100d918a7c7fe102c8e27b91`。同一镜像在生产机 `28082` 隔离预检达到 `healthy`、HTTP 200、重启 0，运行时 Cloud 地址、宿主白名单和 CSP 正确，临时容器随后删除；现网 `18082` 全程保持 `v1.8.3-8317ec9` healthy、重启 0。
- 升级前生产事实已冻结：`127.0.0.1:18082 -> app:6240`，当前镜像 `v1.8.3-8317ec9@sha256:53130c2a3f237e825f98f421a855b78e8c5e77b59e4954f320294ad7e09fd017`，环境备份 `/root/archsight-solver/.env.pre-v1.8.4-20260901T071130Z` 与原文件 SHA256 同为 `c1cb97093bbfd31a8ffea07d4b8826df920cf9ac9e614acf2dec8877297e1ac1`；`v1.8.3-5f4c544` 仍在生产机保留。
- 首次不可变 Tag `v1.8.4` 指向 `fda91b591e8e7f65e54e819e31b24487d8f7dcad`，但 Release 工作流 [33482147849](https://github.com/ArchSightLabs/archsight-solver/actions/runs/33482147849) 被 Trivy 正确阻断：固定 Debian 基础镜像中的 `libssl3t64`、`openssl`、`openssl-provider-legacy` 为 `3.5.6-1~deb13u2`，已有修复版 `3.5.7-1~deb13u2`。该次运行未创建 GitHub Release、未推送 GHCR、未部署生产；已推送的阿里云标签 `v1.8.4-fda91b5` 与候选摘要相同但视为阻断制品，不得上线。`v1.8.4` Tag 不移动，修复通过独立 `v1.8.4-r1` 发行修订承载，产品 SemVer 仍为 `1.8.4`。
- 发行恢复提交 `3d85db381f70a2174aa93d95dfe79b8781ba0482` 将三个 OpenSSL 包精确升级为 `3.5.7-1~deb13u2`；本地 Trivy 0.70.0 使用当前漏洞库复扫，Debian 13.6 与 Python 包均为 0 个可修复 HIGH/CRITICAL。该提交的精确 SHA CI [33485843601](https://github.com/ArchSightLabs/archsight-solver/actions/runs/33485843601) 已通过提交治理、后端、前端、Windows 原生构建与 Docker 发布门。
- 修复后的阿里云精确镜像为 `v1.8.4-3d85db3@sha256:3d59fa029ea419b7e32614e5cb5c9f15e4039880af4738004ac88ed5e2348118`，镜像 ID `sha256:bff2e805a183bd716e99746e7de1a234753b659f4cf3c40f34a7584957b08feb`；本地推送后回拉一致，生产机回拉后在 `127.0.0.1:28082 -> app:6240` 隔离预检达到 healthy、重启 0，运行时 Cloud 地址、宿主白名单与 CSP 正确。临时容器已删除，现网 Solver `v1.8.3-8317ec9` 与 Graphics `v1.5.1` 均保持 healthy、重启 0。
- 候选证据提交 `841cf49c46ce3f805eddf716976fb034365e4c19` 的精确 SHA CI [33486677219](https://github.com/ArchSightLabs/archsight-solver/actions/runs/33486677219) 全部通过；不可变 `v1.8.4-r1` Tag 固定指向该提交，原始 `v1.8.4` Tag 继续固定在失败现场 `fda91b591e8e7f65e54e819e31b24487d8f7dcad`，没有移动、删除或重建。
- [GitHub Release v1.8.4-r1](https://github.com/ArchSightLabs/archsight-solver/releases/tag/v1.8.4-r1) 已发布，发布工作流 [33487495384](https://github.com/ArchSightLabs/archsight-solver/actions/runs/33487495384) 全部通过。7 份资产包括 wheel、sdist、Host Client、离线镜像、SPDX SBOM、Trivy 报告和 `SHA256SUMS`；清单保护的 6 份制品逐项核对一致。SBOM 记录 109 个包和 2,959 个文件，Trivy 报告覆盖 2 个目标且无发现；GHCR 不可变标签摘要为 `sha256:bfd4d07c1583563e2812aab45c33eb37517fddc781e8230ddcb5bcea4e1b1840`。本机凭据缺少 `read:packages`，无法额外回拉 GHCR 私有可见包，但工作流中的推送、摘要与 Release 均成功，该权限限制不改写为镜像失败。
- 生产 `.env` 已备份为 `/root/archsight-solver/.env.pre-v1.8.4-r1-20260901T085115Z`（SHA256 `c1cb97093bbfd31a8ffea07d4b8826df920cf9ac9e614acf2dec8877297e1ac1`），Compose 已备份为 `/root/archsight-solver/docker-compose.yml.pre-v1.8.4-r1-20260901T085115Z`（SHA256 `a7bcd9b6e8ad85e8a315b944a06d8d1875fd97dd09c0e3267e547d1be2a168b5`）。正式容器已切换到阿里云精确镜像 `v1.8.4-3d85db3`，继续使用 `127.0.0.1:18082 -> app:6240`，状态 healthy、重启 0；Graphics `v1.5.1` 继续使用 `18083`，状态 healthy、重启 0。
- 公网首页返回 HTTP 200，浏览器标题为“ArchSight 结构力学求解器”，可见版本 `v1.8.4`，无控制台错误；“前往云端保存”链接精确指向 `https://cloud.archsight.cn/solver`。`runtime-config.js` 精确投影 `cloudWorkspaceUrl=https://cloud.archsight.cn/solver` 与 `hostAllowedOrigins=https://cloud.archsight.cn`，首页 CSP 为 `frame-ancestors 'self' https://cloud.archsight.cn`。
- 线上 Chromium 回归 `10/10` 通过：覆盖 canonical 独立工程计算、结果失效、重算、导出、保存与重开，GNA-001/GNA-003 真实复算与可信证据下载，BM-009/GNA-003/BM-010 图形真实页面，以及框架/桁架 DOCX 图形与数据曲线导出。另以 GNA-005 直接调用线上真实后端，确认共回转求解收敛、GNIA 稳定、10 mm 首阶线性屈曲模态初始缺陷、临界荷载因子 `2.500005` 和 3 个屈曲模态；梁 DOCX/XLSX 分别返回 55,584/19,579 字节、合法 OpenXML MIME 与 `PK` 文件头，可信计算包创建后完整性和复算均通过、SHA-256 长度为 64。
- Cloud 线上 `/api/v1/solver/config` 返回 Host Protocol `1.0.0`、Solver 嵌入地址 `https://solver.archsight.cn/?embed=1&theme=light` 与五项所需 capability；从 Solver 点击“前往云端保存”可到达 `https://cloud.archsight.cn/solver` 登录工作台。Cloud 提交 `5e304825836da4e423843b0a407cb97cdd1cb762` 的登录续接和 Host 保存/重开此前已对功能候选 `8bdd706` 精确归档完成三浏览器跨仓门禁；发行恢复只改 Docker OpenSSL 与发行工程，不改变该 Solver 产品树。此次没有部署 Cloud，也没有使用真实用户账号制造线上云项目，因此不把“已登录线上写入”写成执行证据。
- 直接回滚镜像 `v1.8.3-8317ec9@sha256:53130c2a3f237e825f98f421a855b78e8c5e77b59e4954f320294ad7e09fd017`（镜像 ID `sha256:203ac8239b46d03fc251eb7be356871819969cd44ff7bf5b0de2cd2dce51b83c`）已在生产机 `127.0.0.1:28082 -> app:6240` 隔离启动，达到 running/healthy、HTTP 200、重启 0 后删除；演练前后正式 v1.8.4 与 Graphics 均保持 healthy、重启 0。一条命令回滚路径为 `cd /root/archsight-solver && cp .env.pre-v1.8.4-r1-20260901T085115Z .env && cp docker-compose.yml.pre-v1.8.4-r1-20260901T085115Z docker-compose.yml && ./deploy.sh v1.8.3-8317ec9`。

本记录只把实际执行的 v1.8.4-r1 构建、制品、镜像、线上复核与回滚演练写为完成；Cloud 真实账号线上保存未执行，继续由已完成的精确归档跨仓门禁与当前线上只读配置证据界定，不使用历史 v1.8.3 证据替代。

## 延期与 HOLD

- CalculationTrace canonical 请求哈希未包含全部语义字段；后续若修复必须定义 CalculationResult/Trace 的兼容迁移和跨版本复算策略。
- 共回转固定端非零指定位移尚无 Level 3 数值实现与公开 benchmark；在完成可复现算例、数值容差和主控复核前继续 HOLD。
- GitHub Actions 依赖的 Node 20 运行时迁移提示计入 CI 维护备忘，不阻断本次补丁发布。
