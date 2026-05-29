# Benchmark 目录说明

`benchmark_cases.json` 是公开验证集的机器事实源，不是优先面向人工通读的文档。它同时服务后端回归测试、公开验证报告、公开案例工程、CLI、MCP tools 和计算书验证说明，因此会比普通示例文件更长。

人工理解算例时，建议按下面顺序阅读：

1. 先看 `id`、`category`、`title`、`purpose`，确认算例验证什么结构体系和工程问题。
2. 再看 `verification`，确认参考来源、复核方法和被校核指标。
3. 再看 `expected` 与 `tolerances`，确认标准值和容许误差。
4. 最后看 `payload`，确认完整输入模型。框架和桁架的节点、构件、荷载数组通常最长，应放到最后看。

## 文件角色

| 文件 | 用途 |
|---|---|
| `benchmark_cases.json` | 公开验证集目录，保存算例输入、标准值、误差阈值和验证来源。 |
| `catalog.py` | 读取和筛选 benchmark catalog。 |
| `catalog_summary.py` | 生成 `docs/verification/benchmark-catalog-summary.md`，供人工快速阅读算例目录和模板映射。 |
| `runner.py` | 执行单个或全部 benchmark，并将实际结果与标准值比较。 |
| `report.py` | 生成 `docs/verification/benchmark-validation-report.md`。 |
| `submissions.py` | 校验外部投稿算例，确认模型、标准值、容许误差和验证来源齐全。 |
| `review_submission.py` | 维护者离线查看投稿 JSON，并在复核通过后可选合并到 `benchmark_cases.json`。 |
| `docs/verification/benchmark-validation-report.md` | 面向用户和贡献者的公开验证结果摘要。 |
| `docs/verification/benchmark-catalog-summary.md` | 面向人工评审的算例目录摘要，包含模板到 benchmark 的对应关系。 |

## 算例结构

每个 `cases[]` 条目都使用同一层级：

| 字段 | 含义 | 阅读重点 |
|---|---|---|
| `id` | 稳定算例编号，供测试、CLI、MCP 和公开案例引用。 | 不应随意改名。 |
| `category` | 算例类型：`beam`、`frame`、`truss`、`frame-beam-verify`、`truss-verify`。 | 决定 runner 使用哪类结果提取逻辑。 |
| `title` | 中文算例名称。 | 用于报告和公开案例展示。 |
| `purpose` | 该算例要验证的工程含义。 | 应写清结构体系、荷载或边界条件。 |
| `payload` | 送入求解器的完整输入。 | 梁系较短，框架/桁架会包含节点、构件和荷载数组。 |
| `expected` | 标准结果。 | 只放真正参与回归判断的关键指标。 |
| `tolerances` | 数值容许误差。 | 与 `expected` 的数值指标同名。 |
| `verification` | 参考来源、复核方法、校核指标。 | 用于说明可信度和专业边界。 |

## 三类主要 payload

### 梁系

梁系 payload 通常直接包含梁型、荷载、材料、截面惯性矩和跨长：

```json
{
  "beamType": "simply_supported",
  "loadType": "uniform",
  "q": 12,
  "E": 206,
  "I": 85000,
  "spans": [6]
}
```

### 二维平面框架

框架 payload 使用 `analysisType: "frame"`，主体在 `structure.nodes`、`structure.members`、`structure.loads` 中。框架构件可输出节点位移、支座反力、杆端轴力/剪力/弯矩和构件控制值。

阅读框架算例时，优先确认：

- 节点坐标和支座类型是否构成稳定体系。
- 构件 `start` / `end` 是否引用真实节点。
- 构件荷载方向、节点荷载和单位是否符合算例目的。
- `expected` 是否只选取关键回归指标，例如最大节点位移、最大构件弯矩、节点数量和构件数量。

### 二维平面桁架

桁架 payload 使用 `analysisType: "truss"`，同样由节点、杆件和荷载组成。桁架主指标是节点位移、杆件轴力、杆件轴应力和支座反力，不把弯矩作为主指标。

阅读桁架算例时，优先确认：

- 支座约束是否足以消除刚体位移。
- 杆件只传递轴力，不能按框架梁柱构件理解。
- 荷载应优先使用节点荷载；杆件自重会作为特定回归能力处理。
- `expected.maxAxialForceKn` 和控制杆件是否与算例目的匹配。

## 新增算例流程

1. 先确认新增算例服务当前三类核心模块，不引入三维、动力、稳定、非线性或规范设计能力。
2. 从同类型现有算例复制一个最接近的条目，修改 `id`、`title`、`purpose` 和 `payload`。
3. 运行求解器得到候选结果，并只把关键回归指标写入 `expected`。
4. 为每个数值指标设置明确 `tolerances`，避免用过宽阈值掩盖计算错误。
5. 补齐 `verification.sourceType`、`reference`、`method` 和 `checkedMetrics`。
6. 运行测试和报告生成：

```powershell
python -m pytest backend/tests/test_benchmark_contracts.py backend/tests/test_benchmark_cases.py backend/tests/test_benchmark_runner.py -q
python -m backend.benchmarks.report --output docs/verification/benchmark-validation-report.md
python -m backend.benchmarks.catalog_summary --output docs/verification/benchmark-catalog-summary.md
```

## 云端投稿校验

部署服务后，外部贡献者可以通过 `POST /api/benchmark-submissions` 提交算例草案。请求必须包含：

- `case.payload`：完整 ASMS-JSON 求解输入。
- `case.expected`：参与回归判断的标准结果值。
- `case.tolerances`：与标准值对应的容许误差。
- `case.verification`：验证来源、复核方法和校核指标。

接口会立即执行求解并对比 `expected` / `tolerances`。响应中的 `persisted` 当前固定为 `false`，表示该接口只做投稿前自动校验，不替代 PR / Issue 的人工复核。桁架投稿会拒绝把弯矩或剪力作为主校核指标。

面向非 GitHub 用户的默认路径是离线投稿包：前端顶部“验证投稿”表单会调用 `POST /api/benchmark-submission-packages`，下载单个短文件名 JSON，例如 `beam-20260528-7390b0c8.json`。该 JSON 包含完整算例、贡献者信息和自动预检结果，但仍不会写入服务器。

维护者收到 JSON 后先查看：

```powershell
python -m backend.benchmarks.review_submission path/to/benchmark-submission.json
```

确认来源、标准值和容许误差合适后，再显式合并：

```powershell
python -m backend.benchmarks.review_submission path/to/benchmark-submission.json --append
```

## 常见误读

- `benchmark_cases.json` 不是用户手册；用户优先看公开验证报告和公开案例入口。
- `payload` 是完整求解输入，不是精简示意图；长数组是为了保证回归可复现。
- `internal-regression` 只能说明内部回归稳定，不等同于教材解析解或第三方软件对标。
- `expected` 不需要覆盖所有输出字段，只需要覆盖能证明该算例目的的关键指标。
- 框架和桁架虽然都使用节点-构件模型，但力学假定不同；桁架不得引入弯矩主指标。
