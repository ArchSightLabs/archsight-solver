# Agent 工程流样例

## 定位

本文说明 ArchSight Solver 面向 Agent 的最小工程闭环：

自然语言工况 -> ASMS-JSON -> REST/CLI/MCP 求解 -> benchmark 复核 -> WORD/XLSX 计算书。

该流程用于教学演示、方案阶段复核、企业内网自动化和 AIOS/Codex 类 Agent Runtime 集成。它不替代工程师签审、规范设计、施工安全判断或商业软件的正式出图流程。

可执行 few-shot 样例位于：

- `data/agent_workflows/asms_few_shots.json`

每个样例都包含自然语言工况、缺失输入处理规则、ASMS-JSON、CLI 调用模板、MCP 调用模板、benchmark caseId、导出配置和验收检查。

## 标准流程

1. **抽取工程输入**
   - 识别结构类型：梁系、二维平面框架、二维平面桁架。
   - 抽取几何、材料、截面、支座、荷载、输出指标。
   - 若缺少跨度、节点、构件、支座、E、I、A 或荷载，Agent 应停止并列出缺失输入，不应静默补默认值。

2. **生成 ASMS-JSON**
   - 梁系使用 `analysisType: "beam"`、`beamType`、`loadType`、`spans`、`E`、`I`、荷载字段。
   - 二维平面框架使用 `analysisType: "frame"` 和 `structure.nodes/members/loads`。
   - 二维平面桁架使用 `analysisType: "truss"` 和 `structure.nodes/members/loads`，不得把桁架杆件当作受弯构件。

3. **执行确定性求解**
   - REST：`POST /api/calculate`
   - CLI：`python -m backend.capabilities.solver_cli calculate --input payload.json --pretty`
   - MCP：调用 `calculate` tool，参数为 `{ "payload": <ASMS-JSON> }`

4. **执行公开验证集复核**
   - 选择同类 benchmark case。
   - 通过 `benchmark_case_run` 记录 caseId、状态和误差检查；catalog 级 `schemaVersion` 来自 `backend/benchmarks/benchmark_cases.json` 顶层元数据，不是工具返回字段。
   - 复核结果只说明公开验证集覆盖范围内的回归一致性。

5. **导出计算书**
   - REST：`POST /api/export`
   - `format` 可取 `docx` 或 `xlsx`。
   - 计算书可用于归档和专家复核，但不构成工程签审结论。

## Few-shot Prompt 模板

```text
你是结构力学求解 Agent。请把用户工况转换为 ArchSight Solver 的 ASMS-JSON。

必须遵守：
1. 只生成梁系、二维平面框架或二维平面桁架模型。
2. 单位使用 m、GPa、cm^4、cm^2、kN、kN/m、kN.m。
3. 缺少关键工程输入时输出 missingInputs，不要自行假设截面、支座或荷载。
4. 输出 JSON 后，调用 calculate 工具求解。
5. 选择同类 benchmark_case_run 做回归复核。
6. 若用户要求归档，再调用 /api/export 导出计算书。
7. 最终说明“不替代工程签审或规范设计”。
```

## CLI 调用

将样例中的 `asmsJson` 包装为：

```json
{
  "payload": {
    "analysisType": "beam",
    "projectName": "Agent 简支梁均布荷载复核",
    "beamType": "simply_supported",
    "loadType": "uniform",
    "spans": [6],
    "E": 206,
    "I": 85000,
    "q": 12
  }
}
```

执行：

```powershell
python -m backend.capabilities.solver_cli calculate --input payload.json --pretty
```

公开验证集复核：

```powershell
'{"caseId":"beam-simply-supported-uniform"}' | python -m backend.capabilities.solver_cli benchmark_case_run --pretty
```

## MCP 调用

启动本地 stdio MCP Server：

```powershell
python -m backend.capabilities.mcp_server
```

Agent Host 调用 `calculate` tool：

```json
{
  "name": "calculate",
  "arguments": {
    "payload": {
      "analysisType": "beam",
      "projectName": "Agent 简支梁均布荷载复核",
      "beamType": "simply_supported",
      "loadType": "uniform",
      "spans": [6],
      "E": 206,
      "I": 85000,
      "q": 12
    }
  }
}
```

再调用 `benchmark_case_run`：

```json
{
  "name": "benchmark_case_run",
  "arguments": {
    "caseId": "beam-simply-supported-uniform"
  }
}
```

## REST 与导出

求解：

```powershell
$body = Get-Content payload.asms.json -Raw
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:6240/api/calculate" -ContentType "application/json" -Body $body
```

导出 WORD 计算书：

```powershell
$payload = Get-Content payload.asms.json -Raw | ConvertFrom-Json
$payload | Add-Member -NotePropertyName format -NotePropertyValue "docx" -Force
$json = $payload | ConvertTo-Json -Depth 20
Invoke-WebRequest -Method Post -Uri "http://127.0.0.1:6240/api/export" -ContentType "application/json" -Body $json -OutFile "agent-report.docx"
```

## 审计记录

Agent 每次自动化调用至少应记录：

- ASMS-JSON payload。
- Schema 版本和 OpenAPI 文档版本。
- 工具入口：REST、CLI 或 MCP。
- benchmark caseId、执行结果和 catalog 级 schemaVersion。
- 导出文件格式。
- 人工复核人和复核结论。

禁止把 LLM 估算值、未求解的草稿 JSON 或未复核的自然语言解释包装成求解器结果。
