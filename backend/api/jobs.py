from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Mapping

from flask import Blueprint, jsonify, request, url_for

from backend.application.calculation import build_calculation_result
from backend.api.errors import ApiError, error_payload
from backend.api.sensitivity import build_sensitivity_response
from backend.contracts.calculation_response import api_v1_response_from_stored_result
from backend.services.job_store import DuplicateClientJobError
from backend.services.job_store import load_job as _load_job
from backend.services.job_store import load_job_by_client_id as _load_job_by_client_id
from backend.services.job_store import prune_completed_jobs as _prune_completed_job_records
from backend.services.job_store import store_job as _store_job
from backend.services.job_store import update_job as _update_job
from backend.services.job_store import bulk_fail_stale_jobs as _bulk_fail_stale_jobs
from backend.services.job_runtime import LocalJobRuntime

jobs_bp = Blueprint("jobs", __name__)

MAX_WORKERS = max(1, int(os.environ.get("ARCHSIGHT_SOLVER_JOB_WORKERS", "4")))
MAX_JOBS = max(16, int(os.environ.get("ARCHSIGHT_SOLVER_MAX_JOBS", "128")))
SUPPORTED_OPERATIONS = {"calculate", "preview", "sensitivity"}
ACTIVE_STATUSES = {"queued", "running"}
HEARTBEAT_TIMEOUT_SECONDS = 30.0

_job_runtime = LocalJobRuntime(max_workers=MAX_WORKERS)
# Kept as a read-only compatibility surface for tests and process-local diagnostics.
_futures = _job_runtime.futures


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _tenant_id_from_request() -> str:
    tenant_id = str(request.headers.get("X-Tenant-Id") or "default").strip()
    return tenant_id[:128] if tenant_id else "default"


def _client_job_id_from_payload(data: Mapping[str, Any]) -> str | None:
    value = data.get("clientJobId")
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("clientJobId 必须是字符串")
    client_job_id = value.strip()
    return client_job_id[:128] if client_job_id else None


def _job_submission_response(record: Mapping[str, Any], *, idempotent_hit: bool) -> Any:
    status_url = url_for("jobs.get_job", job_id=record["jobId"], _external=False)
    status = str(record["status"])
    response = jsonify(
        {
            "success": True,
            "operation": "submit_job",
            "version": "v1",
            "jobId": record["jobId"],
            "status": status,
            "statusUrl": status_url,
            "resultUrl": url_for("jobs.get_job_result", job_id=record["jobId"], _external=False),
            "retryAfterSeconds": 1,
            "meta": {"generatedAt": _utc_now(), **({"idempotentHit": True} if idempotent_hit else {})},
        }
    )
    response.status_code = 200 if status in {"succeeded", "failed", "cancelled"} else 202
    response.headers["Location"] = status_url
    if response.status_code == 202:
        response.headers["Retry-After"] = "1"
    return response


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


def _write_job_heartbeats(active_job_ids: list[str]) -> None:
    now = _utc_now()
    for job_id in active_job_ids:
        _update_job(job_id, lastHeartbeatAt=now)


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
        view["result"] = api_v1_response_from_stored_result(record.get("result"))
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
            result = build_calculation_result(payload, operation=operation)
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
        _job_runtime.discard(job_id)


def start_job_runtime() -> bool:
    """Start this worker process's executor on application lifecycle entry."""
    return _job_runtime.start(_run_job, _write_job_heartbeats)


def shutdown_job_runtime() -> None:
    _job_runtime.shutdown()


def _prune_completed_jobs() -> None:
    job_ids = _prune_completed_job_records(MAX_JOBS)
    if job_ids:
        _job_runtime.discard_many(job_ids)


def _reconcile_local_job_handle(record: Mapping[str, Any]) -> Dict[str, Any]:
    if record.get("status") not in ACTIVE_STATUSES:
        return dict(record)

    job_id = str(record["jobId"])
    if _job_runtime.contains(job_id):
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
    if os.environ.get("ARCHSIGHT_SOLVER_DISABLE_ORPHAN_CHECK") == "1":
        return 0

    exclude_jobs = _job_runtime.active_job_ids()

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=HEARTBEAT_TIMEOUT_SECONDS)
    cutoff_str = cutoff.isoformat()

    return _bulk_fail_stale_jobs(cutoff_str, exclude_jobs)


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

    tenant_id = _tenant_id_from_request()
    try:
        client_job_id = _client_job_id_from_payload(data)
    except ValueError as exc:
        return jsonify(error_payload(str(exc), operation="submit_job", code="COMMON_INVALID_CLIENT_JOB_ID")), 400
    if client_job_id:
        existing_job = _load_job_by_client_id(client_job_id, tenant_id=tenant_id)
        if existing_job:
            return _job_submission_response(existing_job, idempotent_hit=True)

    job_id = uuid.uuid4().hex
    now = _utc_now()
    record: Dict[str, Any] = {
        "jobId": job_id,
        "clientJobId": client_job_id,
        "tenantId": tenant_id,
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
    try:
        _store_job(record)
    except DuplicateClientJobError:
        if client_job_id:
            existing_job = _load_job_by_client_id(client_job_id, tenant_id=tenant_id)
            if existing_job:
                return _job_submission_response(existing_job, idempotent_hit=True)
        raise
    _job_runtime.submit(job_id)

    return _job_submission_response(record, idempotent_hit=False)


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
    result = api_v1_response_from_stored_result(record.get("result"))
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
    cancelled_before_start = _job_runtime.cancel(job_id)
    if cancelled_before_start:
        completed_at = _utc_now()
        updated = _update_job(job_id, status="cancelled", completedAt=completed_at, updatedAt=completed_at)
    view = _job_public_view(updated or record)
    return jsonify(view)
