# ArchSight Solver v1.8.3 Post-release Engineering Review

> - 状态：本轮工程审查已收口
> - 审查收口日期：2026-08-31
> - 已发布基线：`v1.8.3`，发布提交 `5f4c544ac7a2a55a81a81437117fc5100156f6e1`
> - 本轮工作树基线：`8317ec9ac9a34f1ab9c46eb14ea6c261158eb2d5`
> - 交付状态：post-release hardening 尚未提交、未 push、未构建或发布新的候选制品

本文记录 v1.8.3 发布后的工程审查、已完成的低风险 hardening、验证证据、明确 HOLD 的高优先级设计问题，以及延期 backlog。本文只描述本轮已经形成的事实，不重新定义 v1.8.3 的发布结论，也不把尚未提交的工作树描述为已发布版本或正式补丁候选。

相关发布事实以 [v1.8.3 发布验收记录](release-1-8-3-acceptance.md) 和仓库根目录 `CHANGELOG.md` 为准。

## 1. 本轮已完成的 hardening

### 1.1 Export / calculate / preview / sensitivity 未知异常契约

本轮统一收紧了同步计算主链路的未知异常边界：

- `export` 与 `export/failure` 对未处理异常使用服务端异常日志，客户端只收到脱敏错误文本、稳定错误码 `COMMON_INTERNAL_ERROR` 和 HTTP 500，不再返回原始异常文本或错误地使用 HTTP 400。
- `calculate`、`preview`、`sensitivity` 对未处理异常使用 `logger.exception(...)` 记录完整堆栈；客户端统一收到脱敏消息“服务内部错误，请稍后重试。”、`COMMON_INTERNAL_ERROR`、`system` 类诊断和 HTTP 500。
- `ApiError`、领域 `ValueError` 等已知请求或模型错误继续沿用既有 HTTP 400 契约。本轮没有把合法的输入校验失败改写为服务端故障。
- OpenAPI 为 `/api/calculate`、`/api/preview`、`/api/sensitivity` 明确发布 HTTP 500 的 `api-error` 响应契约；export 相关 500 契约继续由既有 OpenAPI 测试保护。
- 故障注入回归使用只存在于测试中的 sentinel 异常文本：export 回归验证 HTTP 状态与响应脱敏，calculate/preview/sensitivity 回归同时验证响应脱敏和服务端异常日志。

该 hardening 改善的是错误分类、可观测性和信息暴露边界，不改变结构求解公式或成功响应数据。

### 1.2 Sensitivity 输入错误稳定化

敏感性分析在进入参数循环前增加了稳定输入分类：

- `config` 必须是对象；
- `range` 与 `steps` 的非法数值返回 `COMMON_INVALID_SENSITIVITY_CONFIG` 和 HTTP 400；
- 非法 `targetSpanIndex` 返回同一稳定错误族；
- 前端 sensitivity 调用先检查 HTTP 状态，再读取成功 JSON；失败响应统一通过已有 API error reader 解析。

因此，用户输入错误不会再以 Python 数值转换异常文本回传，也不会被误分类为未知服务端故障。

### 1.3 Frame/truss `reviewPoints` 跨栈闭环

本轮完成了复核点从工作台到 canonical request 的完整闭环：

1. frontend mapper 对自定义 frame/truss 工作区规范化 `reviewPoints`；
2. 最终求解 payload 在顶层携带 `reviewPoints`，不把该请求级字段放入 `structure`；
3. ASMS beam/frame/truss 与 `calculate-payload` JSON Schema 发布同一 bounded selector contract，集合上限为 32；
4. OpenAPI 复用 Schema Registry 中的定义；
5. generated TypeScript DTO 由现有生成脚本同步，不手工维护第二份类型事实；
6. backend contract 回归锁定 beam/frame/truss 的 `reviewPoints` 进入 canonical request echo，并继续验证实际复核点解析结果。

