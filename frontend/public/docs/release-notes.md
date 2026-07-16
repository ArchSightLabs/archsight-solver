# 版本发布记录

<!-- 本文件由根目录 CHANGELOG.md 生成，请勿直接编辑；运行 npm --prefix frontend run sync:release-notes 更新。 -->

## v1.6.1

发布时间：2026-07-16

本版是 v1.6 Host Protocol 1.0 的首次仓库内置 Reference Host 基础接入验证与项目契约可靠性更新，不新增结构分析域，也不声称任何外部宿主或第三方生产部署已经完成接入。

重点变化：

- 将 `examples/host-iframe-demo` 升级为零框架 Reference Host，使用真实双 origin、精确 `targetOrigin`、session/nonce 会话绑定和浏览器 localStorage 托管保存。
- 重构 Reference Host 的产品边界：宿主顶栏负责工程新建、打开、保存和只读审阅，Solver 通过 `embed=1` 只展示工程树、参数建模、结构计算、敏感性分析和结果工作台，协议诊断默认收起。
- 为 Host 保存链路增加 `requestId` 确定快照握手与本地修订校验，避免陈旧回执清除后续编辑；无效工程打开会回滚并恢复既有会话。
- 嵌入模式停止读写 Solver 本地项目草稿，避免外部宿主工程与独立工具或其他宿主会话发生浏览器存储串扰。
- 新增 `python scripts/run_host_iframe_demo.py` 一条命令启动 Solver 与 Reference Host；支持连接已有 Solver 的 `--host-only` 模式，并补充 VS Code `Host iframe demo` 启动入口。
- 新增容器运行时 `ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS` 配置，已发布镜像可按部署环境设置精确宿主白名单，不需要重新构建前端。
- 修正 bootstrap ready 与公开 `solver-host-message` JSON Schema 的差异：bootstrap ready 可省略会话字段，launch 后的 session ready 必须回显 `sessionId` 与 `nonce`。
- 从 `document.referrer` 只解析 allowlist 内的精确 http/https origin，不再使用 `postMessage(..., "*")`；无 referrer 时由宿主在 iframe load 后主动 launch。
- origin 配置会忽略 `*`、子域通配、opaque origin、带路径/query/hash 或认证信息的无效值，继续保持精确白名单边界。
- Reference Host 会在 launch 前协商五项必要 capability；缺少 `acceptHostSaveRequest` 等能力的旧 Solver 会显示不兼容并禁用工程操作，不再出现“已连接但无法保存”的假成功。
- 宿主发起保存后增加 8 秒响应超时与重复请求门禁；Solver 未返回确定快照时保持现有保存状态并给出可见失败信息。
- 正式 HTML 响应新增与运行时 allowlist 同源的 CSP `frame-ancestors`，在浏览器渲染层阻止未授权站点嵌入。
- 新增 canonical `sample-project.slv`，由前端 parser、后端项目健康检查和发布门禁共同验证，避免示例项目契约漂移。

质量门禁：

- Chromium 直接运行公开 Reference Host，覆盖跨 origin 可编辑接入、项目变更、保存、刷新重开、只读和非法 origin 拒绝。
- Reference Host 浏览器验收额外锁定嵌入模式不渲染独立应用 Header，并覆盖宿主新建、打开、保存工程生命周期。
- 原 v1.6 同源 Host 回归继续覆盖 launch/change/save/result、只读锁定和非父窗口拒绝。
- Host Bridge 单元测试和后端 JSON Schema 测试覆盖 bootstrap/session ready、严格 origin 归一化和 canonical 示例文件。
- CI 与 tag release 同时运行 v1.6.1 Reference Host 和既有 v1.6/v1.5 发布回归。
- Docker 发布门禁在构建后注入运行时 allowlist，并复用同一 Playwright 用例验证独立 Host 的握手、保存与刷新重开，不再只检查容器 health。

## v1.6.0

发布时间：2026-07-12

