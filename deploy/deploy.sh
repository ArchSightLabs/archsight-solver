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
IMAGE_TAG="${IMAGE_TAG:-v1.8.0}"
IMAGE="${IMAGE_REPOSITORY}:${IMAGE_TAG}"

if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
else
    echo "错误: 未找到 docker compose 或 docker-compose，请先安装 Docker Compose。"
    exit 1
fi

DEPLOY_HEALTH_TIMEOUT_SECONDS="${DEPLOY_HEALTH_TIMEOUT_SECONDS:-120}"
DEPLOY_HEALTH_POLL_SECONDS="${DEPLOY_HEALTH_POLL_SECONDS:-2}"

require_positive_integer() {
    local name="$1"
    local value="$2"
    if [[ ! "${value}" =~ ^[1-9][0-9]*$ ]]; then
        echo "错误: ${name} 必须是正整数，当前值为 ${value}。"
        return 1
    fi
}

print_recent_logs() {
    "${COMPOSE_CMD[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" logs --tail=100 || true
}

wait_for_services_healthy() {
    local -a container_ids=()
    local container_id
    while IFS= read -r container_id; do
        if [ -n "${container_id}" ]; then
            container_ids+=("${container_id}")
        fi
    done < <("${COMPOSE_CMD[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps --all --quiet)

    if [ "${#container_ids[@]}" -eq 0 ]; then
        echo "错误: Compose 更新后没有可检查的容器。"
        print_recent_logs
        return 1
    fi

    local deadline=$((SECONDS + DEPLOY_HEALTH_TIMEOUT_SECONDS))
    while (( SECONDS < deadline )); do
        local all_ready=true
        local inspection
        local state
        local health
        for container_id in "${container_ids[@]}"; do
            if ! inspection="$(docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}' "${container_id}")"; then
                echo "错误: 无法读取容器 ${container_id} 的健康状态。"
                print_recent_logs
                return 1
            fi
            state="${inspection%% *}"
            health="${inspection#* }"

            case "${state}" in
                exited|dead|removing|paused)
                    echo "错误: 容器 ${container_id} 进入 ${state} 状态。"
                    print_recent_logs
                    return 1
                    ;;
            esac

            case "${health}" in
                healthy)
                    ;;
                starting)
                    all_ready=false
                    ;;
                missing)
                    echo "错误: 容器 ${container_id} 未定义 Docker HEALTHCHECK。"
                    print_recent_logs
                    return 1
                    ;;
                *)
                    echo "错误: 容器 ${container_id} 的健康状态为 ${health}。"
                    print_recent_logs
                    return 1
                    ;;
            esac
        done

        if [ "${all_ready}" = true ]; then
            echo "容器健康检查通过。"
            return 0
        fi
        sleep "${DEPLOY_HEALTH_POLL_SECONDS}"
    done

    echo "错误: 容器在 ${DEPLOY_HEALTH_TIMEOUT_SECONDS} 秒内未达到 healthy 状态。"
    print_recent_logs
    return 1
}

require_positive_integer "DEPLOY_HEALTH_TIMEOUT_SECONDS" "${DEPLOY_HEALTH_TIMEOUT_SECONDS}"
require_positive_integer "DEPLOY_HEALTH_POLL_SECONDS" "${DEPLOY_HEALTH_POLL_SECONDS}"

echo "部署目录: ${SCRIPT_DIR}"
echo "Compose 文件: ${COMPOSE_FILE}"
echo "镜像地址: ${IMAGE}"
echo "Compose: ${COMPOSE_CMD[*]}"

export IMAGE_REPOSITORY
export IMAGE_TAG

echo "[1/4] 拉取镜像..."
"${COMPOSE_CMD[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" pull

echo "[2/4] 更新容器..."
"${COMPOSE_CMD[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" up -d --remove-orphans

echo "[3/4] 当前服务状态..."
"${COMPOSE_CMD[@]}" --env-file "${ENV_FILE}" -f "${COMPOSE_FILE}" ps

echo "[4/4] 等待容器健康检查..."
wait_for_services_healthy

echo "部署完成。"
echo "查看日志: ${COMPOSE_CMD[*]} --env-file ${ENV_FILE} -f ${COMPOSE_FILE} logs -f"
