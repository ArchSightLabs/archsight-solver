# v1.6.0 发布验收清单

本文记录 v1.6.0 正式发布前必须复核的中性宿主接入、本地项目文档契约、模板 registry、版本一致性、容器制品和回滚能力。v1.6.0 不引入账号、组织、远程存储、授权或商业平台逻辑，也不扩大梁系、二维平面框架和二维平面桁架的线弹性静力分析边界。

## 发布范围

- Host iframe 消息协议、origin allowlist、launch / project changed / save requested / save result 闭环。
- `.slv` 项目文件 manifest、迁移诊断、活动分析对象和导出 artifact manifest。
- `project_document_health` 与 `project_template_registry` 的 CLI / MCP 可发现契约。
- 工作台“项目契约”信息展示和 host readiness / 证据链摘要。
- 版本门禁、Docker 健康检查、Playwright 核心工作台回归、镜像扫描、SPDX SBOM 和 SHA-256 制品校验。

## 自动化验收

发布候选提交必须在干净工作树上执行：

```powershell
python scripts/check_versions.py --expected-version 1.6.0
python scripts/check_release_gate.py
python -m pytest backend/tests -q
python -m backend.benchmarks.report --output docs/verification/benchmark-validation-report.md
npm --prefix frontend ci
npm --prefix frontend run lint
npm --prefix frontend run test:unit
npm --prefix frontend run build
npm --prefix frontend audit --omit=dev --audit-level=moderate
npm --prefix frontend exec playwright install chromium
npm --prefix frontend run test:visual -- release-1-6-host-integration.spec.ts --project=chromium --workers=1
npm --prefix frontend run test:visual -- release-1-5-quick-modeling.spec.ts --project=chromium --workers=1
npm --prefix frontend run test:visual -- release-1-5-load-scenarios.spec.ts --project=chromium --workers=1
docker build -t archsight-solver:v1.6.0 .
git diff --check
```

`release-1-6-host-integration.spec.ts` 覆盖可编辑宿主 launch / change / save-request / save-result、真实只读锁定和非父窗口消息拒绝。`release-1-5-quick-modeling.spec.ts` 与 `release-1-5-load-scenarios.spec.ts` 是跨版本保留的核心工作台回归名称；v1.6.0 继续复用它们锁定三类分析对象的首算、工况、组合和导出来源，不因版本升级复制同一组场景。项目文档健康、模板 registry、MCP 和 schema 由后端自动化测试补充覆盖。

## 本地候选验证记录（2026-07-12）

- 后端：517 passed，2 skipped。
- 前端：lint / TypeScript 通过，366 passed，生产构建通过。
- 发布主链路：Chromium 10 passed。
- DOCX 同源工程图：Chromium / Firefox / WebKit 12 passed。
- 依赖审计：production npm dependencies 0 vulnerabilities。
- 版本与发布工程：`check_versions.py`、`check_release_gate.py`、`git diff --check` 通过。

CI 还必须完成：

- Docker 镜像以非 root 用户启动，容器 `HEALTHCHECK` 在 60 秒内变为 `healthy`。
- `CHANGELOG.md` 生成的 Markdown / HTML release notes 与仓库内容无 diff。
- tag 版本、Python 包、前端包、npm lock、uv lock 和发布说明均为 `1.6.0`。
- Trivy 对镜像中已修复的 `HIGH` / `CRITICAL` 漏洞零容忍；扫描报告随 Release 保留。
- 生成 SPDX JSON SBOM、Docker 镜像归档和 `SHA256SUMS`，再推送不可变 GHCR tag。

## 手工验收

- 独立模式：不设置 host origin、不登录、不连接远程存储时，三类分析对象仍能新建、求解、保存本地项目并导出 DOCX / XLSX。
- Host demo：使用 `examples/host-iframe-demo` 完成 launch、项目变更、保存请求和保存结果，确认消息目标 origin 不使用通配符。
- Origin 拒绝：从 allowlist 外来源发起 host 消息，确认工作台拒绝接入且不会泄露项目文档。
- 项目健康：分别检查当前、旧版可迁移、未来不兼容和损坏项目文件，确认 `project_document_health` 返回稳定 code、severity、迁移建议和 host readiness。
- 项目契约：工作台项目信息中可见 document kind、schema、manifest、活动对象、host 会话和导出证据；未生成的证据显示为缺失而非伪造已完成。
- 模板 registry：CLI 与 MCP 返回一致的结构体系、主要结果指标、入口、支持动作和 benchmark 映射；平面桁架不出现弯矩主指标。
- Artifact：三类分析对象至少各导出一个 DOCX 或 XLSX，确认 artifact manifest、文件名、MIME、大小和结果来源可追踪。
- 容器：使用正式镜像 tag 启动后检查首页、典型求解、项目保存和导出，并确认容器健康状态为 `healthy`。

## Tag 与制品验收

仅在上述门禁通过后创建并推送 `v1.6.0` tag。发布工作流必须生成：

- `ghcr.io/<owner>/archsight-solver:v1.6.0`。
- `archsight-solver-v1.6.0.tar.gz`。
- `archsight-solver-v1.6.0.spdx.json`。
- `trivy-report.json` 与 `SHA256SUMS`。
- 从 `CHANGELOG.md` 的 v1.6.0 段提取的 GitHub Release 说明。

抽样下载制品后执行：

```bash
sha256sum --check SHA256SUMS
docker load < archsight-solver-v1.6.0.tar.gz
```

## 阻塞发布条件

- 任一发布入口不是 `1.6.0`，release notes 仍标记“开发中/未发布”，或 tag 与包版本不一致。
- Host bridge 使用 `*` 作为项目文档消息目标，allowlist 外来源可以注入或读取项目数据。
- `.slv` manifest、迁移诊断、项目健康或模板 registry 缺少稳定 schema / error code，外部宿主必须依赖内部 import 或解析中文 warning。
- 独立本地模式因 host / 平台能力而退化，或 solver 出现账号、课程、授权、远程存储等商业平台语义。
- 三类核心工作台首算、工况/组合、项目保存、DOCX / XLSX 导出任一路径失败。
- Docker 镜像无法通过健康检查、以 root 运行，或存在可修复的高危/严重漏洞。
- tag 工作流未生成 SBOM、扫描报告、镜像归档、哈希文件，或推送了可漂移的 `latest` 标签。
- 发布前没有记录上一正式镜像 tag，无法按不可变版本回滚。

## 发布后检查与回滚

发布前记录现网镜像 tag 和健康状态。升级后在 15 分钟观察窗内检查容器健康、HTTP 错误、典型求解、项目保存和导出。发生健康检查失败、核心求解不可用、项目文件损坏或导出回归时，立即用上一不可变 tag 重新执行部署：

```bash
./deploy/deploy.sh v1.5.0
docker inspect --format '{{.Config.Image}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' archsight-solver-app
```

v1.6.0 不包含数据库迁移，因此镜像回退不涉及数据结构降级。项目文件必须保留原始副本；对迁移后的 `.slv` 文件不得只依赖应用回滚恢复。

## 非阻塞但必须记录

- Vite 构建仍可能提示单个 chunk 超过 500 kB；只要构建成功且核心工作台性能未明显退化，可记录后发布优化，不单独阻塞 v1.6.0。
- 完整 Chromium / Firefox / WebKit DOCX 导出矩阵建议在正式 tag 前手工或 nightly 执行；CI 的快速门禁只运行 Chromium 核心工作台回归。
- 公开 benchmark 扩充仍是持续建设目标；v1.6.0 的主目标是中性接入与项目契约，不以新增算例数量作为单独阻塞条件。
