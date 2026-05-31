# Benchmark 算例目录摘要

> 本文件由 `python -m backend.benchmarks.catalog_summary --output docs/verification/benchmark-catalog-summary.md` 生成。`backend/benchmarks/benchmark_cases.json` 仍是机器事实源。

- 算例目录版本：2026-05-28
- 算例总数：33
- 用途：帮助人工快速阅读算例目的、验证来源、关键指标、标准值和容许误差。

## 二维平面桁架

- 算例数量：7

| Case ID | 名称 | 目的 | 验证来源 | 校核指标 | 标准值 | 容许误差 |
|---|---|---|---|---|---|---|
| `truss-simple-roof` | 简单屋架 | 验证二维平面桁架求解、支座反力和轴力峰值。 | 独立刚度法基准 | 节点位移、杆件轴力、节点数量、杆件数量 | statusCode=PASS；nodeCount=4；memberCount=5；maxDisplacementMm=8.8209；maxAxialForceKn=133.3333；maxDisplacementNodeId=N2；maxAxialForceMemberId=M2 | maxDisplacementMm=0.01；maxAxialForceKn=0.01 |
| `truss-pratt-roof` | Pratt 型屋架 | 验证更接近工程高频场景的多节点屋架、上下弦杆、竖杆、斜腹杆及多节点竖向荷载回归。 | 独立刚度法基准 | 节点位移、杆件轴力、节点数量、杆件数量 | statusCode=PASS；nodeCount=7；memberCount=11；maxDisplacementMm=1.4957；maxAxialForceKn=60.0925；maxDisplacementNodeId=N6；maxAxialForceMemberId=T4 | maxDisplacementMm=0.01；maxAxialForceKn=0.01 |
| `truss-warren-roof` | Warren 型屋架 | 补充 Warren 桁架多斜腹杆回归，覆盖等距上下弦与多节点竖向荷载。 | 内部回归算例 | 节点位移、杆件轴力、节点数量、杆件数量 | statusCode=PASS；nodeCount=7；memberCount=11；maxDisplacementMm=1.6771；maxAxialForceKn=43.3333；maxDisplacementNodeId=N6；maxAxialForceMemberId=L2 | maxDisplacementMm=0.01；maxAxialForceKn=0.01 |
| `truss-pratt-bridge` | Pratt 桥式桁架 | 补充 Pratt 桥式桁架回归，覆盖竖杆、斜杆和多节点荷载。 | 内部回归算例 | 节点位移、杆件轴力、节点数量、杆件数量 | statusCode=PASS；nodeCount=8；memberCount=13；maxDisplacementMm=2.2411；maxAxialForceKn=50.9117；maxDisplacementNodeId=N7；maxAxialForceMemberId=D1 | maxDisplacementMm=0.01；maxAxialForceKn=0.01 |
| `truss-howe-roof` | Howe 型屋架 | 补充 Howe 桁架回归，覆盖与 Pratt 相反方向的腹杆布置。 | 内部回归算例 | 节点位移、杆件轴力、节点数量、杆件数量 | statusCode=PASS；nodeCount=7；memberCount=11；maxDisplacementMm=2.0265；maxAxialForceKn=52.1429；maxDisplacementNodeId=N6；maxAxialForceMemberId=B2 | maxDisplacementMm=0.01；maxAxialForceKn=0.01 |
| `truss-member-self-weight` | 桁架杆件自重等效节点荷载 | 覆盖桁架杆件自重荷载预处理为等效节点荷载的回归。 | 内部回归算例 | 节点位移、杆件轴力、节点数量、杆件数量 | statusCode=PASS；nodeCount=3；memberCount=3；maxDisplacementMm=0.2775；maxAxialForceKn=17.7421；maxDisplacementNodeId=N3；maxAxialForceMemberId=M1 | maxDisplacementMm=0.01；maxAxialForceKn=0.01 |
| `truss-cantilever-panel` | 悬挑平面桁架 | 补充悬挑桁架回归，覆盖双支座固定边界和端部竖向荷载。 | 内部回归算例 | 节点位移、杆件轴力、节点数量、杆件数量 | statusCode=PASS；nodeCount=6；memberCount=9；maxDisplacementMm=7.4314；maxAxialForceKn=133.3333；maxDisplacementNodeId=N5；maxAxialForceMemberId=L1 | maxDisplacementMm=0.01；maxAxialForceKn=0.01 |