本版定位为“中性宿主接入 + 本地项目契约增强”。Solver 继续保持开源核心和个人工具边界，不引入账号、组织、远程存储、授权或商业平台逻辑。

重点变化：

- 新增中性 Host iframe 协议，贯通 launch、project changed、save request、save result 和 error 消息；跨域宿主必须进入 origin allowlist，会话使用协议版本、`sessionId`、`nonce` 和父窗口来源共同约束。
- Host `readonly` 由状态标签升级为真实只读边界，统一锁定建模 mutation、工程新建/导入/保存、分析对象增删和项目设置，同时保留分析对象浏览与结果审阅。
- 新增 `.slv` 项目文件 manifest、artifact manifest、稳定 integration errorCode 和四类 JSON Schema registry，明确 single-json 当前能力与未来容器格式边界。
- 新增 `project_document_health` 能力，CLI / MCP 可检查项目文件版本、ASMS-JSON 契约版本、manifest、对象分布、活动对象、迁移诊断和 host readiness。
- 工作台项目信息弹窗新增“项目契约”页签，展示项目文档 kind、schema、manifest、活动对象、导出 manifest、host 会话和证据链状态。
- `project_template_registry` 通过 CLI / MCP 暴露 24 个内置模板的结构体系、主要结果指标、入口、支持动作和 benchmark 证据；公开 templateId 可直接进入 Host load / solve / export，不再存在发现契约与执行契约断链。
- README、快速开始、API 参考、Agent 集成指南和 host iframe demo 同步补充项目健康检查与模板 registry 调用方式。
- ECharts 升级到 6.1.0，关闭旧版公开 XSS 风险；CI 和 tag 发布对 production npm dependency 的 moderate 及以上漏洞执行硬门禁。
- `lxml` 升级到 6.1.1，修复镜像扫描检出的高危漏洞 CVE-2026-41066；tag 发布对镜像中已有修复版本的 HIGH / CRITICAL 漏洞保持零容忍。

质量门禁：

- 后端全量测试通过：517 passed，2 skipped；benchmark、项目健康、运行时 schema、MCP、模板 registry、CLI 和三类结构 Host-to-export 回归均通过。
- 前端 lint、TypeScript、366 项单元测试和生产构建通过；Chromium 发布主链路 10 项通过，Chromium / Firefox / WebKit DOCX 同源工程图矩阵 12 项通过。
- v1.6 Host iframe 验收覆盖 editable、真实 readonly、save handshake 和非父窗口消息拒绝；v1.5 首算与工况组合验收继续作为跨版本回归保留。
- 版本一致性门禁覆盖 `pyproject.toml`、`uv.lock`、前端 package/lockfile、CHANGELOG 和公开 release notes。
- Docker 发布门禁覆盖非 root 运行、容器健康检查、镜像漏洞扫描、SPDX SBOM、制品 SHA-256 哈希和 tag 驱动的 GitHub Release。

## v1.5.0

发布时间：2026-06-22

本版跳过 v1.4.1，但不作为小修补发布。v1.5.0 的发布定位调整为“高可用建模工作台大版本”：在不新增第四类分析对象、不放松数值可信边界的前提下，围绕操作习惯、功能补充和建模简化，缩短从建模到首算的路径。v1.4.0 后的 esbuild 二进制完整性告警修复一并作为 v1.5.0 发布基线。

重点变化：

