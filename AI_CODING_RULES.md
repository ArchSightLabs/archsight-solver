# AI 编码规范入口

本文件是通用 AI 编码助手的兼容入口。项目级 AI 编码规则、术语标准、本地化约束和工程规范，统一以根目录 `AGENTS.md` 为唯一事实源。

处理本项目任务时：

1. 先阅读并遵守 `AGENTS.md`。
2. 优先按项目自身的 `README.md`、`docs/`、`backend/tests/`、`frontend/package.json`、`pyproject.toml` 等工程事实执行。
3. 若本地存在 `.ai/` 目录，且任务涉及 Agent 路由、Skill 选择、Workflow、AI Runtime 或 Code Review，可读取 `.ai/` 作为个人或团队增强层。
4. `.ai/` 缺失时，不影响项目开发；不得因为找不到 `.ai/` 而阻塞普通编码、测试、文档或部署任务。
5. 若本文件、工具专属入口文件与 `AGENTS.md` 出现冲突，以 `AGENTS.md` 为准。

## 本地文档命名规则

- `.local-docs/` 用于本地内部沉淀，不纳入公开仓库提交；按主题分为 `ai-runtime/`、`architecture/`、`product-strategy/`、`validation/`、`workflows/` 等子目录。
- 动态文档必须在文件名末尾增加日期后缀，格式为 `name-YYYY-MM-DD.md`。动态文档包括自动生成报告、阶段性评估、状态快照、执行计划、临时诊断和会随时间变化的策略建议。
- 固定入口和长期规则类文档不加日期后缀，例如 `README.md`、流程手册、长期规范、稳定索引和公开 `docs/roadmap.md`。
- 新增或移动本地动态文档时，同步更新 `.local-docs/README.md`；如果文档之间存在相对链接，移动后必须修正链接。
