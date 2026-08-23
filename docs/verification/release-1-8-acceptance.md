# v1.8.0 发布验收记录

> 状态：已发布。代码、数值、浏览器、正式制品、公开离线镜像与回滚门禁均已通过，P0/P1 为 0。GHCR 是可能需要授权的工作流镜像副本；阿里云镜像推送与线上部署继续保持独立决策。
> 产品与架构依据：[v1.8.0 产品与架构计划](../v1.8.0-plan.md)

本文下面的复选项保留为长期验收判据，不以逐项勾选替代可复核命令。当前状态以本节证据表为准。

| 范围 | 2026-08-23 发布证据 | 状态 |
|---|---|---|
| 版本、契约与发布脚本 | `check_versions.py --expected-version 1.8.0`、`check_release_gate.py`、契约生成/资源同步检查 | 通过 |
| 后端回归 | 全量 `685 passed, 2 skipped`；66/66 公开 benchmark；独立刚度法 26/26；稳定分析专项 29/29 | 通过 |
| 前端回归 | lint、440 个单测、生产构建；主包 gzip 约 114.22 kB | 通过 |
| v1.8 工作台闭环 | Chromium 下计算过程、可访问性、稳定性关键点三组共 10/10 | 通过 |
| 产品事件 | 假 tracker 精确覆盖 `workbench_ready → calculation_requested → calculation_completed → results_viewed → calculation_trace_viewed → report_export_requested → export_completed`，字段低敏感 | 通过 |
| 独立审查 | aios-ceo / aios-arch 发布前审计未发现 P0/P1；发布后按真实分发与部署边界复核，GHCR 私有可见性不构成发布阻塞 | 通过 |
| 正式发布制品 | Release 工作流 `32615973081` 通过；7 项 Release 资产、SHA-256、SPDX SBOM、Trivy 0 个 HIGH/CRITICAL、v1.8 容器/Host 与 v1.7 回滚启动均已实测 | 通过 |
| 容器分发与部署边界 | GitHub Release 公开提供校验后的离线镜像；工作流 GHCR 副本 digest 为 `sha256:563eee375ef9241f37bafc985932844b8db13331675e102385028256816684e7`，当前需要 GitHub Packages 授权；官方部署使用阿里云目标仓库并独立推送/更新 | 通过 |

## 正式发布与回滚证据

