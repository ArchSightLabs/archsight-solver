from __future__ import annotations

import json
import logging
import os
import sys
from logging.handlers import TimedRotatingFileHandler
from pathlib import Path
from typing import Iterable
from urllib.parse import urlsplit

ROOT_DIR = Path(__file__).resolve().parent
# 确保 Gunicorn / python app.py 都能从仓库根目录解析 backend 模块。
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from flask import Flask, request, send_from_directory

from backend.api.benchmark_submissions import benchmark_submissions_bp
from backend.api.calculate import calculate_bp
from backend.api.contracts import contracts_bp
from backend.api.examples import examples_bp
from backend.api.export import export_bp
from backend.api.jobs import jobs_bp, reconcile_all_orphans
from backend.api.preview import preview_bp
from backend.api.sensitivity import sensitivity_bp
from backend.config import get_backend_host, get_backend_port


API_BLUEPRINTS = (
    calculate_bp,
    benchmark_submissions_bp,
    contracts_bp,
    examples_bp,
    jobs_bp,
    preview_bp,
    sensitivity_bp,
    export_bp,
)


def normalize_host_allowed_origins(value: str | None) -> list[str]:
    origins: list[str] = []
    for raw_origin in (value or "").split(","):
        candidate = raw_origin.strip()
        if not candidate:
            continue
        try:
            parsed = urlsplit(candidate)
            port = parsed.port
        except ValueError:
            continue
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            continue
        try:
            hostname = parsed.hostname.encode("ascii").decode("ascii").lower()
        except UnicodeEncodeError:
            continue
        if ":" in hostname:
            hostname = f"[{hostname}]"
        default_port = 80 if parsed.scheme == "http" else 443
        normalized = f"{parsed.scheme}://{hostname}{f':{port}' if port and port != default_port else ''}"
        if normalized not in origins:
            origins.append(normalized)
    return origins


def get_host_allowed_origins() -> list[str]:
    return normalize_host_allowed_origins(os.environ.get("ARCHSIGHT_SOLVER_HOST_ALLOWED_ORIGINS"))


def is_debug_enabled() -> bool:
    return os.environ.get("FLASK_DEBUG", "1").strip().lower() in {"1", "true", "yes", "on"}


def is_reloader_enabled() -> bool:
    return os.environ.get("FLASK_RUN_RELOAD", "0").strip().lower() in {"1", "true", "yes", "on"}


def create_app(*, static_folder: str | os.PathLike[str] | None = None) -> Flask:
    flask_app = Flask(
        __name__,
        static_folder=str(static_folder or ROOT_DIR / "frontend" / "dist"),
        static_url_path="/",
    )
    flask_app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB limit for JSON payloads
    setup_logging(flask_app)
    register_blueprints(flask_app, API_BLUEPRINTS)
    register_request_hooks(flask_app)
    register_static_routes(flask_app)

    # 启动期处理孤儿任务
    with flask_app.app_context():
        try:
            count = reconcile_all_orphans()
            if count > 0:
                flask_app.logger.info("Reconciled %d orphaned jobs during startup.", count)
        except Exception as exc:
            flask_app.logger.warning("Failed to reconcile orphaned jobs on startup: %s", exc)

    return flask_app


def setup_logging(flask_app: Flask) -> None:
    log_dir = ROOT_DIR / "logs"
    log_dir.mkdir(exist_ok=True)
    log_path = log_dir / "telemetry.log"

    if any(
        isinstance(handler, TimedRotatingFileHandler)
        and Path(getattr(handler, "baseFilename", "")).resolve() == log_path.resolve()
        for handler in flask_app.logger.handlers
    ):
        return

    handler = TimedRotatingFileHandler(
        log_path,
        when="D",
        interval=1,
        backupCount=15,
        encoding="utf-8",
    )
    handler.setFormatter(logging.Formatter("[%(asctime)s] %(levelname)s in %(module)s: %(message)s"))
    flask_app.logger.addHandler(handler)
    flask_app.logger.setLevel(logging.INFO)


def register_blueprints(flask_app: Flask, blueprints: Iterable) -> None:
    for blueprint in blueprints:
        flask_app.register_blueprint(blueprint, url_prefix="/api")


def register_request_hooks(flask_app: Flask) -> None:
    @flask_app.before_request
    def log_telemetry():
        client_id = request.headers.get("X-Client-ID", "anonymous")
        if request.path.startswith("/api"):
            flask_app.logger.info("User: %s | Action: %s | Method: %s", client_id, request.path, request.method)

    @flask_app.after_request
    def after_request(response):
        response.headers.add("Access-Control-Allow-Origin", "*")
        response.headers.add("Access-Control-Allow-Headers", "Content-Type,X-Client-ID")
        response.headers.add("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS")
        if response.mimetype == "text/html":
            frame_ancestors = " ".join(["'self'", *get_host_allowed_origins()])
            response.headers["Content-Security-Policy"] = f"frame-ancestors {frame_ancestors}"
        return response


def register_static_routes(flask_app: Flask) -> None:
    @flask_app.get("/runtime-config.js")
    def runtime_config():
        config = {
            "hostAllowedOrigins": ",".join(get_host_allowed_origins()),
        }
        response = flask_app.response_class(
            f"window.__ARCHSIGHT_SOLVER_RUNTIME_CONFIG__ = {json.dumps(config, ensure_ascii=False)};\n",
            mimetype="application/javascript",
        )
        response.headers["Cache-Control"] = "no-store"
        return response

    @flask_app.route("/", defaults={"path": ""})
    @flask_app.route("/<path:path>")
    def serve(path: str):
        static_root = Path(flask_app.static_folder or "")
        if path and (static_root / path).exists():
            return send_from_directory(str(static_root), path)
        return send_from_directory(str(static_root), "index.html")


app = create_app()


if __name__ == "__main__":
    app.run(
        debug=is_debug_enabled(),
        host=get_backend_host(),
        port=get_backend_port(),
        use_reloader=is_reloader_enabled(),
    )
