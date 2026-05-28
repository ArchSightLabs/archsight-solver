import os
import sys
import time

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from backend.api.jobs import _futures, _load_job


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


def test_async_job_rejects_unsupported_operation(client):
    response = client.post("/api/jobs", json={"operation": "unknown", "payload": _beam_payload()})

    assert response.status_code == 400
    assert response.get_json()["error"]["code"] == "COMMON_UNSUPPORTED_ASYNC_OPERATION"
