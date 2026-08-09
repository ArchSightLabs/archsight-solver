# v1.7.0 发布验收

> 状态：正式发布候选验收（2026-08-09）。本地候选门禁已经 GO；只有同一提交上的 Tag Release 工作流继续全绿，才判定 v1.7.0 正式发布完成。其他镜像仓库推送和线上服务器更新仍是独立操作。

## 发布定位与边界

v1.7.0 的版本主题是“可携带、可复核、可嵌入”。它把工作台、REST、CLI、MCP、Python 发行包、Host Client 和 Docker 制品收敛到同一套可信计算与开发者分发路径，但不改变梁系、二维平面桁架、二维平面框架的线弹性静力求解边界，不修改 Host Protocol `1.0.0`，也不引入账号、组织、订阅、远程存储或商业平台逻辑。

本次验收不要求外部访谈、招募试用者或第三方接入数量。公开站 Busuanzi PV/UV 和匿名里程碑事件用于理解真实访问背景，不替代数值、契约、浏览器、Docker、发行包和制品证据。

## GO / HOLD 门禁

只有以下项目全部通过才可创建并推送 `v1.7.0` tag：

1. 版本、发布工程、生成契约、运行时资源同步和工作树检查无漂移。
2. 后端全量测试与独立刚度法 benchmark 通过，三类结构可信计算包均能创建、校验并复算。
3. 前端 lint / TypeScript、单元测试、依赖审计和生产构建通过。
4. Chromium 发布主链路、跨版本 Host/工作台回归与 Chromium / Firefox / WebKit DOCX、可信计算包矩阵通过。
5. wheel/sdist 和 Host Client tarball 在独立目录完成安装、运行、类型与协议检查。
6. Docker 候选镜像以非 root 用户运行并进入 `healthy`，镜像内 REST/CLI 可信计算包与 Host 集成通过。
7. Release 资产名称、哈希、文档与版本一致，tag 创建前工作树干净。
8. 同一 tag 提交的 GitHub Actions Release 工作流全绿，GitHub Release、GHCR 镜像、SBOM、Trivy 报告和 `SHA256SUMS` 均真实存在。

任一门禁失败则保持 **HOLD**，修复并从受影响的最上游门禁重新验证，不以流量数据或局部冒烟替代。

## 候选证据

| 门禁 | 证据 |
|---|---|
| 版本与发布工程 | `check_versions.py --expected-version 1.7.0`、`check_release_gate.py`、契约生成、运行时资源同步和 `git diff --check` 通过；中英文文档中的 wheel、Docker、离线镜像和 Host Client 资产名受版本门禁约束 |
| 后端与 benchmark | 631 passed、2 skipped；独立刚度法 26/26 通过；公开 benchmark 66 项可由发行包加载；三类结构可信计算包、篡改拒绝、跨版本 review 和项目版本回退均有回归覆盖 |
| 前端静态、单元、审计与构建 | lint / TypeScript 通过；408/408 单元测试通过；production moderate 与完整工具链 high 审计均为 0 vulnerabilities；Vite 生产构建通过 |
| 浏览器黄金流程与跨版本回归 | Chromium v1.6.2 工程生命周期、诊断、结果有效性与嵌入验收 13/13；Chromium v1.6.1/v1.6/v1.5 跨版本回归 19/19；Chromium / Firefox / WebKit DOCX 12/12；三类结构可信计算包与迟到响应保护 9/9 |
| Python 发行包 | wheel/sdist 构建成功；全依赖临时虚拟环境安装成功，版本 1.7.0、运行时资源 14 项、benchmark 66 项、模板 24 项、MCP tools 12 项，可信计算包复算 `pass` |
| Host Client 发行包 | `archsight-solver-host-client-1.7.0.tgz` 独立安装成功；版本 1.7.0、零运行时依赖、运行时导入、TypeScript 类型导入与 Protocol `1.0.0` 全部通过 |
| Docker 候选 | `archsight-solver:1.7.0-rc` 镜像 `sha256:561d55281a42…`、352,505,406 bytes；用户 `app`、health `healthy`、首页 200；梁、平面框架、平面桁架通过 REST 与模块 CLI 创建/复算，均为 `pass` 且记录 `solverVersion=1.7.0`；构建后镜像 canonical Host 1/1 通过 |
| Tag Release 制品 | 由 `v1.7.0` tag 工作流在同一提交上复跑并生成；未全绿不得判定发布完成 |