- Tag `v1.8.0` 固定提交 `97ec8fb5522d2ecd4a019ab77ebc7e59b21c19b5`；[GitHub Release](https://github.com/ArchSightLabs/archsight-solver/releases/tag/v1.8.0) 于 2026-08-23 发布，非 Draft、非 Prerelease。
- [CI run 32615960533](https://github.com/ArchSightLabs/archsight-solver/actions/runs/32615960533) 与 [Release run 32615973081](https://github.com/ArchSightLabs/archsight-solver/actions/runs/32615973081) 均在同一提交通过。
- Release 包含 wheel、sdist、Host Client、离线 Docker 镜像、SPDX SBOM、Trivy JSON 和 `SHA256SUMS` 共 7 项资产；六项被校验制品均已独立下载并逐项匹配 `SHA256SUMS`。
- v1.8 离线镜像以非 root 用户 `app` 启动，健康状态为 `healthy`，根路径返回 HTTP 200，canonical Reference Host 用例通过。
- v1.7.0 离线镜像归档 SHA-256 为 `fc7fdcc92d025c3dcd73744310e76c05e108a08f029eb89dbb8aa8c5af87ea0a`；回滚启动后健康状态为 `healthy`，根路径 HTTP 200，canonical Reference Host 用例通过。
- GHCR 镜像已由正式工作流推送，但当前包级可见性需要 GitHub Packages 授权；文档不再承诺匿名直接拉取。Release 离线镜像是公开、可校验的容器获取路径，官方阿里云目标仓库推送与服务器更新不属于 GitHub Release 完成条件。

## 发布定位

v1.8.0 的完整用户闭环是：完成求解后审查计算过程，在系统关键点或用户复核点定位控制工况/组合，对比一次计算迭代，并导出与屏幕同源的标准、详细或失败审查材料。

本版继续保持二维、材料线弹性、静力边界；梁系与桁架仍按材料线弹性静力求解，框架可选几何二阶与线性特征屈曲门禁。不增加第四类结构对象，不引入账号、课程、远程存储、规范承载力设计或生成式 AI 数值推导。

稳定分析已并入 v1.8.0 规划，当前代码已接通真实 P-Delta、线性屈曲、工作台、分层计算书和可信计算包；Gate A 与 Gate B 仍是 v1.8.0 最终发布门禁，必须分别通过且不得互相替代。

## Gate 0：版本与范围

- [ ] 候选实现只有五条用户价值主线：计算过程、控制结果定位、计算快照对比、审查材料、稳定分析求解层；未把内部重构、benchmark 数量或埋点包装为次版本价值。
- [ ] 原同日 v1.8.0 已并入 v1.7.0 的可信计算包、开放分发和学习路径没有重复立项。
- [ ] 维护者已明确授权 v1.8.0 正式发布，所有版本事实源统一为 `1.8.0`；线上部署仍保持独立决策。
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
- `frontend/tests/visual/release-1-8-stability-keypoints.spec.ts`

## Gate 4：工作台与可访问性

- [ ] 求解完成后能进入“计算过程”和“工程关键点”视图，过程阶段、来源和诊断可用键盘访问。
- [ ] 默认标签按确定性优先级和避碰策略显示；因空间隐藏的点仍可在表格或点选详情查看。
- [ ] 标签不遮挡主要结构、荷载、支座或控制结果，不越出画布，不只依赖颜色传达语义。
- [ ] 工作台与导出不再分别推导或选择不同关键点。
- [ ] 失败求解只显示已完成阶段和阻断证据，不伪造后续过程。

候选测试与人工证据至少包含：

- `frontend/tests/visual/release-1-8-workbench-accessibility.spec.ts`：三类结构仅用 `Tab` / `Shift+Tab` / `Enter` / `Space` / 方向键 / `Escape` 完成过程展开、关键点/复核点选择、来源查看和详情关闭，并断言焦点可见、顺序稳定、控件有可访问名称。
- 三类结构在 100% 与 200% 缩放下的键盘走查记录；隐藏标签必须能从表格或详情获得，状态和控制来源不得只依赖颜色。
- 工作台结果视图的 role/name/state 断言；存在阻断性焦点陷阱、无名称主控件或键盘不可达信息时不得放行。

## Gate 5：复核点、包络与控制来源

- [ ] 梁全局坐标、框架构件局部测站、桁架节点/杆件均能创建或选择适用复核点；非法位置返回稳定诊断。
- [ ] 主结果、各工况和各组合可并列比较；正包络、负包络和绝对包络语义分离。
- [ ] 每个包络控制值携带 `sourceType`、`sourceId`、对象、测站/节点/杆件、数值、单位、符号和来源结果哈希。
- [ ] 框架拥有与梁、桁架同等级的包络事实层；前端不从摘要最大值反推控制来源。
- [ ] 屏幕、DOCX、XLSX 与可信计算包对同一复核点和控制来源完全一致。

候选测试至少包含三类结构多工况/组合、控制来源切换、并列比较、重复测站/跳变和组合系数回放。

## Gate 6：稳定分析门禁

- [ ] 真实 P-Delta 的 Gate A 必须通过，且与线性屈曲 Gate B 互不替代；两者都是最终发布阻断门禁。
- [ ] 零轴力退化时，稳定分析结果可明确回落到首阶结果或给出同构诊断，不得输出伪造的二阶增量。
- [ ] 受压悬臂、侧移门架和无侧移门架分别覆盖 P-Delta 收敛、迭代和接近临界荷载显式失败。
- [ ] 工况与组合按各自独立求解，不能把单工况二阶响应按线性叠加替代组合求解。
- [ ] 线性屈曲覆盖铰铰柱、固固柱、固铰柱、整体门架模态、特征残差和约束残差。
- [ ] 工作台与计算书将构件 `K=1` Euler 初筛明确标为复核定位信息，不把它冒充整体临界系数或整体控制模态。
- [ ] 线性屈曲在重复/接近特征值情况下仍能报告稳定的模态排序、归一化和残差诊断。
- [ ] 屏幕、DOCX、XLSX 和可信计算包对同一稳定分析模型输出同源的对象、载荷工况/组合、控制来源、残差和失败诊断。
- [ ] 重复模态对子空间做确定性规范化；近重复模态先经投影广义 Ritz 重解并按临界系数升序，首模态必须对应最小正特征值。
- [ ] 稀疏特征求解的截断点若落在未闭合特征簇内，必须扩展候选集；达到稀疏上限仍无法闭合时，显式记录稠密回退或稳定失败，不得静默输出任意子空间。
- [ ] 接近临界显式失败场景必须保留已完成阶段、失败原因和控制来源，不得伪造“计算完成”。

候选测试至少包含：

- `backend/tests/test_frame_extended_modeling.py`
- `backend/tests/test_frame_workbench.py`
- `frontend/tests/visual/workbench.visual.spec.ts`
- 受压悬臂、侧移门架、无侧移门架、铰铰/固固/固铰柱、整体门架模态和接近临界显式失败样例
- 屏幕 / DOCX / XLSX / 可信包同源断言

## Gate 7：命名计算快照与影响对比

- [ ] 有效求解可保存命名快照，快照带契约版本、模型/请求/结果哈希、来源、轨迹、点集、包络和诊断摘要。
- [ ] 同一分析对象的两个兼容快照可对比输入对象、控制值、控制位置、控制来源和诊断变化。
- [ ] 绝对差、相对差、单位和不可比原因明确；零基值、对象删除或契约不兼容时不伪造百分比。
- [ ] 快照有数量和体积上限，可随 `.slv` 或可信计算包有界携带；不引入账号、远程历史或多人协作。

## Gate 8：标准、详细与失败审查材料

- [ ] 标准和详细 DOCX/XLSX 满足 Gate 2 的真实内容差异。
- [ ] 校验阻断、矩阵奇异或不收敛时可导出失败审查材料，包含已完成阶段、稳定错误码、对象定位、诊断证据和哈希。
- [ ] 失败材料不包含位移、反力、内力、关键点、包络或“计算完成”等伪造结果。
- [ ] 三种材料均记录模板/材料类型、结果状态、契约版本和来源。

## Gate 9：产品事件与真实网络

- [ ] 事件至少覆盖 `workbench_ready`、入口选择、校验前计算请求、校验阻断、计算终态、结果呈现、计算轨迹查看、关键点/复核点检查、控制来源查看、快照比较、报告请求和导出终态。
- [ ] 每次请求只有一个终态；`calculation_requested` 早于本地校验，`results_viewed` 只在结果实际渲染后产生。
- [ ] 事件只包含固定枚举、`schema_version`、`app_version` 和 `workspace_mode`，不发送模型/结果数值、文件名、错误正文或身份信息。
- [ ] Playwright 假 tracker 覆盖默认模型、公开案例、校验阻断、成功求解、过程查看和 DOCX 导出的精确事件顺序。
- [ ] 官方 Umami 脚本和生产站点完成只读网络冒烟；自动化只使用假 tracker，不向生产 property 注入测试流量。
- [ ] Umami 可按低敏感事件配置 `visit → calculation_requested → calculation_completed → results_viewed → calculation_trace_viewed → export_completed` 漏斗；样本量不足时不把转化率当成发布门禁。

## Gate 10：回归、制品与独立复核

- [ ] 66 个公开 benchmark 与独立刚度法回归全部通过。
- [ ] 后端全量测试、前端 lint/类型检查/单测/构建全部通过。
- [ ] Chromium 候选闭环与 Chromium/Firefox/WebKit DOCX 导出矩阵全部通过。
- [ ] 计算轨迹、关键点/复核点、控制包络、快照差异、DOCX/XLSX 和可信计算包通过独立代码审查。
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
npm --prefix frontend run test:visual -- release-1-8-calculation-trace.spec.ts release-1-8-workbench-accessibility.spec.ts release-1-8-stability-keypoints.spec.ts --project=chromium --workers=1 --reporter=list
npm --prefix frontend run test:visual:export-docx
git diff --check
```

上述前置命令和 `.github/workflows/release.yml` 已经通过，正式 Release 资产、三浏览器、容器健康、Host 集成、安全扫描、SBOM 与不可变工作流镜像推送均有远端证据。公开容器路径以同一 Release 的离线镜像和 `SHA256SUMS` 为准；阿里云目标仓库推送与线上更新是发布后的独立运维动作，不能与 GitHub Release 状态混写。

## 发布后观察

- 至少观察 30 天或 100 次合格访问，再比较 v1.7 基线和 v1.8 候选的相对转化。
- 主看计算完成率、过程查看率、控制来源检查率、快照比较率、详细计算书/失败审查材料导出率和失败阶段；跳出率与平均时长只作辅助。
- 产品事件只能说明功能是否被采用，不能替代数值正确性、工程图正确性、制品完整性或人工复核。

## 否决条件

以下任一项成立，v1.8.0 不得发布：

- 标准版和详细版仍只有名称差异。
- 计算轨迹由导出器、前端或 AI 重新计算，无法证明与 canonical result 同源。
- 关键点检测在渲染前按数量静默丢值，或零点跨越不连续段被错误插值。
- 屏幕、表格和导出对同一关键点给出不同测站或数值。
- 包络值没有可回放的控制工况/组合来源，或框架仍缺失同等级包络事实层。
- 快照对比由页面临时拼接，无法证明哈希、单位、来源和不可比规则一致。
- 失败审查材料出现未实际求得的位移、内力、关键点或成功结论。
- 只凭 Umami 页面指标、单个浏览器截图或单项测试宣布版本完成。
