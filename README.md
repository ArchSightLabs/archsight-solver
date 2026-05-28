# ArchSight Solver

一个面向结构工程师、教师和进阶学习者的**开源核心、Web 原生、透明可验证**的结构力学求解器工作台。

本项目当前聚焦于**梁系、二维平面框架、二维平面桁架**三类典型结构分析，已具备连续梁计算、二维框架分析、二维桁架分析、项目模板库、WORD 计算书导出与基准算例闭环。

它的定位不是再做一个“大而全”的商业套件，而是做一个**以三类典型结构为开源核心的结构力学工作台**，让工程师、教师和学习者可以直接拿来算、看得懂、复核得了、方便交付。

在线体验：[solver.archsight.cn](https://solver.archsight.cn/)（公开演示环境）

## 独立开源声明

本项目为独立开源实现，不隶属于任何企业、高校、研究机构或商业软件产品，也不代表任何第三方机构的授权、认可或背书。仓库不包含第三方商业软件源码、内部资料、专有规则库、客户数据或非公开算法。

详见 [NOTICE.md](NOTICE.md)。

## 项目简介

本仓库不是封闭的商业套件，而是把结构力学求解、工程表达和工作流管理整合到同一套现代 Web 应用中的开源核心项目。

目标很直接：

- 让结构力学计算结果可解释、可复现
- 让常见工况可以快速复用
- 让结果输出接近工程交付习惯，尤其是可直接复核的 WORD 计算书
- 让外部开发者可以基于清晰计算核持续扩展

## 文档优先级与边界

1. **公开产品层（最高优先级）**：`README.md`、`NOTICE.md`、`docs/open-source-structure-solver-roadmap.md`
2. **工程验证层**：后端与前端测试、基准算例回归、导出结果校验
3. **实现说明层**：架构状态、文本模型规范、贡献说明

## 核心能力

- 连续梁、简支梁、悬臂梁计算
- 二维平面框架线弹性静力分析
- 二维平面桁架线弹性静力分析
- 均布荷载、集中荷载、线性分布荷载建模
- 支座反力、剪力、弯矩、挠度与最大值位置分析
- 框架节点位移、支座反力、杆端轴力/剪力/弯矩输出
- 桁架节点位移、支座反力、杆件轴力输出
- 梁系、二维平面框架、二维平面桁架的单因素参数敏感性分析（辅助解释与方案比选，不替代基础求解或规范校核）
- 项目模板库与基准模板
- 每个模块的便捷入口、预置模型与默认参数
- 结构图、荷载图、内力图、挠度曲线展示
- WORD / XLSX 计算书导出
- 基准算例、错误契约与回归门禁

## 身份与访问边界

当前开源核心默认直接进入本地工作台，不内置登录、组织、权限或会话管理。早期临时 JWT 登录验证已取消，相关运行时代码、依赖和规格均已移除。

如果后续需要统一身份或多用户能力，应作为独立集成议题重新设计，而不是在 Solver 内重建认证系统。Solver 只消费外部身份上下文与权限判断结果，不在本仓库内实现认证平台。

## 适合谁

- 结构工程师
- 高校教师与学生
- 想快速验证结构力学问题的开发者
- 关注开源工程工具的团队

## 快速开始

### 运行后端

```bash
python app.py
```

后端默认运行在 `http://127.0.0.1:6240`

如需临时改端口，可设置：

```powershell
$env:BEAM_SOLVER_BACKEND_PORT="6240"; python app.py
```

### 运行前端

```bash
cd frontend
npm run dev
```

前端默认运行在 `http://127.0.0.1:6241`

前端开发服务默认将 `/api` 代理到 `http://127.0.0.1:6240`。如需对接其他后端端口，可设置环境变量，或写入 `frontend/.env.local`：

```powershell
$env:BEAM_SOLVER_BACKEND_TARGET="http://127.0.0.1:6240"; npm run dev
```

### 运行测试

```bash
python -m pytest backend/tests -q
npm --prefix frontend run test:unit
```

### 异步 API 与契约

长计算或 Agent 批量调用可使用异步作业入口：

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:6240/api/jobs" -ContentType "application/json" -Body '{"operation":"calculate","payload":{"beamType":"simply_supported","loadType":"uniform","q":12,"E":206,"I":85000,"spans":[6]}}'
```

机器可读 JSON Schema 可通过 `/api/contracts/schemas` 获取，覆盖同步求解、异步作业、CLI 与 MCP 工具输入输出契约。
OpenAPI 3.1 契约可通过 `/api/contracts/openapi` 获取，用于系统集成、SDK 生成和接口审阅。
公开验证工程可通过 `/api/examples/projects` 获取，前端顶部“公开案例”入口也会使用同一接口，把 33 个 benchmark 算例按梁系、平面框架、平面桁架组合成可直接打开和计算的工程。

### ASMS-JSON 协议层

ArchSight Solver 不只是提供一个求解 API，而是提供一套可验证的结构力学数据协议：**ASMS-JSON**。它是本项目的结构模型入口标准，让梁系、二维平面框架和二维平面桁架模型在 Web、REST API、CLI、MCP、benchmark 和计算书之间保持同源、可复现、可审计。

核心关系：

- ASMS-JSON 是入口：描述结构类型、几何、材料截面、支座、荷载和输出指标。
- JSON Schema 是契约：`/api/contracts/schemas/asms-model` 及子 schema 约束字段和单位口径。
- benchmark 是证据：公开验证集使用同一套 ASMS-JSON payload 做回归复核。
- 公开案例是展示入口：工作台可直接打开由 benchmark 生成的验证工程，无需重复输入参数建模。
- REST / CLI / MCP 是同源执行面：`/api/calculate` 直接接收 ASMS-JSON，CLI 与 MCP 使用 `{ "payload": <ASMS-JSON> }` 包装调用。

协议说明见 [ASMS-JSON 结构力学数据协议](docs/structural-model-protocol.md)，Agent 调用闭环见 [Agent 工程流样例](docs/agent-engineering-workflow.md)，可测试 few-shot 样例见 `data/agent_workflows/asms_few_shots.json`。

### 本地工具调用

梁挠度求解可作为本地命令行工具调用：

```powershell
@'
{
  "span": {"value": 6.0, "unit": "m"},
  "elasticModulus": {"value": 210.0, "unit": "GPa"},
  "secondMomentOfArea": {"value": 4500.0, "unit": "cm4"},
  "load": {"value": 10.0, "unit": "kN/m", "case": "uniform"},
  "boundaryCondition": "simply_supported"
}
'@ | python -m backend.capabilities.beam_deflection --pretty
```

也可以直接启动本地 MCP Server：

```powershell
python -m backend.capabilities.mcp_server
```

当前 MCP 工具：

- `beam_deflection`：梁最大挠度计算。
- `beam_deflection_serviceability_check`：梁挠度正常使用限值校核，当前不做强度、稳定或规范承载力设计。
- `frame_displacement`：二维平面框架位移求解。
- `truss_member_force`：二维平面桁架杆件轴力求解。
- `calculate`：通用结构求解，复用 `/api/calculate` 链路。
- `sensitivity_analysis`：参数敏感性分析。
- `benchmark_case_list`：列出公开验证集算例。
- `benchmark_case_run`：执行公开验证集算例并返回误差结论。

关键 MCP Resources：

- `archsight://schemas`：机器可读契约。
- `archsight://docs/asms-json`：ASMS-JSON 协议说明。
- `archsight://examples/asms-few-shots`：Agent 可测试 few-shot 样例库。
- `archsight://benchmark/catalog`：公开验证集算例目录。
- `archsight://docs/benchmark-validation`：公开验证集说明。
- `archsight://docs/aios-runtime-integration`：AIOS 调用层设计。
- `archsight://docs/mcp-resources`：MCP 资源清单、仓库事实源与验收检查。

通用 CLI 入口：

```powershell
'{"caseId":"BM-001"}' | python -m backend.capabilities.solver_cli benchmark_case_run --pretty
```

公开验证集报告：

```powershell
python -m backend.benchmarks.report --output docs/verification/benchmark-validation-report.md
```

Agent 工程流样例：

- [Agent 工程流样例](docs/agent-engineering-workflow.md)
- `data/agent_workflows/asms_few_shots.json`

### Docker 镜像打包

本仓库推荐使用**单镜像**方式：前端在构建阶段打包成 `frontend/dist`，后端 Flask 统一对外提供页面和 API。

如需推送远程镜像，先登录你的镜像仓库：

```powershell
docker login --username=<你的阿里云账号> registry.cn-hangzhou.aliyuncs.com
```

本地构建镜像：

```powershell
docker build -t archsight-solver:latest .
```

如需同时打上远程镜像标签：

```powershell
docker build -t archsight-solver:v1.0.0 -t registry.cn-hangzhou.aliyuncs.com/example-namespace/archsight-solver:v1.0.0 .
```

推送远程镜像：

```powershell
docker push registry.cn-hangzhou.aliyuncs.com/example-namespace/archsight-solver:v1.0.0
```

如果你的 Docker 环境在拉取基础镜像时不稳定，也可以临时关闭 BuildKit：

```powershell
$env:DOCKER_BUILDKIT="0"; docker build -t archsight-solver:latest .
```

本地验证运行：

```powershell
docker run --rm -p 127.0.0.1:6280:6240 archsight-solver:latest
```

容器启动后，前端和后端会一起运行在 `http://127.0.0.1:6280`。

### Docker Compose

本仓库保留通用 Compose 入口，默认将容器内 `6240` 端口绑定到宿主机本地端口：

```powershell
docker compose up -d --build
```

如需调整宿主机端口，可设置 `APP_HOST_PORT`。公网部署时建议只通过外层 Nginx / Caddy 暴露 `80/443`。

### 二维框架快速验证

```powershell
$payload = @{
  analysisType = "frame"
  projectName = "Benchmark Portal Frame"
  materialId = "q345"
  structure = @{
    template = "portal_frame"
    span = 6.0
    height = 4.0
    left_support = "fixed"
    right_support = "fixed"
    beam_load_kn_per_m = 18.0
    lateral_load_kn = 24.0
    top_vertical_load_kn = 0.0
  }
} | ConvertTo-Json -Depth 8

Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:6240/api/calculate" -ContentType "application/json" -Body $payload
```

预期返回 `analysisType: "frame"`，并在 `summary` 中包含最大位移、最大弯矩、控制节点和校核状态。

## 持续集成

仓库内置 GitHub Actions：`.github/workflows/ci.yml`。

- 后端：安装 Python 依赖并运行 `python -m pytest backend/tests -q`
- 前端：执行 `npm run lint`、`npm run test:unit`、`npm run build`

## 示例能力清单

- 输入一组连续梁工况并计算挠度曲线
- 输入门式刚架或自定义二维框架并计算节点位移、支座反力和杆端内力
- 输入典型二维桁架并计算节点位移、支座反力和杆件轴力
- 通过预置模型和默认参数快速进入高频工况
- 将当前工况保存为模板并一键恢复
- 为某个模板设为基准并快速回切
- 导出包含输入参数、图形、验算过程与结果摘要的 WORD 计算书
- 通过工程标记与模板快照保留关键工作状态，便于技术复盘

## 路线图

对外主叙事只保留三段：

### 已交付

- 梁系求解
- 二维平面框架
- 二维平面桁架
- 模板库与工况恢复
- WORD / XLSX 计算书导出
- 基准算例与错误契约

### 未来 3 个月重点

- 梁系、二维平面框架、二维平面桁架三个核心模块同步打磨
- 为每个模块补齐便捷入口、预置模型与默认参数
- 强化 WORD 计算书，补齐输入参数、图形、验算过程与验证结果
- 改善 UI 交互，降低首次建模与结果复核门槛
- 扩大基准算例覆盖面，收紧回归阈值和异常边界
- 保持敏感性分析为辅助能力：只做单因素扰动趋势解释，不升级为优化器、可靠度分析或规范校核
- 建设 Agent 工程流样例：自然语言工况、ASMS-JSON、CLI/MCP 调用、benchmark 复核和计算书导出
- 把 CI 变成真正的门禁，不是摆设
- 不在 Solver 内重建登录；私有部署或多用户场景作为独立集成议题评估

### 明确非目标

- 影响线
- 动力分析
- 稳定分析
- 插件化生态
- OpenSeesPy 或其他外部引擎接入
- 将 Frame3D / 三维杆系求解纳入当前开源核心
- 规范设计与施工安全业务
- 云协作、多用户系统与权限平台化

更完整的阶段说明见：

- [ArchSight Structural Solver API Reference](docs/api-reference.md)
- [Agent 工程流样例](docs/agent-engineering-workflow.md)
- [ASMS-JSON 结构力学数据协议](docs/structural-model-protocol.md)
- [开源结构力学求解器路线图与对标计划](docs/open-source-structure-solver-roadmap.md)
- [架构收口状态](docs/architecture-maintenance-status.md)
- [项目定位与开源价值总结](docs/project-positioning-summary.md)

## 目录结构概览

```text
app.py                         # Flask 入口
backend/                       # 后端计算、导出与测试
frontend/                      # React + Vite 前端工作台
docs/                          # 路线图与工程文档
```

## 贡献方式

- 先阅读 `docs/open-source-structure-solver-roadmap.md`
- 优先补算例、补测试、补文档、补交互，再扩功能
- 典型回归算例以 `backend/tests` 中的基准测试为准
- API 错误契约以测试断言和后端校验消息为准
- 保持计算核、展示层、导出层的职责边界清晰
- 优先为三大核心模块补便捷入口、默认参数与 WORD 计算书质量
- 新增能力时优先补可验证的示例和回归用例

## 许可证

本仓库采用 **Apache-2.0** 许可证，具体文本见 [LICENSE](LICENSE)。该许可证适用于本仓库公开发布的代码、文档和测试样例。

如果你准备贡献代码，请先阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