## 二维平面框架

- 算例数量：7

| Case ID | 名称 | 目的 | 验证来源 | 校核指标 | 标准值 | 容许误差 |
|---|---|---|---|---|---|---|
| `frame-portal-benchmark` | 门式刚架标准算例 | 验证二维平面框架刚度法、节点输出和整体位移控制。 | 独立刚度法基准 | 最大节点位移、构件弯矩、节点数量、构件数量 | maxDisplacementMm=3.8141；maxMomentKnM=58.1043；statusCode=PASS；nodeCount=4；memberCount=3 | maxDisplacementMm=0.01；maxMomentKnM=0.01 |
| `frame-portal-rotational-spring` | 转动弹簧门式刚架 | 验证柱脚转动弹簧刚度进入框架整体刚度矩阵，并对最大节点位移与支座弯矩形成稳定回归。 | 独立刚度法基准 | 最大节点位移、构件弯矩、节点数量、构件数量 | statusCode=PASS；nodeCount=4；memberCount=3；maxDisplacementMm=1.6422；maxMomentKnM=22.1652 | maxDisplacementMm=0.01；maxMomentKnM=0.01 |
| `frame-explicit-two-bay` | 显式双跨单层框架 | 验证多跨框架的节点/构件组织、两跨梁分布荷载、混合支座和侧向节点荷载回归。 | 独立刚度法基准 | 最大节点位移、构件弯矩、节点数量、构件数量 | statusCode=PASS；nodeCount=6；memberCount=5；maxDisplacementMm=11.8027；maxMomentKnM=56.3701 | maxDisplacementMm=0.01；maxMomentKnM=0.01 |
| `frame-portal-light-load` | 轻载门式刚架 | 扩展门式刚架低荷载回归，覆盖较小水平荷载下的最大节点位移与构件弯矩。 | 内部回归算例 | 最大节点位移、构件弯矩、节点数量、构件数量 | statusCode=PASS；nodeCount=4；memberCount=3；maxDisplacementMm=1.5297；maxMomentKnM=23.4271 | maxDisplacementMm=0.01；maxMomentKnM=0.01 |
| `frame-portal-top-vertical-load` | 门式刚架顶部竖向节点荷载 | 扩展门式刚架顶部节点荷载回归，覆盖节点竖向力与梁均布荷载组合。 | 内部回归算例 | 最大节点位移、构件弯矩、节点数量、构件数量 | statusCode=PASS；nodeCount=4；memberCount=3；maxDisplacementMm=1.4242；maxMomentKnM=49.9148 | maxDisplacementMm=0.01；maxMomentKnM=0.01 |
| `frame-inclined-member-load` | 斜杆局部坐标分布荷载框架 | 覆盖斜构件 local_y 分布荷载与坐标转换回归。 | 内部回归算例 | 最大节点位移、构件弯矩、节点数量、构件数量 | statusCode=PASS；nodeCount=3；memberCount=2；maxDisplacementMm=2.57；maxMomentKnM=24.2499 | maxDisplacementMm=0.01；maxMomentKnM=0.01 |
| `frame-member-point-load` | 构件内集中荷载框架梁 | 覆盖 member_point 构件内集中荷载转换与杆端力回归。 | 内部回归算例 | 最大节点位移、构件弯矩、节点数量、构件数量 | statusCode=PASS；nodeCount=4；memberCount=3；maxDisplacementMm=2.8075；maxMomentKnM=35.1079 | maxDisplacementMm=0.01；maxMomentKnM=0.01 |

## 桁架专项验证

- 算例数量：1

