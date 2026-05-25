ARG NODE_IMAGE=node:22-bookworm-slim
ARG PYTHON_IMAGE=python:3.13-slim

FROM ${NODE_IMAGE} AS frontend-builder

WORKDIR /app/frontend

# 先安装前端依赖，再复制源码，便于利用分层缓存。
COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM ${PYTHON_IMAGE} AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    BEAM_SOLVER_BACKEND_HOST=0.0.0.0 \
    BEAM_SOLVER_BACKEND_PORT=6240

WORKDIR /app

RUN groupadd --system app \
    && useradd --system --gid app --create-home --home-dir /home/app app

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY --from=frontend-builder /app/frontend/dist ./frontend/dist
COPY app.py ./app.py
COPY backend ./backend
COPY config ./config
# 确保 app 用户对程序目录有读写权限（用于创建日志等）
RUN chown -R app:app /app

USER app

EXPOSE 6240

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:6240/')" || exit 1

# 使用 Gunicorn 替代 Flask 自带服务器提供生产级服务
CMD ["gunicorn", "--workers", "4", "--bind", "0.0.0.0:6240", "--timeout", "120", "app:app"]
