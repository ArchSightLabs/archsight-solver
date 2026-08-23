# 访问统计与隐私边界

ArchSight Solver 官方演示站同时保留 Busuanzi 与 ArchSight 自托管 Umami，两者职责不同，不能互相替代或混为同一指标。

## 双轨统计职责

- **Busuanzi**：由应用根组件在正式站全局加载，并在“系统设置 / 关于”向访问者
  展示官方演示站累计 PV/UV。PV/UV 是浏览量与访客估算，不代表真实工程师人数、
  有效求解次数或产品留存。
- **Umami**：供 ArchSight 内部查看匿名页面访问、来源和受限的工作台漏斗。Umami 不在产品界面公开后台数据，也不使用 `identify` 建立用户画像。

两种统计服务不可用、被浏览器拦截或超时后，结构建模、求解、敏感性分析、工程文件和计算书导出必须继续正常工作。

## Umami 事件契约

Umami tracker 自动记录不含 query 和 hash 的页面访问。Solver 另外发送以下小写下划线事件：

| 事件 | 触发条件 | 允许参数 |
|---|---|---|
| `calculation_started` / `calculation_completed` / `calculation_failed` | 用户对当前梁系、平面框架或平面桁架发起计算及其终态 | `analysis_mode`；失败时增加 `failure_kind` |
| `sensitivity_started` / `sensitivity_completed` / `sensitivity_failed` | 用户发起单因素敏感性分析及其终态 | `analysis_mode`；失败时增加 `failure_kind` |
| `export_started` / `export_completed` / `export_failed` | 当前结果通过有效性检查后开始导出 DOCX/XLSX 及其终态 | `analysis_mode`、`export_format`；失败时增加 `failure_kind` |
| `project_opened` | 用户通过原生文件选择、文件输入或公开验证工程打开项目 | `project_source` |
| `project_saved` | 工程通过原生文件系统或浏览器下载成功保存 | `save_method` |
| `learning_path_opened` / `learning_prediction_submitted` / `learning_evidence_viewed` / `learning_path_completed` | 用户打开五分钟路径、提交枚举预判、看到当前结果证据或完成证据导出 | `analysis_mode` |

每个事件自动附加 `schema_version`、公开的 `app_version` 和 `workspace_mode`（独立工作台或嵌入模式）。`failure_kind` 只有 `api` / `client` 两个类别，不发送错误正文。

## 明确不采集的内容

前端事件不得上传：

- 工程名称、文件名、文件内容、ASMS-JSON 或任何工程模型；
- 节点、构件、支座、荷载、材料、尺寸或参数值；
- 位移、内力、反力、敏感性曲线或其他计算结果；
- 错误正文、诊断详情、自由文本、报告内容或投稿内容；
- `X-Client-ID`、用户 ID、姓名、邮箱、账号或跨站身份；
- 完整 URL 查询串和 hash。

## 运行与治理边界

- 普通 `npm run dev` 默认关闭两类远程统计；官方 Docker 镜像只允许 `solver.archsight.cn` 加载脚本，本地地址、CI 和其他自托管域名不会上报。`www.solver.archsight.cn` 当前没有 DNS 记录，不属于正式入口。
- Busuanzi 是第三方服务，请求会暴露 IP、来源页、浏览器等常规网络元数据；项目不对其 Cookie、留存或数据处理方式作未经验证的承诺。
- Umami 使用 `https://analytics.archsight.cn/script.js`，website ID 为 `21791f13-6214-44db-8724-0e1dcd656bfb`，数据位于 ArchSight 中国区自托管服务，不发送到 Umami Cloud。
- Umami 排除 query 与 hash，尊重浏览器 Do Not Track，关闭会话回放和热图。当前线上事件与页面访问保留 30 天，每日逻辑备份保留 14 天。
- 当前统计不使用账号、跨站身份、会话回放、热图或广告归因。若未来增加这些能力，必须先重新评估同意机制与隐私说明。

构建参数和派生部署关闭方式见 [部署说明](deployment.md)。