| Case ID | 名称 | 目的 | 验证来源 | 校核指标 | 标准值 | 容许误差 |
|---|---|---|---|---|---|---|
| `BM-002` | 对称平面桁架（顶点水平荷载，轴力与位移验证） | 验证平面静定桁架的轴力计算与节点位移，对标节点平衡法解析解 T_AB=31.25kN(拉)、T_BC=-31.25kN(压)、T_AC=25kN(拉)，确认拉压状态标注与支座反力正确性。 | 教材解析解 | 节点位移、杆件轴力、支座反力 | nodeCount=3；memberCount=3；statusCode=PASS；maxDisplacementMm=0.162；maxDisplacementNodeId=N2；maxAxialForceKn=31.25；maxAxialForceMemberId=M1；memberAxialForces=3 项；supportReactions=2 项 | maxDisplacementMm=0.005；maxAxialForceKn=0.1；memberAxialForceKn=0.1；reactionKn=0.1 |

## 框架梁退化验证

- 算例数量：6

| Case ID | 名称 | 目的 | 验证来源 | 校核指标 | 标准值 | 容许误差 |
|---|---|---|---|---|---|---|
| `BM-001` | 简支梁跨中集中荷载（基础弯矩与位移验证） | 验证框架求解器针对简支梁跨中点荷载的支座反力、最大弯矩与跨中挠度，与教材解析解 Mmax=PL/4、δ=PL³/48EI 对比闭环。 | 教材解析解 | 支座反力、跨中挠度、构件弯矩 | nodeCount=3；memberCount=2；statusCode=PASS；maxMomentKnM=150；midSpanDisplacementMm=-11.25；reactionFyKn_node0=50；reactionFyKn_node2=50；supportReactions=2 项 | maxMomentKnM=0.1；midSpanDisplacementMm=0.05；reactionFyKn=0.1 |
| `BM-003` | 超静定单跨梁（固端-滚动支座，全跨均布荷载） | 验证框架求解器处理一次超静定梁的约束分配与支座反力，对标力法解析解 R_B=3qL/8、R_A=5qL/8、M_A=qL²/8，闭环验证多余约束下的刚度法正确性。 | 教材解析解 | 支座反力、跨中挠度、构件弯矩 | nodeCount=2；memberCount=1；maxMomentKnM=40；supportReactions=2 项 | maxMomentKnM=0.1；reactionFyKn=0.1 |
| `BM-004` | 简支梁全跨均布荷载（框架梁退化验证） | 验证框架梁单元退化为简支梁时的支座反力与最大弯矩。 | 教材解析解 | 支座反力、构件弯矩 | nodeCount=3；memberCount=2；statusCode=PASS；maxMomentKnM=96.0；supportReactions=2 项 | maxMomentKnM=0.1；reactionFyKn=0.1 |
| `BM-005` | 悬臂梁全跨均布荷载（框架梁退化验证） | 验证框架梁单元退化为悬臂梁时的固定端反力与最大弯矩。 | 教材解析解 | 支座反力、构件弯矩 | nodeCount=2；memberCount=1；statusCode=PASS；maxMomentKnM=67.5；supportReactions=1 项 | maxMomentKnM=0.1；reactionFyKn=0.1 |
| `BM-006` | 悬臂梁自由端集中荷载（框架梁退化验证） | 验证框架梁单元处理悬臂自由端集中力的固定端反力与最大弯矩。 | 教材解析解 | 支座反力、构件弯矩 | nodeCount=2；memberCount=1；statusCode=REVIEW；maxMomentKnM=180.0；supportReactions=1 项 | maxMomentKnM=0.1；reactionFyKn=0.1 |
| `BM-007` | 双跨简支退化梁分段均布荷载 | 验证框架梁分段建模下不同均布荷载段的反力和最大弯矩回归。 | 教材解析解 | 支座反力、构件弯矩 | nodeCount=3；memberCount=2；statusCode=PASS；maxMomentKnM=55.125；supportReactions=2 项 | maxMomentKnM=0.1；reactionFyKn=0.1 |

## 梁系

- 算例数量：12

