# ArchSight Solver v1.9.0 发布验收

## 发布边界

v1.9.0 只扩展 Solver 的可嵌入产品外壳与 Host Protocol 可选能力，不改变结构求解算法、数值结果、项目文件 Schema 或导出格式。Cloud 继续拥有身份、租户、远程工程、revision 与分享；Solver 不持有 Cloud token，也不调用 Cloud 存储 API。

## 候选状态

| 项目 | 状态 | 证据 |
| --- | --- | --- |
| 前端 lint / TypeScript | PASS | `npm --prefix frontend run lint` |
| 前端单元测试 | PASS | 461 / 461 |
| Host Protocol JSON Schema | PASS | `backend/tests/test_json_schema_contracts.py` 41 / 41 |
| 契约生成一致性 | PASS | `uv run python scripts/generate_contract_types.py --check` |
| 前端生产构建与 Host Client dist | PASS | `npm --prefix frontend run build` |
| 独立 Solver 与 Host 集成浏览器回归 | PASS | Chromium Host 相关用例 18 项通过，1 项按候选容器条件跳过 |
| Cloud 双域本地工作台 | NOT RUN | 待使用当前 Solver 与 Cloud 精确源码完成 Chrome 验收 |
| 正式 Git 提交与 annotated tag | NOT RUN | tag 只能在实际部署与公网验收一致后创建 |
| GHCR 镜像 / 生产部署 | NOT RUN | 待候选提交和 Cloud 联调通过 |
| 公网 `solver.archsight.cn` 验收 | NOT RUN | 待部署后核对版本、revision、Host capability 与页面行为 |
| 回滚验证 | NOT RUN | 待验证 v1.8.4-r1 独立回滚与 Cloud fallback |

## 必须验收的用户路径

1. 独立 Solver 保持原文件菜单、本地保存、公开案例、验证投稿、主题和系统设置。
2. `embed=1` 只显示一排 Solver Host Portal 顶栏与完整工作台，不叠加 Cloud 左侧菜单或第二排文件菜单。
3. 顶栏显示 Solver 自己的 `v1.9.0`；Cloud 版本与 revision 不进入 Solver 事实源。
4. 工程、保存、版本、分享动作只在 Host allowlist 中出现；只读与匿名分享不能请求保存。
5. 保存动作使用同一 requestId 完成快照、Cloud revision 和 saveResult；保存期间继续编辑后仍保持 dirty。
6. 公开案例从独立 Solver 新标签页打开，不替换当前 Cloud 工程。
7. 主题可切换，系统设置和验证投稿继续使用 Solver 原生实现。
8. 旧 Solver 不声明可选 portal capability 时，Cloud 的最小 fallback 仍可完成工程与保存；新 Solver 遇到旧 Host 时不发送 portal action。

## 发布顺序

1. 提交并推送 Solver v1.9.0 候选源码。
2. 构建、部署并公网验收 Solver；确认原五项 capability 不变且额外声明可选 `requestPortalAction`。
3. 从精确 Solver 提交同步官方 Host Client dist、类型声明、许可证、NOTICE、SHA-256 与 source commit 到 Cloud。
4. 提交、推送并部署 Cloud v1.4.0；完成双域保存、版本、分享、主题、设置和旧能力 fallback 验收。
5. 只有当线上源码、镜像 revision、公网验收和版本号一致后，分别创建并推送对应 annotated tag。

## 回滚边界

- Solver 可独立回滚到 `v1.8.4-r1`；Cloud 必须检测缺少可选 portal capability，并显示不遮挡 Solver 的最小工程工具条。
- Cloud 可回滚到上一稳定版本；新 Solver 因旧 Host 不发送 `hostUiActions`，不会发出 portal action，独立计算功能仍可用。
- 不允许复用或移动历史 tag；回滚后再次发布必须使用新的不可变发布提交和标签。
