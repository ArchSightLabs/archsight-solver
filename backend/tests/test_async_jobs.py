import os
import sys
import time
from datetime import datetime, timezone

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from backend.api.jobs import _futures, _load_job, reconcile_all_orphans
from backend.services.job_store import store_job


class CancelableFuture:
    def __init__(self) -> None:
        self.cancel_called = False

    def cancel(self) -> bool:
        self.cancel_called = True
        return True


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("ARCHSIGHT_SOLVER_JOB_DB_PATH", str(tmp_path / "solver-jobs.sqlite3"))
    app.config["TESTING"] = True
    return app.test_client()


def _beam_payload():
    return {
        "analysisType": "beam",
        "beamType": "simply_supported",
        "loadType": "uniform",
        "q": 12,
        "E": 206,
        "I": 85000,
        "spans": [6],
        "projectName": "Async Job Beam",
    }


def _wait_for_job(client, job_id):
    for _ in range(30):
        response = client.get(f"/api/jobs/{job_id}")
        assert response.status_code == 200
        payload = response.get_json()
        if payload["status"] in {"succeeded", "failed", "cancelled"}:
            return payload
        time.sleep(0.05)
    raise AssertionError("异步求解作业未在预期时间内完成")


def test_async_calculate_job_returns_pollable_result(client):
    response = client.post("/api/jobs", json={"operation": "calculate", "payload": _beam_payload(), "clientJobId": "pytest"})

    assert response.status_code == 202
    assert response.headers["Location"].startswith("/api/jobs/")
    assert response.headers["Retry-After"] == "1"

    submitted = response.get_json()
    job = _wait_for_job(client, submitted["jobId"])

    assert job["status"] == "succeeded"
    assert job["clientJobId"] == "pytest"
    assert job["result"]["analysisType"] == "beam"
    assert job["result"]["summary"]["statusCode"] == "PASS"

    result_response = client.get(f"/api/jobs/{submitted['jobId']}/result")
    assert result_response.status_code == 200
    assert result_response.get_json()["analysisType"] == "beam"


def test_async_job_result_is_read_from_shared_store_not_future_memory(client):
    response = client.post("/api/jobs", json={"operation": "calculate", "payload": _beam_payload()})
    submitted = response.get_json()
    job = _wait_for_job(client, submitted["jobId"])

    assert job["status"] == "succeeded"
    assert _load_job(submitted["jobId"])["result"]["analysisType"] == "beam"

    _futures.clear()
    status_response = client.get(f"/api/jobs/{submitted['jobId']}")
    result_response = client.get(f"/api/jobs/{submitted['jobId']}/result")

    assert status_response.status_code == 200
    assert status_response.get_json()["result"]["analysisType"] == "beam"
    assert result_response.status_code == 200
    assert result_response.get_json()["summary"]["statusCode"] == "PASS"


def test_async_job_marks_orphaned_running_job_failed_after_process_restart(client):
    now = "2026-05-31T00:00:00+00:00"
    stale_heartbeat = "2026-05-31T00:00:00+00:00"  # definitely older than 30s from actual 'now'
    store_job(
        {
            "jobId": "orphaned-running",
            "clientJobId": "lost-worker",
            "operation": "calculate",
            "payload": _beam_payload(),
            "status": "running",
            "lastHeartbeatAt": stale_heartbeat,
            "createdAt": now,
            "updatedAt": now,
            "startedAt": now,
            "warnings": [],
            "infos": [],
        }
    )
    _futures.clear()

    status_response = client.get("/api/jobs/orphaned-running")
    result_response = client.get("/api/jobs/orphaned-running/result")

    assert status_response.status_code == 200
    status_payload = status_response.get_json()
    assert status_payload["status"] == "failed"
    assert status_payload["error"]["code"] == "COMMON_ASYNC_JOB_ORPHANED"
    assert "重新提交作业" in status_payload["error"]["message"]
    assert result_response.status_code == 409
    assert result_response.get_json()["error"]["code"] == "COMMON_ASYNC_JOB_ORPHANED"


def test_async_job_disables_orphan_check_when_env_var_set(client, monkeypatch):
    monkeypatch.setenv("ARCHSIGHT_SOLVER_DISABLE_ORPHAN_CHECK", "1")
    now = "2026-05-31T00:00:00+00:00"
    store_job(
        {
            "jobId": "orphaned-override",
            "clientJobId": "lost-worker",
            "operation": "calculate",
            "payload": _beam_payload(),
            "status": "running",
            "createdAt": now,
            "updatedAt": now,
            "startedAt": now,
            "warnings": [],
            "infos": [],
        }
    )
    _futures.clear()

    status_response = client.get("/api/jobs/orphaned-override")
    assert status_response.status_code == 200
    status_payload = status_response.get_json()
    assert status_payload["status"] == "running"


def test_async_job_cancel_reconciles_orphaned_running_job(client):
    now = "2026-05-31T00:00:00+00:00"
    stale_heartbeat = "2026-05-31T00:00:00+00:00"
    store_job(
        {
            "jobId": "orphaned-cancel",
            "clientJobId": "lost-worker",
            "operation": "calculate",
            "payload": _beam_payload(),
            "status": "running",
            "lastHeartbeatAt": stale_heartbeat,
            "createdAt": now,
            "updatedAt": now,
            "startedAt": now,
            "warnings": [],
            "infos": [],
        }
    )
    _futures.clear()

    cancel_response = client.delete("/api/jobs/orphaned-cancel")

    assert cancel_response.status_code == 200
    payload = cancel_response.get_json()
    assert payload["status"] == "failed"
    assert payload["error"]["code"] == "COMMON_ASYNC_JOB_ORPHANED"