- 梁系模板页新增连续梁快速生成和“生成并计算”，可按跨数、单跨长度和全跨均布荷载生成跨段、支座和荷载，继续保持“跨段 / 支座 / 荷载”的梁系建模心智。
- 平面框架模板页新增规则框架快速生成和“生成并计算”，可按跨数、层数、跨度、层高、梁面均布荷载和顶层水平荷载生成节点、构件、支座和荷载。
- 平面桁架模板页新增平行弦桁架快速生成和“生成并计算”，可按节间数、节间长度、桁高和上弦节点荷载生成节点、杆件、支座和节点荷载，不引入弯矩主指标。
- 三类快速生成入口增加工程预设和“即将生成”摘要；三类内置模板增加“打开并计算”，从公开验证映射模板直接进入首算结果。
- 新建分析对象增加建模路径选择：快速生成、对象编辑、文本导入分别直接打开模板、对象、文本页，减少创建后再次寻找入口的操作成本。
- 梁系补齐荷载工况和荷载组合编辑入口，覆盖均布、集中、线性分布荷载，并在对象导航和表格摘要中形成统一入口。
- 平面桁架补齐荷载工况和荷载组合编辑入口；节点、杆件、荷载复制 / 镜像 / 阵列、重命名和删除时同步维护工况内引用与组合系数。
- 结果页统一“主结果 / 工况 / 组合”来源切换，不再只支持平面框架；梁系和桁架的受力变形图、数据曲线和摘要会随当前来源切换。
- DOCX / XLSX 导出记录当前结果来源，并在 DOCX 导出图像生成时使用与界面一致的选中结果来源。
- 新增结构模型诊断中心，三类模块求解前统一提示支座约束不足、孤立节点/杆件、荷载工况/组合引用、单位/刚度异常和桁架不适用字段，让用户知道“为什么不能算”或“为什么结果可疑”。
- 新增计算书审阅模式，导出设置可选择“草稿 / 可审阅”，DOCX / XLSX 同步写入审阅状态、ASMS-JSON 契约版本、模型假定、结果来源、诊断警告和公开 benchmark 参考。
- ASMS-JSON 契约治理纳入 v1.5.0：三类求解 payload、JSON Schema、OpenAPI、前端类型和公开文档统一声明 `schemaVersion`，项目文件导入旧格式时给出迁移与契约版本校准提示。
- API envelope 前端归一化补齐梁系和桁架的 `loadCaseResults` / `loadCombinationResults`，避免后端已返回但前端视图丢失。
- 新增 v1.5 发布验收清单和 Playwright 荷载场景验收，覆盖梁系 / 平面桁架工况组合、结果来源切换和 XLSX 导出来源记录。
- 新增快速建模生成器单元测试，锁定连续梁、规则框架和平行弦桁架的生成数量、对象类型和专业指标边界。
- 新增模型诊断、项目文件契约迁移、ASMS-JSON `schemaVersion` 漂移和计算书审阅状态测试，锁定 v1.5.0 的可审阅交付边界。
- 版本号统一提升到 `1.5.0`，同步 `package.json`、`frontend/package.json`、`pyproject.toml`、`uv.lock` 和 lockfile 顶部项目版本。

质量门禁：

- 前端 `npm --prefix frontend run lint` 通过。
- 前端 `npm --prefix frontend run test:unit` 通过：360 passed。
- 前端 `npm --prefix frontend run build` 通过；Vite 仍提示部分 chunk 超过 500 kB，这是既有包体提示，不影响构建产物生成。
- 后端 `python -m pytest backend/tests -q` 通过：479 passed，2 skipped。
- 版本一致性检查 `python scripts/check_versions.py` 通过：根包、前端包、`pyproject.toml`、`uv.lock` 和 `CHANGELOG.md` 均为 `1.5.0`。
- Playwright `release-1-5-quick-modeling.spec.ts` 覆盖梁系、平面框架、平面桁架“生成并计算”到求解 payload 的首算路径。
- Playwright `release-1-5-quick-modeling.spec.ts` 覆盖三类内置模板“打开并计算”到求解 payload 的首算路径。
- Playwright `release-1-5-quick-modeling.spec.ts` 覆盖新建分析对象后直接进入指定建模路径。
- Playwright `release-1-5-load-scenarios.spec.ts` 覆盖梁系和平面桁架工况 / 组合发布验收。
- 前端单元测试覆盖求解前诊断中心、ASMS-JSON payload `schemaVersion` 和项目文件导入迁移诊断。
- 后端测试覆盖 JSON Schema / OpenAPI `schemaVersion` 漂移、计算书审阅状态和导出证据表。

