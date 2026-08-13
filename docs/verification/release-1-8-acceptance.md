# v1.8.0 发布验收草案

> 状态：候选规划。本文定义验收证据，不代表功能已完成、版本已发布或线上已部署。
> 产品与架构依据：[v1.8.0 产品与架构计划](../v1.8.0-plan.md)

## 发布定位

v1.8.0 的完整用户闭环是：完成求解后审查计算过程、核对工程关键点，并导出与屏幕同源的详细计算书和可信证据。

本版继续保持梁系、二维平面框架和二维平面桁架的二维线弹性静力边界；不增加第四类结构对象，不引入账号、课程、远程存储、规范承载力设计或生成式 AI 数值推导。

## Gate 0：版本与范围

- [ ] 候选实现只有不超过四条用户价值重点，未把内部重构或测试数量包装为次版本价值。
- [ ] 原同日 v1.8.0 已并入 v1.7.0 的可信计算包、开放分发和学习路径没有重复立项。
- [ ] 当前版本在正式发版决策前仍为 `1.7.0`；仅当维护者明确授权 v1.8.0 发布时才统一升级版本号。
- [ ] 功能完成、候选验证、Tag/Release、镜像推送和线上部署仍是独立状态。

## Gate 1：计算过程契约

- [ ] `CalculationTrace@1` 由计算应用层从一次 canonical result 只读生成；前端与导出器没有第二套求解逻辑。
- [ ] 梁、框架、桁架分别覆盖输入规范化、自由度映射、单元过程、整体装配、边界约化、求解诊断、结果恢复和平衡校核。
- [ ] 轨迹携带请求、模型和结果来源哈希，字段有单位、精度、符号约定和版本。
- [ ] 小模型矩阵展示与大模型摘要/附件有明确上限；截断可见且可解释。
- [ ] 旧 canonical result、旧 `.slv` 和 `verification-package@1.0.0` 可继续读取、复算和核验。

候选测试至少包含：

- `backend/tests/test_calculation_trace_contract.py`
- 梁、框架、桁架各不少于 2 个解析或 benchmark 轨迹案例
- 既有 `backend/tests/test_calculation_result_contract.py`
- 既有 `backend/tests/test_verification_package.py`

## Gate 2：标准/详细计算书承诺

- [ ] 相同模型、相同求解结果分别以 `standard` 和 `complete` 导出时，最终结果完全一致。
- [ ] 标准版包含输入、假定、控制结果、平衡校核、工程图和关键点表。
- [ ] 详细版额外包含自由度、单元过程、装配/约束、求解诊断、结果恢复和轨迹来源。
- [ ] 自动化测试断言两种模板的章节、表格和机器证据确有差异，不能只断言标题存在。
- [ ] DOCX、XLSX 与可信计算包使用同一个轨迹和关键点事实源。

候选测试至少包含标准/详细 DOCX 内容差异、XLSX 工作表差异、最终数值同值和大模型体积上限。

## Gate 3：工程关键点

- [ ] 关键点检测与标签显示策略分离；完整集合不因图面上限或阈值被静默裁剪。
- [ ] 梁覆盖端点/支座、跳变左右值、局部/全局极值、适用零点和控制挠度。
- [ ] 框架覆盖逐构件端值、荷载不连续点、局部/全局极值和适用零点，并标明构件号与局部测站。
- [ ] 桁架逐杆轴力、支座/加载节点和控制位移可复核；未引入弯矩或剪力主指标。
- [ ] 零点只在连续段和已声明容差内求取；重复测站与跳变点保留 `left` / `right` 语义。
- [ ] 屏幕、关键点表、DOCX、XLSX 和可信计算包的对象、测站、数值、单位、精度和侧别一致。

候选测试至少包含：

- `backend/tests/test_result_critical_points.py`
- `frontend/src/lib/result-critical-points.test.ts`
- 既有梁、框架、桁架图形与标签布局单测
- `frontend/tests/visual/release-1-8-critical-point-annotations.spec.ts`

