# ArchSight Structural Solver API Reference

## 版本与边界

- API 版本：`v1`
- Schema 版本：`2026-05-30`
- 默认本地地址：`http://127.0.0.1:6240`
- 核心对象：梁系、二维平面框架、二维平面桁架
- 计算假定：线弹性、小变形、确定性静力分析；当前开源核心不提供规范设计、施工安全签审或三维杆系分析

本 API Reference 面向二次开发者、AI Agent Runtime、企业内网系统和教学验证场景。所有结构安全结论仍需工程师复核。

## ASMS-JSON 契约入口

ASMS-JSON 是 ArchSight Solver 的结构力学数据入口标准，用同一份 JSON 描述梁系、二维平面框架和二维平面桁架模型。API、CLI、MCP、benchmark 与计算书导出围绕同一模型工作，避免出现“前端一套、Agent 一套、测试一套”的契约漂移。

对集成方而言，核心关系如下：

- **ASMS-JSON 是入口**：`POST /api/calculate`、`POST /api/preview`、`POST /api/export` 接收 ASMS-JSON 及端点附加字段。
- **JSON Schema 是契约**：`GET /api/contracts/schemas/asms-model` 是总入口，`asms-beam-model`、`asms-frame-model`、`asms-truss-model` 是结构体系子契约。
- **benchmark 是证据**：公开验证集使用同源 ASMS-JSON payload，Agent 或 CI 可通过 `benchmark_case_run` 记录复核证据。
- **公开案例是可见入口**：`GET /api/examples/projects` 将公开验证集组合成可直接导入工作台的工程案例，适合第三方平台复核和演示。
- **算例投稿必须带标准值**：`POST /api/benchmark-submissions` 接收完整模型、标准值、容许误差和验证来源，并在入库前执行自动校验。
- **REST / CLI / MCP 是同源执行面**：REST 直接提交 ASMS-JSON；CLI 与 MCP 使用 `{ "payload": <ASMS-JSON> }` 包装，计算链路仍与 `/api/calculate` 同源。

协议字段说明见 `docs/asms-json-schema.md`，Agent 从自然语言到 ASMS-JSON 的调用闭环见 `docs/agent-engineering-workflow.md`，可测试样例库见 `data/agent_workflows/asms_few_shots.json`。

## 响应信封

同步求解类接口统一返回：

```json
{
  "success": true,
  "operation": "calculate",
  "version": "v1",
  "analysisType": "beam",
  "request": {},
  "model": {},
  "results": {},
  "diagnostics": {
    "status": "合格",
    "statusCode": "PASS",
    "method": "Euler-Bernoulli 梁理论 + 梁单元法",
    "warnings": [],
    "infos": []
  },
  "errors": [],
  "meta": {
    "generatedAt": "2026-05-26T00:00:00+00:00"
  }
}
```

错误响应：

```json
{
  "success": false,
  "operation": "calculate",
  "version": "v1",
  "error": {
    "code": "BEAM_INVALID_REQUEST",
    "message": "跨度必须大于 0"
  },
  "legacyError": "跨度必须大于 0",
  "diagnostics": {
    "warnings": [],
    "infos": []
  },
  "meta": {
    "generatedAt": "2026-05-26T00:00:00+00:00"
  }
}
```

## POST /api/calculate

执行结构求解，返回结构模型、结果摘要、图表数据、节点/构件结果和诊断信息。

### 梁系示例

```http
POST /api/calculate
Content-Type: application/json
```

```json
{
  "analysisType": "beam",
  "projectName": "简支梁均布荷载验证",
  "beamType": "simply_supported",
  "loadType": "uniform",
  "spans": [6],
  "E": 206,
  "I": 85000,
  "q": 12
}
```

关键输出：

- `summary.maxDeflectionMm`：最大挠度，单位 mm。
- `summary.maxDeflectionPositionM`：最大挠度位置，单位 m。
- `summary.maxMomentKnM`：最大弯矩，单位 kN·m。
- `summary.maxShearKn`：最大剪力，单位 kN。
- `beam.supports`：支座信息。

梁系逐跨参数：`spanProperties[].materialId` 为跨段材料库编号，用于保留材料语义；`E` / `I` 仍是梁单元刚度计算输入。

### 二维平面框架示例

