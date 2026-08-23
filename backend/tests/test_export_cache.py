import io
import os
import sys

import pandas as pd
import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from backend.contracts.calculation_evidence import EVIDENCE_FIELDS
from backend.application.calculation import build_calculation_result
from backend.contracts.calculation_response import build_api_v1_response
from backend.services.job_store import store_job


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("ARCHSIGHT_SOLVER_JOB_DB_PATH", str(tmp_path / "solver-jobs.sqlite3"))
    app.config["TESTING"] = True
    return app.test_client()


def test_export_skips_calculation_when_valid_job_id_provided(client, monkeypatch):
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    canonical_result = build_calculation_result({"analysisType": "beam", "beamType": "simply_supported", "spans": [6]})
    legacy_solution = dict(canonical_result["solution"])
    for field in EVIDENCE_FIELDS:
        canonical_result.pop(field, None)
        legacy_solution.pop(field, None)
    canonical_result["solution"] = legacy_solution
    store_job({
        "jobId": "test-cache-export-id",
        "operation": "calculate",
        "payload": {"analysisType": "beam", "beamType": "simply_supported", "spans": [6]},
        "status": "succeeded",
        "result": canonical_result,
        "createdAt": now,
        "updatedAt": now,
        "startedAt": now,
        "completedAt": now,
    })

    def boom(*args, **kwargs):
        raise AssertionError("Calculation should have been skipped!")
    
    import backend.services.export_service
    monkeypatch.setattr(backend.services.export_service, "build_beam_solution", boom)
    monkeypatch.setattr(backend.services.export_service, "build_frame_solution", boom)
    monkeypatch.setattr(backend.services.export_service, "build_truss_solution", boom)

    received_report = None
    import backend.api.export

    def mock_export_report(report, format_type):
        nonlocal received_report
        received_report = report
        from backend.exporters.common.artifact import ExportArtifact
        import io
        return ExportArtifact(buffer=io.BytesIO(b"mocked document"), filename="mock.docx", mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document")

    monkeypatch.setattr(backend.api.export, "export_report", mock_export_report)

    response = client.post("/api/export", json={
        "analysisType": "beam",
        "beamType": "simply_supported",
        "spans": [6],
        "jobId": "test-cache-export-id",
        "format": "docx"
    })

    assert response.status_code == 200
    assert received_report is not None
    assert "criticalPoints" not in received_report.fields
    assert received_report.analysis_type == "beam"


def test_export_reads_canonical_result_from_sync_calculation_cache(client):
    payload = {
        "analysisType": "beam",
        "beamType": "simply_supported",
        "loadType": "uniform",
        "q": 12,
        "E": 206,
        "I": 85000,
        "spans": [6],
        "projectName": "Canonical Cached Export",
    }
    calculation = client.post("/api/calculate", json=payload)

    assert calculation.status_code == 200
    job_id = calculation.get_json()["jobId"]
    exported = client.post("/api/export", json={**payload, "jobId": job_id, "format": "xlsx"})

    assert exported.status_code == 200
    assert exported.mimetype == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert len(exported.data) > 0
    workbook_text = pd.read_excel(io.BytesIO(exported.data), sheet_name="05_校核证据", header=None).astype(str).to_string()
    assert "当前结果未提供 criticalPoints" not in workbook_text
    assert "unavailable" not in workbook_text
    assert "__primary__" in workbook_text
    assert "deflection" in workbook_text


def test_export_reuses_legacy_public_response_cache_without_recalculation(client, monkeypatch):
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    payload = {"analysisType": "beam", "beamType": "simply_supported", "spans": [6]}
    public_response = build_api_v1_response(build_calculation_result(payload))
    store_job({
        "jobId": "legacy-public-export-id",
        "operation": "calculate",
        "payload": payload,
        "status": "succeeded",
        "result": public_response,
        "createdAt": now,
        "updatedAt": now,
        "startedAt": now,
        "completedAt": now,
    })

    import backend.services.export_service

    def boom(*args, **kwargs):
        raise AssertionError("Legacy cached export must not rerun a solver")

    monkeypatch.setattr(backend.services.export_service, "build_beam_solution", boom)
    response = client.post("/api/export", json={**payload, "jobId": "legacy-public-export-id", "format": "xlsx"})

    assert response.status_code == 200
    assert response.mimetype == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def test_export_rejects_cached_job_without_reusable_solution_facts(client, monkeypatch):
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    store_job({
        "jobId": "noncanonical-export-id",
        "operation": "calculate",
        "payload": {"analysisType": "beam", "beamType": "simply_supported", "spans": [6]},
        "status": "succeeded",
        "result": {
            "success": True,
            "operation": "calculate",
            "analysisType": "beam",
            "summary": {},
        },
        "createdAt": now,
        "updatedAt": now,
        "startedAt": now,
        "completedAt": now,
    })

    def boom(*args, **kwargs):
        raise AssertionError("Export should not recompute when the cached job result is noncanonical!")

    import backend.services.export_service

    monkeypatch.setattr(backend.services.export_service, "build_beam_solution", boom)
    monkeypatch.setattr(backend.services.export_service, "build_frame_solution", boom)
    monkeypatch.setattr(backend.services.export_service, "build_truss_solution", boom)

    response = client.post(
        "/api/export",
        json={
            "analysisType": "beam",
            "beamType": "simply_supported",
            "spans": [6],
            "jobId": "noncanonical-export-id",
            "format": "docx",
        },
    )

    assert response.status_code == 409
    data = response.get_json()
    assert data["success"] is False
    assert data["error"]["code"] == "COMMON_EXPORT_CACHE_MISS"
    assert "可复用的求解事实" in data["error"]["message"]
