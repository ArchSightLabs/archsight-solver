from __future__ import annotations

import json
import os
import sqlite3
import tempfile
import threading
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Mapping

from flask import Blueprint, jsonify, request, url_for

from backend.api.errors import ApiError, error_payload
from backend.api.sensitivity import build_sensitivity_response
from backend.api.utils import build_calculation_response

jobs_bp = Blueprint("jobs", __name__)

MAX_WORKERS = max(1, int(os.environ.get("ARCHSIGHT_SOLVER_JOB_WORKERS", "4")))
MAX_JOBS = max(16, int(os.environ.get("ARCHSIGHT_SOLVER_MAX_JOBS", "128")))
SUPPORTED_OPERATIONS = {"calculate", "preview", "sensitivity"}

_executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="solver-job")
_futures: Dict[str, Future[Any]] = {}
_lock = threading.Lock()

JOB_COLUMNS = {
    "jobId": "job_id",
    "clientJobId": "client_job_id",
    "operation": "operation",
    "payload": "payload_json",
    "status": "status",
    "result": "result_json",
    "error": "error_json",
    "warnings": "warnings_json",
    "infos": "infos_json",
    "cancelRequested": "cancel_requested",
    "createdAt": "created_at",
    "updatedAt": "updated_at",
    "startedAt": "started_at",
    "completedAt": "completed_at",
}

JSON_FIELDS = {"payload", "result", "error", "warnings", "infos"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _job_db_path() -> Path:
    configured = os.environ.get("ARCHSIGHT_SOLVER_JOB_DB_PATH")
    if configured and configured.strip():
        return Path(configured)
    return Path(tempfile.gettempdir()) / "archsight-solver-jobs.sqlite3"


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_load(value: str | None, fallback: Any) -> Any:
    if value in (None, ""):
        return fallback
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return fallback


def _connect() -> sqlite3.Connection:
    db_path = _job_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(db_path, timeout=30)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout=30000")
    connection.execute("PRAGMA journal_mode=WAL")
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS solver_jobs (
            job_id TEXT PRIMARY KEY,
            client_job_id TEXT,
            operation TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            status TEXT NOT NULL,
            result_json TEXT,
            error_json TEXT,
            warnings_json TEXT NOT NULL,
            infos_json TEXT NOT NULL,
            cancel_requested INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            started_at TEXT,
            completed_at TEXT
        )
        """
    )
    return connection


def _row_to_record(row: sqlite3.Row | None) -> Dict[str, Any] | None:
    if row is None:
        return None
    return {
        "jobId": row["job_id"],
        "clientJobId": row["client_job_id"],
        "operation": row["operation"],
        "payload": _json_load(row["payload_json"], {}),
        "status": row["status"],
        "result": _json_load(row["result_json"], None),
        "error": _json_load(row["error_json"], None),
        "warnings": _json_load(row["warnings_json"], []),
        "infos": _json_load(row["infos_json"], []),
        "cancelRequested": bool(row["cancel_requested"]),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "startedAt": row["started_at"],
        "completedAt": row["completed_at"],
    }


def _store_job(record: Mapping[str, Any]) -> None:
    with _connect() as connection:
        connection.execute(
            """
            INSERT INTO solver_jobs (
                job_id, client_job_id, operation, payload_json, status,
                result_json, error_json, warnings_json, infos_json,
                cancel_requested, created_at, updated_at, started_at, completed_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                record["jobId"],
                record.get("clientJobId"),
                record["operation"],
                _json_dump(record["payload"]),
                record["status"],
                _json_dump(record.get("result")) if record.get("result") is not None else None,
                _json_dump(record.get("error")) if record.get("error") is not None else None,
                _json_dump(record.get("warnings", [])),
                _json_dump(record.get("infos", [])),
                1 if record.get("cancelRequested") else 0,
                record["createdAt"],
                record["updatedAt"],
                record.get("startedAt"),
                record.get("completedAt"),
            ),
        )