```json
{
  "analysisType": "frame",
  "projectName": "门式刚架标准算例",
  "materialId": "q345",
  "structure": {
    "template": "explicit",
    "nodes": [
      {"id": "N1", "x": 0, "y": 0, "supportType": "fixed"},
      {"id": "N2", "x": 6, "y": 0, "supportType": "roller", "supportAngleDeg": 90},
      {"id": "N3", "x": 0, "y": 4, "supportType": "free"},
      {"id": "N4", "x": 6, "y": 4, "supportType": "free"}
    ],
    "members": [
      {"id": "C1", "start": "N1", "end": "N3", "materialId": "q345", "E_GPa": 210, "A_cm2": 240, "I_cm4": 12000, "kind": "column"},
      {"id": "B1", "start": "N3", "end": "N4", "materialId": "q345", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
      {"id": "C2", "start": "N2", "end": "N4", "materialId": "q345", "E_GPa": 210, "A_cm2": 240, "I_cm4": 12000, "kind": "column"}
    ],
    "loads": [
      {"type": "distributed", "member": "B1", "wyKnPerM": -18},
      {"type": "nodal", "node": "N4", "fxKn": 24, "fyKn": 0, "mzKnM": 0}
    ]
  }
}
```

框架节点字段说明：`supportAngleDeg` 为平面框架滚动支座法向角，单位 °；仅当 `supportType` 为 `roller` 时参与约束方向计算，`90` 表示竖向法向约束。`springs` 用于框架节点弹性约束，`ux` / `uy` 使用 `stiffnessKnPerM`，`rz` 使用 `stiffnessKnMPerRad`。

构件字段说明：`members[].materialId` 为材料库编号，用于保留材料语义、计算书材料摘要和前端编辑口径；`E_GPa`、`A_cm2`、`I_cm4` 仍是线弹性求解的刚度与截面输入。`endReleases` 表示构件端部 `rz` 释放，`internalHinges` 表示构件内部铰，`ratio` 为相对构件起点的位置比例。

荷载字段说明：构件分布荷载可用 `qStartKnPerM` / `qEndKnPerM` 表示线性强度，`startRatio` / `endRatio` 表示作用范围。构件集中荷载使用 `member_point`、`forceKn` 和 `positionRatio`。`loadCases` 与 `loadCombinations` 用于多工况与组合包络。

关键输出：

- `summary.maxDisplacementMm`：最大节点位移，单位 mm。
- `summary.maxMomentKnM`：最大构件弯矩，单位 kN·m。
- `nodeResults[].uxMm / uyMm / rzRad`：节点位移与转角。
- `memberResults[].axialStartKn / shearStartKn / momentStartKnM`：杆端内力。
- `equilibriumRmsRelativeError`：整体平衡残差指标。

### 二维平面桁架示例

```json
{
  "analysisType": "truss",
  "projectName": "三杆静定桁架",
  "materialId": "steel-verify",
  "structure": {
    "template": "explicit",
    "nodes": [
      {"id": "N1", "x": 0, "y": 0, "supportType": "pinned"},
      {"id": "N2", "x": 4, "y": 3, "supportType": "free"},
      {"id": "N3", "x": 8, "y": 0, "supportType": "roller"}
    ],
    "members": [
      {"id": "M1", "start": "N1", "end": "N2", "materialId": "steel-verify", "E_GPa": 200, "A_cm2": 100, "kind": "truss"},
      {"id": "M2", "start": "N2", "end": "N3", "materialId": "steel-verify", "E_GPa": 200, "A_cm2": 100, "kind": "truss"},
      {"id": "M3", "start": "N1", "end": "N3", "materialId": "steel-verify", "E_GPa": 200, "A_cm2": 100, "kind": "truss"}
    ],
    "loads": [
      {"type": "nodal", "node": "N2", "fxKn": 50, "fyKn": 0}
    ]
  }
}
```

节点字段说明：平面桁架节点仅含 `ux`、`uy` 平动自由度；`supportType` 使用 `pinned`、`roller`、`free`，不支持 `supportAngleDeg`、`springs` 或 `condensedDofs`。旧版 `fixed` 输入会归并为 `pinned`，新模型应直接使用 `pinned`。

杆件字段说明：`members[].materialId` 为材料库编号，用于保留杆件材料语义；桁架刚度计算仍以 `E_GPa` 与 `A_cm2` 为准。

