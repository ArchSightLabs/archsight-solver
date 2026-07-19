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
python -m backend.capabilities.solver_cli project_document_health --input project.slv --pretty
echo '{}' | python -m backend.capabilities.solver_cli project_template_registry --pretty
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

## Host iframe / 外部宿主

v1.6 起，Solver 额外提供中性的外部宿主接入面，便于第三方页面通过 iframe 加载个人工具，同时由宿主自行管理项目文件持久化。Solver 只处理本地项目文档、结构求解、导出和消息契约，不内置身份、远程持久化或组织协作能力。

宿主消息使用 `postMessage`，协议版本为 `1.0.0`：

完整状态机、消息允许矩阵、安全校验顺序和兼容承诺见 [`host-protocol-1.md`](host-protocol-1.md)。

- `archsight.solver.host.launch`：宿主发送项目文档、sessionId、nonce 和只读/可编辑模式。
- `archsight.solver.ready`：Solver 告知宿主已就绪。
- `archsight.solver.project.changed`：可编辑模式下 Solver 通知宿主项目已变更。
- `archsight.solver.host.requestSave`：宿主请求 Solver 生成保存时的确定快照，必须携带 `requestId`。
- `archsight.solver.project.saveRequest`：Solver 请求宿主保存当前项目文档。
- `archsight.solver.host.saveResult`：宿主回传保存状态。
- `archsight.solver.error`：Solver 回传协议处理错误。

`sessionId` 用于关联一次嵌入会话，`nonce` 用于把 launch、变更、保存请求和保存结果绑定到同一轮宿主上下文。保存链路还必须原样回传 `requestId`；没有关联标识的旧宿主回执不会清除 Solver 的未保存状态，延迟回执也不能把更新后的工程误标为已保存。容器部署使用运行时环境变量 `ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS` 配置宿主 origin allowlist；纯静态构建仍可使用 `VITE_SOLVER_HOST_ALLOWED_ORIGINS` 作为构建期回退。

### Host Protocol 生命周期

Solver 产品版本与 Host Protocol 版本相互独立。当前实现只接受精确的 `1.0.0`，不把其他 `1.x` 版本自动视为兼容：

- 保持 `1.0.0` 的兼容维护只能增加可选字段、补充错误信息，或通过 capabilities 协商新增能力；不得改变既有必选字段、消息类型、安全约束和保存语义。
- 新增宿主必须支持的能力时，Reference Host 必须在 launch 前检查对应 capability；旧 Solver 缺少能力时应明确显示不兼容，不能假装接入成功。
- 删除或重命名消息、改变必选字段、放宽安全边界、改变项目快照或保存回执语义，都属于破坏性变更，必须升级协议主版本并提供迁移说明。
- 旧协议不会被静默重新解释。接入方遇到未知协议版本时应停止 launch，并保留当前工程与保存状态。

宿主应将 iframe URL 设置为 `?embed=1`，此时 Solver 只展示工程树、参数建模、结构计算、敏感性分析和结果工作台，不展示独立应用的文件菜单、公开案例、验证投稿、主题切换与系统设置。工程新建、打开和保存由宿主负责；`theme=light|dark` 可让宿主统一嵌入区主题。`embed` 只控制展示外壳，编辑权限仍必须通过 launch 的 `mode=editable|readonly` 建立。

本仓库提供可自动验收的 Reference Host：

```bash
python scripts/run_host_iframe_demo.py
```

该命令在 `127.0.0.1:6241` 启动 Solver，在 `127.0.0.1:6250` 启动中性宿主，真实演示 launch、变更消息、localStorage 托管保存和刷新重开。不要直接用 `file://` 打开 HTML；opaque `null` origin 会被精确白名单拒绝。完整示例见 `examples/host-iframe-demo/README.md`。

宿主接入前建议先用 `project_document_health` 检查项目文档，确认项目文件版本、ASMS-JSON 契约版本、manifest、活动分析对象和迁移诊断。需要展示内置模板能力时，可调用 `project_template_registry`，返回结构体系、主要结果指标、支持入口、可执行动作和 benchmark 映射。

## 项目文件与导出契约

`.slv` 当前仍是单 JSON 项目文件，但 v1.6 开始在项目文档中写入 `manifest`：

- `projectFileKind=single-json` 是当前可读写承诺。
- `zip-container` 和 `project-folder` 是预留格式，当前只识别 manifest，不承诺读写容器。
- `contract` 同步记录项目文件 schema 和 ASMS-JSON schema 版本。

导出 DOCX / XLSX 时，artifact metadata 写入 `manifestVersion`、`artifactType=solver.export`、项目 manifest、结果来源、诊断摘要和 host 协议版本，便于外部系统审计“从哪个项目、哪个结果来源生成了哪个导出物”。

公开 JSON Schema registry 中新增：

- `project-document-tool-input`
- `project-file-manifest`
- `solver-host-message`
- `solver-artifact-manifest`
- `solver-template-registry`

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
