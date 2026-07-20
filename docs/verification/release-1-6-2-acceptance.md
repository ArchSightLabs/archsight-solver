# v1.6.2 发布候选验收

> 状态：发布候选验收。本文证明仓库代码和候选镜像达到可发布门槛，不代表已经创建 `v1.6.2` tag、GitHub Release、线上镜像或服务器更新。

## 范围与结论门槛

v1.6.2 的目标是把 Solver 从“功能可演示”提升为“工作台可持续使用、宿主可稳定接入”。验收只使用本仓库的独立工作台、Host Protocol、`SolverHostClient` 和 Reference Host，不修改或依赖 `archsight-solver-platform`。

只有下列证据全部通过才可判定 GO：

- 工程打开、修改、保存、恢复和只读边界没有隐性数据丢失。
- 建模与计算问题可定位、可解释、可操作。
- 结果来源可追溯；模型改变后旧结果和导出立即失效。
- 同一 canonical `.slv` 在独立与嵌入模式完成基础全链路。
- v1.6.1、v1.6 和 v1.5 发布主链路保持回归通过。
- 版本、发布工程、后端、前端、三浏览器、构建后 Docker 镜像、依赖审计、漏洞扫描和 SBOM 门禁通过。

任一项失败，或升级前没有保留可拉取的 v1.6.0 镜像与工程备份，结论均为 HOLD。

## Canonical 工程矩阵

统一输入为 `examples/host-iframe-demo/sample-project.slv`，自动化入口为 `frontend/tests/visual/release-1-6-2-acceptance.spec.ts`。

| 模式 | 必须通过的路径 |
|---|---|
| 独立工作台 | 打开 canonical 工程 → 计算 → 修改荷载 → 结果失效且禁止导出 → 重算 → XLSX 导出 → 保存 → 重开 → 保留模型与结果来源 |
| Reference Host | 同一 canonical 工程建立真实双 origin 会话 → 计算 → 修改 → 失效 → 重算 → 导出 → Host 托管保存 → 刷新重开 → 只读审阅 |
| 构建后镜像 | 以运行时 allowlist 启动候选镜像，Reference Host 连接容器 URL，复跑嵌入模式 canonical 主链路 |

## 异常与协议矩阵

| 风险 | 自动化证据 | 预期结果 |
|---|---|---|
| 无效独立工程 | `release-1-6-2-project-lifecycle.spec.ts` | 当前有效工程不被破坏 |
| 独立保存失败 | `release-1-6-2-project-lifecycle.spec.ts` | 保留当前工程和未保存状态，可再次保存 |
| 无效 Host 工程 | `release-1-6-1-host-reference.spec.ts` | 拒绝新工程并恢复活动会话 |
| 保存超时或迟到快照 | `solver-host-client.test.ts` | 明确 `save-timeout` / `late-save-snapshot`，迟到消息不覆盖新状态 |
| 陈旧保存回执 | `release-1-6-host-integration.spec.ts`、`host-protocol-machine.test.ts` | 不消费当前请求，当前保存继续有效 |
| capability 不兼容 | `solver-host-client.test.ts`、`release-1-6-1-host-reference.spec.ts` | 会话不进入可操作假成功状态 |
| 错误 origin / session / nonce | `host-bridge.test.ts`、`host-protocol-machine.test.ts`、Reference Host 浏览器验收 | 严格拒绝，且不存在通配 `targetOrigin` |

## 发布候选复核命令

```bash
python scripts/check_versions.py
python scripts/check_release_gate.py
python -m pytest backend/tests -q
npm --prefix frontend run lint
npm --prefix frontend run test:unit
npm --prefix frontend audit --omit=dev --audit-level=moderate
npm --prefix frontend run build
npm --prefix frontend run test:visual -- release-1-6-2-acceptance.spec.ts release-1-6-2-project-lifecycle.spec.ts release-1-6-2-diagnostics.spec.ts release-1-6-2-result-validity.spec.ts --project=chromium --project=firefox --project=webkit --workers=1
npm --prefix frontend run test:visual -- release-1-6-1-host-reference.spec.ts release-1-6-host-integration.spec.ts release-1-5-quick-modeling.spec.ts release-1-5-load-scenarios.spec.ts --project=chromium --workers=1
git diff --check
```

