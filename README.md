# ArchSight Solver

一个面向结构工程师、教师和进阶学习者的**开源核心、Web 原生、透明可验证**的结构力学求解器工作台。

ArchSight Solver 当前聚焦三类典型结构分析：

- 梁系：连续梁、简支梁、悬臂梁。
- 二维平面框架：门式刚架与显式二维杆系。
- 二维平面桁架：典型屋架、桥式桁架和教学算例。

在线体验：[solver.archsight.cn](https://solver.archsight.cn/)（公开演示环境）

## 独立开源声明

本项目为独立开源实现，不隶属于任何企业、高校、研究机构或商业软件产品，也不代表任何第三方机构的授权、认可或背书。仓库不包含第三方商业软件源码、内部资料、专有规则库、客户数据或非公开算法。

详见 [NOTICE.md](NOTICE.md)。

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

- 梁系、二维平面框架、二维平面桁架的线弹性静力分析。
- 支座反力、剪力、弯矩、挠度、节点位移、杆件轴力等专业结果输出。
- 结构图、荷载图、内力图、挠度曲线和结果摘要展示。
- 项目模板库、公开验证工程、WORD / XLSX 计算书导出。
- ASMS-JSON 数据协议、REST API、CLI、MCP tools、基准算例与错误契约。

详细功能边界见 [功能与适用边界](docs/capabilities.md)。

## 公开数据协议

ArchSight Solver 使用 **ASMS-JSON** 作为结构模型入口标准，让 Web、REST API、CLI、MCP、benchmark 和计算书导出围绕同一份结构模型工作。

- 协议说明：[ASMS-JSON / Model Schema](docs/asms-json-schema.md)
- API 文档：[ArchSight Structural Solver API Reference](docs/api-reference.md)
- Agent 调用闭环：[Agent 工程流样例](docs/agent-engineering-workflow.md)
- MCP 资源清单：[MCP Resources 清单与生成口径](docs/mcp-resources.md)

## 公开验证

公开验证集当前覆盖梁系、二维平面框架、二维平面桁架和框架梁退化验证等基础力学场景。前端顶部“公开案例”入口可直接打开由 benchmark 生成的三个验证工程。

```bash
python -m pytest backend/tests/test_benchmark_cases.py backend/tests/test_benchmark_runner.py -q
python -m backend.benchmarks.report --output docs/verification/benchmark-validation-report.md
```

验证报告见 [公开验证集报告](docs/verification/benchmark-validation-report.md)。

## 文档入口

- [文档索引](docs/README.md)
- [快速开始与本地工具](docs/quickstart.md)
- [功能与适用边界](docs/capabilities.md)
- [部署说明](docs/deployment.md)
- [路线图](docs/roadmap.md)
- [工程文本模型规范](docs/text-model-spec.md)
- [跨浏览器视觉回归](docs/verification/visual-regression.md)

## 目录结构

```text
app.py                         # Flask 入口
backend/                       # 后端计算、导出、API 与测试
frontend/                      # React + Vite 前端工作台
docs/                          # 公开文档
data/                          # 公开样例与 Agent workflow 数据
```

## 贡献方式

- 优先补算例、补测试、补文档、补交互，再扩功能。
- 新增能力必须补可验证的示例和回归用例。
- 计算结果、图表、导出内容和 UI 文案应使用结构工程专业术语。
- 典型回归算例以 `backend/tests` 和公开 benchmark 为准。

贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

本仓库采用 **Apache-2.0** 许可证，具体文本见 [LICENSE](LICENSE)。该许可证适用于本仓库公开发布的代码、文档和测试样例。