| Case ID | 名称 | 目的 | 验证来源 | 校核指标 | 标准值 | 容许误差 |
|---|---|---|---|---|---|---|
| `beam-simply-supported-uniform` | 简支梁均布荷载 | 验证基础梁系求解、支座约束和挠度峰值位置。 | 教材解析解 | 最大挠度、峰值位置、支座数量 | maxDeflectionMm=1.1565；maxDeflectionXM=3；supportCount=2 | maxDeflectionMm=0.01；maxDeflectionXM=0.01 |
| `beam-cantilever-uniform` | 悬臂梁均布荷载 | 验证悬臂边界和末端控制位移。 | 教材解析解 | 最大挠度、峰值位置、支座数量 | maxDeflectionMm=7.3403；maxDeflectionXM=5；supportCount=1 | maxDeflectionMm=0.01；maxDeflectionXM=0.01 |
| `beam-simply-supported-center-point` | 简支梁跨中集中荷载 | 验证简支梁集中荷载、跨中峰值挠度位置和梁单元集中力等效节点荷载处理。 | 教材解析解 | 最大挠度、峰值位置、支座数量 | maxDeflectionMm=11.25；maxDeflectionXM=3；supportCount=2 | maxDeflectionMm=0.01；maxDeflectionXM=0.01 |
| `beam-cantilever-end-point` | 悬臂梁自由端集中荷载 | 验证悬臂梁固定端约束、自由端集中荷载和最大挠度位置。 | 教材解析解 | 最大挠度、峰值位置、支座数量 | maxDeflectionMm=26.6667；maxDeflectionXM=4；supportCount=1 | maxDeflectionMm=0.01；maxDeflectionXM=0.01 |
| `beam-simply-supported-uniform-8m` | 简支梁均布荷载 8m | 扩展简支梁均布荷载解析回归，覆盖较大跨度与较小截面惯性矩。 | 教材解析解 | 最大挠度、峰值位置、支座数量 | maxDeflectionMm=4.2667；maxDeflectionXM=4.0；supportCount=2 | maxDeflectionMm=0.01；maxDeflectionXM=0.02 |
| `beam-simply-supported-uniform-4m` | 简支梁均布荷载 4m | 扩展短跨简支梁均布荷载解析回归，约束单位换算与峰值位置。 | 教材解析解 | 最大挠度、峰值位置、支座数量 | maxDeflectionMm=0.7937；maxDeflectionXM=2.0；supportCount=2 | maxDeflectionMm=0.01；maxDeflectionXM=0.02 |
| `beam-cantilever-uniform-6m` | 悬臂梁均布荷载 6m | 扩展悬臂梁均布荷载解析回归，覆盖自由端控制挠度。 | 教材解析解 | 最大挠度、峰值位置、支座数量 | maxDeflectionMm=5.4；maxDeflectionXM=6.0；supportCount=1 | maxDeflectionMm=0.01；maxDeflectionXM=0.02 |
| `beam-cantilever-end-point-3m` | 悬臂梁自由端集中荷载 3m | 扩展悬臂梁端部集中荷载解析回归，覆盖小跨度高荷载工况。 | 教材解析解 | 最大挠度、峰值位置、支座数量 | maxDeflectionMm=10.9756；maxDeflectionXM=3.0；supportCount=1 | maxDeflectionMm=0.01；maxDeflectionXM=0.02 |
| `beam-simply-supported-center-point-9m` | 简支梁跨中集中荷载 9m | 扩展简支梁跨中集中荷载解析回归，覆盖长跨集中力工况。 | 教材解析解 | 最大挠度、峰值位置、支座数量 | maxDeflectionMm=10.125；maxDeflectionXM=4.5；supportCount=2 | maxDeflectionMm=0.01；maxDeflectionXM=0.02 |
| `beam-continuous-two-span-uniform` | 两跨连续梁均布荷载 | 补充多跨连续梁回归，覆盖中间支座与三弯矩方程链路。 | 内部回归算例 | 最大挠度、峰值位置、支座数量 | maxDeflectionMm=0.0962；maxDeflectionXM=6.3214；supportCount=3 | maxDeflectionMm=0.01；maxDeflectionXM=0.02 |
| `beam-continuous-three-span-uniform` | 三跨连续梁均布荷载 | 补充三跨连续梁回归，覆盖多内支座与连续梁弯矩传递。 | 内部回归算例 | 最大挠度、峰值位置、支座数量 | maxDeflectionMm=0.0414；maxDeflectionXM=5.0；supportCount=4 | maxDeflectionMm=0.01；maxDeflectionXM=0.02 |
| `beam-continuous-unequal-span-point` | 不等跨连续梁集中荷载 | 补充不等跨连续梁集中荷载回归，覆盖非对称峰值位置。 | 内部回归算例 | 最大挠度、峰值位置、支座数量 | maxDeflectionMm=0.4209；maxDeflectionXM=5.8214；supportCount=4 | maxDeflectionMm=0.01；maxDeflectionXM=0.02 |

