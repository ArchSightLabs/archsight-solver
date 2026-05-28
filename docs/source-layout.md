# 源码目录说明

本文说明 ArchSight Solver 公开仓库的主要目录职责，帮助贡献者快速定位后端计算、前端工作台、公开数据、测试和文档入口。

## 根目录

| 路径 | 用途 |
|---|---|
| `app.py` | Flask 应用入口，负责初始化、蓝图注册、日志和前端静态文件服务。 |
| `backend/` | 后端 API、结构求解、输入归一化、导出、benchmark、CLI/MCP 能力和测试。 |
| `frontend/` | React + Vite + TypeScript 前端工作台。 |
| `data/` | 公开样例数据，例如 Agent workflow few-shot 与模板验证映射。 |
| `docs/` | 公开文档，面向用户、贡献者和第三方集成方。 |
| `.github/` | GitHub Actions、Issue 模板和 PR 模板。 |
| `Dockerfile`、`docker-compose.yml` | 单镜像构建和本地容器运行入口。 |

## 后端目录

| 路径 | 用途 |
|---|---|
| `backend/api/` | Flask API 蓝图，包括求解、预览、导出、作业、契约、公开案例和 benchmark 投稿校验 / 投稿包生成接口。 |
| `backend/application/` | 应用层编排，承接结构求解前后的业务流程。 |
| `backend/benchmarks/` | 公开验证集目录、字段说明、运行器、报告生成和投稿包维护工具。 |
| `backend/capabilities/` | 本地 CLI、MCP server 和确定性工具封装。 |
| `backend/contracts/` | JSON Schema Registry 与 OpenAPI 文档生成。 |
| `backend/examples/` | 可导入工作台的公开工程案例生成逻辑。 |
| `backend/exporters/` | WORD / XLSX 计算书导出。 |
| `backend/normalizers/` | 梁系、框架、桁架输入归一化和 ASMS-JSON 预处理。 |
| `backend/presenters/` | 面向 API 或前端的结果表达转换。 |
| `backend/services/` | 求解服务、导出服务和工作台适配层。 |
| `backend/solver/` | 结构力学求解核心，包括梁、框架、桁架计算。 |
| `backend/tests/` | 后端单元测试、契约测试、benchmark 回归和 MCP/CLI 测试。 |

## 前端目录

| 路径 | 用途 |
|---|---|
| `frontend/src/App.tsx` | 工作台顶层状态、布局和模块入口。 |
| `frontend/src/components/` | 工作台组件、预览组件、结果面板、对话框和 UI 控件。 |
| `frontend/src/hooks/` | 计算、导出、敏感性分析等前端业务动作封装。 |
| `frontend/src/lib/` | 项目文件、payload 构造、模板库、文本模型、图表数据等纯逻辑。 |
| `frontend/src/types/` | 前端共享类型定义。 |

## 公开数据与文档

| 路径 | 用途 |
|---|---|
| `data/agent_workflows/asms_few_shots.json` | Agent 从自然语言工况到 ASMS-JSON、CLI/MCP 调用和 benchmark 复核的可测试样例。 |
| `data/verification/template_benchmark_map.json` | 前端内置模板到公开 benchmark 的对应/相近映射。 |
| `docs/asms-json-schema.md` | ASMS-JSON / Model Schema 字段语义、单位口径和结构体系边界。 |
| `docs/api-reference.md` | REST API、CLI、MCP 和错误码说明。 |
| `docs/verification/benchmark-validation-report.md` | 当前公开验证集自动生成报告。 |
| `docs/verification/benchmark-catalog-summary.md` | 自动生成的 benchmark 人工阅读目录，包含算例标准值、容许误差和模板映射。 |

## 本地忽略目录

以下目录用于本地开发、AI 运行时或内部沉淀，默认不进入公开仓库：

| 路径 | 用途 |
|---|---|
| `.local-docs/` | 内部阶段性文档、策略分析、AIOS 对接笔记和本地工作流说明。 |
| `.ai/` | ArchSight AIOS 项目级补充治理文件。 |
| `.omx/` | oh-my-codex / OMX 运行状态、计划和日志。 |
| `.venv/`、`frontend/node_modules/` | 本地依赖目录。 |
| `logs/`、`frontend/dist/`、`test-results/` | 运行日志、构建产物和测试产物。 |

公开文档应只引用公开仓库内可复现的路径；内部策略、临时诊断和自动生成阶段报告放入 `.local-docs/`。