荷载字段说明：桁架以节点荷载为主，也支持可等效为节点荷载的杆件荷载。`selfWeightKnPerM` 表示杆件自重线荷载，按全局 Y 向下等效；`distributed` / `member_load` / `member` 可使用 `direction`、`wyKnPerM`、`qStartKnPerM`、`qEndKnPerM` 描述杆件线荷载。`loadCases` 与 `loadCombinations` 支持多工况与组合包络。

关键输出：

- `summary.maxDisplacementMm`：最大节点位移，单位 mm。
- `summary.maxAxialForceKn`：最大杆件轴力绝对值，单位 kN。
- `memberResults[].axialForceKn`：杆件轴力，拉为正、压为负。
- `memberResults[].forceState`：`tension` 或 `compression`。
- `nodeResults[].rxKn / ryKn`：支座反力。

## POST /api/preview

与 `/api/calculate` 使用同一输入契约，返回 `operation: "preview"`。适用于前端实时预览、Agent 预检和模型导入后的结构图校验。

## POST /api/sensitivity

执行单因素参数敏感性分析。该接口已覆盖梁系、二维平面框架和二维平面桁架，用于教学演示、趋势解释和方案比选；不用于基础求解以外的校核、设计或工程签审。

输入为任一求解 payload，附加：

```json
{
  "config": {
    "range": 20,
    "steps": 10,
    "responseMetric": "max_deflection"
  }
}
```

梁系响应指标：

- `max_deflection`：最大挠度。
- `max_moment`：最大弯矩。
- `max_shear`：最大剪力。

框架响应指标：

- `max_ux`：最大水平位移。
- `max_uy`：最大竖向位移。
- `max_member_moment`：最大构件弯矩。

桁架响应指标：

- `max_node_displacement`：最大节点位移。
- `max_member_axial`：最大杆件轴力。
- `max_member_stress`：最大杆件轴应力。

边界：

- 仅执行单因素扰动，不做多参数联合扰动。
- 框架不做逐构件、逐楼层或逐组合复杂敏感性分析。
- 桁架不做拓扑变化、构件增删或可靠度分析。
- `0%` 扰动点应与基础求解链路一致。

## POST /api/export

导出 WORD 或 XLSX 计算书。输入为任一求解 payload，附加：

```json
{
  "format": "docx",
  "sensitivityResults": {},
  "reportImages": {},
  "reportOptions": {},
  "benchmark": {
    "caseId": "beam-simply-supported-uniform",
    "sourceLabel": "教材解析解",
    "expectedSummary": "标准值：最大挠度 7.624943 mm",
    "toleranceSummary": "容许误差：最大挠度 0.001 mm"
  }
}
```

字段说明：

- `format`：`docx` 或 `xlsx`，默认 `xlsx`。
- `sensitivityResults`：可选敏感性分析结果，仅作为计算书附录资料写入。
- `reportImages`：可选结构图、变形图、内力图等图片资源。平面框架和平面桁架 DOCX 仅使用前端同源结构预览和模型叠加工程图，必需 key 由 `shared/report-figures.json` 约束；缺失时跳过对应插图，不插入后端简化兜底图。
- `reportOptions`：可选计算书图形范围与排版配置。
- `benchmark`：可选验证来源元数据；公开案例导出的计算书会写入 `caseId`、标准值和容许误差。

导出结果是二进制文件；导出计算书展示求解证据、平衡校核、验证集覆盖说明和适用边界，不构成工程签审结论。

图形导出回归入口：`npm --prefix frontend run test:visual:export-docx`。该入口按 Chromium / Firefox / WebKit 顺序验证框架与桁架 DOCX 请求携带前端同源 PNG。

## POST /api/jobs

提交本地轻量异步作业，适合本机批量计算、Agent 自动调用和避免同步请求阻塞。当前开源实现不是生产级分布式任务队列：计算在当前服务进程的 `ThreadPoolExecutor` 中执行，状态和结果默认写入本地 SQLite；多容器、多主机、高吞吐或需要幂等重试的部署，应接入共享数据库、Redis 或专用任务队列。

```json
{
  "operation": "calculate",
  "clientJobId": "optional-trace-id",
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

成功返回：

- HTTP 状态：`202 Accepted`
- `Location: /api/jobs/{jobId}`
- `Retry-After: 1`

## GET /api/jobs/{jobId}

查询异步作业状态。

状态枚举：

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`

## GET /api/jobs/{jobId}/result

获取异步作业结果。若作业尚未完成，返回 `202` 并给出当前状态；若失败或取消，返回错误状态。