## v1.4.0

发布时间：2026-06-08

相对 v1.3.0 的主要变化：

- 平面框架补齐构件均匀温度荷载闭环，覆盖文本模型、求解 payload、材料默认线膨胀系数、支座反力、杆端内力、节点位移和结果图切换。
- 平面框架新增支座位移约束，统一前端输入、ASMS-JSON / OpenAPI 契约、后端归一化和求解链路。
- 工作台增加撤销 / 重做、节点坐标网格吸附、表格批量编辑、复制、镜像、阵列和选中节点直连构件，降低显式节点 / 构件模型的编辑成本。
- 主控画布和结果图改进标注避让、尺寸标注偏移、选择状态、底部状态栏和紧凑布局；梁系、平面框架、平面桁架的常用模板在桌面与移动视口下保持可读。
- 多工况 / 荷载组合状态在工程文件恢复、求解 payload 和结果页切换中保持一致，降低模式切换或项目往返时的工况数据丢失风险。
- 结构化诊断优先展示后端 `diagnostics.issues` 明细，避免求解器已经返回工程诊断时被前端通用 fallback 文案覆盖。
- 公开 benchmark 扩展到 61 个通过算例，补充验证等级证据链，并同步更新验证报告与目录摘要。
- 后端收紧大请求体限制、异步作业幂等作用域、导出缓存一致性和响应 envelope 处理，降低长时间运行和重复请求下的状态漂移风险。

质量门禁：
- 后端全量测试通过：477 passed, 1 skipped。
- 前端单元测试通过：344 passed；lint、TypeScript 检查、生产构建和版本一致性检查通过。
- Playwright 发布验收覆盖三类内置模板冒烟、平面框架多工况 / 温度结果切换、网格吸附、撤销 / 重做、复制 / 镜像 / 阵列后的拓扑一致性。

## v1.3.0

发布时间：2026-06-02

相对 v1.2.0 的发布定位：

- v1.2.0 已经交付公开验证工程、投稿闭环和基础工程图；v1.3.0 的核心是把梁系、平面框架和平面桁架推进到“建模入口清楚、结果口径稳定、计算书图形可信、公开验证可复核”的专业工作台闭环。
- 这不是新增第四类分析域的版本，而是对三类二维线弹性静力分析对象做交付质量收口：对象建模、文本模型、结果图、DOCX / XLSX 计算书、ASMS-JSON、API、CLI/MCP、benchmark 和公开文档围绕同一套结构对象语义对齐。
- 重点修复 v1.2.0 后暴露出的可信度短板：框架/桁架计算书不能再退回与页面口径不一致的降级示意图，梁系不能因为三类模块统一而丢失“跨段 / 支座 / 荷载”的行业常用建模心智。

工作台建模与交互：

- 三类结构模块统一为“模板 / 基本 / 对象 / 文本 / 表格”五页签；梁系、平面框架和平面桁架共享入口秩序，但保留各自正确的专业对象口径。
- 梁系拆出模板、基本、跨段、支座、荷载、文本模型和表格摘要入口，恢复梁系以“跨段 / 支座 / 荷载”为第一建模心智，并在文本模型中保留支座自由度语义。
- 平面框架补齐节点、构件、材料截面、端部释放、节点弹性约束、荷载、荷载工况和荷载组合编辑入口，支持选中节点直连新增构件，减少手工维护节点连接的摩擦。
- 平面桁架补齐节点、杆件、支座、荷载和文本模型编辑入口，统一杆件编号、节点连接、材料标签和支座节点摘要，避免把桁架杆件误导为受弯构件。
- 对象摘要、基本页、结果页受力变形、荷载编辑器、模板库和计算书选项统一使用共享对象词表；框架使用“构件”，桁架使用“杆件”，梁系使用“跨段 / 支座”，降低跨模块术语漂移。
- 主控建模画布改为按模型规模自适应显示，普通模板默认完整可读，高密度模型才进入低倍缩放与可平移画布；标签布局增加遮挡控制，降低大模型节点、构件/杆件、荷载和尺寸标注混叠风险。
- 结果页收敛为统一的内容区、指标选择器、结果工具栏和工程图预览结构，敏感性分析响应指标从共享结果指标目录派生。
- **受力变形主视图升级**：统一三类分析对象的“受力变形”主视图，支持位移倍率和未变形结构、极值、荷载图层的动态显隐控制；优化实际变形比例下大跨结构内力图和位移图的视觉表现与可读性。
- **视觉风格与信息密度收口**：收紧基本页、系统设置面板、模板库等界面的文本说明与密度，降低用户的视觉断层；统一应用内 SVG 工程图（字重、标号）、ECharts 数据曲线与 DOCX 计算书导出图形的线条粗细（统一向 1.5 基准靠拢），消除视觉割裂。