Docker 候选应以精确宿主白名单启动，并以 `ARCHSIGHT_SOLVER_E2E_URL` 指向容器复跑 v1.6.2 嵌入验收。tag release 还必须生成 Trivy JSON 报告与 SPDX JSON SBOM；存在已有修复版本的 HIGH / CRITICAL 漏洞时不得发布。

## 从线上 v1.6.0 直接升级到 v1.6.2

v1.6.1 未更新线上服务器时，可以直接从 v1.6.0 升级到 v1.6.2，不需要先部署 v1.6.1。正式操作由维护者手动执行：

1. 记录线上 v1.6.0 镜像 tag 与 digest，确认仓库仍可拉取；备份运行配置、宿主 allowlist 和关键 `.slv` 工程原文件。
2. 在独立环境构建并推送不可变 `v1.6.2` 镜像，不使用 `latest`；先完成健康检查、三类典型求解、DOCX / XLSX 导出和 Reference Host canonical 验收。
3. 将部署配置的镜像 tag 从 v1.6.0 改为 v1.6.2，更新后等待容器 `healthy`，再复核独立工作台和允许来源的 Host 接入。
4. 保留升级前工程原文件，不批量覆写旧文件；本版没有数据库迁移，也不要求平台侧改造。

## 回滚

若健康检查、典型求解、导出或 Host 接入任一失败，立即把镜像 tag 恢复为记录过 digest 的 v1.6.0，重新启动并复核健康状态与基础求解。`.slv` 是单文件工程契约，回滚时保留 v1.6.2 保存过的文件副本，同时使用升级前原文件验证 v1.6.0；不要用旧版本覆盖唯一的新文件。

## 本轮证据

本节在候选提交前写入实际执行结果；tag、镜像推送、GitHub Release 和线上更新保持“未执行”。

| 门禁 | 结果 |
|---|---|
| 版本与发布工程 | `check_versions.py`、`check_release_gate.py`、生成 release notes 与 `git diff --check` 通过 |
| 后端测试 | 562 passed，2 skipped |
| Python 依赖清单 | `uv.lock` 与生产 `requirements.txt` 导出一致；Flask 3.1.3、pytest 9.1.1，已采用 GitHub 告警所列修复版本 |
| 前端 lint / unit / build / production audit | lint 通过；400 passed；生产构建通过；Windows 本地主入口 390.31 kB、gzip 106.91 kB，Linux 候选镜像 390.40 kB、gzip 106.95 kB；0 vulnerabilities |
| 三浏览器与跨版本 Playwright | v1.6.2 工作台生命周期、诊断和结果有效性在 Chromium、Firefox、WebKit 共 39 项通过；v1.6.1/v1.6/v1.5 Chromium 回归 19 项通过；测试服务使用严格端口且不跨 Playwright 进程复用 |
| 构建后 Docker 健康与 Host canonical | `archsight-solver:1.6.2-rc-final` 构建成功；最终镜像 `sha256:3259aa06fe97…`、352,164,640 bytes；非 root `app`（UID 999）；health `healthy`；首页 200；Schema 版本 `2026-05-30`、25 项；运行时 CSP 包含精确 Host origin；容器嵌入 canonical 1 项通过。远端 CI 使用默认镜像源构建通过；本地因 Docker Hub 镜像代理层校验错误，使用相同官方镜像的 AWS Public ECR 镜像源复验 |
| Trivy HIGH / CRITICAL | Trivy 0.69.3 使用 2026-07-20 下载的漏洞库扫描 Debian 13.6 与 Python 依赖；`--ignore-unfixed` 下 HIGH 0、CRITICAL 0 |
| SPDX SBOM | Syft 1.48.0 生成 SPDX-2.3，识别 124 个 packages、928 条 relationships，结构校验通过 |

最终发布判断：**GO（发布候选）**。该结论仅表示当前候选代码和镜像达到可创建 tag / Release 的门槛；本轮未创建 tag / GitHub Release，未推送镜像，也未更新线上服务器。
