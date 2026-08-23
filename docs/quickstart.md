# 快速开始与本地工具

中文 | [English](en/quickstart.md)

本文面向本地开发、教学演示和 Agent 集成调试，汇总后端、前端、测试、CLI、MCP 和公开案例接口的常用命令。

## 环境与安装

需要 Python `>=3.13`、[uv](https://docs.astral.sh/uv/) 和 Node.js `>=22.22.0`。仓库使用 `uv.lock` 和 `frontend/package-lock.json` 固定可复现依赖；首次启动前执行：

```bash
git clone https://github.com/ArchSightLabs/archsight-solver.git
cd archsight-solver
uv sync --frozen
npm --prefix frontend ci --include=optional
```

## 后端

```bash
uv run python app.py
```

默认地址：`http://127.0.0.1:6240`

临时修改端口：

```powershell
$env:BEAM_SOLVER_BACKEND_PORT="6240"; uv run python app.py
```

## 前端

前端开发与构建需要 Node.js `>=22.22.0`。

```bash
cd frontend
npm run dev
```

默认地址：`http://127.0.0.1:6241`

前端开发服务默认将 `/api` 代理到 `http://127.0.0.1:6240`。如需对接其他后端端口：

```powershell
$env:BEAM_SOLVER_BACKEND_TARGET="http://127.0.0.1:6240"; npm run dev
```

## 测试

```bash
uv run python -m pytest backend/tests -q
npm --prefix frontend run lint
npm --prefix frontend run test:unit
npm --prefix frontend run build
```

## GitHub Release 五分钟路径

如果只需要 CLI / MCP，不必克隆仓库。下载 v1.8.0 Release 的 `archsight_solver-1.8.0-py3-none-any.whl` 与 `SHA256SUMS`，校验后安装：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install .\archsight_solver-1.8.0-py3-none-any.whl
```

按[可信计算包指南](verification-package.md)准备 `create-request.json`；源码仓库可直接复制 `examples/verification-package/create-request.json`。然后生成并复算：

```powershell
archsight-solver-tool verification_package_create --input create-request.json --pretty > created.json
python -c "import json; d=json.load(open('created.json',encoding='utf-8')); json.dump({'package':d['package']},open('verify-request.json','w',encoding='utf-8'),ensure_ascii=False)"
archsight-solver-tool verification_package_verify --input verify-request.json --pretty
```

成功输出应包含 `status: "pass"`、`integrityValid: true` 和 `replayMatched: true`。安装态 wheel 自带 CLI/MCP 所需的契约、Benchmark、模板、材料、支座、截面和文档资源，不依赖仓库 cwd。完整 Web/API 使用 GHCR 不可变版本镜像或同一 Release 的离线镜像归档。

## 异步 API 与公开案例

提交异步计算作业：

```powershell
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:6240/api/jobs" -ContentType "application/json" -Body '{"operation":"calculate","payload":{"beamType":"simply_supported","loadType":"uniform","q":12,"E":206,"I":85000,"spans":[6]}}'
```

公开验证工程：

- REST：`GET /api/examples/projects`
- 前端：顶部“公开案例”入口

机器可读契约：

- `GET /api/contracts/schemas`
- `GET /api/contracts/openapi`

## CLI

梁挠度工具：

```powershell
@'
{
  "span": {"value": 6.0, "unit": "m"},
  "elasticModulus": {"value": 210.0, "unit": "GPa"},
  "secondMomentOfArea": {"value": 4500.0, "unit": "cm4"},
  "load": {"value": 10.0, "unit": "kN/m", "case": "uniform"},
  "boundaryCondition": "simply_supported"
}
'@ | uv run python -m backend.capabilities.beam_deflection --pretty
```

通用求解工具：

```powershell
'{"payload":{"analysisType":"beam","beamType":"simply_supported","loadType":"uniform","spans":[6],"q":12,"E":206,"I":85000}}' |
  uv run python -m backend.capabilities.solver_cli calculate --pretty
```

执行公开验证集算例：

```powershell
'{"caseId":"BM-001"}' | uv run python -m backend.capabilities.solver_cli benchmark_case_run --pretty
```

检查项目文件契约与托管状态：

```powershell
uv run python -m backend.capabilities.solver_cli project_document_health --input project.slv --pretty
```

读取内置模板 registry：

```powershell
'{}' | uv run python -m backend.capabilities.solver_cli project_template_registry --pretty
```

生成与复算可信计算包：

```powershell
uv run python -m backend.capabilities.solver_cli verification_package_create --input create-request.json --pretty > created.json
python -c "import json; d=json.load(open('created.json',encoding='utf-8')); json.dump({'package':d['package']},open('verify-request.json','w',encoding='utf-8'),ensure_ascii=False)"
uv run python -m backend.capabilities.solver_cli verification_package_verify --input verify-request.json --pretty
```

## MCP Server

```powershell
uv run python -m backend.capabilities.mcp_server
```

当前 MCP tools：

- `beam_deflection`
- `beam_deflection_serviceability_check`
- `frame_displacement`
- `truss_member_force`
- `calculate`
- `sensitivity_analysis`
- `benchmark_case_list`
- `benchmark_case_run`
- `project_document_health`
- `project_template_registry`
- `verification_package_create`
- `verification_package_verify`

当前 MCP resources：

- `archsight://schemas`
- `archsight://docs/asms-json`
- `archsight://examples/asms-few-shots`
- `archsight://benchmark/catalog`
- `archsight://docs/benchmark-validation`
- `archsight://docs/mcp-resources`

资源路径、更新责任和验收检查见 [MCP Resources 清单与生成口径](mcp-resources.md)。

可信计算包的字段、状态、容差与责任边界见[可信计算包 1.0](verification-package.md)，按角色复跑的完整路径见[三条黄金流程](golden-flows.md)。

## 二维框架快速验证

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

预期返回 `analysisType: "frame"`，并在 `summary` 中包含最大节点位移、最大构件弯矩、控制节点和校核状态。
