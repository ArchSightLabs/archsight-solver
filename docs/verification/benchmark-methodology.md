# Benchmark 方法论

本文说明 ArchSight Solver 公开验证集的建设口径。自动生成的当前报告见 [公开验证集报告](benchmark-validation-report.md)，人工阅读目录见 [Benchmark 算例目录摘要](benchmark-catalog-summary.md)。

## 目标

公开验证集用于回答三个问题：

1. 结构计算结果是否可复核。
2. 新增功能是否破坏既有算例。
3. 用户和贡献者能否理解每个标准值来自哪里。

验证集不是工程签审，也不等于“通过所有结构设计规范”。它服务于线弹性静力分析的数值可信度、契约稳定性和回归测试。

## 验证证据分层

| 等级 | 来源 | 用途 |
|---|---|---|
| A | 教材解析解或标准公式 | 校验基本公式、单位换算、边界条件和符号约定 |
| B | 独立刚度法基线或独立矩阵法算例 | 校验框架、桁架和连续梁的刚度装配行为 |
| C | 版本明确的工程软件对标 | 记录软件、版本、单元类型、单位制和建模假定后用于第三方结果对照 |
| D | 内部回归基线 | 防止后续迭代引入结果漂移，不作为外部专业背书 |

每个 benchmark 的 `verification` 元数据会暴露机器可读的 `verificationLevel`、`verificationLevelLabel` 和 `verificationLevelDescription`。内部回归基线不能包装成外部独立验证。文档和计算书应区分“解析解”“独立基线”“工程软件对标”和“内部回归”。

## 仓库内独立基线

B 级算例必须能在不调用生产求解链路的前提下复跑。仓库提供
`backend.benchmarks.independent_stiffness`，直接从 benchmark payload 读取节点、
构件、支座和荷载，使用标准二维框架或桁架刚度矩阵与 NumPy 线性求解复算结果。
该模块不导入生产 `normalizer`、`assembler`、`solver`、`recover` 或
`presenter`，用于发现生产装配、约束和结果恢复与独立公式实现之间的漂移。

当前参考实现覆盖现有 B 级算例需要的节点荷载、`local_y` / `global_y` 全构件
线性分布荷载、固定/铰接/滚动支座、`rz` 转动弹簧，以及按轴向刚度参与整体
装配的 `brace` 构件。超出该范围的荷载或约束会明确拒绝，不能静默降级为 B 级
证据。

```powershell
python -m backend.benchmarks.independent_stiffness
```

## 当前覆盖

公开验证集覆盖：

- 梁系：简支梁、悬臂梁、连续梁、均布荷载、集中荷载。
- 二维平面桁架：Pratt、Warren、Howe、悬挑桁架、杆件自重等效节点荷载。
- 二维平面框架：门式刚架、框架梁退化验证、构件荷载、弹性支座和典型节点位移。

当前算例数量和通过状态以自动生成的 [公开验证集报告](benchmark-validation-report.md) 为准。

## 算例记录要求

新增 benchmark 应记录：

- `caseId`：稳定唯一标识。
- 结构类型：梁系、平面桁架、平面框架或框架梁退化验证。
- 模型输入：完整可运行 payload。
- 验证来源：解析公式、独立刚度法、内部回归或外部公开资料。
- 验证等级：A / B / C / D，与验证来源保持一致。
- 标准值：只记录关键回归指标。
- 容许误差：按指标单位给出明确阈值。
- 校核指标：例如最大挠度、最大构件弯矩、最大节点位移、最大杆件轴力、支座反力。
- 适用边界：说明该算例验证什么，不验证什么。

## 指标选择原则

不同结构体系必须使用正确的主指标：

| 结构体系 | 推荐主指标 | 不应作为主指标 |
|---|---|---|
| 梁系 | 最大挠度、最大弯矩、最大剪力、支座反力 | 杆件轴应力 |
| 平面桁架 | 节点位移、杆件轴力、杆件轴应力、支座反力 | 弯矩、剪力 |
| 平面框架 | 最大节点位移、最大构件弯矩、杆端内力、支座反力 | 把所有构件简化为只看轴力 |

桁架 benchmark 会拒绝把弯矩或剪力作为主校核指标。

## 运行方式

常用验证命令：

```bash
python -m backend.benchmarks.independent_stiffness
python -m pytest backend/tests/test_benchmark_cases.py backend/tests/test_benchmark_runner.py -q
python -m backend.benchmarks.report --output docs/verification/benchmark-validation-report.md
python -m backend.benchmarks.catalog_summary --output docs/verification/benchmark-catalog-summary.md
```

也可以通过 REST API、CLI 或 MCP tools 读取和运行公开案例。具体接口见 [API 参考](../api-reference.md) 和 [MCP Resources 清单与生成口径](../mcp-resources.md)。

## 投稿前校验

新增公开算例建议先通过投稿校验：

- 使用前端“验证投稿”生成单文件 JSON。
- 或通过 `POST /api/benchmark-submissions` 执行投稿前校验。
- 校验通过后，通过 GitHub Issue 或官方邮箱提交给维护者复核。

维护者审核通过后，可使用仓库工具合并投稿包。

## 公开来源原则

- 优先使用公开课程材料、开放教材、通用公式表和可自行推导的经典工况。
- 不复制商业教材长篇内容，只记录公式来源、工况参数、标准值和误差阈值。
- 不提交第三方商业软件模型文件、专有规则库或非公开项目数据。
- 如果使用商业软件对标，只能记录软件版本、单元类型、单位制、模型条件和可公开的结果摘要。

## 禁止宣传口径

不得对外宣称：

- 已通过全部结构设计规范。
- 可替代注册结构工程师签审。
- 与所有商业软件结果完全一致。
- benchmark 覆盖了所有工程风险。

建议表述：

> ArchSight Solver 的公开核心计算链路接入 CI 回归验证。验证集覆盖梁系、二维平面桁架和二维平面框架的典型工况，并对解析解、独立刚度法基线和内部回归基线执行自动对标。
