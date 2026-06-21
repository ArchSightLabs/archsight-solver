# v1.5.0 发布验收清单

本文记录 v1.5.0 发布前必须复核的建模易用性、荷载场景、结构模型诊断、计算书审阅状态、ASMS-JSON 契约治理和导出证据链。v1.5.0 是高可用建模工作台大版本，不新增第四类分析域，但必须证明三类既有模块能更快完成首个可计算模型，并且 `loadCases` / `loadCombinations` 编辑、结果切换、求解前诊断和导出来源一致。

## 自动化验收

```powershell
python -m pytest backend/tests -q
npm --prefix frontend run test:unit
npm --prefix frontend run lint
npm --prefix frontend run test:visual -- release-1-5-quick-modeling.spec.ts --project=chromium --workers=1
npm --prefix frontend run test:visual -- release-1-5-load-scenarios.spec.ts --project=chromium --workers=1
npm --prefix frontend run test:visual:export-docx
git diff --check
```

其中前端单元测试覆盖：

- `workbench-quick-models.test.ts` 验证连续梁快速生成会生成跨段、支座和均布荷载。
- `workbench-quick-models.test.ts` 验证规则框架快速生成会生成稳定支座、节点、柱、梁、梁面荷载和顶层水平荷载。
- `workbench-quick-models.test.ts` 验证平行弦桁架快速生成只生成桁架杆件与节点荷载，不引入弯矩主指标。
- `template-section-content.test.ts` 验证快速生成入口仍位于模板页，不恢复重复模板标题和低价值伪按钮，并保留工程预设、生成摘要和一键首算入口。
- `model-diagnostics.test.ts` 验证三类模块的求解前诊断能识别支座约束不足、孤立节点、组合引用丢失、桁架不适用字段和刚度异常。
- `solver-payload.test.ts` 与 `test_json_schema_contracts.py` 验证三类 ASMS-JSON payload、JSON Schema、OpenAPI、前端类型和文档均声明 `schemaVersion`。
- `test_export_benchmark_evidence.py` 与 `test_report_options_contract.py` 验证计算书审阅状态、ASMS-JSON 契约版本、结果来源、诊断警告和 benchmark 参考进入 DOCX / XLSX 同源表格。

`release-1-5-quick-modeling.spec.ts` 覆盖：

- 梁系从模板页点击“生成并计算”后，求解请求包含 3 跨、4 个支座和 12 kN/m 全跨均布荷载。
- 平面框架从模板页点击“生成并计算”后，求解请求包含规则框架节点、柱、梁和梁面均布荷载。
- 平面桁架从模板页点击“生成并计算”后，求解请求包含平行弦桁架节点、桁架杆件和节点荷载。
- 三类内置模板从模板页点击“打开并计算”后，直接进入对应模块首算结果，并形成梁系、平面框架、平面桁架求解请求。
- 新建分析对象选择“对象编辑”路径后，创建完成直接进入对应模块的对象页。

`release-1-5-load-scenarios.spec.ts` 覆盖：

- 梁系在对象页新增两个荷载工况和一个荷载组合，求解请求保留工况 ID、组合系数和组合标签。
- 梁系结果页出现“主结果 / 工况 / 组合”来源切换，选中组合后 XLSX 导出 payload 记录 `resultSource=combination`。
- 平面桁架在对象页新增荷载工况和荷载组合，求解请求保留工况 ID、组合系数和组合标签。
- 平面桁架结果页出现“主结果 / 工况 / 组合”来源切换，选中组合后 XLSX 导出 payload 记录 `resultSource=combination`。

`test:visual:export-docx` 继续覆盖 DOCX 图形导出矩阵，避免计算书插图和当前结果来源显示口径脱节。

## 手工验收

发布前至少按桌面视口手工走一遍下列路径：