这次修改没有改动 canonical hash 算法，也没有借复核点修复扩大 `structure`、项目文件或求解内核的字段范围。

### 1.4 Application/services 依赖方向整改

`backend/application/calculation.py` 已直接依赖三类 application analysis 模块，不再经由 `backend/services/*_workbench.py` 反向进入 application：

- application → services 的反向依赖被移除；
- beam/frame/truss workbench service 保留为外层兼容 facade，但移除了与求解 facade 无关的 exporter imports；
- architecture gate 明确禁止 `backend/application` 导入 `backend.services`，防止后续回退。

这项整改只收紧模块边界，没有迁移求解逻辑、修改数值路径或删除公开兼容入口。

### 1.5 契约、生成制品与架构治理

本轮同时完成了以下治理改进：

- JSON Schema、OpenAPI、generated DTO 与 backend canonical request 测试形成可执行的契约链；
- generated contract consistency gate 证明生成文件与后端 Schema Registry 一致；
- architecture gate 同时保护 solver、normalizer、application、service 等依赖方向和热点 facade 大小；
- export cache/error 回归覆盖普通导出与失败审查材料两个入口的异常脱敏行为；
- frontend boundary test 锁定 sensitivity 必须先检查 HTTP 状态，再解析成功响应。

本轮没有生成或修改 wheel、sdist、Host Client tarball、Docker 镜像、SBOM 或 Release 资产。这里的“生成制品治理”仅指仓库内 generated DTO 与契约一致性，不代表下一补丁版本已经完成 packaging 或 release acceptance。

## 2. 验证证据

以下结果来自 2026-08-31 当前未提交工作树：

| 验证项 | 命令或范围 | 结果 |
|---|---|---:|
| Backend 聚焦回归 | calculation trace、JSON Schema/OpenAPI、error contracts、sensitivity | `83 passed` |
| Frontend mapper 聚焦回归 | `solver-payload.test.ts` | `26 passed` |
| Architecture gates | `backend/tests/test_architecture_boundaries.py` | `2 passed` |
| Backend 全量 | `.venv\Scripts\python.exe -m pytest backend/tests -q` | `748 passed, 2 skipped` |
| Frontend 全量 | `npm run test:unit` | `458 passed` |
| ESLint + TypeScript | `npm run lint`，包含 `eslint src` 与 `tsc --noEmit` | exit code `0` |
| Generated contract consistency | `python scripts/generate_contract_types.py --check` | 通过 |
| Diff hygiene | `git diff --check` | 通过 |

### 2.1 2026-09-01 阶段提交与复核

在维护者明确授权按功能阶段提交后，本轮 hardening 已从混合工作树中精确隔离为以下提交：

| 提交 | 功能边界 | 状态 |
|---|---|---|
| `809922f` | 未预期异常脱敏、敏感性输入错误稳定化、`reviewPoints` 跨栈契约闭环 | 已提交，未 push、未发布、未部署 |
| `8c223d8` | application 直接依赖分析模块，services facade 保留外层兼容 | 已提交，未 push、未发布、未部署 |

同日复核结果：后端聚焦契约、架构和公共文档测试 `114 passed`；前端单元测试 `458 passed`；ESLint 与 TypeScript 检查通过。另有独立 Cloud 导航入口提交 `5aa447e`，只提供显式“前往云端保存”链接，不属于本轮数值/契约 hardening，也不回写为历史 v1.8.3 能力。

### 2.2 本轮未运行 build 的理由

本轮 post-release hardening 没有新增依赖、Vite 入口、动态 import 或构建配置；受影响 TypeScript 已通过聚焦测试、frontend 全量测试、ESLint 和 `tsc --noEmit`。`npm run build` 的 `prebuild` 还会同步 Host Client、Host Client package 和 release notes，可能在当前包含其他用户 WIP 的工作树中扩大生成文件范围。因此本轮按“验证充分但不扩大修改范围”的约束，没有额外运行 build。