## 模板验证映射

> “对应”表示模板与 benchmark 的结构体系、边界和荷载基本一致；“相近/相关”表示可作为同类口径参考，但仍需要后续补专项算例。

| 模块 | 模板 | 对应 benchmark | 关系 | 说明 |
|---|---|---|---|---|
| beam | `simple-span-uniform` / 简支梁均布荷载 | `beam-simply-supported-uniform` | 对应 | 同为单跨简支梁全跨均布荷载，主要复核最大挠度与峰值位置。 |
| beam | `cantilever-tip-load` / 悬臂梁端部集中力 | `beam-cantilever-end-point` | 对应 | 同为悬臂梁自由端集中荷载，主要复核自由端挠度。 |
| beam | `two-span-continuous` / 两跨连续梁 | `beam-continuous-two-span-uniform` | 对应 | 同为两跨连续梁均布荷载，主要复核连续梁变形控制值。 |
| beam | `three-span-linear` / 三跨连续梁线性分布荷载 | `beam-continuous-three-span-uniform` | 相近 | 验证对象同为三跨连续梁；公开 benchmark 采用均布荷载，模板采用线性分布荷载。 |
| frame | `portal-single-bay` / 单跨单层刚架 | `frame-portal-benchmark` | 相近 | 同为单跨门式刚架；荷载组合略有差异，主要复核位移与构件弯矩口径。 |
| frame | `frame-two-bay` / 两跨单层框架 | `frame-explicit-two-bay` | 对应 | 同为显式两跨单层框架，主要复核节点位移、构件弯矩与对象数量。 |
| frame | `frame-two-story` / 两层两跨框架 | `frame-explicit-two-bay` | 相近 | 公开 benchmark 覆盖显式两跨单层框架；该模板扩展到两层，需另补专门 benchmark。 |
| frame | `braced-frame` / 带斜撑框架 | `frame-portal-benchmark` | 相关 | 共享门式刚架基本边界；斜撑端部释放与抗侧效果仍需新增专项 benchmark。 |
| truss | `simple-roof-truss` / 简支三角屋架 | `truss-simple-roof` | 对应 | 同为简支屋架节点荷载，主要复核节点位移与杆件轴力。 |
| truss | `pratt-truss` / Pratt 桁架 | `truss-pratt-bridge` | 对应 | 同为 Pratt 桁架，主要复核节点位移、杆件轴力和控制杆件。 |
| truss | `warren-truss` / Warren 桁架 | `truss-warren-roof` | 对应 | 同为 Warren 桁架，主要复核节点位移与杆件轴力。 |
| truss | `cantilever-truss` / 悬臂桁架 | `truss-cantilever-panel` | 对应 | 同为悬挑桁架体系，主要复核自由端节点位移与杆件轴力。 |

## 使用说明

- 人工评审优先看本摘要，定位算例后再打开 `benchmark_cases.json` 查看完整 payload。
- `internal-regression` 只表示内部回归稳定，不等同于教材解析解或第三方工程软件对标。
- 新增公开验证算例必须同时提供计算模型、标准值、容许误差和验证来源。
