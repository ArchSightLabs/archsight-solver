# ArchSight Solver

一个面向结构工程师、教师和进阶学习者的**开源核心、Web 原生、透明可验证**的结构力学求解器工作台。

ArchSight Solver 当前聚焦三类典型结构分析：

- 梁系：连续梁、简支梁、悬臂梁。
- 二维平面桁架：典型屋架、桥式桁架和教学算例。
- 二维平面框架：门式刚架与显式二维杆系。

在线体验：[solver.archsight.cn](https://solver.archsight.cn/)（公开演示环境）

## 独立开源声明

本项目为独立开源实现，不隶属于任何企业、高校、研究机构或商业软件产品，也不代表任何第三方机构的授权、认可或背书。仓库不包含第三方商业软件源码、内部资料、专有规则库、客户数据或非公开算法。

详见 [NOTICE.md](NOTICE.md)。

## 归属、商标与官方版本

本仓库代码、文档和测试样例按 Apache-2.0 许可开放，允许在遵守许可证和 NOTICE 保留要求的前提下使用、修改、分发和商业使用。

Apache-2.0 不授予 ArchSight、ArchSight Solver、ArchSightLabs、项目 logo、官方域名或其他品牌标识的商标使用权。派生版本和商业服务应使用清晰不同的产品名称，并保留原始归属说明，不得暗示 ArchSightLabs 官方发布、认证、合作或背书。详见 [TRADEMARKS.md](TRADEMARKS.md)。

## 快速开始

```bash
python app.py
npm --prefix frontend run dev
```

默认地址：

- 后端：`http://127.0.0.1:6240`
- 前端：`http://127.0.0.1:6241`

运行测试：

```bash
python -m pytest backend/tests -q
npm --prefix frontend run test:unit
```

更完整的启动、测试、CLI、MCP 和公开案例接口说明见 [快速开始与本地工具](docs/quickstart.md)。

## 核心能力

- 梁系、二维平面桁架、二维平面框架的线弹性静力分析。
- 支座反力、剪力、弯矩、挠度、节点位移、杆件轴力等专业结果输出。
- 结构图、荷载图、内力图、挠度曲线和结果摘要展示。
- 项目模板库、公开验证工程、WORD / XLSX 计算书导出。
- ASMS-JSON 数据协议、REST API、CLI、MCP tools、基准算例与错误契约。

详细功能边界见 [功能与适用边界](docs/capabilities.md)。

## v1.3.0 发布重点

相对 v1.2.0，v1.3.0 的重点是把工作台从“可验证、可查看”推进到“更适合交付计算书”的专业闭环：

- 框架与桁架计算书改用前端同源工程图，修复旧版本 DOCX 中框架、桁架图形口径不一致、不够可信的问题。
- 工作台统一为“模板 / 基本 / 对象 / 文本 / 表格”五页签，框架对象入口补齐荷载工况与荷载组合。
- 新增“两端固结均布荷载”“一端固结一端简支”“坡屋面门式刚架”“平行弦桁架”等高频模板。
- 修复常规模型默认预览出现不必要内嵌滚动条的问题，并用三浏览器视觉回归锁定桌面工作台高度。

## v1.5.0 发布目标

v1.5.0 跳过 v1.4.1，直接收口 v1.4.0 发布后的遗留事项，重点是把“三类分析对象的荷载工况、结果来源和导出记录”做成一致闭环：

- 梁系和平面桁架补齐荷载工况 / 荷载组合编辑入口，达到平面框架同等级的可视化编辑能力。
- 结果页统一显示“主结果 / 工况 / 组合”来源，受力变形、工程图、数据曲线和摘要随当前来源一致切换。
- 结构模型诊断中心在求解前提示支座约束不足、孤立节点/杆件、组合引用丢失、刚度异常和桁架不适用字段。
- DOCX / XLSX 导出记录当前结果来源和“草稿 / 可审阅”状态，避免计算书读者混淆基本荷载、指定工况和指定组合。
- ASMS-JSON、项目文件、JSON Schema、OpenAPI 和导出证据统一记录 `schemaVersion`，降低 Agent、CLI、MCP 和公开贡献者的字段漂移风险。
- v1.4.0 后的 esbuild 二进制完整性告警修复纳入 v1.5.0 发布基线，不再单独发布 v1.4.1。
- 温度作用仍限定为“线弹性静力 + 平面框架构件均匀温差”；截面温度梯度、瞬态热传导、混凝土徐变松弛和桥梁专用温度场分析不进入 v1.5.0 承诺范围。

发布范围、验收口径和后续质量路线见 [路线图](docs/roadmap.md)。

## v1.6.1 发布重点

v1.6.1 的发布方向是“仓库内置 Reference Host 验证 + 项目契约可靠性”，不是把开源核心做成商业平台。本版直接服务需要把 Solver 嵌入现有业务页面的前端接入开发者，并用本仓库配套 DEMO 证明最基础的加载、修改、保存、刷新重开和只读审阅闭环，不依赖 `archsight-solver-platform` 或其他外部项目完成验收，也不以第三方团队数量或商业试点作为发布门槛。

当前状态：**已发布（2026-07-16）**。`v1.6.1` tag 与 GitHub Release 固定本次代码基线；线上镜像可由维护者另行手动构建和推送，运行中部署是否更新独立安排。

- `python scripts/run_host_iframe_demo.py` 一条命令启动两个真实 origin，演示 launch、项目变更、托管保存和刷新重开。
- Reference Host 由宿主管理工程新建、打开、保存和只读审阅；Solver 使用 `embed=1` 仅呈现结构分析工作台，不重复平台级文件、案例、投稿、主题和系统设置入口。
- Host iframe 消息协议继续使用精确 origin allowlist、sessionId、nonce 和父窗口来源约束，不向 `*` 发送 ready 或项目文档。
- Reference Host 在 launch 前检查 Solver 的必要 capabilities，并为宿主发起的保存请求提供超时失败反馈，避免旧实现被误判为可接入。
- 正式镜像同时使用运行时 allowlist 和 CSP `frame-ancestors` 限制宿主来源；CI 会对构建后的镜像运行真实跨域保存与重开测试。
- `.slv` 项目文件 manifest、导出 artifact manifest、稳定 integration API 错误码和 JSON Schema registry。
- `project_document_health` CLI / MCP 工具，检查项目文件版本、manifest、对象分布、活动对象、迁移诊断和托管就绪状态。
- 工作台“项目契约”面板，直接展示项目文档、schema、manifest、host readiness 和导出证据链摘要。
- `project_template_registry` CLI / MCP 工具，公开内置模板的结构体系、主要结果指标、可用入口、支持动作和 benchmark 映射。

完整任务边界见 [路线图](docs/roadmap.md)，参考接入见 [Host iframe Reference](examples/host-iframe-demo/README.md)，发布复核见 [v1.6.1 发布验收清单](docs/verification/release-1-6-1-acceptance.md)。

## 公开数据协议

ArchSight Solver 使用 **ASMS-JSON** 作为结构模型入口标准，让 Web、REST API、CLI、MCP、benchmark 和计算书导出围绕同一份结构模型工作。

- 协议说明：[ASMS-JSON / Model Schema](docs/asms-json-schema.md)
- API 文档：[ArchSight Structural Solver API Reference](docs/api-reference.md)
- Agent 集成指南：[Agent 集成指南](docs/agent-integration.md)
- Agent 调用闭环：[Agent 工程流样例](docs/agent-engineering-workflow.md)
- MCP 资源清单：[MCP Resources 清单与生成口径](docs/mcp-resources.md)

## 公开验证

公开验证集当前覆盖梁系、二维平面桁架、二维平面框架和框架梁退化验证等基础力学场景。前端顶部“公开案例”入口可直接打开由 benchmark 生成的三个验证工程。

```bash
python -m pytest backend/tests/test_benchmark_cases.py backend/tests/test_benchmark_runner.py -q
python -m backend.benchmarks.report --output docs/verification/benchmark-validation-report.md
python -m backend.benchmarks.catalog_summary --output docs/verification/benchmark-catalog-summary.md
```

验证方法见 [Benchmark 方法论](docs/verification/benchmark-methodology.md)，验证报告见 [公开验证集报告](docs/verification/benchmark-validation-report.md)，人工阅读用算例目录见 [Benchmark 算例目录摘要](docs/verification/benchmark-catalog-summary.md)。公开案例和计算书会显示对应 `caseId`、验证来源、标准值和容许误差；云端或私有部署可通过 `POST /api/benchmark-submissions` 执行投稿前校验，也可在前端顶部“验证投稿”生成单文件 JSON，并通过 GitHub Issue 或官方邮箱 `archsight-labs@qq.com` 提交给维护者复核。

## 文档入口

| 文档 | 用途 | 状态 |
|---|---|---|
| [快速开始与本地工具](docs/quickstart.md) | 本地启动、测试、CLI、MCP 与公开案例接口 | 当前快速开始 |
| [功能与适用边界](docs/capabilities.md) | 功能范围、适用人群、身份边界与非目标 | 当前能力说明 |
| [结构力学入门](docs/learning/README.md) | 梁系、平面桁架、平面框架的概念、术语和图形入门 | 当前学习入口 |
| [源码目录说明](docs/source-layout.md) | 后端、前端、数据、测试和本地忽略目录说明 | 当前源码导航 |
| [版本发布记录](CHANGELOG.md) | 仓库级发布记录；前端发布记录页面由该文件同步生成 | 当前发布记录 |
| [部署说明](docs/deployment.md) | Docker 单镜像、远程镜像标签与 Compose 部署 | 当前部署说明 |
| [路线图](docs/roadmap.md) | 开源路线、三模块边界、v1.5 发布范围与后续质量路线 | 当前主路线 |
| [ArchSight Structural Solver API Reference](docs/api-reference.md) | REST API、CLI、MCP 与错误码 | 当前 API 参考 |
| [MCP Resources 清单与生成口径](docs/mcp-resources.md) | MCP Resources URI、仓库事实源、更新责任和验收检查 | 当前 MCP 资源清单 |
| [Agent 集成指南](docs/agent-integration.md) | REST API、CLI、MCP 三类 Agent/自动化集成入口 | 当前集成指南 |
| [Agent 工程流样例](docs/agent-engineering-workflow.md) | 自然语言工况到 ASMS-JSON、REST/CLI/MCP、benchmark 与计算书的 Agent 调用闭环 | 当前集成样例 |
| [ASMS-JSON / Model Schema](docs/asms-json-schema.md) | Web/API/CLI/MCP/benchmark 的共同模型入口 | 当前数据协议 |
| [工程文本模型规范](docs/text-model-spec.md) | 梁、框架、桁架文本模型导入导出口径 | 当前工程契约 |
| [Benchmark 方法论](docs/verification/benchmark-methodology.md) | 公开验证集分层、指标选择、投稿校验和宣传边界 | 当前验证方法 |
| [公开验证集报告](docs/verification/benchmark-validation-report.md) | 当前公开验证集自动生成报告 | 当前验证报告 |
| [Benchmark 算例目录摘要](docs/verification/benchmark-catalog-summary.md) | 按结构体系列出算例目的、来源、标准值、容差和模板映射 | 当前验证摘要 |
| [跨浏览器视觉回归](docs/verification/visual-regression.md) | 前端工作台视觉回归说明 | 当前验证说明 |
| [v1.6.1 发布验收清单](docs/verification/release-1-6-1-acceptance.md) | 真实双 origin Reference Host、项目契约、版本与发布门禁 | v1.6.1 发布基线 |
| [温度作用后续评估](docs/temperature-action-evaluation.md) | 平面框架均匀温差边界与后续温度扩展评估矩阵 | v1.5.0 边界材料 |
| [规模与性能基线](docs/verification/performance-baseline.md) | 三类分析对象的可复跑规模基线脚本和发布口径 | v1.5.0 质量材料 |

## 贡献方式

- 优先补算例、补测试、补文档、补交互，再扩功能。
- 新增能力必须补可验证的示例和回归用例。
- 计算结果、图表、导出内容和 UI 文案应使用结构工程专业术语。
- 典型回归算例以 `backend/tests` 和公开 benchmark 为准；新增公开算例必须提供模型输入、标准结果、容许误差和验证来源。推荐先在前端生成验证投稿包，再通过 GitHub “公开验证算例投稿” Issue 或官方邮箱 `archsight-labs@qq.com` 提交；维护者审核通过后可用 `python -m backend.benchmarks.review_submission <json> --append` 合并投稿包。

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

本仓库采用 **Apache-2.0** 许可证，具体文本见 [LICENSE](LICENSE)。该许可证适用于本仓库公开发布的代码、文档和测试样例。再分发时请同时保留 [NOTICE.md](NOTICE.md) 和必要的修改说明。
