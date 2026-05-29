#!/usr/bin/env bash
# ArchSight Solver 服务器端部署脚本。
# 用法: ./deploy.sh [IMAGE_TAG]

set -euo pipefail

TAG="${1:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="${SCRIPT_DIR}/docker-compose.yml"
COMPOSE_EXAMPLE_FILE="${SCRIPT_DIR}/docker-compose.yml.example"
ENV_FILE="${SCRIPT_DIR}/.env"

if [ ! -f "${ENV_FILE}" ]; then
    ENV_FILE="${SCRIPT_DIR}/.env.example"
fi

if [ ! -f "${ENV_FILE}" ]; then
    echo "错误: 未找到 .env 或 .env.example。"
    exit 1
fi

if [ ! -f "${COMPOSE_FILE}" ]; then
    if [ -f "${COMPOSE_EXAMPLE_FILE}" ]; then
        COMPOSE_FILE="${COMPOSE_EXAMPLE_FILE}"
    else
        echo "错误: 未找到 docker-compose.yml 或 docker-compose.yml.example。"
        exit 1
    fi
fi

while IFS='=' read -r key value || [ -n "${key:-}" ]; do
    key="${key%%[[:space:]]*}"
    value="${value%$'\r'}"

    case "${key}" in
        ""|\#*)
            continue
            ;;
    esac

    export "${key}=${value}"
done < "${ENV_FILE}"

if [ -n "${TAG}" ]; then
    export IMAGE_TAG="${TAG}"
fi

IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-registry.cn-hangzhou.aliyuncs.com/your-namespace/archsight-solver}"
IMAGE_TAG="${IMAGE_TAG:-v1.2.0}"
IMAGE="${IMAGE_REPOSITORY}:${IMAGE_TAG}"

if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
else
    echo "错误: 未找到 docker compose 或 docker-compose，请先安装 Docker Compose。"
    exit 1
fi

echo "部署目录: ${SCRIPT_DIR}"
echo "Compose 文件: ${COMPOSE_FILE}"
echo "镜像地址: ${IMAGE}"
echo "Compose: ${COMPOSE_CMD[*]}"

export IMAGE_REPOSITORY
export IMAGE_TAG

echo "[1/3] 拉取镜像..."
"${COMPOSE_CMD[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" pull

echo "[2/3] 更新容器..."
"${COMPOSE_CMD[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --remove-orphans

echo "[3/3] 当前服务状态..."
"${COMPOSE_CMD[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps

echo "部署完成。"
echo "查看日志: ${COMPOSE_CMD[*]} --env-file ${ENV_FILE} -f ${COMPOSE_FILE} logs -f"
