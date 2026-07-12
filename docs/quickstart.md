# 快速开始与本地工具

本文面向本地开发、教学演示和 Agent 集成调试，汇总后端、前端、测试、CLI、MCP 和公开案例接口的常用命令。

## 后端

```bash
python app.py
```

默认地址：`http://127.0.0.1:6240`

临时修改端口：

```powershell
$env:BEAM_SOLVER_BACKEND_PORT="6240"; python app.py
```

## 前端

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
python -m pytest backend/tests -q
npm --prefix frontend run lint
npm --prefix frontend run test:unit
npm --prefix frontend run build
```

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
'@ | python -m backend.capabilities.beam_deflection --pretty
```

通用求解工具：

```powershell
'{"payload":{"analysisType":"beam","beamType":"simply_supported","loadType":"uniform","spans":[6],"q":12,"E":206,"I":85000}}' |
  python -m backend.capabilities.solver_cli calculate --pretty
```

执行公开验证集算例：

```powershell
'{"caseId":"BM-001"}' | python -m backend.capabilities.solver_cli benchmark_case_run --pretty
```

检查项目文件契约与托管状态：

```powershell
python -m backend.capabilities.solver_cli project_document_health --input project.slv --pretty
```

读取内置模板 registry：

```powershell
'{}' | python -m backend.capabilities.solver_cli project_template_registry --pretty
```

## MCP Server

```powershell
python -m backend.capabilities.mcp_server
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

当前 MCP resources：

- `archsight://schemas`
- `archsight://docs/asms-json`
- `archsight://examples/asms-few-shots`
- `archsight://benchmark/catalog`
- `archsight://docs/benchmark-validation`
- `archsight://docs/mcp-resources`

资源路径、更新责任和验收检查见 [MCP Resources 清单与生成口径](mcp-resources.md)。

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