def _load_job(job_id: str) -> Dict[str, Any] | None:
    with _connect() as connection:
        row = connection.execute("SELECT * FROM solver_jobs WHERE job_id = ?", (job_id,)).fetchone()
    return _row_to_record(row)


def _update_job(job_id: str, **updates: Any) -> Dict[str, Any] | None:
    if not updates:
        return _load_job(job_id)
    assignments: list[str] = []
    values: list[Any] = []
    for key, value in updates.items():
        column = JOB_COLUMNS[key]
        assignments.append(f"{column} = ?")
        if key in JSON_FIELDS:
            values.append(_json_dump(value))
        elif key == "cancelRequested":
            values.append(1 if value else 0)
        else:
            values.append(value)
    values.append(job_id)
    with _connect() as connection:
        connection.execute(f"UPDATE solver_jobs SET {', '.join(assignments)} WHERE job_id = ?", values)
    return _load_job(job_id)


def _job_public_view(record: Mapping[str, Any], *, include_result: bool = False) -> Dict[str, Any]:
    view: Dict[str, Any] = {
        "success": True,
        "operation": "job_status",
        "version": "v1",
        "jobId": record["jobId"],
        "clientJobId": record.get("clientJobId"),
        "jobOperation": record["operation"],
        "status": record["status"],
        "createdAt": record["createdAt"],
        "updatedAt": record["updatedAt"],
        "startedAt": record.get("startedAt"),
        "completedAt": record.get("completedAt"),
        "cancelRequested": bool(record.get("cancelRequested", False)),
        "diagnostics": {
            "warnings": record.get("warnings", []),
            "infos": record.get("infos", []),
        },
    }
    if include_result and record.get("status") == "succeeded":
        view["result"] = record.get("result")
    if record.get("status") == "failed":
        view["error"] = record.get("error")
    return view


def _run_job(job_id: str) -> None:
    record = _load_job(job_id)
    if record is None:
        return
    if record.get("cancelRequested"):
        now = _utc_now()
        _update_job(job_id, status="cancelled", completedAt=now, updatedAt=now)
        return

    started_at = _utc_now()
    _update_job(job_id, status="running", startedAt=started_at, updatedAt=started_at)
    operation = record["operation"]
    payload = dict(record["payload"])

    try:
        if operation == "sensitivity":
            result = build_sensitivity_response(payload)
        else:
            result = build_calculation_response(payload, operation=operation)
        current = _load_job(job_id)
        completed_at = _utc_now()
        if current and current.get("cancelRequested"):
            _update_job(job_id, status="cancelled", completedAt=completed_at, updatedAt=completed_at)
        else:
            _update_job(job_id, status="succeeded", result=result, completedAt=completed_at, updatedAt=completed_at)
    except ApiError as exc:
        completed_at = _utc_now()
        _update_job(
            job_id,
            status="failed",
            error=error_payload(exc, operation=operation, data=payload)["error"],
            completedAt=completed_at,
            updatedAt=completed_at,
        )
    except Exception as exc:  # pragma: no cover - background safety boundary
        completed_at = _utc_now()
        _update_job(
            job_id,
            status="failed",
            error={
                "code": "COMMON_ASYNC_JOB_FAILED",
                "message": f"异步求解作业失败: {exc}",
            },
            completedAt=completed_at,
            updatedAt=completed_at,
        )
    finally:
        with _lock:
            _futures.pop(job_id, None)


def _prune_completed_jobs() -> None:
    with _connect() as connection:
        total = int(connection.execute("SELECT COUNT(*) FROM solver_jobs").fetchone()[0])
        if total <= MAX_JOBS:
            return
        rows = connection.execute(
            """
            SELECT job_id FROM solver_jobs
            WHERE status IN ('succeeded', 'failed', 'cancelled')
            ORDER BY updated_at ASC
            LIMIT ?
            """,
            (max(0, total - MAX_JOBS),),
        ).fetchall()
        job_ids = [str(row["job_id"]) for row in rows]
        if job_ids:
            connection.executemany("DELETE FROM solver_jobs WHERE job_id = ?", [(job_id,) for job_id in job_ids])
    if job_ids:
        with _lock:
            for job_id in job_ids:
                _futures.pop(job_id, None)


