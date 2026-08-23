# 部署说明

本文说明 ArchSight Solver 的本地镜像构建、容器运行和 Docker Compose 入口。

当前仓库稳定版本为 2026-08-23 发布的 v1.8.0。Tag 发布工作流生成 GitHub Release、可能需要 GitHub Packages 授权的 GHCR 工作流镜像和公开校验制品；官方线上部署使用阿里云容器镜像服务，推送目标镜像及更新服务器仍是独立操作。只有阿里云目标仓库中的 v1.8.0 不可变镜像实际存在并完成摘要核对后才能部署。

## 单镜像模式

本仓库推荐使用单镜像方式部署：前端在构建阶段打包成 `frontend/dist`，后端 Flask 统一对外提供页面和 API。

本地构建镜像：

```powershell
docker build -t archsight-solver:latest .
```

Dockerfile 默认将 Node 22 与 Python 3.13 基础镜像固定到已验证 digest。若 Docker Hub 直连或本地 mirror 不稳定，推荐通过构建脚本和 `deploy/.env` 显式使用同 digest 的官方 Public ECR Docker Library 镜像：

```powershell
.\scripts\build-image.ps1 -Tag v1.8.0
```

脚本读取 `NODE_IMAGE` 与 `PYTHON_IMAGE`；`-RefreshBaseImages` 会先单独拉取两份固定基础镜像，用于主动刷新或诊断，不是每次构建的必要步骤。

## 正式演示站访问统计

Docker 镜像的前端配置在**构建阶段**写入，容器启动后的环境变量不能改写已经生成的 Vite 静态资源。官方镜像默认仅允许在 `solver.archsight.cn` 加载两类统计：

- Busuanzi：由应用根组件全局加载，在“系统设置 / 关于”中展示公开累计 PV/UV；
- ArchSight 自托管 Umami：使用 website ID `21791f13-6214-44db-8724-0e1dcd656bfb` 记录匿名页面访问和受限的工作台事件。

域名允许列表会阻止本地开发地址、CI 和其他自托管域名向官方统计服务发送数据。派生部署应保持关闭，或替换成自己的服务和 website ID：

```powershell
docker build `
  --build-arg VITE_ENABLE_BUSUANZI=false `
  --build-arg VITE_UMAMI_ENABLED=false `
  -t archsight-solver:latest .
```

需要接入自有 Umami 时，构建参数包括 `VITE_UMAMI_ENABLED`、`VITE_UMAMI_SCRIPT_URL`、`VITE_UMAMI_WEBSITE_ID`、`VITE_UMAMI_DOMAINS` 和 `VITE_UMAMI_TAG`。完整事件与隐私边界见 [访问统计与隐私边界](analytics-and-privacy.md)。

本地运行：

```powershell
docker run --rm -p 127.0.0.1:6280:6240 archsight-solver:latest
```

容器启动后，前端和后端会一起运行在 `http://127.0.0.1:6280`。

若 Solver 需要被其他 origin 的平台 iframe 嵌入，应在容器运行时配置精确宿主白名单，无需为每个宿主重新构建前端镜像：

```powershell
docker run --rm -p 127.0.0.1:6280:6240 `
  -e ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS=https://classroom.example.edu,https://review.example.edu `
  archsight-solver:latest
```

该配置只接受完整的 `http/https origin`，不接受 `*`、子域通配、路径或 query。未配置时只允许同 origin 宿主。

## 远程镜像标签

如需推送远程镜像，先登录镜像仓库：

```powershell
docker login --username=<your-account> registry.example.com
```

构建并打标签：

```powershell
docker build -t archsight-solver:v1.8.0 -t registry.example.com/example-namespace/archsight-solver:v1.8.0 .
```

推送：

```powershell
docker push registry.example.com/example-namespace/archsight-solver:v1.8.0
```

构建脚本只使用 BuildKit；不要通过 `DOCKER_BUILDKIT=0` 回退到已弃用的 Legacy Builder。镜像源异常应通过固定 digest、显式 `NODE_IMAGE` / `PYTHON_IMAGE` 和 `-RefreshBaseImages` 处理。

## Docker Compose

```powershell
docker compose up -d --build
```

Compose 默认将容器内 `6240` 端口绑定到宿主机本地端口。如需调整宿主机端口，可设置 `APP_HOST_PORT`；外部宿主接入使用 `ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS` 配置运行时白名单。

公网部署时建议只通过外层 Nginx、Caddy 或同类网关暴露 `80/443`，并由网关负责 TLS、访问控制、请求体限制和审计策略。应用会把 `ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS` 同时投影为 Host Protocol 白名单和 HTML `Content-Security-Policy: frame-ancestors ...`；若网关覆盖 CSP，必须保留同等或更严格的 `frame-ancestors`，否则会重新放开未授权的视觉嵌入。

## 正式发布制品

推送 `v1.8.0` 形式的 Git tag 后，GitHub Actions 发布工作流会复跑版本、后端、前端、Playwright 和 Docker 门禁，并生成以下可追踪制品：

- `ghcr.io/<owner>/archsight-solver:v1.8.0` 不可变工作流镜像；包可见性由 GitHub Packages 权限决定。
- 公开 Docker 镜像归档 `archsight-solver-v1.8.0.tar.gz`，可从同一 GitHub Release 下载并离线加载。
- SPDX JSON SBOM、Trivy 高危/严重漏洞扫描报告和 `SHA256SUMS`。
- 从 `CHANGELOG.md` 当前版本段提取的 GitHub Release 说明。

发布工作流不会推送 `latest`，避免部署配置在未审阅时静默漂移。部署前应核对 tag、镜像摘要和 `SHA256SUMS`。v1.8.0 还会附带 Python wheel/sdist 与 Host Client tarball，供不克隆源码仓库的 CLI/MCP 和嵌入式宿主直接安装。

## 回滚

升级前记录当前容器镜像标签与健康状态。`deploy/deploy.sh` 会有界等待 Docker `HEALTHCHECK` 变为 `healthy`，失败时输出最近的容器日志并返回非零状态；脚本成功后仍需复核首页、典型求解和导出入口。若失败，重新以先前不可变标签执行部署；当前版本的直接回滚基线是 v1.7.0：

```bash
./deploy/deploy.sh v1.7.0
docker inspect --format '{{.Config.Image}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' archsight-solver-app
```

当前镜像不包含数据库迁移；未来若加入持久化结构变化，必须在发布清单中单独声明备份、兼容和数据恢复步骤。
