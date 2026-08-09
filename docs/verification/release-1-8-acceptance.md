# v1.8.0 发布验收

> 状态：正式发布 GO。`v1.8.0` Tag Release、不可变镜像、线上部署与三条真实学习路径均已验收通过。

## 发布定位

v1.8.0 的主题是“可验证的结构力学学习与复核工作台”。本版不新增求解对象，而是把既有模型、图形、计算结果、公开 benchmark、计算书和可信计算包组织成三条可完成、可解释、可导出的专业路径。

## 产品门禁

- [x] 公开案例入口置顶梁、平面桁架、平面框架三条五分钟路径。
- [x] 每条路径完成“模型关注点 -> 三项预判 -> 计算 -> 图形核对 -> A 级解析证据 -> 导出”。
- [x] 三类结构术语和主指标正确，桁架路径不引入弯矩或剪力主指标。
- [x] 旧项目、非学习公开案例、普通求解和普通导出无回归。

## 证据与隐私门禁

- [x] DOCX/XLSX 记录路径、预判选择、标准结论、匹配状态、caseId、验证等级和来源。
- [x] 可信计算包携带枚举化学习复核，不包含模型之外的自由文本或身份字段。
- [x] 匿名里程碑事件只携带分析类型，不记录 caseId、题目、选项、模型、参数、结果、文件、项目或身份。
- [x] 首批路径全部使用 A 级教材解析解；第三方对标继续遵守版本、单元、单位、假定和非背书边界。

## 工程门禁

- [x] 后端全量测试与独立刚度法基准通过。
- [x] 前端 lint / TypeScript、全量单元测试、生产构建和两级依赖审计通过。
- [x] Chromium / Firefox / WebKit 的三条路径和可信计算包导出矩阵通过。
- [x] Python 分发包、Host Client 和 Docker 候选镜像通过隔离验证；正式发布制品由 Tag Release 生成。
- [x] 版本、CHANGELOG、README、release notes、OpenAPI 和线上指南入口无漂移。

## 正式发布门禁

- [x] 中文 Lore Commit 完整；发版提交完成后工作树保持干净。
- [x] `v1.8.0` tag 与同提交 GitHub Release 全绿。
- [x] GHCR 不可变镜像、SBOM、Trivy 报告、离线镜像归档和 `SHA256SUMS` 可核验。
- [x] 线上部署健康，三条路径完成真实冒烟，并记录上一版本不可变回滚目标。

## 当前实施证据（2026-08-09）

- 功能提交：`2779724 feat(learning): 让三类结构从预判进入可验证复核`。
- 后端：635 passed、2 skipped；独立刚度法 26/26 通过。
- 前端：416 项单元测试、ESLint、TypeScript 和生产构建通过。
- 依赖审计：生产依赖 moderate 与完整工具链 high 均为 0 vulnerabilities。
- 浏览器：Chromium / Firefox / WebKit 共 9 条路径通过，覆盖梁、平面桁架、平面框架的预判、计算、证据展示与可信计算包下载。
- 导出：实际 DOCX 与 XLSX 文件均包含由 benchmark 事实源解析的学习路径、选择、标准结论和一致性状态；伪造客户端展示文案不会进入计算书。
- 契约与发布工程：OpenAPI、运行时资源同步、发布工程门禁和 `git diff --check` 通过。
- 发行包：wheel/sdist 与 Host Client tarball 隔离验收通过；wheel 识别版本 1.8.0、14 项运行时资源、66 个 benchmark、24 个模板和 12 个 MCP tools，可信计算包复算为 `pass`。
- Docker：候选镜像 `archsight-solver:1.8.0-rc` 为 `sha256:9e4758beda2350b696b46bb8586e5c6336321d5c74de59920930c1c3a2dc1675`，352638030 bytes，用户 `app`、健康状态 `healthy`；容器公开案例返回三条路径及各三项预判，构建后 UI 3/3、canonical Host 1/1 通过。

## 正式发布证据（2026-08-09）

- 主分支 CI：run `31314621382` 全绿；`v1.8.0` 标注 Tag 指向 `ee5abe4003fdb039ba1dadf1dbb26ecf6bc49e2e`。
- Tag Release：run `31314883974` 全绿；[GitHub Release](https://github.com/ArchSightLabs/archsight-solver/releases/tag/v1.8.0) 已正式发布，包含 wheel、sdist、Host Client、离线镜像、SPDX SBOM、Trivy 报告和 `SHA256SUMS`。
- 制品核验：下载后的 `SHA256SUMS` 与 Release 资产摘要一致；Trivy 对有修复版本的 HIGH/CRITICAL 漏洞检出为 0。
- 镜像：GHCR 发布日志记录 digest `sha256:bf53a8c8bd9e502314f89988926b192e88842a0b992d98fd65acc80c3095332c`；线上仓库标签 `v1.8.0-ee5abe4` 的 manifest digest 为 `sha256:d6f99993bf52145fb45baa65ab430eb7da547998bc5d7722adfb910a5ba85b54`。
- 线上部署：`solver.archsight.cn` 容器使用镜像 ID `sha256:9e4758beda2350b696b46bb8586e5c6336321d5c74de59920930c1c3a2dc1675` 且保持 `healthy`。
- 线上冒烟：Chromium 中梁、平面桁架、平面框架 3/3 通过真实求解、三项预判复核，并分别成功下载 DOCX、XLSX 和可信计算包；服务日志同步记录三组 `/api/calculate`、`/api/export` 和 `/api/verification-packages` 请求。
- 回滚目标：`v1.7.0-bb3ce98`；部署前环境备份为 `/root/archsight-solver/backups/.env.before-v1.8.0-ee5abe4-20260809T211919`。