## DELETE /api/jobs/{jobId}

请求取消排队或运行中的作业。当前开源实现只跟踪当前服务进程内的 `ThreadPoolExecutor` future，并用本地 SQLite 记录作业状态和结果；同一容器内多 Gunicorn worker 可共享提交、轮询和结果读取状态，但执行调度仍不是跨进程、跨容器的分布式队列。已开始执行的短任务可能在取消请求前完成。

## GET /api/contracts/schemas

返回当前开放 Schema Registry。核心 Schema：

- `asms-model`
- `asms-beam-model`
- `asms-frame-model`
- `asms-truss-model`
- `calculate-payload`
- `job-request`
- `capability-result`
- `calculate-tool-input`
- `sensitivity-tool-input`
- `benchmark-case-run-input`
- `benchmark-submission-input`
- `benchmark-submission-response`
- `benchmark-submission-package`
- `benchmark-submission-package-response`

Schema 内的 `$id` 采用 `https://solver.archsight.cn/schemas/*.schema.json` 作为稳定标识 URI。它首先用于声明契约来源、版本化缓存和外部校验器识别；当前后端运行时按本地 Registry 返回 schema，不会因为 `$id` 自动请求该公网地址。若后续上线静态 schema 文档，可让这些 URI 真实可访问，但不应频繁更换。

## GET /api/contracts/schemas/{schemaId}

返回指定 JSON Schema。示例：

```http
GET /api/contracts/schemas/asms-frame-model
```

## GET /api/contracts/openapi

返回由当前 JSON Schema Registry 组装的 OpenAPI 3.1 文档，覆盖同步求解、预览、敏感性分析、异步作业、计算书导出、公开案例、benchmark 投稿校验、投稿包生成和契约端点。敏感性分析、计算书导出、benchmark 投稿和 Schema Registry 使用端点专属 schema，避免把附加字段折叠成通用求解 payload。该文档用于系统集成、SDK 生成和接口审阅；字段语义仍以 ASMS-JSON 和对应 schema 为准。

## GET /api/examples/projects

返回由公开验证集生成的可导入工程案例。每个工程按分析对象类型组织，内部对象与 `backend/benchmarks/benchmark_cases.json` 的 `caseId` 一一对应。

当前返回三个工程：

- `beam-public-validation`：梁系公开验证工程，12 个梁系算例。
- `frame-public-validation`：二维平面框架公开验证工程，13 个框架与框架梁退化算例。
- `truss-public-validation`：二维平面桁架公开验证工程，8 个桁架算例。

```http
GET /api/examples/projects
```

关键字段：

- `caseCount`：公开验证集总算例数量。
- `projects[].project`：可直接被前端工作台导入的工程对象。
- `projects[].project.objects[].benchmark`：该分析对象对应的验证元数据，包含 `caseId`、来源类型、参考说明、校核指标、标准值和容许误差。
- `sourceLinks`：可用公开出处链接；内部回归算例可能没有外部链接，应按来源类型如实展示。

## POST /api/benchmark-submissions

提交公开验证算例草案并执行投稿前自动校验。该接口面向云端服务、第三方教学平台和开源贡献流程，必须同时提供计算参数、标准结果值、容许误差和验证来源。

```json
{
  "case": {
    "id": "beam-example-from-contributor",
    "category": "beam",
    "title": "投稿简支梁均布荷载算例",
    "purpose": "复核单跨简支梁均布荷载最大挠度。",
    "payload": {
      "analysisType": "beam",
      "beamType": "simply_supported",
      "loadType": "uniform",
      "spans": [6],
      "q": 12,
      "E": 206,
      "I": 85000
    },
    "expected": {
      "supportCount": 2,
      "maxDeflectionMm": 7.624943,
      "maxDeflectionXM": 3
    },
    "tolerances": {
      "maxDeflectionMm": 0.001,
      "maxDeflectionXM": 0.01
    },
    "verification": {
      "sourceType": "textbook-analytical",
      "reference": "结构力学教材简支梁均布荷载公式",
      "method": "按 5qL^4/(384EI) 独立计算最大挠度。",
      "checkedMetrics": ["最大挠度", "峰值位置", "支座数量"]
    }
  }
}
```

成功响应：

- `evaluation.passed`：标准值与当前求解结果是否在容许误差内。
- `reviewStatus`：`ready_for_review` 或 `needs_correction`。
- `persisted`：当前固定为 `false`，表示服务端只做投稿前校验，不直接入库。
- `caseDraft`：可用于 PR / Issue 附件的标准化算例草案。

