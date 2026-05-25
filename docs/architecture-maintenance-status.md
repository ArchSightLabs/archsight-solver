# ArchSight Solver 架构收口状态

> 状态：首个公开版本架构基线
> 本文件替代旧的架构评审、后端分层草案、API 响应契约草案和硬化计划。旧草案中的未完成事项如仍有效，已在本文“剩余风险”中重新表达。

## 结论

当前项目已经形成三类核心模块的工程闭环：

- 梁系
- 二维平面框架
- 二维平面桁架

主线不再扩展第四类分析域。近期架构重点是继续压实 API 契约、应用层边界、导出模型和前端工作台拆分，而不是引入 Frame3D、外部求解器、规范设计或多用户平台。

## 当前已完成的收口

| 主题 | 当前状态 | 主要落点 |
|---|---|---|
| Flask 入口瘦身 | `app.py` 只负责 Flask 初始化、日志、蓝图注册和静态文件服务 | `app.py`、`backend/api/*` |
| API 蓝图拆分 | calculate / preview / sensitivity / export 已拆为独立 blueprint | `backend/api/` |
| 错误契约结构化 | 错误响应已包含 `success=false`、`operation`、`version`、`error.code`、`error.message`、`legacyError`、`diagnostics`、`meta` | `backend/api/errors.py` |
| 未知分析类型处理 | 非空未知 `analysisType` 不再静默回退 beam，而是返回 `COMMON_UNSUPPORTED_ANALYSIS_TYPE` | `backend/api/utils.py`、`backend/tests/test_error_contracts.py` |
| 成功响应 envelope | calculate / preview 已补齐 `success`、`operation`、`meta`，前端结果页与导出已通过 selector 优先消费 envelope `request/results/model/diagnostics`，legacy 顶层字段进入冻结期 | `backend/api/utils.py`、`frontend/src/lib/api-envelope.ts` |
| 导出模型收口 | export API 不再直接读取内部 `solution` 字段，导出入口通过 `ReportModel` 和 `export_service` 统一调度 | `backend/exporters/common/report_model.py`、`backend/services/export_service.py` |
| 敏感性边界保护 | 服务端限制扰动范围与步数，越界返回结构化错误 | `backend/api/sensitivity.py`、`backend/tests/test_sensitivity.py` |
| frame 应用层试点 | `frame_workbench.py` 已压缩为 adapter，核心编排迁入 application 层 | `backend/application/frame_analysis.py`、`backend/services/frame_workbench.py` |
| 前端业务动作抽离 | 计算、导出、敏感性动作已进入 hook，错误读取兼容结构化 envelope，导出请求和报告截图不再依赖顶层 legacy `payload/results` | `frontend/src/hooks/useWorkbenchActions.ts`、`frontend/src/lib/api-envelope.ts` |
| 荷载组合标签 | 梁、框架、桁架组合 `tags` 已贯通到归一化、结果、项目文件、结果页、XLSX 和 DOCX 导出 | `backend/exporters/common/load_tables.py`、`frontend/src/components/WorkbenchResultTabs.tsx` |
| 外部源码边界 | 公开仓库不包含第三方求解器源码、git submodule 或 `external/` 参考源码树 | `.gitignore`、`NOTICE.md` |
| 范围边界 | 当前主仓库聚焦三类二维静力分析，Frame3D 不进入当前开源范围 | `README.md`、`docs/open-source-structure-solver-roadmap.md` |

## 当前验证基线

最近一次完整工程验证：

- `python -m pytest backend/tests -q`：`159 passed, 1 skipped`
- `npm --prefix frontend run test:unit`：`29 passed`
- `npm --prefix frontend run lint`：通过，`0 errors, 20 warnings`

这些数字用于说明首个公开版本的架构收口基线。若后续测试数量变化，以 CI 和最新提交结果为准。

## 剩余风险

### 1. legacy 响应字段仍处于过渡期

成功响应仍保留 `beam`、`frame`、`truss`、`solution`、`payload` 等兼容字段。短期合理，但不再允许新增顶层 legacy 字段；新增字段只进入 `request`、`model`、`results` 或 `diagnostics`。

建议：

- 前端继续迁移到 `results / summary / preview / diagnostics`，结果页与导出已完成 envelope 优先选择器，后续组件内部可继续减少 legacy 类型暴露。
- 新测试优先断言统一 envelope。
- 删除 legacy 字段前先发布迁移说明。

### 2. application 层只完成 frame 试点

`frame_workbench.py` 已压缩成 adapter，但 beam / truss 仍主要由 `services/*_workbench.py` 承担应用编排。

建议：

- 先观察 frame application adapter 的稳定性。
- 再按 beam、truss 顺序迁移应用编排。
- 迁移时不得改变 benchmark 输出。

### 3. 导出器内部仍以映射字段消费报告

`ReportModel` 已阻断 API / service 层直接暴露内部 `solution` 对象，但 DOCX/XLSX 导出器内部仍通过映射字段读取报告数据。

建议：

- 当前阶段接受该过渡形态。
- 后续可按模块逐步提取 `ReportSections` 或表格模型。
- 不应在没有测试保护时大幅重写导出模板。

### 4. 前端 `App.tsx` 与部分组件仍偏厚

业务动作已抽到 hook，但顶层工作台和部分绘图/预览组件仍有继续拆分空间。

建议：

- 优先拆稳定的展示组件和数据选择器。
- 避免为了文件行数而打碎业务上下文。
- 保留 `npm --prefix frontend run lint` 和单元测试作为门禁。

### 5. 旧认证服务已清理

当前主线已不把登录/JWT 作为产品能力，运行时认证服务文件、`PyJWT` 依赖、临时登录组件和历史认证规格均已移除。

建议：

- 后续若重新引入登录能力，应作为独立身份集成项目重新立项，并补齐 API 契约、密钥管理、权限边界和回归测试。

## 当前不做

- 不新增 Frame3D / Space Frame 开源入口。
- 不接入外部求解器作为运行时内核。
- 不把第三方求解器源码、数据结构或可执行文件迁入当前主仓库。
- 不把企业模板、规范校核、批量工程或私有部署能力默认合入开源核心。

## 建议下一步

1. 用 `docs/README.md` 作为文档入口，避免再新增孤立评审报告。
2. 继续把 beam / truss 的应用编排向 application adapter 收口。
3. 分阶段迁移前端到统一 API envelope。
4. 以 README 和 specs 中的当前非目标作为新增高级能力的准入检查。
5. 删除或归档不再代表当前事实的临时评审文档。
