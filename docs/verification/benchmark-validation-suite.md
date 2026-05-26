# 公开验证集建设说明

## 目标

公开验证集用于回答一个商业化过程中的核心质疑：ArchSight Solver 的结构计算结果是否可复核、可回归、可解释。

当前策略是先建立三层证据：

1. 教材解析解：简支梁、悬臂梁、超静定单跨梁、静定桁架等可手算工况。
2. 独立刚度法基线：门式刚架、双跨框架、Pratt 屋架等二维杆系模型。
3. 后续工程软件对标：保留接口，未来引入 Midas / SAP2000 / OpenSees 等外部结果文件，但不得提交第三方专有模型或源码。

## 已落地内容

- 基准目录：`backend/benchmarks/benchmark_cases.json`
- 数值回归：`backend/tests/test_benchmark_cases.py`
- 元数据契约：`backend/tests/test_benchmark_contracts.py`
- 可复用运行器：`backend/benchmarks/runner.py`
- 报告生成：`backend/benchmarks/report.py`
- MCP 工具：`benchmark_case_list`、`benchmark_case_run`

## 公开来源筛选原则

- 优先选公开课程材料、开放教材、通用公式表和可自行推导的经典力学工况。
- 不复制商业教材长篇内容；只记录公式来源、工况参数、标准值和误差阈值。
- 对无法公开引用的商业软件对标结果，只能记录软件版本、单元类型和模型条件，不能把专有文件放进仓库。

已查阅的公开资料包括：

- Purdue ME 323 梁挠度公式材料：`https://www.purdue.edu/freeform/me323/wp-content/uploads/sites/2/2018/03/equations.pdf`
- Purdue ME 323 简支梁/悬臂梁积分与叠加法作业材料：`https://www.purdue.edu/freeform/me323/wp-content/uploads/sites/2/2018/10/ME323_F18_Hw7_final.pdf`
- Engineering LibreTexts 梁位移章节：`https://eng.libretexts.org/Bookshelves/Mechanical_Engineering/Mechanics_of_Materials_%28Roylance%29/04%3A_Bending/4.03%3A_Beam_Displacements`
- Deflection engineering 公开公式索引：`https://en.wikipedia.org/wiki/Deflection_(engineering)`

## 当前算例族

| 算例族 | 覆盖内容 | 可信度用途 |
|---|---|---|
| 梁系解析解 | 简支梁均布荷载、简支梁跨中集中荷载、悬臂梁均布荷载、悬臂梁端部集中荷载 | 验证单位换算、边界条件、挠度峰值 |
| 框架梁解析解 | 简支梁跨中集中荷载、固端-滚动支座均布荷载 | 验证框架梁柱单元可退化为经典梁问题 |
| 平面桁架解析解 | 三杆静定桁架 | 验证节点平衡、杆件轴力、支座反力和拉压状态 |
| 独立刚度法基线 | 门式刚架、转动弹簧门式刚架、双跨框架、屋架 | 验证更接近工程建模的矩阵装配行为 |

## 销售材料口径

建议对外表述：

> ArchSight Solver 的公开核心计算链路已接入 CI 回归验证。当前验证集覆盖梁系、二维平面框架、二维平面桁架等典型工况，并对教材解析解与独立刚度法基线执行自动对标。每次代码变更都会重新校验最大挠度、构件弯矩、节点位移、杆件轴力和支座反力等专业指标。

禁止对外表述：

- “已通过全部结构设计规范”
- “可替代注册结构工程师签审”
- “与所有商业软件结果完全一致”

## 扩展路线

下一阶段按优先级补充：

1. 梁系增加偏心集中荷载、局部均布荷载、多跨连续梁三弯矩方程算例。
2. 桁架增加 Warren、Howe、K 型支撑等可手算或可独立校验模型。
3. 框架增加侧移刚架、节点转角控制和多荷载组合模型。
4. 为每个商业软件对标算例增加导出报告截图、单位制、单元类型和版本记录。
