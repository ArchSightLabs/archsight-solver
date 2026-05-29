# AGENTS.md

> [!IMPORTANT]
> **单一事实源声明 (SSoT)**: 本项目所有 AI 编程助手的通用规则、术语表、本地化标准与工程规范，统一以本文件为唯一主规则源。

## 1. 项目定位与背景 (Project Positioning)
该项目是一个**开源结构力学求解器工作台**，目标是为结构工程师、教师与学习者提供可验证、可复现、可扩展的 Web 工具。

**产品定位补充：**
- 本产品首先是面向**结构工程专业人员的辅助工具与生产力工具**，其次才是演示型 Web 应用。
- 典型用户包括：土木/结构方向的产品经理、结构工程师、教师与高校学生。
- AI 在设计功能、文案、指标、图表与导出内容时，必须默认用户具备专业背景，优先满足**专业可信度、术语准确性、工程可解释性**，不得为了“通俗易懂”而牺牲专业正确性。
- 若专业性与泛化表达冲突，应优先采用教材、规范、工程软件常用口径，再视需要补充简短说明。

**核心功能方向：**
1. **智能体前端生成 (Agent-driven Frontend)**: 基于需求生成现代化、响应式工程界面。
2. **后台复杂算法实现 (Backend Engineering via AI)**: 使用 Python 实现结构工程复杂力学计算（如多跨连续梁挠度与动荷载模拟）。
3. **全栈连通自动化 (Full-stack Integration)**: 自主分析前后端结构并完成 RESTful API 对接与图表渲染。
4. **工具链整合与智能调试 (MCP-powered Debugging)**: 深度整合 Chrome DevTools (MCP) 等工具链，实现自动诊断与修复。

## 2. 技术栈 (Technology Stack)
- **前端 (Frontend)**: Vite + React + TypeScript + Tailwind CSS v4 + shadcn/ui + ECharts
- **后端 (Backend)**: Python + Flask + Numpy + Pandas + Openpyxl
- **工程计算 (Engineering)**: 连续梁三弯矩方程计算、真实载荷模型。

## 3. 项目演进规划 (Roadmap)
后续版本重点：
1. **引入 Github-Spec (Spec-Driven Development)**:
   - 读取规范化 Markdown 需求（`github-spec`）或 PRD，完成架构拆解与代码闭环。
2. **引入 Ossature 架构升级 (Enterprise-level Architecture Generation)**:
   - 将现有轻量级 Flask 版本逐步升级为更高阶企业架构，验证复杂框架驾驭能力。

## 4. 智能体行为准则 (Agent Behavior Guidelines)

在介入和修改项目任意环节时，AI 必须遵循：

### 4.1 过程透明 (Process Transparency)
- 在新增或修改功能时，明确呈现“理解需求 -> 设计拆解 -> 任务执行 -> 自测验证”的完整工作流。

### 4.2 业务专业性 (Domain Authenticity)
- 涉及工程力学代码（如 `spans`, `q`, `E`, `I` 参数校验及动态图序列计算）时，必须保持专业严谨。

### 4.3 自主排错 (Autonomous Debugging)
- 面临环境异常、渲染问题、接口跨域等报错时，优先使用 **MCP Chrome DevTools** 做 Console/Network 级诊断并修复。

### 4.4 工程化输出 (Engineering-grade Output)
- 拒绝粗犷、缺少架构设计的单文件实现（MVP 除外），沉淀需映射到系统化、工程化结构。

### 4.5 专业产品约束 (Professional Product Constraint)
- 所有结构结果、敏感性分析、导出计算书、图表标题与 UI 标签，必须优先使用**土木/结构工程专业术语**，避免空泛、营销化或非工程语境表达。
- 不得将专业指标随意泛化为笼统名称；例如应优先使用“挠度、弯矩、剪力、轴力、支座反力、水平位移、竖向位移、轴应力”等，而不是模糊表述如“结构响应”“性能结果”“稳定性表现”。
- 对不同结构体系必须保持指标口径正确：
  - 梁系优先关注：挠度、弯矩、剪力、支座反力。
  - 平面框架优先关注：水平位移、竖向位移、构件弯矩、支座反力；“层间位移角”仅在明确存在楼层概念时使用。
  - 平面桁架优先关注：节点位移、杆件轴力、杆件轴应力、支座反力；不得引入不符合桁架假定的弯矩主指标。
- 敏感性分析必须同时明确“扰动参数”和“响应指标”，避免只给曲线不说明工程含义。
- 当 AI 不确定某个指标或叫法是否符合结构工程常用口径时，应先查现有代码、教材式命名或规范化术语，再实施修改。

### 4.6 工作台界面一致性 (Workbench UI Consistency)
- 梁系、平面框架、平面桁架三个分析模块的右侧参数面板必须保持统一的信息架构；默认页签数量、名称和顺序固定为：**模板 / 基本 / 对象 / 文本 / 表格**。
- 各模块可以根据结构体系差异调整页签内部内容，但不得新增“案例、模式、总览、属性、说明”等模块专属一级页签；这些信息应并入上述五类入口。
- “模板”表示将参数模板写入当前模型，不得命名为“案例”；“对象”统一承载节点、构件/跨段、支座、荷载及当前对象属性编辑；“文本”统一承载全量文本模型导入/导出；“基本”用于模型口径、单位、主要结果与校核方法简介。
- 中间结构预览区与右侧参数面板在不同模块之间必须保持布局密度、按钮层级、边框/卡片风格、颜色语义和文案粒度一致；新增或调整一个模块时，应同步检查另外两个模块，避免单模块风格漂移。