- 梁系：进入“模板”，确认快速生成区有工程预设和“即将生成”摘要；使用连续梁“生成并计算”生成 3 跨、5 m、12 kN/m 模型；确认直接进入结构计算结果，返回对象页后显示跨段、支座、荷载。
- 平面框架：进入“模板”，确认快速生成区有工程预设和“即将生成”摘要；使用规则框架“生成并计算”生成 2 跨 1 层模型；确认直接进入结构计算结果，返回对象页后显示节点、构件、支座、梁面荷载。
- 平面桁架：进入“模板”，确认快速生成区有工程预设和“即将生成”摘要；使用平行弦桁架“生成并计算”生成 4 节间模型；确认直接进入结构计算结果，返回对象页后只展示节点位移、杆件轴力、轴应力和支座反力相关指标。
- 内置模板：梁系、平面框架、平面桁架各选一个公开验证映射模板，点击“打开并计算”，确认无需切换到结构计算页即可完成首算。
- 新建对象：分别选择“快速生成”“对象编辑”“文本导入”路径创建对象，确认创建后落到模板、对象、文本页，不需要再寻找右侧入口。
- 梁系：对象页新增 `DL` / `LL` 工况和 `ULS1` 组合，运行计算后分别切换“主结果”“恒载”“基本组合”，确认受力变形图、数据曲线和结果摘要随来源切换。
- 平面框架：导入含 `CASE` / `CASELOAD` / `COMB` 的文本模型，运行计算后切换普通荷载工况、温度工况和组合结果，确认温度荷载图例不会残留到普通荷载结果。
- 平面桁架：对象页新增 `VL` 工况和 `COMB1` 组合，运行计算后切换工况和组合，确认桁架结果只显示节点位移、杆件轴力、轴应力和支座反力相关指标，不引入弯矩主指标。
- 求解前诊断：分别制造梁系缺少竖向支座、框架支座约束不足、桁架含框架专属支座字段、组合引用不存在工况，确认诊断中心给出阻断或复核提示，并说明修正建议。
- 项目文件：打开旧 `.slv` / `.aslv.json` 样例，确认导入提示包含项目文件迁移、ASMS-JSON 契约版本校准和模型归一化说明；重新保存后写入当前项目文件版本与 ASMS-JSON 契约版本。
- 导出：在梁系、平面框架、平面桁架各选择一个非主结果来源并把审阅状态切到“可审阅”后导出 XLSX；至少抽查一次 DOCX，确认计算书或参数表记录当前来源是“工况”或“组合”，记录 `ASMS-JSON 契约版本`、审阅状态、诊断警告和 benchmark 参考，不是默认主结果。

## 阻塞发布条件

- 任一模块的快速生成入口无法生成可求解模型，“生成并计算”不能直接进入首算结果，缺少工程预设 / 生成摘要，或生成后不能继续进入对象页精细编辑。
- 任一模块内置模板的“打开并计算”不能完成模板载入和首算。
- 新建分析对象的建模路径选择失效，创建后没有进入用户选择的模板 / 对象 / 文本页。
- 快速生成入口破坏“模板 / 基本 / 对象 / 文本 / 表格”五页签信息架构。
- 梁系快速生成把主操作心智变成节点 / 杆件，或桁架快速生成引入不符合桁架假定的受弯主指标。
- 任一模块的求解 payload 丢失工况 ID、组合系数或组合标签。
- 任一模块的求解 payload、JSON Schema 或 OpenAPI 缺失 `schemaVersion`，或项目文件导入旧格式时没有兼容提示。
- 求解前诊断不能拦截明显不可解模型，或诊断文案无法说明“为什么不能算 / 为什么结果可疑”。
- 结果页切换到工况或组合后，受力变形图、数据曲线、结果摘要仍显示主结果。
- DOCX / XLSX 导出 payload 未携带当前 `resultSource`。
- DOCX / XLSX 未记录审阅状态、ASMS-JSON 契约版本、诊断警告或 benchmark 参考。
- 平面桁架结果页或计算书把弯矩、剪力作为桁架主校核指标。
- Vite 8 部署环境的 Node.js 版本低于 `^20.19.0` 或 `>=22.12.0`。

## 非阻塞但应记录

- 新增公开 benchmark 数量未从 61 推进到 100：这是持续建设目标，不单独阻塞 v1.5.0。
- 温度作用未扩展到桁架或梁系：当前仍按 [温度作用后续评估](../temperature-action-evaluation.md) 管理，不作为 v1.5.0 承诺。
- Playwright 仅跑 Chromium 的 `release-1-5-load-scenarios.spec.ts`：可作为发布前快速门禁；正式 release 或 nightly 应继续跑三浏览器 DOCX 导出矩阵。
