# ArchSight Structural Model Schema (ASMS-JSON)

## 定位

ASMS-JSON 是 ArchSight Solver 对外开放的结构力学数据协议，用 JSON 描述梁系、二维平面框架和二维平面桁架模型。

它不是为了替代 IFC、SAF、OpenSees Tcl 或商业结构软件模型文件，而是服务于更轻量的工程计算场景：

- Web 前端建模。
- AI Agent 生成确定性求解输入。
- 企业内系统调用结构校核服务。
- 教材算例、benchmark 和计算书复核。

战略上，ASMS-JSON 应成为本项目的“力学数据入口标准”：前端、API、CLI、MCP、benchmark 和导出计算书都围绕同一套结构化模型工作。

## 协议入口与同源执行面

ASMS-JSON 的公开价值在于把“模型是什么”和“从哪里调用”分离。结构模型由 ASMS-JSON 表达，调用入口可以是 Web 前端、REST API、CLI、MCP、benchmark 或计算书导出，但它们不应各自发明一套 payload。

最小闭环：

```text
自然语言工况
  -> ASMS-JSON 结构模型
  -> REST / CLI / MCP 同源求解
  -> benchmark 回归复核
  -> WORD / XLSX 计算书归档
```

核心分工：

- **ASMS-JSON 是入口**：描述结构类型、几何、材料截面、支座、荷载和输出指标。
- **JSON Schema 是契约**：通过 `/api/contracts/schemas/asms-model` 及子 schema 约束字段、单位和基础类型。
- **benchmark 是证据**：公开验证集使用同源 payload 复核求解链路，不把示例和测试割裂。
- **REST / CLI / MCP 是执行面**：`POST /api/calculate` 直接接收 ASMS-JSON；CLI 和 MCP 为工具调用稳定性使用 `{ "payload": <ASMS-JSON> }` 包装。

因此，本文件是 ASMS-JSON 的权威协议说明，负责字段语义、单位、结构体系差异、版本策略和协议级错误；Agent 如何从自然语言生成 payload、如何调用工具和如何归档结果，放在 `docs/agent-engineering-workflow.md` 中说明。

## 版本策略

- 当前协议名：`ASMS-JSON`
- 当前版本：`0.1`
- Schema Registry：`GET /api/contracts/schemas`
- 总入口：`GET /api/contracts/schemas/asms-model`

后续破坏性修改应提升协议版本，兼容性扩展优先通过新增字段实现。

## 统一单位

| 物理量 | 字段 | 单位 |
|---|---|---|
| 坐标、跨度、荷载位置 | `x`、`y`、`spans`、`pointLoadPositionM` | m |
| 弹性模量 | `E`、`E_GPa` | GPa |
| 截面惯性矩 | `I`、`I_cm4` | cm^4 |
| 截面面积 | `A_cm2` | cm^2 |
| 集中力 | `fxKn`、`fyKn`、`pointLoadKn`、`forceKn` | kN |
| 均布荷载 | `q`、`wyKnPerM`、`qStartKnPerM`、`qEndKnPerM` | kN/m |
| 弯矩 | `mzKnM` | kN·m |

约定：

- 框架与桁架节点力：`fxKn` 向右为正，`fyKn` 向上为正。
- 桁架杆件轴力：拉为正，压为负。
- 梁系 `q` 兼容当前 UI 习惯，正值表示向下均布荷载。

## 梁系模型

Schema：`asms-beam-model`

最小输入：

```json
{
  "analysisType": "beam",
  "beamType": "simply_supported",
  "loadType": "uniform",
  "spans": [6],
  "E": 206,
  "I": 85000,
  "q": 12
}
```

字段说明：

- `beamType`：`continuous`、`simply_supported`、`cantilever`。
- `loadType`：`uniform`、`point`、`linear`。
- `spans`：跨长数组，单位 m。
- `spanProperties`：逐跨材料与截面参数，优先级高于全局 `E` / `I`。
- `supports`：自定义支座数组，用于连续梁或非标准边界。
- `loads`：叠加荷载数组，用于多荷载工况。

集中荷载示例：

```json
{
  "analysisType": "beam",
  "beamType": "cantilever",
  "loadType": "point",
  "spans": [4],
  "E": 200,
  "I": 16000,
  "pointLoadKn": 40,
  "pointLoadPositionM": 4
}
```

## 二维平面框架模型

Schema：`asms-frame-model`

框架模型由节点、构件和荷载组成。

