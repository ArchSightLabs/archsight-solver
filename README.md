# ArchSight Solver

中文 | [English](README.en.md)

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

需要 Python `>=3.13`、[uv](https://docs.astral.sh/uv/) 和 Node.js `>=22.22.0`。首次克隆后先按锁文件安装依赖：

```bash
git clone https://github.com/ArchSightLabs/archsight-solver.git
cd archsight-solver
uv sync --frozen
npm --prefix frontend ci --include=optional
```

然后在两个终端分别启动后端和前端：

```bash
uv run python app.py
npm --prefix frontend run dev
```

默认地址：

- 后端：`http://127.0.0.1:6240`
- 前端：`http://127.0.0.1:6241`

运行测试：

```bash
uv run python -m pytest backend/tests -q
npm --prefix frontend run test:unit
```

更完整的启动、测试、CLI、MCP 和公开案例接口说明见 [快速开始与本地工具](docs/quickstart.md)。

## 核心能力

- 梁系、二维平面桁架、二维平面框架的线弹性静力分析。
- 支座反力、剪力、弯矩、挠度、节点位移、杆件轴力等专业结果输出。
- 结构图、荷载图、内力图、挠度曲线和结果摘要展示。
- 项目模板库、公开验证工程、WORD / XLSX 计算书导出。
- 可携带输入、记录结果、来源证据、SHA-256 摘要与复算规则的可信计算包。
- ASMS-JSON 数据协议、REST API、CLI、MCP tools、基准算例与错误契约。

详细功能边界见 [功能与适用边界](docs/capabilities.md)。

## 当前版本：v1.8.3

v1.8.3 已于 2026-08-25 发布，继续收口 Solver 1.8 的专业交付体验：公开验证工程与五分钟学习路径分层呈现，面向用户的摘要统一为中文工程表达，图形与计算书共享真实模型范围适配和关键点标注口径。

- 仓库、发行包和 Host Client 的稳定版本为 `1.8.3`，发布容器标签为 `v1.8.3`。
- 本补丁不改变既有 GNA/GNIA、线性屈曲或一次分析数值，也不新增结构类型、账号、云项目或规范设计能力。
- 完整发布事实、验证证据和回滚边界见 [v1.8.3 发布验收](docs/verification/release-1-8-3-acceptance.md)；历次版本变化统一查阅 [CHANGELOG](CHANGELOG.md)。

直接开始：[公开案例与五分钟学习路径](https://solver.archsight.cn/) · [五分钟安装路径](docs/quickstart.md) · [可信计算包指南](docs/verification-package.md) · [English entry](README.en.md)

## 公开数据协议

ArchSight Solver 使用 **ASMS-JSON** 作为结构模型入口标准，让 Web、REST API、CLI、MCP、benchmark 和计算书导出围绕同一份结构模型工作。

- 协议说明：[ASMS-JSON / Model Schema](docs/asms-json-schema.md)
- API 文档：[ArchSight Structural Solver API Reference](docs/api-reference.md)
- Agent 集成指南：[Agent 集成指南](docs/agent-integration.md)
- Agent 调用闭环：[Agent 工程流样例](docs/agent-engineering-workflow.md)
- MCP 资源清单：[MCP Resources 清单与生成口径](docs/mcp-resources.md)

面向前端接入开发者，仓库提供 [Host Protocol 1.0](docs/host-protocol-1.md)、[Solver Host Client](docs/host-client.md) 和 [Reference Host](examples/host-iframe-demo/README.md)。该接入闭环不依赖 `archsight-solver-platform` 或其他外部项目完成验收，开源核心也不包含账号、租户、订阅或云端项目存储。

## 公开验证

公开验证集当前覆盖梁系、二维平面桁架、二维平面框架、框架梁退化验证以及二维框架 GNA/GNIA 教学基准。前端顶部“公开案例”入口可直接打开由 benchmark 生成的四个验证工程。

```bash
uv run python -m pytest backend/tests/test_benchmark_cases.py backend/tests/test_benchmark_runner.py -q
uv run python -m backend.benchmarks.report --output docs/verification/benchmark-validation-report.md
uv run python -m backend.benchmarks.catalog_summary --output docs/verification/benchmark-catalog-summary.md
```

验证方法见 [Benchmark 方法论](docs/verification/benchmark-methodology.md)，验证报告见 [公开验证集报告](docs/verification/benchmark-validation-report.md)，人工阅读用算例目录见 [Benchmark 算例目录摘要](docs/verification/benchmark-catalog-summary.md)。公开案例和计算书会显示对应 `caseId`、验证来源、标准值和容许误差；云端或私有部署可通过 `POST /api/benchmark-submissions` 执行投稿前校验，也可在前端顶部“验证投稿”生成单文件 JSON，并通过 GitHub Issue 或官方邮箱 `archsight-labs@qq.com` 提交给维护者复核。

## 文档入口

### 使用与理解

| 文档 | 用途 |
|---|---|
| [快速开始与本地工具](docs/quickstart.md) | 本地启动、测试、CLI、MCP 与公开案例接口 |
| [功能与适用边界](docs/capabilities.md) | 当前功能范围、适用人群与明确非目标 |
| [三条黄金流程](docs/golden-flows.md) | 工程师、教师/学习者、开发者的可复跑成功路径 |
| [结构力学入门](docs/learning/README.md) | 梁系、平面桁架、平面框架的概念、术语和图形入门 |
| [English README](README.en.md) | English quickstart, capabilities, verification, and boundaries |

### 开发与集成

| 文档 | 用途 |
|---|---|
| [API Reference](docs/api-reference.md) | REST API、CLI、MCP 与错误码 |
| [ASMS-JSON / Model Schema](docs/asms-json-schema.md) | Web、API、CLI、MCP 与 benchmark 的共同模型入口 |
| [可信计算包指南](docs/verification-package.md) | 生成、完整性校验与独立复算 |
| [Agent 集成指南](docs/agent-integration.md) | REST API、CLI、MCP 三类集成入口 |
| [Host Protocol 1.0](docs/host-protocol-1.md) | iframe 宿主协议、状态机与安全边界 |
| [系统架构导读](docs/architecture.md) | 模块边界、核心数据流、架构不变量与整改优先级 |
| [部署说明](docs/deployment.md) | Docker 单镜像、远程镜像标签与 Compose 部署 |
| [源码目录说明](docs/source-layout.md) | 后端、前端、数据、测试和本地忽略目录导航 |

### 验证、治理与版本历史

| 文档 | 用途 |
|---|---|
| [Benchmark 方法论](docs/verification/benchmark-methodology.md) | 验证分层、指标、来源与宣传边界 |
| [公开验证集报告](docs/verification/benchmark-validation-report.md) | 当前公开算例的自动生成结果 |
| [访问统计与隐私边界](docs/analytics-and-privacy.md) | 公开统计事件、匿名边界与明确非采集字段 |
| [发布治理](docs/release-governance.md) | 版本价值、观察窗口、确认与不可变发布规则 |
| [开源路线图](docs/roadmap.md) | 当前基线、近期方向、能力边界与维护规则 |
| [CHANGELOG](CHANGELOG.md) | 历次版本变化的唯一汇总入口 |
| [v1.8.3 发布验收](docs/verification/release-1-8-3-acceptance.md) | 当前版本的制品、验证、上线与回滚证据 |

## 贡献方式

- 优先补算例、补测试、补文档、补交互，再扩功能。
- 新增能力必须补可验证的示例和回归用例。
- 计算结果、图表、导出内容和 UI 文案应使用结构工程专业术语。
- 典型回归算例以 `backend/tests` 和公开 benchmark 为准；新增公开算例必须提供模型输入、标准结果、容许误差和验证来源。推荐先在前端生成验证投稿包，再通过 GitHub “公开验证算例投稿” Issue 或官方邮箱 `archsight-labs@qq.com` 提交；维护者审核通过后可用 `uv run python -m backend.benchmarks.review_submission <json> --append` 合并投稿包。

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

本仓库采用 **Apache-2.0** 许可证，具体文本见 [LICENSE](LICENSE)。该许可证适用于本仓库公开发布的代码、文档和测试样例。再分发时请同时保留 [NOTICE.md](NOTICE.md) 和必要的修改说明。
