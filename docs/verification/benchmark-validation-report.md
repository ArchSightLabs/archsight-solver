# ArchSight Solver 公开验证集报告

- 算例目录版本：2026-06-04
- 算例数量：60
- 通过数量：60
- 未通过数量：0
- 验证等级：A, B, D
- 来源类型：independent-stiffness-baseline, internal-regression, textbook-analytical

## 结论

当前公开验证集覆盖梁系、二维平面桁架、二维平面框架和框架梁等基础力学场景。每个算例均保留标准值、容许误差和验证来源元数据，可作为 CI 回归门禁与对外专业可信度材料。

## 界面入口

工作台顶部提供“公开案例”入口，可直接打开由本验证集生成的三个工程：

- 梁系公开验证工程：22 个梁系分析对象。
- 二维平面桁架公开验证工程：16 个桁架分析对象。
- 二维平面框架公开验证工程：22 个框架与框架梁退化分析对象。

每个分析对象均保留 `caseId`、来源类型、校核指标、标准值、容许误差和可用出处链接。打开工程后可直接查看模型、运行计算、查看图形结果并导出计算书，无需重新输入参数建模。

开发者也可以通过 `GET /api/examples/projects` 读取同一组公开验证工程，用于第三方平台对标、自动化演示或 Agent 集成样例。

## 验证等级

| 等级 | 口径 |
|---|---|
| A | 教材解析解或标准公式。 |
| B | 独立刚度法基线或独立矩阵法算例。 |
| C | 版本明确的工程软件对标。 |
| D | 项目内部回归基线，只用于防止行为漂移。 |

## 算例明细

