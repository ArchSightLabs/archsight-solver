# API 与 JSON Schema 契约设计

## 当前结论

ArchSight Solver 保留同步 API 作为工程计算主入口，同时新增异步作业 API 和机器可读 JSON Schema Registry：

- 同步主入口：`POST /api/calculate`、`POST /api/preview`、`POST /api/sensitivity`
- 异步主入口：`POST /api/jobs`、`GET /api/jobs/{jobId}`、`GET /api/jobs/{jobId}/result`
- 契约主入口：`GET /api/contracts/schemas`、`GET /api/contracts/schemas/{schemaId}`

这套设计的目标不是把 Flask 改造成全异步框架，而是先补齐 SaaS 化最关键的工程边界：长计算不阻塞调用方、Agent 可发现输入契约、测试和销售材料可以复用同一组算例。

## 异步 API 设计

### 提交作业

```http
POST /api/jobs
Content-Type: application/json
```

```json
{
  "operation": "calculate",
  "clientJobId": "optional-client-trace-id",
  "payload": {
    "analysisType": "beam",
    "beamType": "simply_supported",
    "loadType": "uniform",
    "spans": [6],
    "q": 12,
    "E": 206,
    "I": 85000
  }
}
```

返回 `202 Accepted`，并带：

- `Location: /api/jobs/{jobId}`
- `Retry-After: 1`
- `statusUrl`
- `resultUrl`

### 查询状态

```http
GET /api/jobs/{jobId}
```

状态值：

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`

完成后，状态响应中包含 `result`；也可以通过 `GET /api/jobs/{jobId}/result` 直接获取同步 API 同构结果。

### 设计取舍

- 当前实现采用进程内 `ThreadPoolExecutor`，适合单机部署、演示环境和轻量私有化。
- 企业 SaaS 阶段应替换为 Redis / Postgres-backed queue，并将结果落盘，以支持多实例、重启恢复和租户隔离。
- 回调 / Webhook 暂不默认启用。OpenAPI 文档将 callbacks 定位为长操作完成后的带外通知机制；当前项目先用轮询闭环，后续再加签名回调。

参考：Microsoft REST LRO 建议用 `202 Accepted`、`Location`、`Retry-After` 做轮询；OpenAPI callbacks 用于长操作完成后的带外通知。

## JSON Schema Registry

当前 Registry 暴露以下契约：

- `beam-deflection-input`
- `beam-serviceability-input`
- `asms-model`
- `asms-beam-model`
- `asms-frame-model`
- `asms-truss-model`
- `calculate-payload`
- `job-request`
- `capability-result`
- `frame-tool-input`
- `truss-tool-input`
- `calculate-tool-input`
- `sensitivity-tool-input`
- `benchmark-case-list-input`
- `benchmark-case-run-input`

这些 schema 同时服务三类入口：

1. REST API 文档和前端/外部集成。
2. MCP `tools/list` 的 `inputSchema` / `outputSchema`。
3. CLI / Agent 运行时的参数校验与提示词约束。

## 短板与下一阶段

- 当前 schema 是轻量契约，尚未引入 `jsonschema` 运行时依赖；后端仍以现有 normalizer 和业务校验为最终裁决。
- 当前异步队列是内存态；生产多实例必须外置队列、持久化作业和审计日志。
- 当前没有 OpenAPI 文档生成器；下一步可从 `backend/contracts/json_schemas.py` 生成 `openapi.json`，避免人工维护分叉。