## Gate 4：工作台与可访问性

- [ ] 求解完成后能进入“计算过程”和“工程关键点”视图，过程阶段、来源和诊断可用键盘访问。
- [ ] 默认标签按确定性优先级和避碰策略显示；因空间隐藏的点仍可在表格或点选详情查看。
- [ ] 标签不遮挡主要结构、荷载、支座或控制结果，不越出画布，不只依赖颜色传达语义。
- [ ] 工作台与导出不再分别推导或选择不同关键点。
- [ ] 失败求解只显示已完成阶段和阻断证据，不伪造后续过程。

## Gate 5：产品事件与真实网络

- [ ] 事件至少覆盖 `workbench_ready`、入口选择、校验前计算请求、校验阻断、计算终态、结果呈现、计算轨迹查看、关键点主动检查、报告请求和导出终态。
- [ ] 每次请求只有一个终态；`calculation_requested` 早于本地校验，`results_viewed` 只在结果实际渲染后产生。
- [ ] 事件只包含固定枚举、`schema_version`、`app_version` 和 `workspace_mode`，不发送模型/结果数值、文件名、错误正文或身份信息。
- [ ] Playwright 假 tracker 覆盖默认模型、公开案例、校验阻断、成功求解、过程查看和 DOCX 导出的精确事件顺序。
- [ ] staging Umami property 完成真实网络冒烟；生产 property 不注入自动化测试流量。
- [ ] Umami Funnel 能显示 `visit → calculation_requested → calculation_completed → results_viewed → calculation_trace_viewed → export_completed`。

## Gate 6：回归、制品与独立复核

- [ ] 66 个公开 benchmark 与独立刚度法回归全部通过。
- [ ] 后端全量测试、前端 lint/类型检查/单测/构建全部通过。
- [ ] Chromium 候选闭环与 Chromium/Firefox/WebKit DOCX 导出矩阵全部通过。
- [ ] 计算轨迹、关键点、DOCX/XLSX 和可信计算包通过独立代码审查。
- [ ] 候选制品从干净环境生成，版本、哈希、SBOM、安全扫描和回滚证据齐备。
- [ ] `git diff --check` 通过，工作树没有混入其他会话或无关改动。

正式候选命令以实现完成后的 `scripts/check_release_gate.py` 为事实源，至少包括：

```powershell
python scripts/check_versions.py --expected-version 1.8.0
python scripts/check_release_gate.py
uv run python -m backend.benchmarks.independent_stiffness
uv run python -m pytest backend/tests -q
npm --prefix frontend run lint
npm --prefix frontend run test:unit
npm --prefix frontend run build
npm --prefix frontend run test:visual -- release-1-8-calculation-trace.spec.ts release-1-8-critical-point-annotations.spec.ts --project=chromium --workers=1 --reporter=list
npm --prefix frontend run test:visual:export-docx
git diff --check
```

上述命令现在只是目标门禁；测试文件、脚本标记和版本升级完成前，不能把它们描述为已通过。

## 发布后观察

- 至少观察 30 天或 100 次合格访问，再比较 v1.7 基线和 v1.8 候选的相对转化。
- 主看计算完成率、过程查看率、详细计算书导出率和失败阶段；跳出率与平均时长只作辅助。
- 产品事件只能说明功能是否被采用，不能替代数值正确性、工程图正确性、制品完整性或人工复核。

## 否决条件

以下任一项成立，v1.8.0 不得发布：

- 标准版和详细版仍只有名称差异。
- 计算轨迹由导出器、前端或 AI 重新计算，无法证明与 canonical result 同源。
- 关键点检测在渲染前按数量静默丢值，或零点跨越不连续段被错误插值。
- 屏幕、表格和导出对同一关键点给出不同测站或数值。
- 只凭 Umami 页面指标、单个浏览器截图或单项测试宣布版本完成。