模板、公开案例与验证集：

- 新增 4 个高频专业模板并写入模板 benchmark 映射：梁系“两端固结均布荷载”“一端固结一端简支”，平面框架“坡屋面门式刚架”，平面桁架“平行弦桁架”。
- 所有内置模板均维护 `data/verification/template_benchmark_map.json` 映射；无法完全对应公开 benchmark 的模板明确标注“相近/相关”，不把相近算例包装成完全验证。
- 公开验证工程继续由 benchmark catalog 生成，覆盖 33 个公开算例：梁系 12 个、平面桁架 8 个、平面框架与框架梁退化验证 13 个；前端“公开案例”和 `GET /api/examples/projects` 使用同一份数据。
- 公开案例、计算书和 API 文档继续携带 `caseId`、验证来源、标准值、容许误差和校核指标，方便第三方平台、教学场景和 Agent Runtime 复核。
- `BM-006` 作为公开的框架梁退化样例保留在验证工程中，但机器预期状态仍为 `REVIEW`；发布说明和验证材料明确其人工复核边界，不把它表述成完全合格样例。

计算书与导出：

- 框架与桁架 DOCX 导出改为使用前端同源工程图 PNG，保留节点、构件/杆件、支座、滚动支座角度、荷载、尺寸、结果图名称和控制值标注，不再混入旧的非 UI 同源曲线或降级结构图。
- 缺少前端同源图片时，DOCX 导出会明确暴露缺图语义；测试锁定“不能伪装成已有工程图”的行为，避免计算书交付材料出现静默降级。
- 计算书图形范围、插图模式、图形 key 和排版选项收敛到共享图形目录和共享导出选项，后端 DOCX 插图断言、前端 `reportImages` 和 Playwright 导出矩阵围绕同一目录验证。
- 大模型计算书插图按节点规模扩展画布，超宽图形自动切换横向页面，降低固定画布导致的裁切、二次压缩和图例拥挤风险。
- 梁系计算书补齐材料与跨段刚度语义，框架/桁架计算书补齐材料截面摘要、支座节点摘要、验证来源证据链和适用边界说明。
- 导出文件名统一按分析对象和导出类型生成，WORD 计算书、XLSX 参数表与前端下载状态使用一致口径。

专业契约、API 与 Agent 集成：

- 新增共享目录：材料、支座、结果指标、计算假定、计算书图形、导出选项和 ASMS 关键字段；前端、后端、API 文档、文本模型和导出逻辑通过共享事实源减少字段漂移。
- JSON Schema、OpenAPI、ASMS-JSON 文档和 MCP 能力说明同步扩展，覆盖公开案例、benchmark 投稿、计算书导出、异步作业和 schema registry 等集成入口。
- 收紧桁架输入契约：拒绝弹性支座、滚动支座法向角、凝聚自由度、转角释放等不符合桁架假定的高级框架字段；桁架支座类型在前端契约中排除不适用的 `fixed` 口径。
- 收敛框架支座类型、节点弹性约束、滚动支座角度、材料默认值和构件连接规则，减少 UI、payload、schema 与计算书之间的专业边界不一致。
- 文本模型解析能力集中到共享基础函数，梁系、框架、桁架分别复用支座解析、荷载解析和对象归一化规则，降低新增语法膨胀风险。
- 本地异步作业文档和行为明确为轻量队列：状态默认写入本地 SQLite，执行由当前服务进程承担；失联时显式失败，不承诺多实例分布式调度或生产级幂等重试。