@jobs_bp.route("/jobs", methods=["POST"])
def submit_job():
    data = request.json or {}
    if not isinstance(data, Mapping):
        return jsonify(error_payload("异步作业请求必须是 JSON object", operation="submit_job")), 400

    operation = str(data.get("operation") or "calculate").strip().lower()
    payload = data.get("payload")
    if operation not in SUPPORTED_OPERATIONS:
        return (
            jsonify(
                error_payload(
                    f"不支持的异步作业类型: {operation}",
                    operation="submit_job",
                    code="COMMON_UNSUPPORTED_ASYNC_OPERATION",
                )
            ),
            400,
        )
    if not isinstance(payload, Mapping):
        return jsonify(error_payload("payload 必须是结构求解输入对象", operation="submit_job")), 400

    job_id = uuid.uuid4().hex
    now = _utc_now()
    record: Dict[str, Any] = {
        "jobId": job_id,
        "clientJobId": data.get("clientJobId"),
        "operation": operation,
        "payload": dict(payload),
        "status": "queued",
        "createdAt": now,
        "updatedAt": now,
        "warnings": [],
        "infos": [f"作业已进入本地线程池，最大并发 {MAX_WORKERS}。"],
    }

    _prune_completed_jobs()
    _store_job(record)
    with _lock:
        _futures[job_id] = _executor.submit(_run_job, job_id)

    status_url = url_for("jobs.get_job", job_id=job_id, _external=False)
    response = jsonify(
        {
            "success": True,
            "operation": "submit_job",
            "version": "v1",
            "jobId": job_id,
            "status": "queued",
            "statusUrl": status_url,
            "resultUrl": url_for("jobs.get_job_result", job_id=job_id, _external=False),
            "retryAfterSeconds": 1,
            "meta": {"generatedAt": _utc_now()},
        }
    )
    response.status_code = 202
    response.headers["Location"] = status_url
    response.headers["Retry-After"] = "1"
    return response


@jobs_bp.route("/jobs/<job_id>", methods=["GET"])
def get_job(job_id: str):
    record = _load_job(job_id)
    if record is None:
        return jsonify(error_payload("未找到异步求解作业", operation="job_status", code="COMMON_JOB_NOT_FOUND")), 404
    view = _job_public_view(record, include_result=True)
    return jsonify(view)


@jobs_bp.route("/jobs/<job_id>/result", methods=["GET"])
def get_job_result(job_id: str):
    record = _load_job(job_id)
    if record is None:
        return jsonify(error_payload("未找到异步求解作业", operation="job_result", code="COMMON_JOB_NOT_FOUND")), 404
    status = record["status"]
    if status != "succeeded":
        return jsonify(_job_public_view(record)), 202 if status in {"queued", "running"} else 409
    result = record.get("result")
    return jsonify(result)


@jobs_bp.route("/jobs/<job_id>", methods=["DELETE"])
def cancel_job(job_id: str):
    record = _load_job(job_id)
    if record is None:
        return jsonify(error_payload("未找到异步求解作业", operation="cancel_job", code="COMMON_JOB_NOT_FOUND")), 404
    if record["status"] in {"succeeded", "failed", "cancelled"}:
        return jsonify(_job_public_view(record))
    updated = _update_job(job_id, cancelRequested=True, updatedAt=_utc_now())
    with _lock:
        future = _futures.get(job_id)
        if future is not None and future.cancel():
            completed_at = _utc_now()
            updated = _update_job(job_id, status="cancelled", completedAt=completed_at, updatedAt=completed_at)
    view = _job_public_view(updated or record)
    return jsonify(view)
