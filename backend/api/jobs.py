from __future__ import annotations

import os
import threading
import time
import uuid
from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timezone
from typing import Any, Dict, Mapping

from flask import Blueprint, jsonify, request, url_for

from backend.api.errors import ApiError, error_payload
from backend.api.sensitivity import build_sensitivity_response
from backend.api.calculation_response import build_calculation_response
from backend.services.job_store import load_job as _load_job
from backend.services.job_store import prune_completed_jobs as _prune_completed_job_records
from backend.services.job_store import store_job as _store_job
from backend.services.job_store import update_job as _update_job
from backend.services.job_store import load_active_jobs_meta as _load_active_jobs_meta

jobs_bp = Blueprint("jobs", __name__)

MAX_WORKERS = max(1, int(os.environ.get("ARCHSIGHT_SOLVER_JOB_WORKERS", "4")))
MAX_JOBS = max(16, int(os.environ.get("ARCHSIGHT_SOLVER_MAX_JOBS", "128")))
SUPPORTED_OPERATIONS = {"calculate", "preview", "sensitivity"}
ACTIVE_STATUSES = {"queued", "running"}
HEARTBEAT_TIMEOUT_SECONDS = 30.0

_executor = ThreadPoolExecutor(max_workers=MAX_WORKERS, thread_name_prefix="solver-job")
_futures: Dict[str, Future[Any]] = {}
_lock = threading.Lock()


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_heartbeat_at(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _heartbeat_loop() -> None:
    while True:
        try:
            with _lock:
                active_job_ids = list(_futures.keys())
            if active_job_ids:
                now = _utc_now()
                for job_id in active_job_ids:
                    _update_job(job_id, lastHeartbeatAt=now)
        except Exception:
            pass  # pragma: no cover
        time.sleep(5.0)


_heartbeat_thread = threading.Thread(target=_heartbeat_loop, daemon=True, name="solver-heartbeat")
_heartbeat_thread.start()


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
    job_ids = _prune_completed_job_records(MAX_JOBS)
    if job_ids:
        with _lock:
            for job_id in job_ids:
                _futures.pop(job_id, None)


def _reconcile_local_job_handle(record: Mapping[str, Any]) -> Dict[str, Any]:
    if record.get("status") not in ACTIVE_STATUSES:
        return dict(record)

    job_id = str(record["jobId"])
    with _lock:
        if job_id in _futures:
            return dict(record)

    if os.environ.get("ARCHSIGHT_SOLVER_DISABLE_ORPHAN_CHECK") == "1":
        return dict(record)

    heartbeat_at = _parse_heartbeat_at(record.get("lastHeartbeatAt") or record.get("updatedAt"))
    if heartbeat_at is not None:
        now = datetime.now(timezone.utc)
        if (now - heartbeat_at).total_seconds() < HEARTBEAT_TIMEOUT_SECONDS:
            return dict(record)

    completed_at = _utc_now()
    updated = _update_job(
        job_id,
        status="failed",
        error={
            "code": "COMMON_ASYNC_JOB_ORPHANED",
            "message": "异步作业心跳超时或句柄丢失，请重新提交作业。",
        },
        completedAt=completed_at,
        updatedAt=completed_at,
    )
    return updated or dict(record)


def reconcile_all_orphans() -> int:
    """找出当前未完成但 worker 进程已丢失的作业并标记为失败，返回修复的作业数。"""
    active_records = _load_active_jobs_meta()
    reconciled_count = 0
    for record in active_records:
        original_status = record.get("status")
        updated_record = _reconcile_local_job_handle(record)
        if updated_record.get("status") != original_status:
            reconciled_count += 1
    return reconciled_count


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
        "workerProcessId": os.getpid(),
        "lastHeartbeatAt": now,
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
    record = _reconcile_local_job_handle(record)
    view = _job_public_view(record, include_result=True)
    return jsonify(view)


@jobs_bp.route("/jobs/<job_id>/result", methods=["GET"])
def get_job_result(job_id: str):
    record = _load_job(job_id)
    if record is None:
        return jsonify(error_payload("未找到异步求解作业", operation="job_result", code="COMMON_JOB_NOT_FOUND")), 404
    record = _reconcile_local_job_handle(record)
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
    record = _reconcile_local_job_handle(record)
    if record["status"] in {"succeeded", "failed", "cancelled"}:
        return jsonify(_job_public_view(record))
    updated = _update_job(job_id, cancelRequested=True, updatedAt=_utc_now())
    cancelled_before_start = False
    with _lock:
        future = _futures.get(job_id)
        if future is not None and future.cancel():
            _futures.pop(job_id, None)
            cancelled_before_start = True
    if cancelled_before_start:
        completed_at = _utc_now()
        updated = _update_job(job_id, status="cancelled", completedAt=completed_at, updatedAt=completed_at)
    view = _job_public_view(updated or record)
    return jsonify(view)