当前候选判断：**GO（允许创建并推送 `v1.7.0` tag）**。正式发布完成仍以 Tag Release 工作流、GitHub Release、GHCR 镜像和全部校验制品真实存在为准。

## 候选复核命令

```bash
python scripts/check_versions.py --expected-version 1.7.0
python scripts/check_release_gate.py
python scripts/generate_contract_types.py --check
python scripts/sync_runtime_resources.py --check
uv run python -m pytest backend/tests -q
uv run python -m backend.benchmarks.independent_stiffness
npm --prefix frontend run lint
npm --prefix frontend run test:unit
npm --prefix frontend audit --omit=dev --audit-level=moderate
npm --prefix frontend audit --audit-level=high
npm --prefix frontend run build
npm --prefix frontend run test:visual -- release-1-6-2-acceptance.spec.ts release-1-6-2-project-lifecycle.spec.ts release-1-6-2-diagnostics.spec.ts release-1-6-2-result-validity.spec.ts --project=chromium --workers=1
npm --prefix frontend run test:visual -- release-1-6-1-host-reference.spec.ts release-1-6-host-integration.spec.ts release-1-5-quick-modeling.spec.ts release-1-5-load-scenarios.spec.ts --project=chromium --workers=1
npm --prefix frontend run test:visual:export-docx
npm --prefix frontend run test:visual -- release-1-7-verification-package.spec.ts --project=chromium --project=firefox --project=webkit --workers=1 --reporter=list
uv build --wheel --sdist --out-dir dist
python scripts/check_python_distribution.py dist/archsight_solver-1.7.0-py3-none-any.whl
npm pack ./packages/solver-host-client --pack-destination dist
node frontend/scripts/check-host-client-package.mjs dist/archsight-solver-host-client-1.7.0.tgz
git diff --check
```

Docker 候选必须使用不可变本地标签 `archsight-solver:1.7.0-rc` 构建，确认镜像用户为 `app` 并等待 `HEALTHCHECK` 进入 `healthy`；随后在构建后镜像中复跑三类结构可信计算包 REST/CLI 路径与 canonical Host 接入。Tag 工作流的 Trivy、SBOM、镜像归档和制品校验和不能由本地测试替代。

## 分发资产

- `archsight_solver-1.7.0-py3-none-any.whl`
- `archsight_solver-1.7.0.tar.gz`
- `archsight-solver-host-client-1.7.0.tgz`
- `ghcr.io/archsightlabs/archsight-solver:v1.7.0`
- `archsight-solver-v1.7.0.tar.gz`
- `sbom.spdx.json`
- `trivy-report.json`
- `SHA256SUMS`

本地候选三项开发者分发资产摘要：

| 文件 | 大小（bytes） | SHA-256 |
|---|---:|---|
| `archsight_solver-1.7.0-py3-none-any.whl` | 276013 | `00d185a06235fde3068389b6f7025e816bd2d19f7f212beadf81401438531266` |
| `archsight_solver-1.7.0.tar.gz` | 223511 | `a0f73df37d4fd5ee937caade915d25f1ec0a646ffa72e485871bdb747b0a884a` |
| `archsight-solver-host-client-1.7.0.tgz` | 9213 | `0ccf112912d824a4996ee06f829e8eeee821223ed70ad7e1fea07e52ab893da6` |

Tag 工作流会在 Linux 干净环境重新构建，因此 GitHub Release 中资产的最终摘要以随 Release 发布的 `SHA256SUMS` 为准，不要求与 Windows 本地候选字节级相同。

## 升级与回滚边界

v1.7.0 不包含数据库迁移，既有 `.slv` 项目、ASMS-JSON 主契约和 Host Protocol `1.0.0` 保持兼容。可信计算包是新增、版本化的便携证据格式；它的 SHA-256 用于完整性检查，不是数字签名、身份认证、工程认证或安全批准。

线上公开演示不属于本次 tag 创建动作。只有 GitHub Release 与目标镜像仓库中的不可变镜像真实存在、摘要一致后，维护者才可另行决定服务器更新。更新前记录 v1.6.3 镜像 tag/digest、运行配置和关键 `.slv` 文件；若健康、典型求解、DOCX/XLSX/可信计算包导出或 Host 接入任一失败，恢复已记录 digest 的 v1.6.3 镜像，并保留失败版本产物用于诊断。
