# AGENTS.md

> 本文件供 Codex、Cursor 等支持 `AGENTS.md` 的编码工具自动发现项目规则。
> 项目级 AI 编码规则、术语标准、本地化约束和工程规范，统一以 `AI_CODING_RULES.md` 为唯一事实源；本文件只做工具入口适配。

## 必读入口

开始任何工作前，先阅读：

- `AI_CODING_RULES.md`
- 与当前任务相关的工程入口，例如 `README.md`、`docs/`、`frontend/package.json`、`pyproject.toml`、`backend/tests/`、`scripts/`。

## Codex / Cursor 入口适配

- 必须优先遵守 `AI_CODING_RULES.md` 的项目定位、结构工程术语、中文输出、验证与版本一致性要求。
- 若本文件、工具专属入口文件与 `AI_CODING_RULES.md` 出现冲突，以 `AI_CODING_RULES.md` 为准。
- 若本地存在 `.ai/`，且任务涉及 Agent 路由、Skill 选择、Workflow、交付验证、AI Runtime 或 Code Review，可将 `.ai/` 作为个人或团队增强层读取。
- `.ai/` 缺失时，不影响普通编码、测试、文档、部署和排错任务。
- 接入可选 AIOS/个人工作流不代表当前项目依赖特定私有平台，也不要求使用 Hermes、飞书或其他特定运行环境。

## Codex 专用状态持久化与故障恢复

> 本节只约束 Codex 类长上下文编码代理；`AI_CODING_RULES.md` 仍是项目级编码规范的唯一事实源。

- 不得把 Codex 的长对话上下文当作唯一状态源；任务事实应以仓库文件、`git status`、`git diff`、提交记录、测试结果和交接文档为准。
- 长链路任务必须按可验证阶段推进，避免在单一会话中无边界地叠加“架构分析、跨模块实现、测试修复、评审清理”等多类工作；每个阶段应有明确目标、涉及文件、风险和验证方式。
- 在上下文变长、任务跨天、需要切换会话或存在中断风险时，应先沉淀交接文档，再继续或重开会话；本地交接文档默认放入 `.local-docs/workflows/`，并遵守 `AI_CODING_RULES.md` 第 8 节的动态文档命名与索引更新规则。
- 交接文档应至少记录：当前目标、已完成修改、未完成事项、关键文件、设计决策、风险点、已运行命令和下一步建议；重开会话后应优先读取交接文档、最近提交、当前工作树状态和现有 diff。
- 遇到 Codex compact、stream disconnected、远端上下文压缩失败或类似会话状态异常时，不应反复盲目重试；应优先保护当前工作树，可根据改动成熟度选择生成 patch、stash、WIP checkpoint 或提交到专用分支。
- 不适合进入正式历史的中间态改动不得直接混入主分支；需要 WIP checkpoint 时，优先使用 feature branch、临时 worktree、stash 或 patch，最终合并前再整理为可审查提交。
- 大型仓库任务应主动限制上下文输入面，避免无关扫描 `node_modules`、`dist`、`coverage`、日志、大型生成文件和无关快照；任务提示中应明确优先阅读的目录和排除范围。
- 外部故障链接、服务状态页判断、社区 issue 和某次故障根因推断只适合作为临时诊断材料，不应直接写入长期规则；长期规则只沉淀可复用的工程动作和恢复流程。
