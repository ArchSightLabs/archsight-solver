import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from backend.services.job_store import store_job


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("ARCHSIGHT_SOLVER_JOB_DB_PATH", str(tmp_path / "solver-jobs.sqlite3"))
    app.config["TESTING"] = True
    return app.test_client()


def test_export_skips_calculation_when_valid_job_id_provided(client, monkeypatch):
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc).isoformat()
    mock_solution = {"fake": "solution_data", "analysisType": "beam"}
    store_job({
        "jobId": "test-cache-export-id",
        "operation": "calculate",
        "payload": {"analysisType": "beam", "beamType": "simply_supported", "spans": [6]},
        "status": "succeeded",
        "result": {
            "success": True,
            "operation": "calculate",
            "version": "1.0",
            "analysisType": "beam",
            "results": {},
            "diagnostics": {},
            "meta": {},
            "solution": mock_solution
        },
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
    assert received_report.fields == mock_solution
    assert received_report.analysis_type == "beam"