def test_async_job_keeps_active_job_owned_by_alive_process_pending(client):
    now = datetime.now(timezone.utc).isoformat()
    store_job(
        {
            "jobId": "other-worker-running",
            "clientJobId": "other-worker",
            "operation": "calculate",
            "payload": _beam_payload(),
            "status": "running",
            "lastHeartbeatAt": now,
            "createdAt": now,
            "updatedAt": now,
            "startedAt": now,
            "warnings": [],
            "infos": [],
        }
    )
    _futures.clear()

    status_response = client.get("/api/jobs/other-worker-running")
    result_response = client.get("/api/jobs/other-worker-running/result")

    assert status_response.status_code == 200
    assert status_response.get_json()["status"] == "running"
    assert result_response.status_code == 202
    assert result_response.get_json()["status"] == "running"


def test_async_job_accepts_naive_recent_heartbeat(client):
    now = datetime.now().isoformat()
    store_job(
        {
            "jobId": "naive-heartbeat-running",
            "clientJobId": "other-worker",
            "operation": "calculate",
            "payload": _beam_payload(),
            "status": "running",
            "lastHeartbeatAt": now,
            "createdAt": now,
            "updatedAt": now,
            "startedAt": now,
            "warnings": [],
            "infos": [],
        }
    )
    _futures.clear()

    status_response = client.get("/api/jobs/naive-heartbeat-running")

    assert status_response.status_code == 200
    assert status_response.get_json()["status"] == "running"


def test_async_job_cancel_removes_future_when_cancelled_before_start(client):
    now = datetime.now(timezone.utc).isoformat()
    store_job(
        {
            "jobId": "queued-cancel",
            "clientJobId": "cancel-before-start",
            "operation": "calculate",
            "payload": _beam_payload(),
            "status": "queued",
            "lastHeartbeatAt": now,
            "createdAt": now,
            "updatedAt": now,
            "warnings": [],
            "infos": [],
        }
    )
    future = CancelableFuture()
    _futures.clear()
    _futures["queued-cancel"] = future

    cancel_response = client.delete("/api/jobs/queued-cancel")

    assert cancel_response.status_code == 200
    assert cancel_response.get_json()["status"] == "cancelled"
    assert future.cancel_called is True
    assert "queued-cancel" not in _futures


def test_async_job_rejects_unsupported_operation(client):
    response = client.post("/api/jobs", json={"operation": "unknown", "payload": _beam_payload()})

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "COMMON_UNSUPPORTED_ASYNC_OPERATION"


def test_async_job_rejects_non_string_client_job_id(client):
    response = client.post("/api/jobs", json={"operation": "calculate", "payload": _beam_payload(), "clientJobId": {"id": "bad"}})

    assert response.status_code == 400
    data = response.get_json()
    assert data["error"]["code"] == "COMMON_INVALID_CLIENT_JOB_ID"
    assert "clientJobId" in data["error"]["message"]


def test_reconcile_all_orphans_on_startup(client):
    now = "2026-05-31T00:00:00+00:00"
    stale_heartbeat = "2026-05-31T00:00:00+00:00"

    store_job(
        {
            "jobId": "startup-orphan",
            "clientJobId": "lost-worker",
            "operation": "calculate",
            "payload": _beam_payload(),
            "status": "running",
            "lastHeartbeatAt": stale_heartbeat,
            "createdAt": now,
            "updatedAt": now,
            "startedAt": now,
            "warnings": [],
            "infos": [],
        }
    )
    _futures.clear()

    reconcile_all_orphans()

    job = _load_job("startup-orphan")
    assert job["status"] == "failed"
    assert job["error"]["code"] == "COMMON_ASYNC_JOB_ORPHANED"


def test_async_job_submission_is_idempotent_by_client_id(client):
    payload = _beam_payload()

    response1 = client.post("/api/jobs", json={"operation": "calculate", "payload": payload, "clientJobId": "idempotent-test-123"})
    assert response1.status_code == 202
    job_id1 = response1.get_json()["jobId"]
    assert response1.get_json()["meta"].get("idempotentHit") is None

    response2 = client.post("/api/jobs", json={"operation": "calculate", "payload": payload, "clientJobId": "idempotent-test-123"})
    assert response2.status_code in (200, 202)
    job_id2 = response2.get_json()["jobId"]
    assert response2.get_json()["meta"].get("idempotentHit") is True

    assert job_id1 == job_id2


def test_async_job_client_id_idempotency_is_scoped_by_tenant(client):
    payload = _beam_payload()
    request_body = {"operation": "calculate", "payload": payload, "clientJobId": "tenant-scoped-client-id"}

    tenant_a_first = client.post("/api/jobs", json=request_body, headers={"X-Tenant-Id": "tenant-a"})
    tenant_b_first = client.post("/api/jobs", json=request_body, headers={"X-Tenant-Id": "tenant-b"})
    tenant_a_second = client.post("/api/jobs", json=request_body, headers={"X-Tenant-Id": "tenant-a"})

    assert tenant_a_first.status_code == 202
    assert tenant_b_first.status_code == 202
    assert tenant_a_second.status_code in (200, 202)

    tenant_a_first_job_id = tenant_a_first.get_json()["jobId"]
    tenant_b_first_job_id = tenant_b_first.get_json()["jobId"]
    tenant_a_second_data = tenant_a_second.get_json()

    assert tenant_a_first_job_id != tenant_b_first_job_id
    assert tenant_a_second_data["jobId"] == tenant_a_first_job_id
    assert tenant_a_second_data["meta"]["idempotentHit"] is True
