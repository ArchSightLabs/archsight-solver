# 部署说明

本文说明 ArchSight Solver 的本地镜像构建、容器运行和 Docker Compose 入口。

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

## 远程镜像标签

如需推送远程镜像，先登录镜像仓库：

```powershell
docker login --username=<your-account> registry.example.com
```

构建并打标签：

```powershell
docker build -t archsight-solver:v1.5.0 -t registry.example.com/example-namespace/archsight-solver:v1.5.0 .
```

推送：

```powershell
docker push registry.example.com/example-namespace/archsight-solver:v1.5.0
```

如果 Docker 环境在拉取基础镜像时不稳定，可临时关闭 BuildKit：

```powershell
$env:DOCKER_BUILDKIT="0"; docker build -t archsight-solver:latest .
```

## Docker Compose

```powershell
docker compose up -d --build
```

Compose 默认将容器内 `6240` 端口绑定到宿主机本地端口。如需调整宿主机端口，可设置 `APP_HOST_PORT`。

公网部署时建议只通过外层 Nginx、Caddy 或同类网关暴露 `80/443`，并由网关负责 TLS、访问控制、请求体限制和审计策略。
