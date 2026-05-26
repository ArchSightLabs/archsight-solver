# 版本发布记录

## v1.1.0

发布时间：2026-05-26

主要变化：

- 新增 `/api/jobs` 异步作业接口与 `/api/contracts/schemas` JSON Schema 契约入口。
- 新增 `archsight-solver-tool` CLI 通用入口，扩展 MCP 计算、敏感性分析和 benchmark 工具。
- 新增公开 benchmark catalog、runner、report，并在 CI 中生成验证报告。
- 新增 API Reference、ASMS-JSON 结构力学数据协议、AIOS 集成文档和 benchmark 验证报告。
- 引入 SciPy sparse 求解后端、跨数上限配置、输出精度控制和求解器诊断，增强大跨数与大自由度模型支撑。

## v1.0.0

发布时间：2026-05-25

主要功能：

- 首个公开版本，交付梁系、平面框架、平面桁架三类线弹性静力分析工作台。
- 支持参数建模、结构计算、敏感性分析、结果图表、模板库和 Word / Excel 计算书导出。
- 提供 `/api/calculate`、`/api/sensitivity`、`/api/export` 等基础接口。
- 结果口径覆盖挠度、弯矩、剪力、节点位移、杆件轴力、轴应力和支座反力。