| 算例 | 类型 | 验证等级 | 状态 | 关键校核 |
|---|---|---|---|---|
| `beam-simply-supported-uniform` | beam | A 级验证 | 通过 | 支座数量=2（标准 2）；最大挠度(mm)=1.1565（标准 1.1565）；最大挠度位置(m)=3.0（标准 3） |
| `beam-cantilever-uniform` | beam | A 级验证 | 通过 | 支座数量=1（标准 1）；最大挠度(mm)=7.3403（标准 7.3403）；最大挠度位置(m)=5.0（标准 5） |
| `beam-simply-supported-center-point` | beam | A 级验证 | 通过 | 支座数量=2（标准 2）；最大挠度(mm)=11.25（标准 11.25）；最大挠度位置(m)=3.0（标准 3） |
| `beam-cantilever-end-point` | beam | A 级验证 | 通过 | 支座数量=1（标准 1）；最大挠度(mm)=26.6667（标准 26.6667）；最大挠度位置(m)=4.0（标准 4） |
| `frame-portal-benchmark` | frame | B 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；构件数量=3（标准 3） |
| `frame-portal-rotational-spring` | frame | B 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；构件数量=3（标准 3） |
| `truss-simple-roof` | truss | B 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；杆件数量=5（标准 5） |
| `frame-explicit-two-bay` | frame | B 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=6（标准 6）；构件数量=5（标准 5） |
| `truss-pratt-roof` | truss | B 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=7（标准 7）；杆件数量=11（标准 11） |
| `BM-001` | frame-beam-verify | A 级验证 | 通过 | 节点数量=3（标准 3）；构件数量=2（标准 2）；最大构件弯矩(kN·m)=150.0（标准 150） |
| `BM-003` | frame-beam-verify | A 级验证 | 通过 | 节点数量=2（标准 2）；构件数量=1（标准 1）；最大构件弯矩(kN·m)=40.0（标准 40） |
| `BM-002` | truss-verify | A 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=3（标准 3）；杆件数量=3（标准 3） |
| `beam-simply-supported-uniform-8m` | beam | A 级验证 | 通过 | 支座数量=2（标准 2）；最大挠度(mm)=4.2667（标准 4.2667）；最大挠度位置(m)=4.0（标准 4.0） |
| `beam-simply-supported-uniform-4m` | beam | A 级验证 | 通过 | 支座数量=2（标准 2）；最大挠度(mm)=0.7937（标准 0.7937）；最大挠度位置(m)=2.0（标准 2.0） |
| `beam-cantilever-uniform-6m` | beam | A 级验证 | 通过 | 支座数量=1（标准 1）；最大挠度(mm)=5.4（标准 5.4）；最大挠度位置(m)=6.0（标准 6.0） |
| `beam-cantilever-end-point-3m` | beam | A 级验证 | 通过 | 支座数量=1（标准 1）；最大挠度(mm)=10.9756（标准 10.9756）；最大挠度位置(m)=3.0（标准 3.0） |
| `beam-simply-supported-center-point-9m` | beam | A 级验证 | 通过 | 支座数量=2（标准 2）；最大挠度(mm)=10.125（标准 10.125）；最大挠度位置(m)=4.5（标准 4.5） |
| `beam-continuous-two-span-uniform` | beam | D 级验证 | 通过 | 支座数量=3（标准 3）；最大挠度(mm)=0.0962（标准 0.0962）；最大挠度位置(m)=6.321429（标准 6.3214） |
| `beam-continuous-three-span-uniform` | beam | D 级验证 | 通过 | 支座数量=4（标准 4）；最大挠度(mm)=0.0414（标准 0.0414）；最大挠度位置(m)=5.0（标准 5.0） |
| `beam-continuous-unequal-span-point` | beam | D 级验证 | 通过 | 支座数量=4（标准 4）；最大挠度(mm)=0.4209（标准 0.4209）；最大挠度位置(m)=5.821429（标准 5.8214） |
| `BM-004` | frame-beam-verify | A 级验证 | 通过 | 节点数量=3（标准 3）；构件数量=2（标准 2）；最大构件弯矩(kN·m)=96.0（标准 96.0） |
| `BM-005` | frame-beam-verify | A 级验证 | 通过 | 节点数量=2（标准 2）；构件数量=1（标准 1）；最大构件弯矩(kN·m)=67.5（标准 67.5） |
| `BM-006` | frame-beam-verify | A 级验证 | 通过 | 节点数量=2（标准 2）；构件数量=1（标准 1）；最大构件弯矩(kN·m)=180.0（标准 180.0） |
| `BM-007` | frame-beam-verify | A 级验证 | 通过 | 节点数量=3（标准 3）；构件数量=2（标准 2）；最大构件弯矩(kN·m)=55.125（标准 55.125） |
| `frame-portal-light-load` | frame | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；构件数量=3（标准 3） |
| `frame-portal-top-vertical-load` | frame | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；构件数量=3（标准 3） |
| `frame-inclined-member-load` | frame | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=3（标准 3）；构件数量=2（标准 2） |
| `frame-member-point-load` | frame | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；构件数量=3（标准 3） |
| `truss-warren-roof` | truss | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=7（标准 7）；杆件数量=11（标准 11） |
| `truss-pratt-bridge` | truss | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=8（标准 8）；杆件数量=13（标准 13） |
| `truss-howe-roof` | truss | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=7（标准 7）；杆件数量=11（标准 11） |
| `truss-member-self-weight` | truss | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=3（标准 3）；杆件数量=3（标准 3） |
| `truss-cantilever-panel` | truss | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=6（标准 6）；杆件数量=9（标准 9） |
| `beam-template-three-span-linear` | beam | D 级验证 | 通过 | 支座数量=4（标准 4）；最大挠度(mm)=4.4056（标准 4.4056）；最大挠度位置(m)=6.5（标准 6.5） |
| `beam-template-fixed-fixed-uniform` | beam | A 级验证 | 通过 | 支座数量=2（标准 2）；最大挠度(mm)=2.4575（标准 2.4575）；最大挠度位置(m)=3.0（标准 3.0） |
| `beam-template-propped-cantilever-point` | beam | D 级验证 | 通过 | 支座数量=2（标准 2）；最大挠度(mm)=3.5332（标准 3.5332）；最大挠度位置(m)=2.75（标准 2.75） |
| `beam-continuous-four-span-uniform` | beam | D 级验证 | 通过 | 支座数量=5（标准 5）；最大挠度(mm)=0.031（标准 0.031）；最大挠度位置(m)=4.964286（标准 4.9643） |
| `beam-continuous-four-span-point` | beam | D 级验证 | 通过 | 支座数量=5（标准 5）；最大挠度(mm)=0.1316（标准 0.1316）；最大挠度位置(m)=5.392857（标准 5.3929） |
| `beam-continuous-two-span-partial-uniform` | beam | D 级验证 | 通过 | 支座数量=3（标准 3）；最大挠度(mm)=0.295（标准 0.295）；最大挠度位置(m)=2.428571（标准 2.4286） |
| `beam-continuous-two-point-loads` | beam | D 级验证 | 通过 | 支座数量=4（标准 4）；最大挠度(mm)=0.1938（标准 0.1938）；最大挠度位置(m)=2.0（标准 2.0） |
| `beam-simply-supported-partial-uniform` | beam | D 级验证 | 通过 | 支座数量=2（标准 2）；最大挠度(mm)=3.3617（标准 3.3617）；最大挠度位置(m)=3.5（标准 3.5） |
| `beam-cantilever-partial-uniform` | beam | D 级验证 | 通过 | 支座数量=1（标准 1）；最大挠度(mm)=12.4363（标准 12.4363）；最大挠度位置(m)=6.0（标准 6.0） |
| `beam-continuous-elastic-middle-support` | beam | D 级验证 | 通过 | 支座数量=3（标准 3）；最大挠度(mm)=0.0903（标准 0.0903）；最大挠度位置(m)=1.678571（标准 1.6786） |
| `frame-template-portal-single-bay` | frame | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；构件数量=3（标准 3） |
| `frame-template-two-story` | frame | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=9（标准 9）；构件数量=10（标准 10） |
| `frame-template-braced-frame` | frame | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；构件数量=5（标准 5） |
| `frame-template-gable-frame` | frame | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=5（标准 5）；构件数量=4（标准 4） |
| `frame-portal-global-y-heavy` | frame | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；构件数量=3（标准 3） |
| `frame-portal-local-y-load` | frame | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；构件数量=3（标准 3） |
| `frame-two-bay-asymmetric-load` | frame | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=6（标准 6）；构件数量=5（标准 5） |
| `frame-portal-member-point-quarter` | frame | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；构件数量=3（标准 3） |
| `frame-elastic-column-base` | frame | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；构件数量=3（标准 3） |
| `truss-template-parallel-chord` | truss | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=8（标准 8）；杆件数量=13（标准 13） |
| `truss-parallel-chord-asymmetric` | truss | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=8（标准 8）；杆件数量=13（标准 13） |
| `truss-parallel-chord-member-weight` | truss | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=8（标准 8）；杆件数量=13（标准 13） |
| `truss-simple-roof-horizontal-load` | truss | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；杆件数量=5（标准 5） |
| `truss-simple-roof-unbalanced` | truss | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=4（标准 4）；杆件数量=5（标准 5） |
| `truss-cantilever-tip-single` | truss | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=6（标准 6）；杆件数量=9（标准 9） |
| `truss-cantilever-tip-horizontal` | truss | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=6（标准 6）；杆件数量=9（标准 9） |
| `truss-cantilever-member-weight` | truss | D 级验证 | 通过 | 状态码=PASS（标准 PASS）；节点数量=6（标准 6）；杆件数量=9（标准 9） |

## 使用方式

```powershell
python -m pytest backend/tests/test_benchmark_cases.py backend/tests/test_benchmark_runner.py -q
python -m backend.benchmarks.report --output docs/verification/benchmark-validation-report.md
```

## 专业边界

- 本报告证明当前求解器在公开验证集覆盖范围内满足数值回归阈值，不等同于所有结构设计场景的规范合规结论。
- 工程签审、施工安全专项方案和地区规范适用性仍需注册结构工程师或企业技术负责人复核。
- 后续新增商业软件对标算例时，应记录软件名称、版本、单元类型、单位制和模型文件来源。