桁架投稿的主校核指标必须保持桁架口径：节点位移、杆件轴力、杆件轴应力和支座反力。接口会拒绝把弯矩或剪力作为桁架 benchmark 主指标。

## POST /api/benchmark-submission-packages

生成离线短文件名 JSON 投稿包，例如 `beam-20260528-7390b0c8.json`。请求体与 `POST /api/benchmark-submissions` 相同；接口会先执行自动预检，再把完整算例、贡献者信息和预检结果封装为单文件 JSON。该接口仍不做服务端持久化；前端会在下载后提供 GitHub Issue 与官方邮箱 `archsight-labs@qq.com` 两种正式提交通道。

成功响应关键字段：

- `filename`：建议下载文件名。
- `package.format`：固定为 `archsight-benchmark-submission`。
- `package.case`：可由维护者复核并合并的标准化算例。
- `package.precheck`：自动预检结果，包含 `submissionId`、`reviewStatus`、`checks` 和 `persisted=false`。

维护者收到 JSON 后可本地查看或合并：

```powershell
python -m backend.benchmarks.review_submission path/to/benchmark-submission.json
python -m backend.benchmarks.review_submission path/to/benchmark-submission.json --append
```

投稿者推荐提交方式：

- GitHub Issue：使用仓库的“公开验证算例投稿”模板，上传或粘贴前端生成的 JSON 投稿包，适合公开来源和公开追踪审核状态的算例。
- 官方邮箱：发送至 `archsight-labs@qq.com`，邮件主题建议包含 `submissionId`，并手动附上 JSON 投稿包，适合不便公开验证来源或不熟悉 GitHub 的投稿者。

## Capability CLI

通用本地工具入口：

```powershell
'{"payload":{"analysisType":"beam","beamType":"simply_supported","loadType":"uniform","spans":[6],"q":12,"E":206,"I":85000}}' |
  python -m backend.capabilities.solver_cli calculate --pretty
```

执行公开验证集算例：

```powershell
'{"caseId":"BM-001"}' | python -m backend.capabilities.solver_cli benchmark_case_run --pretty
```

## MCP Server

启动：

```powershell
python -m backend.capabilities.mcp_server
```

Tools：

- `beam_deflection`
- `beam_deflection_serviceability_check`
- `frame_displacement`
- `truss_member_force`
- `calculate`
- `sensitivity_analysis`
- `benchmark_case_list`
- `benchmark_case_run`

Resources：

- `archsight://schemas`
- `archsight://docs/asms-json`
- `archsight://examples/asms-few-shots`
- `archsight://benchmark/catalog`
- `archsight://docs/benchmark-validation`
- `archsight://docs/mcp-resources`

Prompts：

- `solver-capability-call`
- `benchmark-validation-review`

## 错误码策略

- `COMMON_INVALID_REQUEST`：通用请求错误。
- `COMMON_UNSUPPORTED_ANALYSIS_TYPE`：不支持的分析对象。
- `COMMON_INVALID_SENSITIVITY_CONFIG`：敏感性分析配置错误。
- `COMMON_UNSUPPORTED_ASYNC_OPERATION`：不支持的异步作业类型。
- `COMMON_JOB_NOT_FOUND`：异步作业不存在。
- `COMMON_SCHEMA_NOT_FOUND`：Schema 不存在。
- `BENCHMARK_SUBMISSION_INVALID`：公开验证算例投稿草案不满足必填字段、力学口径或自动校验入口要求。
- `BEAM_INVALID_REQUEST`：梁系输入错误。
- `FRAME_INVALID_REQUEST`：框架输入错误。
- `TRUSS_INVALID_REQUEST`：桁架输入错误。

## 生产化注意事项

- 当前异步作业是本地轻量队列：状态默认写入本地 SQLite，可覆盖 `ARCHSIGHT_SOLVER_JOB_DB_PATH`；执行由当前服务进程的 `ThreadPoolExecutor` 承担。多容器、多主机或高吞吐企业部署应迁移到共享数据库 / Redis / 专用任务队列。
- 当前开源核心不内置认证；私有部署应由网关或宿主平台提供身份、权限和审计。
- Agent 调用必须保留输入、Schema 版本、工具版本和 benchmark 证据，不得把 LLM 估算值包装成求解器结果。
