# v1.7.0 发布验收

> 发布状态：已发布。[GitHub Release v1.7.0](https://github.com/ArchSightLabs/archsight-solver/releases/tag/v1.7.0) 于 2026-08-09 发布；发布时 Tag、分发资产、目标镜像和线上部署均已通过验证，当前线上版本已升级为 v1.8.0。

## 发布定位

v1.7.0 的主题是“可携带、可复核、可解释”。本版把两条原本不应拆开的价值线合并为一次发布：

- 工作台、REST、CLI 与 MCP 生成同一格式的可信计算包，可校验完整性并独立复算。
- Python wheel/sdist、Host Client、GHCR 镜像、离线镜像、SBOM、Trivy 与 `SHA256SUMS` 形成开放分发闭环。
- 梁、平面桁架、平面框架各提供一条五分钟学习复核路径，完成预判、求解、图形核对、A 级解析证据与导出。

本版继续保持 Apache-2.0 开源、免费和二维线弹性静力分析边界；不修改求解核心，不引入账号、课程、班级、作业、订阅、学校平台或远程项目存储。

## 产品与证据门禁

- [x] 三类结构各有一条公开学习路径，每条只使用三项枚举预判，不收集自由文本。
- [x] 普通工程、旧项目、非学习公开案例和既有 API/CLI/MCP 保持原使用方式。
- [x] DOCX、XLSX 与可信计算包记录路径、选择、标准结论和一致性状态。
- [x] 学习证据由 benchmark 事实源解析，不接受客户端伪造展示文案。
- [x] 匿名里程碑不携带 caseId、题目、选项、模型、参数、结果、文件、项目或身份。

## 工程候选门禁

- [x] 版本、CHANGELOG、README、部署文档、生成页面和 Release 资产名全部为 `1.7.0`。
- [x] 后端全量测试、独立刚度法、契约生成和运行时资源同步通过。
- [x] 前端 lint / TypeScript、单元测试、依赖审计和生产构建通过。
- [x] Chromium / Firefox / WebKit 的三条学习路径、可信计算包与 DOCX 导出矩阵通过。
- [x] wheel/sdist、Host Client 与候选 Docker 镜像在隔离环境通过。

## 正式发布门禁

- [x] 合并提交的主分支 CI 全绿。
- [x] 重建后的 `v1.7.0` 标注 Tag 与 GitHub Release 指向同一提交。
- [x] GHCR、离线镜像、SPDX SBOM、Trivy 报告和 `SHA256SUMS` 可核验。
- [x] 2026-08-09 当日误拆出的旧 `v1.8.0` Release 与 Tag 已撤下，重写前证据保留在维护记录中；2026-08-23 重新规划并独立发布的正式 `v1.8.0` 不属于本项。
- [x] 目标镜像仓库和线上部署使用合并后的 `v1.7.0`，三条路径完成真实求解及 DOCX、XLSX、可信计算包下载。
- [x] 上一可用镜像、部署配置和回滚动作已记录。

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
npm --prefix frontend run test:visual -- release-1-7-verification-package.spec.ts release-1-7-learning-paths.spec.ts --project=chromium --project=firefox --project=webkit --workers=1 --reporter=list
npm --prefix frontend run test:visual:export-docx
uv build --wheel --sdist --out-dir dist
python scripts/check_python_distribution.py dist/archsight_solver-1.7.0-py3-none-any.whl
npm pack ./packages/solver-host-client --pack-destination dist
node frontend/scripts/check-host-client-package.mjs dist/archsight-solver-host-client-1.7.0.tgz
git diff --check
```

## 合并候选证据（2026-08-09）

- 后端：636 passed、2 skipped；独立刚度法 26/26 通过。
- 前端：lint / TypeScript、416 项单元测试、两级依赖审计 0 vulnerabilities、生产构建通过。
- 浏览器：三浏览器学习路径与可信计算包 18/18；三浏览器 DOCX 同源工程图与数据曲线 12/12。
- Python 分发：wheel 识别版本 1.7.0、14 项运行时资源、66 个 benchmark、24 个模板、12 个 MCP tools，可信计算包复算为 `pass`。
- Host Client：版本 1.7.0、零运行时依赖、运行时导入、类型导入与 Host Protocol `1.0.0` 通过。
- 候选镜像：`archsight-solver:1.7.0-consolidated-rc`，镜像 ID `sha256:14ead4273b04de11ca98de9450e36d326dfd5d1a204cd996dfa881e9a9260617`，用户 `app`、健康状态 `healthy`、首页 200；构建后学习路径 3/3、canonical Host 1/1 通过。
- 本地分发摘要：wheel `61d16c5e1e44eae9e58deb28e9f24f61c2ac644e8a37bd2434b88a1eee674803`；sdist `223f0301ae0036ff17365b7d94c2ad412c0d1cb237a2fb890e43b16eb694b59a`；Host Client `0ccf112912d824a4996ee06f829e8eeee821223ed70ad7e1fea07e52ab893da6`。

## 正式发布证据（2026-08-09）

- 合并提交 `b52641c5ff0023fcf161c9e5cde396ffb3abf65a` 的主分支 CI `31319672328` 全绿，覆盖后端、前端工作台、Windows 原生构建和 Docker Release Gate。
- 重建后的标注 Tag `v1.7.0` 指向 `b52641c`；Release 流水线 `31320083589` 全绿，GitHub Release 于 `2026-08-09T15:10:03Z` 发布并成为 latest。
- 7 个 Release 资产全部可下载；`SHA256SUMS` 的 6 个制品条目全部独立复核匹配，wheel 与 Host Client 元数据均为 `1.7.0`，Trivy 的 HIGH/CRITICAL 为 0。
- GHCR `v1.7.0` 摘要为 `sha256:4c6a6b1ba7431abc44469cdfdc5692b0d13533147a68d3f0c832a2bc58c9719f`。
- 目标仓库镜像 `v1.7.0-b52641c` 摘要为 `sha256:6c6a0823c48a5fd8a973989c8e48b05f9a58c2fa59c5fa1a07f41866a2e4167e`，镜像 ID 为 `sha256:14ead4273b04de11ca98de9450e36d326dfd5d1a204cd996dfa881e9a9260617`。
- 截至 2026-08-09，当日误拆出的旧 `v1.8.0` GitHub Release、本地 Tag 与远端 Tag 均已撤下，合并后的 `v1.7.0` 成为当时的 latest；重新规划的正式 `v1.8.0` 后于 2026-08-23 独立发布。
- `solver.archsight.cn` 已部署 `v1.7.0-b52641c`，容器为 `running|healthy`；中英文五分钟上手、黄金流程和发布记录均返回 200，三条学习路径完成 3 次真实计算、6 次导出和 3 次可信证据包生成。
- 部署前镜像为 `v1.8.0-ee5abe4`；配置备份位于 `/root/archsight-solver/backups/.env.before-v1.7.0-b52641c-20260809T153500Z`，旧镜像继续作为受控回滚证据保留。

## 发布线纠偏边界

2026-08-09 数小时内先后发布的原 `v1.7.0` 与 `v1.8.0` 被判定为同一里程碑的错误拆分。维护者明确授权在公开推广前进行一次性合并。替代制品验证完成前不得删除现有 Release；合并完成后不立即创建下一版本，先执行稳定化和发布节奏观察。

详细规则见 [发布治理](../release-governance.md)。