```json
{
  "analysisType": "frame",
  "projectName": "门式刚架",
  "structure": {
    "template": "explicit",
    "nodes": [
      {"id": "N1", "x": 0, "y": 0, "supportType": "fixed"},
      {"id": "N2", "x": 6, "y": 0, "supportType": "fixed"},
      {"id": "N3", "x": 0, "y": 4, "supportType": "free"},
      {"id": "N4", "x": 6, "y": 4, "supportType": "free"}
    ],
    "members": [
      {"id": "C1", "start": "N1", "end": "N3", "E_GPa": 210, "A_cm2": 240, "I_cm4": 12000, "kind": "column"},
      {"id": "B1", "start": "N3", "end": "N4", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
      {"id": "C2", "start": "N2", "end": "N4", "E_GPa": 210, "A_cm2": 240, "I_cm4": 12000, "kind": "column"}
    ],
    "loads": [
      {"type": "distributed", "member": "B1", "direction": "local_y", "qStartKnPerM": -18, "qEndKnPerM": -18},
      {"type": "nodal", "node": "N4", "fxKn": 24, "fyKn": 0, "mzKnM": 0}
    ]
  }
}
```

节点：

- `id`：节点唯一编号。
- `x` / `y`：平面坐标，单位 m。
- `supportType`：`free`、`pinned`、`roller`、`fixed`。
- `springs`：节点弹簧，可表达柱脚转动弹簧等边界。

构件：

- `start` / `end`：起止节点 ID。
- `E_GPa`、`A_cm2`、`I_cm4`：材料与截面参数。
- `kind`：工程语义标签，如 `beam`、`column`。

荷载：

- `nodal`：节点荷载。
- `distributed`：构件分布荷载。
- `member_point`：构件集中荷载。

## 二维平面桁架模型

Schema：`asms-truss-model`

```json
{
  "analysisType": "truss",
  "projectName": "三杆静定桁架",
  "structure": {
    "template": "explicit",
    "nodes": [
      {"id": "N1", "x": 0, "y": 0, "supportType": "pinned"},
      {"id": "N2", "x": 4, "y": 3, "supportType": "free"},
      {"id": "N3", "x": 8, "y": 0, "supportType": "roller"}
    ],
    "members": [
      {"id": "M1", "start": "N1", "end": "N2", "E_GPa": 200, "A_cm2": 100, "kind": "truss"},
      {"id": "M2", "start": "N2", "end": "N3", "E_GPa": 200, "A_cm2": 100, "kind": "truss"},
      {"id": "M3", "start": "N1", "end": "N3", "E_GPa": 200, "A_cm2": 100, "kind": "truss"}
    ],
    "loads": [
      {"type": "nodal", "node": "N2", "fxKn": 50, "fyKn": 0}
    ]
  }
}
```

桁架协议约束：

- 杆件只承受轴力，不输出弯矩主指标。
- 荷载当前以节点荷载为主；自重和等效节点荷载应在预处理层显式转换。
- 支座不足、零长度杆件、重复 ID、无效节点引用都属于协议级错误。

## Benchmark 与协议绑定

公开验证集使用同一套 ASMS-JSON：

- `backend/benchmarks/benchmark_cases.json`
- `backend/tests/test_benchmark_cases.py`
- `backend/benchmarks/report.py`

这意味着每个公开算例既是测试用例，也是协议样例。新增协议字段时，应优先新增一个 benchmark 覆盖其工程含义。

## Agent few-shot 样例

Agent 工程流样例同样使用 ASMS-JSON：

- 文档：`docs/agent-engineering-workflow.md`
- 数据：`data/agent_workflows/asms_few_shots.json`
- MCP 资源：`archsight://examples/asms-few-shots`
- 回归：`backend/tests/test_agent_workflow_examples.py`

这些样例把自然语言工况、ASMS-JSON、CLI/MCP 调用、公开验证集复核和计算书导出放在同一个可测试闭环中。它们是 Agent 生成模型输入的 few-shot 资料，不是规范设计书，也不替代工程师签审。

## 生态策略

ASMS-JSON 的开放价值不在于“锁死用户”，而在于降低生态接入成本：

- 前端、Agent、BIM/ERP 插件、教学脚本都能生成同一种结构模型。
- 下游报告、验证集、MCP 工具和企业 API 能复用同一 payload。
- 一旦形成稳定样例库，外部贡献者可以先贡献数据协议与 benchmark，再贡献求解器实现。

这比只开源 UI 或单个 Python 函数更有战略价值：数据协议会逐步沉淀为事实上的工程协作边界。
