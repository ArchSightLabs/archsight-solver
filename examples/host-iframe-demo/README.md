# Host iframe demo

这个示例演示外部宿主如何以中性协议嵌入 ArchSight Solver。它只包含本地项目文档、iframe、`postMessage` 和保存回传，不包含身份、权限、远程存储或后台管理能力。

## 使用方式

1. 启动 solver 前端：

   ```bash
   npm --prefix frontend run dev
   ```

2. 用浏览器打开本目录的 `index.html`。
3. 确认 iframe 加载后点击“发送 launch”。
4. 在 solver 中修改项目或点击保存，左侧日志会显示 `project.changed`、`saveRequest` 等消息。

默认 iframe 地址为 `http://127.0.0.1:6241`，可在页面顶部输入框中修改。

## 对接前检查

demo 中发送的 `projectDocument` 是 `archsight-solver.project` 单 JSON 项目文件，包含项目文件版本、ASMS-JSON 契约版本和 manifest。外部宿主在正式接入前可先运行：

```bash
python -m backend.capabilities.solver_cli project_document_health --input path/to/project.slv --pretty
echo '{}' | python -m backend.capabilities.solver_cli project_template_registry --pretty
```

前者用于检查项目是否需要迁移或复核，后者用于读取内置模板、结构体系、主要结果指标和 benchmark 映射。
