# 可信计算包 1.0

[English](en/verification-package.md) | 中文

可信计算包把一次确定性结构求解的输入、记录结果、来源证据和复算规则封装成可携带的 UTF-8 JSON 文件。Web、REST、CLI 与 MCP 使用同一个公开格式：`archsight-solver-verification-package@1.0.0`。

它解决的是“这份结果由什么输入、什么版本、什么规则得到，内容是否变化，当前求解器能否重放一致”，不解决发布者身份认证、工程签审或结构安全责任。

## 包含内容

| 区域 | 内容 |
|---|---|
| `solver` | 求解器名称、产品版本、响应信封和存储契约版本 |
| `analysis.input` | 原始结构求解输入 |
| `analysis.request` | 求解器回显请求；可用时包含 `normalizedRequest` |
| `analysis.model` | 归一化后的结构模型 |
| `analysis.recordedResult` | 去除非稳定生成时间后的完整记录结果 |
| `analysis.diagnostics` | 求解诊断与适用边界证据 |
| `evidence` | Web 结果来源、provenance、benchmark、jobId 或调用方证据 |
| `replayPolicy` | 固定绝对容差 `1e-8`、相对容差 `1e-6`，不忽略结果路径 |
| `integrity` | 输入、请求、模型、结果和整个包体的 SHA-256 摘要 |

格式版本与产品版本独立。Solver 升级不自动改变 `formatVersion`；只有包契约发生不兼容变化时才升级格式主版本。

## 从工作台导出

1. 打开模板、公开案例或 `.slv` 工程并完成当前分析对象求解。
2. 在结果页确认状态为“已同步”，并确认当前显示的是主结果、工况或组合。
3. 打开“成果导出”，选择“导出可信计算包”。
4. 浏览器下载 `archsight-solver-<beam|frame|truss>.solver-verification.json`。

工作台只允许从当前有效结果导出。模型参数、工程修订或分析对象在请求期间发生变化时，返回文件会被丢弃；DOCX 图片和计算书设置不会进入计算包生成链路。

## REST

生成并立即复算：

```http
POST /api/verification-packages
Content-Type: application/json
```

```json
{
  "payload": {
    "analysisType": "beam",
    "beamType": "simply_supported",
    "loadType": "uniform",
    "spans": [6],
    "q": 12,
    "E": 206,
    "I": 85000
  },
  "evidence": {
    "source": "rest-quickstart"
  }
}
```

复算已有包：

```http
POST /api/verification-packages/verify
Content-Type: application/json
```

```json
{
  "package": {
    "format": "archsight-solver-verification-package"
  }
}
```

第二个示例中的 `package` 应替换为完整包对象。机器可读契约见 `GET /api/contracts/schemas/solver-verification-package` 和 `GET /api/contracts/openapi`。

## CLI

安装 GitHub Release wheel 后使用 `archsight-solver-tool`；从源码运行时把命令替换为 `uv run python -m backend.capabilities.solver_cli`。

生成：

```powershell
archsight-solver-tool verification_package_create --input create-request.json --pretty > created.json
python -c "import json; d=json.load(open('created.json',encoding='utf-8')); json.dump({'package':d['package']},open('verify-request.json','w',encoding='utf-8'),ensure_ascii=False)"
archsight-solver-tool verification_package_verify --input verify-request.json --pretty
```

`create-request.json` 使用 REST 示例的同一 `{ "payload": ..., "evidence": ... }` 结构。验证工具接收 `{ "package": ... }`，上面的 Python 标准库命令从生成响应提取完整包并写入 UTF-8 请求文件。

验证工作台下载文件：

```powershell
python -c "import json; p=json.load(open('archsight-solver-beam.solver-verification.json',encoding='utf-8')); json.dump({'package':p},open('verify-request.json','w',encoding='utf-8'),ensure_ascii=False)"
archsight-solver-tool verification_package_verify --input verify-request.json --pretty
```

应保留下载包的原始 UTF-8 JSON。某些工具反序列化后会改写高精度数值，再序列化时包摘要会正确地变化；包装验证请求时不要对包内数值做舍入或格式转换。

## MCP

启动安装态 MCP Server：

```bash
archsight-solver-mcp
```

工具：

- `verification_package_create`：输入 `{ "payload": <ASMS-JSON>, "evidence": {} }`。
- `verification_package_verify`：输入 `{ "package": <完整可信计算包> }`。

两者复用 CLI 的 capability handler 和 JSON Schema，不维护第二套求解或比较实现。

## 状态与处置

| 状态 | 含义 | 建议 |
|---|---|---|
| `pass` | 格式、完整性和同版本复算均通过 | 可作为本次软件复核证据继续人工审阅 |
| `review` | 完整性和复算一致，但记录版本与当前版本不同 | 阅读版本差异与 warning 后再决定是否接受 |
| `fail` | 格式、Hash 或复算存在不一致 | 不使用该包代表原记录结果；检查 `mismatches` |

数值字段使用公开容差比较，非数值字段精确比较。差异报告提供 JSON Path、说明、期望值和实际值；最多返回 100 项，避免异常包造成无界输出。

## 责任边界

- SHA-256 只能发现包内内容变化，不证明是谁生成或发布。
- `pass` 只证明在当前公开契约和容差内复算一致，不证明模型假定、输入或工程方案正确。
- 可信计算包不构成数字签名、证书、第三方认证、规范设计、工程签审或结构安全结论。
- 真实工程使用仍需核对荷载、单位、支座、刚度、组合、适用规范和专业责任人复核。

三类角色的完整使用路径见[三条黄金流程](golden-flows.md)，能力范围见[功能与适用边界](capabilities.md)。
