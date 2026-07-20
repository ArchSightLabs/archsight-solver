ARG NODE_IMAGE=node:22-bookworm-slim
ARG PYTHON_IMAGE=python:3.13-slim

FROM ${NODE_IMAGE} AS frontend-builder

ARG VITE_ENABLE_BUSUANZI=false
ENV VITE_ENABLE_BUSUANZI=${VITE_ENABLE_BUSUANZI}

WORKDIR /app/frontend

# 先安装前端依赖，再复制源码，便于利用分层缓存。
COPY frontend/package*.json ./
RUN npm ci --include=optional \
    --fetch-retries=5 \
    --fetch-retry-mintimeout=10000 \
    --fetch-retry-maxtimeout=120000

COPY frontend/ ./
COPY CHANGELOG.md /app/CHANGELOG.md
COPY data/ /app/data/
COPY shared/ /app/shared/
RUN NODE_OPTIONS="--max-old-space-size=4096" npm run build

FROM ${PYTHON_IMAGE} AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BEAM_SOLVER_BACKEND_HOST=0.0.0.0 \
    BEAM_SOLVER_BACKEND_PORT=6240 \
    ARCHSIGHT_GUNICORN_WORKERS=4

WORKDIR /app

RUN groupadd --system app \
    && useradd --system --gid app --create-home --home-dir /home/app app

COPY requirements.txt ./
RUN pip install --no-compile --retries 5 --timeout 120 --upgrade pip \
    && attempt=1 \
    && until pip install --no-compile --retries 5 --timeout 120 -r requirements.txt; do \
        if [ "$attempt" -ge 3 ]; then exit 1; fi; \
        attempt=$((attempt + 1)); \
        echo "Python 依赖下载中断，复用 pip 缓存执行第 ${attempt} 次安装。" >&2; \
      done \
    && rm -rf /root/.cache/pip

COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY app.py ./app.py
COPY backend ./backend
COPY config ./config
COPY data ./data
COPY shared ./shared
# 确保 app 用户对程序目录有读写权限（用于创建日志等）
RUN chown -R app:app /app

USER app

EXPOSE 6240

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:6240/')" || exit 1

# 异步作业状态使用 SQLite 共享存储，支持同一容器内多 worker 提交与轮询。
CMD ["sh", "-c", "gunicorn --workers ${ARCHSIGHT_GUNICORN_WORKERS:-4} --bind 0.0.0.0:6240 --timeout 120 app:app"]