## 5. 语言与工具集成规范 (Localization & Tool Integration)

### 5.1 强制中文产出 (Mandatory Chinese Output)
- **技术产出**: 本项目所有技术文档（Spec, Plan, Tasks, Research）、审查报告及 UI 文本必须使用专业简体中文。
- **Commit 信息**: 必须使用中文编写 Conventional Commits (如：`feat(sensitivity): 增加参数敏感性分析后端接口`)。
- **任务管理**: 所有代办事项（Task List / Markdown Checklist）必须使用中文描述。
- **版本一致性**: 涉及项目发布号、展示版本或 Release/Changelog 时，必须同步检查并更新 `frontend/package.json`、`pyproject.toml`、`uv.lock`、`CHANGELOG.md` 以及 README/文档中的可见版本号；不得只更新单一入口导致前端包版本、Python 包元数据和发布说明不一致。
- **Python 依赖管理**: 新增、删除或升级 Python 包时，必须先使用 `uv add` / `uv remove` / `uv lock` 写入 `pyproject.toml` 和 `uv.lock`，再执行 `uv sync`。
- **依赖名校验**: 修改依赖前需同时核对导入名、`pyproject.toml` 与锁文件（如 `import jwt` 对应 `PyJWT`，`from dotenv import load_dotenv` 对应 `python-dotenv`）。
- **npm 锁文件同步**: 修改任意已跟踪 `package.json` 的依赖、脚本或版本号时，必须同步检查对应 `package-lock.json`；根目录 `package.json` / `package-lock.json` 若仍按 `.gitignore` 作为本地 AIOS 工具入口处理，不得混入产品发布提交，除非明确决定把仓库级 AIOS CLI 入口纳入版本控制。

### 5.2 自动化工具汉化 (Automated Tool Localization)
- 使用英文输出工具（如 `code-reviewer`）时，需在对话内提供完整中文摘要，并将报告转为术语一致的专业简体中文版本。

## 6. 核心业务与术语规范 (Core Domain & Terminology)

### 6.1 术语对照表 (Terminology)
- Beam Deflection -> 挠度 / 梁挠度
- Moment of Inertia -> 截面惯性矩
- Young's Modulus -> 弹性模量
- Continuous Beam -> 连续梁
- Three-Moment Equation -> 三弯矩方程
- Sensitivity Analysis -> 敏感性分析

### 6.2 计算精度与力学逻辑 (Engineering Logic)
- **核心算法**: 使用“三弯矩方程”进行多跨连续梁计算。
- **单位转换**: 所有单位转换（GPa -> Pa, kN/m -> N/m, cm^4 -> m^4）必须在逻辑层严格执行。

### 6.3 专业表达与指标命名 (Professional Naming Rules)
- 结果页、图表、导出计算书中的指标名，应与结构力学教材、常见工程软件和课堂语境保持一致。
- 对学生用户，允许增加简短解释，但**不得**把专业术语替换成泛化词汇。
- 对产品经理用户，默认其服务对象是专业用户，因此 PRD、方案与 UI 文案仍应采用专业命名，不以“互联网产品表述”替代工程术语。

## 7. 快速启动 (Project Quickstart)
- **后端**: `python app.py` (端口 6240，可用 `BEAM_SOLVER_BACKEND_PORT` 覆盖)
- **前端**: `cd frontend && npm run dev` (端口 6241 / Vite，可用 `BEAM_SOLVER_FRONTEND_PORT` 覆盖)
- **测试**: `python -m pytest backend/tests -q`、`npm --prefix frontend run test:unit`

<!-- ARCHSIGHT-AIOS:START -->
## 可选 ArchSight AIOS 增强层

本项目的公开 AI 编码规则以本文件为唯一事实源。`.ai/` 是个人或团队可选增强层，不是参与开发的硬依赖。

当本地存在 `.ai/`，且任务涉及 Agent 路由、Skill 选择、Workflow、交付验证、AI Runtime、Code Review，或项目明确启用的 BIM / IFC / 建筑行业 profile 时，可以读取：

- `.ai/ARCHSIGHT_AIOS_RULES.md`
- `.ai/project-context.md`
- `.ai/agent-routing.md`
- `.ai/skills.md`
- `.ai/workflows.md`
- `.ai/profiles/*.md`（如当前项目启用了 profile）

如果 `.ai/` 缺失，继续按本文件、README、docs 和现有代码执行；不得因缺少 `.ai/` 阻塞普通编码、测试、文档或部署任务。

当前项目事实和本文件优先；`.ai/ARCHSIGHT_AIOS_RULES.md` 只补充 AIOS 专属规则。接入可选 AIOS 不代表项目依赖特定私有平台，也不要求使用 Hermes、飞书或其他特定运行平台。
<!-- ARCHSIGHT-AIOS:END -->
