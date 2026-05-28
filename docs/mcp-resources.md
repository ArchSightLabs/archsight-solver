# MCP Resources 清单与生成口径

本文档说明 `backend/capabilities/mcp_server.py` 暴露的 MCP Resources 与仓库内事实源之间的对应关系。MCP 资源只做 Agent Host 的上下文入口，不替代 REST API、CLI、JSON Schema 或工程师复核。

## 资源清单

| URI | MIME | 仓库事实源 | 用途 |
|---|---|---|---|
| `archsight://schemas` | `application/json` | `backend/contracts/json_schemas.py` 运行时生成 | 公开 JSON Schema Registry，约束 REST、CLI、MCP 与 Agent payload。 |
| `archsight://docs/asms-json` | `text/markdown` | `docs/asms-json-schema.md` | ASMS-JSON 字段语义、单位口径、结构体系差异和协议边界。 |
| `archsight://examples/asms-few-shots` | `application/json` | `data/agent_workflows/asms_few_shots.json` | 自然语言工况到 ASMS-JSON、CLI/MCP 调用、benchmark 复核和计算书导出的可测试 few-shot 样例。 |
| `archsight://benchmark/catalog` | `application/json` | `backend/benchmarks/benchmark_cases.json` 经 `load_benchmark_catalog()` 读取 | 公开验证集算例目录、标准值、容许误差和来源元数据。 |
| `archsight://docs/benchmark-validation` | `text/markdown` | `docs/verification/benchmark-validation-report.md` | 公开验证集算例、通过状态、关键校核和专业边界。 |
| `archsight://docs/mcp-resources` | `text/markdown` | `docs/mcp-resources.md` | 本清单，说明资源路径、更新责任和验收检查。 |

## 生成与更新责任

- `archsight://schemas` 不落静态 JSON 文件，由 `schema_registry()` 每次运行时生成，避免契约副本漂移。
- `archsight://benchmark/catalog` 不落静态导出文件，由 benchmark catalog 运行时读取，避免算例目录副本漂移。
- 文档类资源必须对应仓库内真实 Markdown 文件，不允许返回“尚未生成”类占位内容。
- few-shot 资源必须对应仓库内真实 JSON 文件，并保持 `schemaVersion`、`examples`、`cliCall`、`mcpCall`、`benchmarkCaseId` 和 `acceptanceChecks` 可测试。
- 新增 MCP Resource 时，应同步更新本文档、根目录 `README.md`、`docs/quickstart.md` 和 `backend/tests/test_solver_tools_mcp.py`。

## Agent Host 推荐读取顺序

1. 读取 `archsight://schemas` 获取机器可读契约。
2. 读取 `archsight://docs/asms-json` 明确字段语义、单位和结构体系边界。
3. 读取 `archsight://examples/asms-few-shots` 获取可测试的生成样例。
4. 对公开背书或回归复核任务，读取 `archsight://benchmark/catalog` 并调用 `benchmark_case_run`。
5. 对 MCP 集成方案，读取 `archsight://docs/mcp-resources`。

## 验收检查

资源完整性由 `backend/tests/test_solver_tools_mcp.py` 覆盖：

- `resources/list` 必须列出所有公开 URI。
- 文件型资源的仓库路径必须存在且非空。
- 文档型资源不得返回“尚未生成”占位文本。
- JSON 型 few-shot 资源必须可解析为 JSON。
- `resources/read` 返回内容必须与资源声明的 MIME 类型一致。

如任一文件型资源缺失，MCP server 会返回 JSON-RPC `-32602` 错误，提示缺失的仓库相对路径，避免 Agent 在占位文本上继续生成 payload 或报告。
