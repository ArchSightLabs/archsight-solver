# 三条黄金流程

本文件把“有人能访问”进一步约束为三条仓库内可复跑的成功路径。它们是产品验收入口，不要求招募外部试用者、不要求第三方系统完成接入，也不把流量、订单或人工反馈作为 GO 条件。

## 流程 A：结构工程师携带并复核一次计算

目标：从当前工程结果得到计算书和可独立复算的证据包。

1. 打开在线工作台或本地 Web，选择“简支梁均布荷载”等内置模板。
2. 运行计算，确认结构体系、单位、支座、荷载、诊断和结果来源。
3. 查看受力变形、工程图和结果摘要；需要时切换主结果、工况或组合。
4. 从“成果导出”下载 DOCX/XLSX 和可信计算包。
5. 使用安装态 CLI 验证工作台下载的包：

```powershell
python -c "import json; p=json.load(open('archsight-solver-beam.solver-verification.json',encoding='utf-8')); json.dump({'package':p},open('verify-request.json','w',encoding='utf-8'),ensure_ascii=False)"
archsight-solver-tool verification_package_verify --input verify-request.json --pretty
```

成功证据：

- 工作台导出时结果状态为“已同步”，文件来源与当前分析对象一致。
- CLI 返回 `status: "pass"`、`integrityValid: true`、`replayMatched: true`。
- 改动模型后旧结果失效，不能继续导出；请求期间改模时返回文件被丢弃。

专业边界：这条流程证明软件记录与复算一致，不代替工程师核对输入、规范、组合、构造和安全责任。

## 流程 B：教师或学习者解释公开 Benchmark

目标：把“答案相近”升级为“知道标准值、容差、来源和复算状态”。

1. 从工作台顶部“公开案例”打开梁、桁架或框架验证工程。
2. 阅读案例 `caseId`、验证等级、标准值、容许误差和来源说明。
3. 运行当前对象并对照控制位置、位移、内力或反力，不只看“通过”。
4. 保持模型或做一次明确的参数变化，重新计算并解释结果变化；不要把变更后的结果继续称为原 Benchmark 标准答案。
5. 导出可信计算包并用 CLI 复算；另用公开算例工具重跑目录事实源：

```powershell
'{"caseId":"BM-001"}' | archsight-solver-tool benchmark_case_run --pretty
```

成功证据：

- 公开算例返回 `passed: true`，关键指标在案例声明容差内。
- 可信计算包复算为 `pass`；如果换用不同产品版本但数值一致，状态为 `review` 而不是伪装成同版本 `pass`。
- 学习记录能区分“公开标准值”“当前模型结果”“软件复算一致性”和“人工解释”。

教学边界：公开算例和软件结果不替代教材、课程评价、教师判断或真实工程设计。

## 流程 C：开发者五分钟创建并验证计算包

目标：不依赖仓库 cwd、私有平台、PyPI 或 npm registry，从 GitHub Release 资产完成确定性调用。

1. 下载 wheel 和 `SHA256SUMS`，校验文件摘要后安装：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install .\archsight_solver-1.8.2-py3-none-any.whl
```

2. 按[五分钟英文 Quickstart](en/quickstart.md)创建 `create-request.json`。
3. 创建并验证计算包：

```powershell
archsight-solver-tool verification_package_create --input create-request.json --pretty > created.json
python -c "import json; d=json.load(open('created.json',encoding='utf-8')); json.dump({'package':d['package']},open('verify-request.json','w',encoding='utf-8'),ensure_ascii=False)"
archsight-solver-tool verification_package_verify --input verify-request.json --pretty
```

4. 需要 Agent Host 时启动 `archsight-solver-mcp`，调用 `verification_package_create` / `verification_package_verify`。
5. 需要 Web/API 时优先使用 Release 公开离线镜像；具有 GitHub Packages 权限时也可使用 GHCR 不可变 tag。需要 iframe 宿主时安装同一 Release 的 Host Client tarball。

成功证据：

- 安装态命令从 `site-packages` 读取运行资源，不依赖仓库目录。
- CLI/MCP 共享 12 个工具与同一计算包 Schema；创建后的复算为 `pass`。
- Host Client 临时 npm 项目能完成 ESM、类型与 Protocol 1.0 生命周期检查。
- 使用者能从[功能与适用边界](capabilities.md)指出三类分析对象和明确非目标。

集成边界：五分钟路径证明发布资产可安装和公共契约可调用，不证明任何外部系统已生产接入，也不要求第三方接入作为本版发布门槛。

## 自动化映射

| 黄金流程 | 主要自动化证据 |
|---|---|
| 工程师 | 工作台可信计算包 Chromium 下载/竞态测试、三类计算书回归、CLI 复算 |
| 教师/学习者 | 71 个公开 Benchmark、独立刚度法基线、工作台公开案例与来源展示 |
| 开发者 | wheel/sdist 隔离安装、Host Client tarball 临时安装、REST/CLI/MCP 契约、Docker 健康检查 |

正式候选阶段必须把这些证据与版本一致性、三浏览器、Docker、SBOM、Trivy、校验和和 GitHub Release 资产一起复核。