这项 `NOT RUN` 只适用于本轮未提交 hardening。历史 v1.8.3 发布候选已经按其发布验收记录运行生产构建、打包、镜像和线上验收；未来如果把本轮 hardening 纳入下一补丁 candidate，仍必须重新执行该 candidate 自己的 build、package 和 release gates。

## 3. 高优先级 HOLD

以下两项是独立的设计问题。它们没有在本轮自动修复，也不得在未来会话中被当作普通低风险 P1 补丁处理。

### 3.A HOLD：Canonical hash semantics

**已识别事实**

- 梁系 canonical request echo 当前会丢失 load cases、load combinations 和 loads 等模型/荷载事实；
- beam `modelHash` 所覆盖的模型事实，与 frame/truss 的 `modelHash` 定义不一致；
- 该语义同时影响公开验证包、request/model/result hash contract、跨版本复算与完整性解释；
- 直接把缺失字段塞进当前 hash 会改变既有摘要，可能使已生成可信计算包、外部缓存或调用方比较逻辑出现兼容断裂。

**风险范围**

这是“模型身份与证据契约是否表达了同一事实”的问题，不等同于已经证明梁、框架或桁架数值求解整体错误。v1.8.3 在其已发布契约和适用范围内仍可使用，但依赖 hash 判断跨版本语义等价的调用方必须了解该不一致。

**后续进入条件**

该问题应作为 `CalculationResult@2` 或明确的兼容迁移专题处理，至少先定义：

1. request/model/result 三类 hash 各自覆盖的 canonical 字段目录；
2. beam/frame/truss 的模型事实一致性；
3. 旧可信计算包的校验、复算和迁移状态；
4. 新旧摘要并存期、版本标识和调用方升级策略；
5. 固定跨版本 fixtures 与 verification-package 回归。

在这些设计产物完成前，状态保持 **HOLD**，不得通过局部字段拼接直接改写现有 hash。

### 3.B HOLD：Corotational fixed-only prescribed displacement

**已识别事实**

- 共回转路径中的 variable factor 与 fixed-only 支座规定位移路径语义可能冲突；
- 问题位于 Level 3 数值核心，涉及荷载路径、固定作用、变量作用、残差和切线迭代之间的定义；
- 直接修改缩放因子或位移施加位置可能改变 GNA/GNIA 路径、收敛历史和失败证据，不能由普通单元测试证明正确。

**风险范围**

风险集中在启用共回转几何非线性、同时包含 fixed-only prescribed displacement 的特定路径；它不是“所有共回转计算不可用”或“已发布版本整体不可用”的证据。现有发布边界、已通过 benchmark 和其他线性/非线性工况仍应按各自证据解释。

**后续进入条件**

进入实现前必须依次完成：

1. 明确定义 fixed action、variable action 与 prescribed displacement 的 load-path semantics；
2. 规定支座位移在 reference/current configuration、残差和切线中的施加方式；
3. 建立可独立复核的数值 benchmark，覆盖零变量荷载、纯规定位移、混合作用和分步路径；
4. 固定反力、位移、内力、路径 trace、收敛和失败状态的容差；
5. 经数值设计评审后再决定是否修改实现及是否需要方法/结果版本升级。

未来会话不得将本项作为“高置信度、低风险 P1”自动修复。状态保持 **HOLD**。

## 4. Deferred backlog

以下 P2 没有在本轮处理。延期不是降级或隐藏，而是因为它们需要新的 benchmark、公共契约、规模证据或更大范围重构，不符合本轮 post-release 最小 hardening 边界。

