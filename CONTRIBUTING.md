# 贡献指南

感谢你参与这个开源结构力学求解器工作台。

## 项目原则

- 先保证计算核可信，再扩展界面与功能
- 任何新增能力都要有可回归的测试
- 规范优先，文档优先，算例优先
- 本仓库采用 Apache-2.0 许可证，贡献内容需确认可以合法公开
- 贡献内容应服务梁系、二维框架、二维桁架三类核心能力；超出当前范围的大型能力建议先开 issue 讨论边界

## 提交前检查

提交代码前，请至少完成以下检查：

- 后端：`python -m pytest backend/tests -q`
- 前端：`npm --prefix frontend run lint`
- 前端构建：`npm --prefix frontend run build`

如果改动涉及计算结果，请补充或更新对应的回归用例。

如果改动涉及材料、支座、节点、跨段/构件/杆件、荷载、荷载工况/组合、文本模型字段或计算书导出字段，请先同步共享契约或共享词表，再补前端 payload、后端 schema、公开文档和漂移测试。不要只改 UI、API 或导出中的单一入口。

如果改动涉及内置模板，请同步检查 `data/verification/template_benchmark_map.json`；没有直接公开 benchmark 时，应明确标注“相近/相关”，并记录后续专项算例需求。

如果改动涉及计算书图形或结果插图，请同步检查 `shared/report-figures.json`、前端 `reportImages`、后端 DOCX 插图断言和 `npm --prefix frontend run test:visual:export-docx` 的适用性。

如果改动涉及版本发布记录，请只维护根目录 `CHANGELOG.md`；前端静态发布记录通过 `npm --prefix frontend run sync:release-notes` 生成，`npm --prefix frontend run build` 会在构建前自动同步。

如果改动涉及私有部署、高级分析、三维求解、规范校核或客户场景，请先开 issue 讨论边界。

## 新增算例或回归基线

如果你要补充新的典型算例，请同时完成三件事：

1. 在 `backend/tests/benchmark_catalog.py` 或相关测试中增加算例
2. 在 `backend/tests/test_benchmark_cases.py` 中增加对应断言
3. 必要时同步更新 README 或 `docs/` 下的公开说明

新增算例时，请优先选择：

- 可人工复核的经典工况
- 结果稳定、不依赖随机数的输入
- 对当前求解器最有代表性的边界场景

## 提交规范

- 分支建议使用 `codex/` 前缀
- 提交信息使用中文 Conventional Commits
- 描述要写清楚动机，不只写“改了什么”
- 如果是修复回归，最好在提交说明里点出对应算例或测试名

## PR 要求

Pull Request 请至少包含：

- 变更摘要
- 验证方式
- 风险说明
- 如涉及 UI，附截图
- 如涉及计算核，附测试样例或结果对照

## 讨论入口

- 功能问题：请优先开 feature request
- 缺陷问题：请优先开 bug report
- 文档问题：可直接提交修复 PR
