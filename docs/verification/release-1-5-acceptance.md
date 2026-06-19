# v1.5.0 发布验收清单

本文记录 v1.5.0 发布前必须复核的荷载场景、结果来源和导出证据链。v1.5.0 不新增第四类分析域，验收重点是三类既有模块的 `loadCases` / `loadCombinations` 编辑、结果切换和导出来源一致性。

## 自动化验收

```powershell
python -m pytest backend/tests -q
npm --prefix frontend run test:unit
npm --prefix frontend run lint
npm --prefix frontend run test:visual -- release-1-5-load-scenarios.spec.ts --project=chromium
npm --prefix frontend run test:visual:export-docx
git diff --check
```

其中 `release-1-5-load-scenarios.spec.ts` 覆盖：

- 梁系在对象页新增两个荷载工况和一个荷载组合，求解请求保留工况 ID、组合系数和组合标签。
- 梁系结果页出现“主结果 / 工况 / 组合”来源切换，选中组合后 XLSX 导出 payload 记录 `resultSource=combination`。
- 平面桁架在对象页新增荷载工况和荷载组合，求解请求保留工况 ID、组合系数和组合标签。
- 平面桁架结果页出现“主结果 / 工况 / 组合”来源切换，选中组合后 XLSX 导出 payload 记录 `resultSource=combination`。

`test:visual:export-docx` 继续覆盖 DOCX 图形导出矩阵，避免计算书插图和当前结果来源显示口径脱节。

## 手工验收

发布前至少按桌面视口手工走一遍下列路径：

- 梁系：对象页新增 `DL` / `LL` 工况和 `ULS1` 组合，运行计算后分别切换“主结果”“恒载”“基本组合”，确认受力变形图、数据曲线和结果摘要随来源切换。
- 平面框架：导入含 `CASE` / `CASELOAD` / `COMB` 的文本模型，运行计算后切换普通荷载工况、温度工况和组合结果，确认温度荷载图例不会残留到普通荷载结果。
- 平面桁架：对象页新增 `VL` 工况和 `COMB1` 组合，运行计算后切换工况和组合，确认桁架结果只显示节点位移、杆件轴力、轴应力和支座反力相关指标，不引入弯矩主指标。
- 导出：在梁系、平面框架、平面桁架各选择一个非主结果来源后导出 XLSX；至少抽查一次 DOCX，确认计算书或参数表记录当前来源是“工况”或“组合”，不是默认主结果。

## 阻塞发布条件

- 任一模块的求解 payload 丢失工况 ID、组合系数或组合标签。
- 结果页切换到工况或组合后，受力变形图、数据曲线、结果摘要仍显示主结果。
- DOCX / XLSX 导出 payload 未携带当前 `resultSource`。
- 平面桁架结果页或计算书把弯矩、剪力作为桁架主校核指标。
- Vite 8 部署环境的 Node.js 版本低于 `^20.19.0` 或 `>=22.12.0`。

## 非阻塞但应记录

- 新增公开 benchmark 数量未从 61 推进到 100：这是持续建设目标，不单独阻塞 v1.5.0。
- 温度作用未扩展到桁架或梁系：当前仍按 [温度作用后续评估](../temperature-action-evaluation.md) 管理，不作为 v1.5.0 承诺。
- Playwright 仅跑 Chromium 的 `release-1-5-load-scenarios.spec.ts`：可作为发布前快速门禁；正式 release 或 nightly 应继续跑三浏览器 DOCX 导出矩阵。
