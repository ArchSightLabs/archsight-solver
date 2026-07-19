# 部署说明

本文说明 ArchSight Solver 的本地镜像构建、容器运行和 Docker Compose 入口。

当前仓库版本为 v1.6.2 发布候选；以下 v1.6.2 tag、镜像和 Release 名称是正式发布后的目标口径，在 tag 与不可变镜像实际存在前不得用于线上更新。

## 单镜像模式

本仓库推荐使用单镜像方式部署：前端在构建阶段打包成 `frontend/dist`，后端 Flask 统一对外提供页面和 API。

本地构建镜像：

```powershell
docker build -t archsight-solver:latest .
```

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
docker build -t archsight-solver:v1.6.2 -t registry.example.com/example-namespace/archsight-solver:v1.6.2 .
```

推送：

```powershell
docker push registry.example.com/example-namespace/archsight-solver:v1.6.2
```

如果 Docker 环境在拉取基础镜像时不稳定，可临时关闭 BuildKit：

```powershell
$env:DOCKER_BUILDKIT="0"; docker build -t archsight-solver:latest .
```

## Docker Compose

```powershell
docker compose up -d --build
```

Compose 默认将容器内 `6240` 端口绑定到宿主机本地端口。如需调整宿主机端口，可设置 `APP_HOST_PORT`；外部宿主接入使用 `ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS` 配置运行时白名单。

公网部署时建议只通过外层 Nginx、Caddy 或同类网关暴露 `80/443`，并由网关负责 TLS、访问控制、请求体限制和审计策略。应用会把 `ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS` 同时投影为 Host Protocol 白名单和 HTML `Content-Security-Policy: frame-ancestors ...`；若网关覆盖 CSP，必须保留同等或更严格的 `frame-ancestors`，否则会重新放开未授权的视觉嵌入。

## 正式发布制品

推送 `v1.6.2` 形式的 Git tag 后，GitHub Actions 发布工作流会复跑版本、后端、前端、Playwright 和 Docker 门禁，并生成以下可追踪制品：

- `ghcr.io/<owner>/archsight-solver:v1.6.2` 不可变版本镜像。
- Docker 镜像归档 `archsight-solver-v1.6.2.tar.gz`。
- SPDX JSON SBOM、Trivy 高危/严重漏洞扫描报告和 `SHA256SUMS`。
- 从 `CHANGELOG.md` 当前版本段提取的 GitHub Release 说明。

发布工作流不会推送 `latest`，避免部署配置在未审阅时静默漂移。部署前应核对 tag、镜像摘要和 `SHA256SUMS`。

## 回滚

升级前记录当前容器镜像标签与健康状态。新版本上线后等待 Docker `HEALTHCHECK` 变为 `healthy`，并复核首页、典型求解和导出入口。若失败，重新以先前不可变标签执行部署：

```bash
./deploy/deploy.sh v1.5.0
docker inspect --format '{{.Config.Image}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' archsight-solver-app
```

当前镜像不包含数据库迁移；未来若加入持久化结构变化，必须在发布清单中单独声明备份、兼容和数据恢复步骤。
