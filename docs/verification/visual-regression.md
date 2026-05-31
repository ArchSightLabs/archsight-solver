# 跨浏览器视觉回归

本项目使用 Playwright 维护工作台关键界面的跨浏览器视觉基线，覆盖 Chromium、Firefox 与 WebKit。

## 覆盖范围

- 桌面端梁系工作台初始态。
- 桌面端平面框架工作台初始态。
- 桌面端平面桁架工作台初始态。
- 移动端平面框架入口、参数面板与结果面板切换。

这些场景优先验证结构体系入口、参数面板、结果区域、状态卡与响应式断点是否出现遮挡、溢出或布局退化。

## 命令

```powershell
npm --prefix frontend run test:visual
npm --prefix frontend run test:visual:update
```

首次建立或有意更新视觉基线时使用 `test:visual:update`。常规回归使用 `test:visual`。

计算书 DOCX 图形导出链路需要覆盖 Chromium / Firefox / WebKit 三个浏览器项目，使用专用矩阵入口：

```bash
npm --prefix frontend run test:visual:export-docx
```

该入口按单 worker 顺序运行 `workbench-export-docx.spec.ts`，验证框架与桁架导出请求携带前端同源的结构预览图和模型叠加工程图。

若本地尚未安装 Playwright 浏览器二进制，先执行：

```powershell
npm --prefix frontend exec playwright install chromium firefox webkit
```

## 维护规则

- 修改工作台布局、导航、图表容器、主题变量或响应式断点后必须运行视觉回归。
- 新增结构体系入口时必须新增对应桌面端截图场景。
- 不得用扩大容差掩盖明显的文字溢出、遮挡或错位；应修正布局。
- 仅修改后端计算、纯文档或不影响浏览器渲染的测试代码时，不强制运行视觉回归。