| 类别 | 延期事项 | 已知风险/边界 | 延期原因与重新进入条件 |
|---|---|---|---|
| 数值结果恢复 | 并联弹簧反力恢复 | 弹簧并联、支座反力与结果展示的恢复口径需要统一，避免刚度参与计算但反力证据解释不完整 | 先建立解析平衡 benchmark 和结果 contract，再决定恢复/展示字段；本轮没有足够证据支持低风险补丁 |
| 作业与审计 | Job audit | 当前本地 job 主要承担便利缓存和运行记录，不应被解释为持久审计、认证或租户隔离系统 | 需要先定义持久化、身份、租户、保留期和审计事件；不与同步 API hardening 混改 |
| 性能与规模 | General constraint 路径 sparse → dense | 一般约束路径可能转为 dense SVD/solve，大模型下存在内存和耗时放大风险 | 先建立独立规模基线、模型上限和性能门槛，再评估稀疏消元或鞍点系统；当前不是已证实的数值错误 |
| 宿主与存储 | Safe storage / embed storage boundary | embed 会关闭部分工程/模板持久化，但布局、主题或 session 仍可能访问本地存储，数据 owner 容易被误解 | 先形成 storage ownership matrix、隐私边界和浏览器回归，再调整实现；不在本轮 Cloud/用户 WIP 上叠加修改 |
| 导出架构 | Export pipeline duplication | API、canonical evidence、DOCX/XLSX 和前端投影存在重复选择/本地化路径，新字段容易漂移 | 先固定同源 export fixtures、字段目录和兼容策略，再按投影边界拆分；禁止无收益的大规模重写 |
| 诊断与维护 | 病态矩阵诊断、`.slv` 三体系工作流、API transport、可变事实同步等 | 当前可用，但诊断解释、自动化对称性或维护成本仍有限制 | 按真实需求分别建立条件数/尺度 benchmark、frame/truss workflow contract、无状态 API client 和事实源门禁后再进入 |

## 5. 版本边界

| 层级 | 当前状态 | 可以声明 | 不得声明 |
|---|---|---|---|
| 已发布版本 | `v1.8.3` 已于 2026-08-25 发布；不可变 Tag 指向 `5f4c544...`，发布、镜像、线上与回滚证据见发布验收记录 | 在已发布能力、适用范围和验收证据内可使用；本轮审查没有形成“整体不可用”的证据 | 不得把当前未提交 hardening 倒写成 v1.8.3 已包含能力，也不得移动历史 Tag |
| 本轮 post-release hardening | 异常契约、reviewPoints、依赖边界和回归治理已分别提交为 `809922f`、`8c223d8` | 本轮授权整改范围可判定为已提交且工程验证通过 | 不得描述为已 push、已打包、已部署或已在线验收 |
| 下一补丁版本 candidate | 尚未命名，也尚未形成隔离提交或候选制品 | 可把本轮 hardening 作为候选输入，前提是先隔离用户 WIP并重新执行完整 candidate gates | 当前工作树不是 release candidate；本轮测试不能替代未来候选的 build、package、镜像、CI 和回滚证据 |
| Numerical/contract evolution | Canonical hash semantics 与 corotational fixed-only prescribed displacement 均为 HOLD | 应进入 `CalculationResult@2`/兼容迁移设计和 Level 3 数值专题 | 不得塞入普通补丁版本自动修复，不得隐去兼容与数值风险 |

## 6. 收口判断

- **本轮 post-release hardening：GO。** 已授权的低风险整改已按功能形成阶段提交，对应验证已经闭合。
- **v1.8.3 已发布结论：保持。** 两项 HOLD 不构成把已发布版本简单描述为整体不可用的证据，但其适用范围和风险必须持续公开记录。
- **下一补丁 candidate：尚未形成。** 阶段提交不等于候选版本，仍需重新运行候选版本自己的 build/package/release gates。
- **两项 HOLD：继续 HOLD。** 在相应契约迁移设计或数值 benchmark 完成前，不进入自动修复队列。
- **所有 P2：延期。** 后续仅在具备明确需求、证据和独立验收门槛时重新启动。

本文完成后，本轮 Solver post-release engineering review 结束，不继续扩大生产代码审查或修改范围。
