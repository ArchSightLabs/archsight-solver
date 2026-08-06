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

WAIT_SECONDS=2
HTTP_TRIES=30
APP_HOST_PORT="${APP_HOST_PORT:-18082}"
SOLVER_BASE_URL="http://127.0.0.1:${APP_HOST_PORT}"

wait_for_http() {
    local url="$1"
    local label="$2"
    local attempts="${HTTP_TRIES}"

    echo "[部署健康检查] 开始检测 ${label}: ${url}"
    for i in $(seq 1 "${attempts}"); do
        local http_code
        if http_code=$(curl -sS -o /tmp/deploy_probe_body.txt -w "%{http_code}" "${url}" 2>/tmp/deploy_probe_err.txt); then
            if [ "${http_code}" = "200" ]; then
                echo "[部署健康检查] ${label} 就绪（HTTP ${http_code}）。"
                rm -f /tmp/deploy_probe_body.txt /tmp/deploy_probe_err.txt
                return 0
            fi
            echo "[部署健康检查] ${label} 返回 HTTP ${http_code}（尝试 ${i}/${attempts}）。"
        else
            echo "[部署健康检查] ${label} 未就绪（尝试 ${i}/${attempts}）。"
        fi

        if [ "${i}" -lt "${attempts}" ]; then
            sleep "${WAIT_SECONDS}"
        fi
    done

    echo "[部署健康检查] ${label} 超时：${attempts} 次尝试后未返回预期。"
    return 1
}

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

if ! command -v curl >/dev/null 2>&1; then
    echo "错误: 未找到 curl，部署后验证不可用。请先安装 curl 后重试。"
    exit 1
fi

IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-registry.cn-hangzhou.aliyuncs.com/your-namespace/archsight-solver}"
IMAGE_TAG="${IMAGE_TAG:-v1.6.2}"
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

echo "[4/4] 部署后健康复核..."
wait_for_http "${SOLVER_BASE_URL}/" "主页入口"
wait_for_http "${SOLVER_BASE_URL}/runtime-config.js" "运行时配置端点"
wait_for_http "${SOLVER_BASE_URL}/api/jobs" "异步任务 API"

echo "部署完成。"
echo "查看日志: ${COMPOSE_CMD[*]} --env-file ${ENV_FILE} -f ${COMPOSE_FILE} logs -f"
