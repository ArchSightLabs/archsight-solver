# v1.5.0 规模与性能基线

本文记录 v1.5.0 的规模边界验证口径。性能结论必须来自可复跑脚本或测试，不写成营销承诺。

## 运行命令

```powershell
python scripts/measure_scale_baseline.py --repeat 3 --output docs/verification/performance-baseline-v1.5.0.json
```

脚本覆盖三类代表路径：

- `beam-100-spans`：100 跨连续梁，用于观察梁系大跨数求解路径。
- `frame-4x3-grid`：4 跨 3 层显式平面框架，用于观察节点 / 构件规模增长。
- `truss-public-benchmark`：公开桁架 benchmark，用于确认公开验证口径下的桁架求解路径。

## 发布口径

- 推荐规模不在 README 中写成绝对上限；当前仅记录本机和 CI 可复跑基线。
- 若性能基线明显回退，应先确认输入规模、求解器后端、Python / Node 版本和机器负载，再判断是否阻塞发布。
- DOCX 图形导出仍以 Playwright 三浏览器矩阵和 `workbench-export-docx.spec.ts` 为准；本脚本只覆盖后端求解耗时，不替代视觉回归。

## 后续扩展

- 增加更大平面框架和桁架规模梯度。
- 将 JSON 基线纳入 nightly artifact，而不是每次提交都覆盖历史趋势。
- 与公开 benchmark 增长计划联动，把高价值规模样例补充为可复核 benchmark。
