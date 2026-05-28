# AIOS 调用层设计：API、CLI、MCP

## 结论

当前不应押注单一路径。ArchSight Solver 的运行时能力应按三层暴露：

1. **REST API 是商业 SaaS 主入口**：适合 B2B 系统集成、权限、审计、限流、异步作业和私有部署。
2. **CLI 是本地自动化与 CI 主入口**：适合 Agent 沙箱、批处理、GitHub Actions、离线验证和专家复核。
3. **MCP 是 Agent 发现与上下文入口**：适合 AIOS / Codex / Claude 等 Agent 自动发现工具、读取 schema、执行基准算例，但不应作为唯一生产集成面。

用户提到“主流是否正在从 MCP 冷却甚至抛弃”，我的判断是：**MCP 没有被主流抛弃，但纯 MCP Server 不是完整产品架构。主流正在从“只做 MCP 工具”转向“API + 强类型 Schema + Agent Runtime + MCP 适配层”的组合。**

依据：

- MCP 官方规范仍把 Tools / Resources / Prompts 作为服务器三类核心能力，并要求 tools 声明 `inputSchema`。
- OpenAI Responses API 已支持 remote MCP servers 和 connectors，同时提供 `allowed_tools`、approval flow 等安全控制。
- 官方安全建议强调远程 MCP 服务器会共享数据并执行动作，敏感动作需要审批和审计。

## 当前实现能力

### REST API

- `POST /api/calculate`
- `POST /api/preview`
- `POST /api/sensitivity`
- `POST /api/export`
- `POST /api/jobs`
- `GET /api/jobs/{jobId}`
- `GET /api/jobs/{jobId}/result`
- `GET /api/contracts/schemas`
- `GET /api/contracts/openapi`

### CLI

```powershell
python -m backend.capabilities.solver_cli beam_deflection --input payload.json --pretty
python -m backend.capabilities.solver_cli calculate --input payload.json --pretty
python -m backend.capabilities.solver_cli benchmark_case_run --input case.json --pretty
```

安装为项目脚本后：

```powershell
archsight-solver-tool benchmark_case_run --input case.json --pretty
```

### MCP

当前 stdio MCP Server：

```powershell
python -m backend.capabilities.mcp_server
```

已暴露 Tools：

- `beam_deflection`
- `beam_deflection_serviceability_check`
- `frame_displacement`
- `truss_member_force`
- `calculate`
- `sensitivity_analysis`
- `benchmark_case_list`
- `benchmark_case_run`

已暴露 Resources：

- `archsight://schemas`
- `archsight://docs/asms-json`
- `archsight://examples/asms-few-shots`
- `archsight://benchmark/catalog`
- `archsight://docs/benchmark-validation`
- `archsight://docs/aios-runtime-integration`
- `archsight://docs/mcp-resources`

其中 `archsight://docs/asms-json` 是协议语义入口，`archsight://examples/asms-few-shots` 是 Agent few-shot 与回归样例入口。Agent Host 应先读取协议和 schema，再构造 ASMS-JSON，不应只根据自然语言描述猜测 payload。
资源 URI、仓库路径、更新责任和验收检查见 `docs/mcp-resources.md`；文件型资源缺失时 MCP server 会返回明确错误，不再返回“尚未生成”的占位文案。

已暴露 Prompts：

- `solver-capability-call`
- `benchmark-validation-review`

## AIOS Runtime 边界

```text
Source：结构计算任务、模型 payload、公开验证集、JSON Schema、工程报告
Runtime：AIOS / Codex / 其他 Agent Host
Instance：本地 stdio MCP、私有 REST API、CI CLI
输入：自然语言工况、结构化 JSON、benchmark caseId
输出：确定性求解结果、验证报告、缺失输入清单
工具：REST API、CLI、MCP tools
记忆：不把客户工况写入长期记忆；只记录版本、schema、caseId 和审计摘要
评估：benchmark pass rate、schema validation、单位换算、异常契约
风险：Prompt injection、越权工具调用、未经签审的结构安全结论、租户数据污染
```

## Agent 工程流样例

当前已提供可执行样例：

- `docs/agent-engineering-workflow.md`
- `data/agent_workflows/asms_few_shots.json`
- `backend/tests/test_agent_workflow_examples.py`

样例覆盖梁系、二维平面框架和二维平面桁架。每条样例都给出自然语言工况、ASMS-JSON、CLI/MCP 调用模板、同类 benchmark caseId 和导出计算书配置。测试会验证样例 payload 可被 `/api/calculate` 同源链路求解、CLI `calculate` 可运行、benchmark 引用可通过、WORD 导出可生成。

## 生产化建议

- REST API 做权威入口：认证、租户、限流、审计、异步队列、结果持久化都放在 API 层。
- MCP 只做 Adapter：暴露只读/确定性工具，使用 `readOnlyHint=true`、`destructiveHint=false`，并限制工具白名单。
- CLI 做可复现执行：所有 benchmark 和专家复核都能脱离 Agent 运行。
- JSON Schema 做单一契约：REST、CLI、MCP、前端表单和 Agent prompt 共同引用同一批 schema。
- ASMS-JSON 做结构模型入口：协议文档、few-shot 样例、Schema Registry、benchmark 和计算书导出必须指向同一模型口径。
- 对敏感动作保留人工确认：工程签审、规范结论、商业软件对标导入不允许由 Agent 静默完成。

## 下一阶段短板

- MCP 目前只有 stdio transport；若要接 OpenAI remote MCP，需要补 Streamable HTTP endpoint、Origin 校验、鉴权和审计。
- 作业队列目前为进程内线程池；企业 SaaS 应迁移到持久化队列。
- 缺少租户级 Capability Registry；私有部署需要按企业、项目和角色限制工具集合。
