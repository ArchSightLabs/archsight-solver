# GEMINI.md

> 本文件供 Gemini 发现本项目的 AI 编码规则。
> 项目规则以 `AI_CODING_RULES.md` 为唯一事实源；本文件只做工具入口适配。

## 必读入口

开始任何工作前，先阅读：

- `AI_CODING_RULES.md`
- 与当前任务相关的工程入口，例如 `README.md`、`docs/`、`frontend/package.json`、`pyproject.toml`、`backend/tests/`、`scripts/`。

## Gemini 入口适配

- 必须优先遵守 `AI_CODING_RULES.md` 的项目定位、结构工程术语、中文输出、验证与版本一致性要求。
- 若本文件、工具专属入口文件与 `AI_CODING_RULES.md` 出现冲突，以 `AI_CODING_RULES.md` 为准。
- 若本地存在 `.ai/`，且任务涉及 Agent 路由、Skill 选择、Workflow、交付验证、AI Runtime 或 Code Review，可将 `.ai/` 作为个人或团队增强层读取。
- `.ai/` 缺失时，不影响普通编码、测试、文档、部署和排错任务。
- 使用浏览器或外部工具前，先说明目的；操作后汇报结果。
- 接入可选 AIOS/个人工作流不代表当前项目依赖特定私有平台，也不要求使用 Hermes、飞书或其他特定运行环境。
