# v1.6.3 发布验收

> 发布状态：已发布。[GitHub Release v1.6.3](https://github.com/ArchSightLabs/archsight-solver/releases/tag/v1.6.3) 于 2026-08-07 发布；下文保留创建 Tag 前的候选证据和门禁口径，其他目标镜像仓库推送和线上更新仍属于独立运维状态。

## 范围与版本判断

v1.6.3 是向后兼容的补丁版，不新增结构分析域，不改变 ASMS-JSON 或 Host Protocol 主契约，不引入账号、组织、远程存储或平台业务。版本提升依据是 v1.6.2 之后存在多项直接影响安装、构建、部署和可信度的修复，但没有不兼容 API 或新分析能力，因此采用 PATCH 而不是 MINOR。

候选范围：

- 前端依赖风险、生产依赖审计和构建工具链高危漏洞门禁。
- Windows / Linux 干净环境安装与 Rolldown 原生可选绑定校验。
- 固定 digest 的 Docker 构建来源和 Compose 容器健康门禁。
- `/api/jobs` 幂等命名空间的 OpenAPI / CORS 可发现性；`X-Tenant-Id` 不构成认证或访问隔离。
- 66 个公开 benchmark、26 个可独立复跑的 B 级算例、二维杆系坐标变换解析校核和规模基线 nightly。

## GO / HOLD 门槛

只有以下门禁全部通过才可创建 `v1.6.3` tag：

- 版本元数据、发布文档、部署默认标签和前端发布记录一致。
- 后端、前端 lint / TypeScript、单元测试、生产构建和契约生成检查通过。
- 生产依赖在 moderate 门槛、完整构建工具链在 high 门槛下无已知漏洞。
- v1.6.2 工作台工程生命周期、诊断和结果有效性在 Chromium / Firefox / WebKit 中通过。
- v1.6.1 Reference Host、v1.6 Host 和 v1.5 工作台跨版本浏览器回归通过。
- 框架 / 桁架 DOCX 同源工程图与数据曲线导出在 Chromium / Firefox / WebKit 中通过。
- CI 与 Tag Release 必须阻断 Chromium 工作台主链路和 DOCX 导出回归；weekly nightly 继续独立阻断完整三浏览器 DOCX 矩阵。
- 构建后镜像以非 root 用户运行并进入 `healthy`，容器内 Reference Host canonical 嵌入链路通过。
- Tag 工作流重新生成 Trivy 报告、SPDX SBOM、镜像归档和 `SHA256SUMS`，并确认无已有修复版本的 HIGH / CRITICAL 漏洞。

任何一项失败，或 tag 所指提交与本验收提交不一致，结论均为 HOLD。

## 仓库内候选证据

| 门禁 | 2026-08-06 结果 |
|---|---|
| 仓库状态 | 候选提交链基于 v1.6.2 连续演进；候选整理前工作树干净 |
| 后端 | 606 passed，2 skipped；独立刚度法基线 26/26 通过 |
| 前端 | lint / TypeScript 通过；400 passed；生产构建通过，主入口约 390 kB、gzip 约 107 kB |
| 版本与发布工程 | `check_versions.py`、`check_release_gate.py`、契约生成检查和 `git diff --check` 通过 |
| v1.6.2 三浏览器交付主链路 | 工程生命周期、诊断与结果有效性在 Chromium / Firefox / WebKit 共 39/39 通过 |
| 跨版本兼容 | Chromium 中 v1.6.1 Reference Host、v1.6 Host、v1.5 快速建模与荷载场景共 19/19 通过 |
| DOCX 三浏览器导出 | 框架 / 桁架同源工程图与数据曲线选项在 Chromium / Firefox / WebKit 共 12/12 通过 |
| 自动发布门禁 | CI 与 Tag Release 已纳入 Chromium 生命周期、诊断、结果有效性和 DOCX 导出；weekly nightly 保留 Chromium / Firefox / WebKit DOCX 矩阵 |
| 依赖审计 | production moderate 与完整工具链 high 两道门禁均为 0 vulnerabilities |
| 构建后镜像 | `archsight-solver:1.6.3-rc` 构建成功；镜像 `sha256:875041a8c450…`、352,269,916 bytes；用户 `app`；health `healthy`；首页与 runtime config 200；CSP 精确包含测试 Host origin；容器公开案例 66 个；容器 Host canonical 1 项通过 |
| Tag Release 制品 | 由 `v1.6.3` tag 工作流在同一提交上复跑并生成；未全绿不得判定发布完成 |

历史候选判断：**GO**。当时代码与候选镜像已达到创建 `v1.6.3` Tag 和 GitHub Release 的门槛；Tag 工作流随后完成，正式发布事实见本文顶部。其他目标镜像仓库推送和线上更新继续作为独立的维护者操作。

## 候选复核命令

```bash
python scripts/check_versions.py
python scripts/check_release_gate.py
python scripts/generate_contract_types.py --check
python -m pytest backend/tests -q
python -m backend.benchmarks.independent_stiffness
npm --prefix frontend run lint
npm --prefix frontend run test:unit
npm --prefix frontend audit --omit=dev --audit-level=moderate
npm --prefix frontend audit --audit-level=high
npm --prefix frontend run build
npm --prefix frontend run test:visual -- release-1-6-2-acceptance.spec.ts release-1-6-2-project-lifecycle.spec.ts release-1-6-2-diagnostics.spec.ts release-1-6-2-result-validity.spec.ts --project=chromium --workers=1
npm --prefix frontend run test:visual -- release-1-6-2-acceptance.spec.ts release-1-6-2-project-lifecycle.spec.ts release-1-6-2-diagnostics.spec.ts release-1-6-2-result-validity.spec.ts --project=firefox --workers=1
npm --prefix frontend run test:visual -- release-1-6-2-acceptance.spec.ts release-1-6-2-project-lifecycle.spec.ts release-1-6-2-diagnostics.spec.ts release-1-6-2-result-validity.spec.ts --project=webkit --workers=1
npm --prefix frontend run test:visual -- release-1-6-1-host-reference.spec.ts release-1-6-host-integration.spec.ts release-1-5-quick-modeling.spec.ts release-1-5-load-scenarios.spec.ts --project=chromium --workers=1
npm --prefix frontend run test:visual:export-docx
git diff --check
```

本次三浏览器长矩阵在受限命令包装器中按浏览器、spec 或用例组拆分执行，以获得每组明确退出码；拆分不减少上述发布覆盖范围。整组命令超出包装器时限不能视为通过，只有拆分后的 39/39、19/19 和 12/12 明确结果计入候选证据。

Docker 候选还必须构建为不可变本地标签，以 `ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS=http://127.0.0.1:6250` 启动，等待 Docker `HEALTHCHECK` 为 `healthy`，再设置 `ARCHSIGHT_SOLVER_E2E_URL` 复跑 canonical 嵌入验收。Tag 工作流的 Trivy、SBOM、制品归档和校验和不能由本地测试替代。

## 升级与回滚边界

线上当前公开演示仍按既有部署独立管理。只有 `v1.6.3` tag、GitHub Release 和目标镜像仓库中的不可变镜像均已存在且摘要一致后，维护者才可把部署标签从 v1.6.2 更新为 v1.6.3。

更新前记录 v1.6.2 镜像 tag 与 digest，备份运行配置和关键 `.slv` 文件。v1.6.3 不含数据库迁移；若容器健康、典型求解、导出或 Host 接入任一失败，立即恢复已记录 digest 的 v1.6.2 镜像，并保留失败版本产生的工程文件用于诊断，不用旧文件覆盖唯一的新文件。