文档、部署与开发体验：

- 新增结构力学入门文档，覆盖三类分析对象、支座类型、梁系、桁架、框架、符号与方向约定，帮助开发者、学生和贡献者理解当前开源核心的力学边界。
- 更新 README、能力边界、API Reference、ASMS-JSON、Agent 工程流、Agent 集成和公开路线图，明确“可验证、可复核、可导出”的开源核心定位。
- 新增部署模板与运维脚本：Docker Compose 示例、Nginx 示例、部署说明、镜像构建脚本、远程部署脚本和端口清理脚本，补齐公开发布后的私有部署入口。
- 新增 `AGENTS.md`、`CLAUDE.md`、`GEMINI.md` 和 `AI_CODING_RULES.md`，把项目定位、结构工程术语、中文输出、版本同步和验证要求沉淀为 AI 编码入口。特别固化了强制结构化提交流程（包含 Constraint, Rejected, Directive 等字段）以保证协作上下文透明。
- 前端单元测试入口收敛为 `npm --prefix frontend run test:unit`，计算书图形导出增加 Chromium / Firefox / WebKit 三浏览器矩阵入口，发布构建前自动从 `CHANGELOG.md` 同步前端 release notes。
- 梳理 VS Code 及本地全栈调试（Antigravity）入口，修复调试启动顺序。

质量门禁：

- 后端测试覆盖公开 benchmark、公开案例、JSON Schema / OpenAPI、材料/支座/结果指标共享目录、报告图形目录、计算书文件名、异步作业、文本模型和三类工作台 payload。
- 前端测试覆盖模板 benchmark 映射、材料与支座词表、对象术语漂移、节点连接、文本模型、主控画布尺寸、报告图形生成、计算书选项、结果指标和导出视觉契约。
- Playwright 视觉链路锁定框架/桁架 DOCX 导出必须携带前端同源图片，并通过媒体字节比对防止同源插图退化。
- 当前发布验证保留公开验证集 33 个算例全部通过的证据，同时保留 `BM-006` 的 `REVIEW` 治理标记，区分“自动回归通过”和“工程结论已完全背书”。

## v1.2.0

发布时间：2026-05-29

主要变化：

- 新增公开验证工程入口与验证投稿闭环，覆盖公开案例浏览、投稿包生成、Issue 模板和后端投稿预审。
- 增强工作台工程图可读性，补充梁系、平面桁架、平面框架的尺寸标注、关键结果图和视觉基线。
- 统一计算书图形契约，导出报告优先使用前端同源工程图，并增加导出图形前置校验。
- 扩展公开 benchmark 数据、验证目录摘要、OpenAPI / JSON Schema 契约和 MCP 能力文档。
- 优化大模型编辑、工程树信息密度、公开案例可读性和桁架支座/杆件长度建模表达。
- 修复图表 tooltip HTML 注入风险，补充 HTML 转义、图形契约、投稿包和大模型限制相关测试。

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

- 首个公开版本，交付梁系、平面桁架、平面框架三类线弹性静力分析工作台。
- 支持参数建模、结构计算、敏感性分析、结果图表、模板库和 Word / Excel 计算书导出。
- 提供 `/api/calculate`、`/api/sensitivity`、`/api/export` 等基础接口。
- 结果口径覆盖挠度、弯矩、剪力、节点位移、杆件轴力、轴应力和支座反力。
