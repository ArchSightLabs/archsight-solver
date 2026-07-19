# ArchSight Solver 生产部署

本目录用于服务器生产部署，部署方式为：拉取已构建好的应用镜像，将应用容器绑定到宿主机本地端口，再由公共 Nginx 反向代理。

当前 v1.6.2 仍是发布候选。仓库示例已预置目标版本号，但只有在不可变镜像实际推送后才能执行线上更新。

## 目录结构

```text
deploy/
  .env
  .env.example
  deploy.sh
  docker-compose.yml
  docker-compose.yml.example
  nginx/
    default.conf
  readme.md
```

其中 `.env` 与 `docker-compose.yml` 是服务器本地文件，默认不进入版本控制；仓库只保留 `.env.example` 与 `docker-compose.yml.example` 作为可复用模板。

## 配置说明

首次部署时可复制示例配置：

```bash
cp .env.example .env
cp docker-compose.yml.example docker-compose.yml
```

主要变量：

- `IMAGE_REPOSITORY`：应用镜像仓库地址，不包含 TAG。
- `IMAGE_TAG`：应用镜像 TAG，默认 `v1.6.2`；正式环境应使用不可变版本标签，不使用 `latest`。
- `APP_HOST_BIND`：宿主机监听地址，默认 `127.0.0.1`，避免直接暴露容器端口。
- `APP_HOST_PORT`：宿主机本地监听端口，默认 `6280`，仅绑定 `127.0.0.1`，供公共 Nginx 反向代理。
- `ARCHSIGHT_GUNICORN_WORKERS`：Gunicorn worker 数量，默认 `4`。
- `ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS`：运行时允许嵌入 Solver 的宿主 origin，多个值使用逗号分隔；必须填写完整 `http/https origin`，不接受 `*` 或子域通配。

## 启动与更新

在服务器进入本目录后执行：

```bash
./deploy.sh
```

如需部署指定镜像 TAG，可修改 `.env`：

```env
IMAGE_TAG=v1.6.2
```

也可以用部署脚本临时覆盖，不会改写 `.env`：

```bash
./deploy.sh v1.6.2
```

构建镜像时同样使用该 TAG：

```powershell
..\scripts\build-image.ps1 -Tag v1.6.2 -Push
```

若不传 `-Tag`，构建脚本会读取 `deploy/.env` 中的 `IMAGE_TAG`。

在 Windows 本地可以通过 SSH 远程触发服务器部署：

```powershell
.\scripts\remote-deploy.ps1 -Server your-server -User root -DeployPath /opt/archsight-solver/deploy -Tag v1.6.2
```

如果需要本地先构建并推送镜像，再远程更新服务器：

```powershell
.\scripts\remote-deploy.ps1 -Server your-server -User root -DeployPath /opt/archsight-solver/deploy -Tag v1.6.2 -BuildAndPush
```

部署脚本会自动兼容新版 Compose 与旧版 Compose：

```bash
docker compose
docker-compose
```

查看日志：

```bash
docker compose logs -f
```

停止服务：

```bash
docker compose down
```

## 发布后检查与回滚

正式更新前记录当前镜像标签，并确保该标签仍可从镜像仓库拉取。执行 `./deploy.sh v1.6.2` 后，应等待容器健康检查变为 `healthy`，再检查首页、三类分析对象的典型求解以及 DOCX / XLSX 导出入口。

```bash
docker inspect --format '{{.Config.Image}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' archsight-solver-app
docker compose logs --tail=200 app
```

若健康检查失败、核心求解不可用或导出链路异常，使用更新前记录的不可变标签重新执行部署。以下示例回退到上一正式版本；实际标签以发布记录为准：

```bash
./deploy.sh v1.5.0
docker inspect --format '{{.Config.Image}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' archsight-solver-app
```

本版本不包含数据库迁移。若后续版本引入持久化结构变化，应在发布前另行准备数据备份、向前兼容和恢复演练，不得只依赖镜像回退。

## 公共 Nginx 代理关系

应用容器内部仍监听 `6240`，Docker Compose 将其映射到宿主机本地端口：

```text
127.0.0.1:6280 -> app:6240
```

公共 Nginx 可配置为：

```nginx
location / {
    proxy_pass http://127.0.0.1:6280;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 120s;
}
```

仓库内的 `nginx/default.conf` 是可复制到服务器 Nginx 的示例配置。正式域名部署时应至少替换 `server_name`，并在外层 TLS 入口或证书管理工具中配置 HTTPS。

应用容器内部端口由 `BEAM_SOLVER_BACKEND_PORT=6240` 固定，避免生产代理配置与后端监听端口不一致。公网只需要开放公共 Nginx 使用的 `80/443`，不要开放 `6240`。
