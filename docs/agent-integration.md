# Agent 集成指南

本文说明 ArchSight Solver 如何被 Agent、自动化脚本和第三方系统调用。更完整的自然语言工况到 ASMS-JSON 的闭环样例见 [Agent 工程流样例](agent-engineering-workflow.md)。

## 集成入口

ArchSight Solver 暴露三类入口：

| 入口 | 适合场景 | 典型用途 |
|---|---|---|
| REST API | Web 服务、私有部署、系统集成 | 同步求解、异步作业、导出、benchmark 投稿校验 |
| CLI | 本地自动化、CI、批处理 | 离线求解、benchmark 回归、专家复核 |
| MCP | Agent Host 工具发现和上下文读取 | 读取 schema、运行确定性工具、执行公开验证算例 |

不要把 MCP 当作唯一生产集成面。更稳的架构是：

```text
ASMS-JSON + JSON Schema
        ↓
REST API / CLI / MCP Adapter
        ↓
同源求解、导出、benchmark 和错误契约
```

## REST API

常用接口：

- `POST /api/calculate`
- `POST /api/preview`
- `POST /api/sensitivity`
- `POST /api/export`
- `POST /api/jobs`
- `GET /api/jobs/{jobId}`
- `GET /api/jobs/{jobId}/result`
- `GET /api/contracts/schemas`
- `GET /api/contracts/openapi`

REST API 适合承载认证、审计、限流、异步作业和私有部署边界。当前本仓库默认不内置登录和组织权限系统，生产化部署应由外部网关或宿主平台提供。

## CLI

示例：

```bash
python -m backend.capabilities.solver_cli calculate --input payload.json --pretty
python -m backend.capabilities.solver_cli benchmark_case_run --input case.json --pretty
```

安装为项目脚本后：

```bash
archsight-solver-tool benchmark_case_run --input case.json --pretty
```

CLI 适合在 CI、离线环境和 Agent 沙箱中复现同一份结构模型。

## MCP

本地 stdio MCP Server：

```bash
python -m backend.capabilities.mcp_server
```

MCP 适合让 Agent 发现可用工具、读取协议文档、读取 schema 和运行公开验证算例。

已暴露能力以 [API 参考](api-reference.md) 和 [MCP Resources 清单与生成口径](mcp-resources.md) 为准。

## Agent 调用顺序

推荐顺序：

1. 读取 [ASMS-JSON / Model Schema](asms-json-schema.md)。
2. 读取 [功能与适用边界](capabilities.md)，确认结构类型属于当前公开核心。
3. 根据自然语言工况构造 ASMS-JSON。
4. 用 JSON Schema 或 `/api/contracts/schemas` 校验 payload。
5. 调用 REST API、CLI 或 MCP tool 执行求解。
6. 对照 benchmark、单位、支座反力和主结果指标做合理性检查。
7. 需要交付时导出 DOCX / XLSX 计算书。

Agent 不应只凭自然语言直接猜测 payload 字段。

## 安全边界

Agent 集成必须遵守：

- 不把客户工况、未公开项目数据或私有模型写入长期记忆。
- 不把求解结果包装成工程签审结论。
- 不静默执行高风险动作，例如覆盖文件、发布报告、提交商业软件对标数据。
- 不绕过 schema 校验和错误契约。
- 对敏感动作保留人工确认和审计记录。

## 能力边界

当前公开核心支持梁系、二维平面桁架和二维平面框架的线弹性静力分析。

不支持：

- 三维杆系和空间框架。
- 动力分析、稳定分析、材料非线性、几何非线性和接触问题。
- 规范设计、施工安全专项和工程签审。
- 多租户认证、云协作和企业权限系统。

## 最小可复核闭环

一个可复核 Agent 工作流至少应包含：

- 输入工况。
- ASMS-JSON payload。
- 调用入口和命令。
- 求解结果摘要。
- 单位和符号约定。
- 同类 benchmark 或解析解参考。
- 计算书导出配置。

仓库中的 [Agent 工程流样例](agent-engineering-workflow.md) 和 `data/agent_workflows/asms_few_shots.json` 提供了可执行样例。
