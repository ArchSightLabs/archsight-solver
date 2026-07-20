import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from backend.services.job_store import load_job


def _beam_payload():
    return {
        "analysisType": "beam",
        "projectName": "Beam Envelope",
        "materialId": "q345",
        "beamType": "continuous",
        "loadType": "uniform",
        "spans": [5.0, 5.0],
        "spanProperties": [
            {"E": 210.0, "I": 4500.0},
            {"E": 210.0, "I": 4500.0},
        ],
        "q": 10.0,
        "freq": 2.0,
        "duration": 5.0,
    }


def _frame_payload():
    return {
        "analysisType": "frame",
        "projectName": "Frame Envelope",
        "materialId": "q345",
        "structure": {
            "template": "portal_frame",
            "span": 6.0,
            "height": 4.0,
            "left_support": "fixed",
            "right_support": "fixed",
            "beam_load_kn_per_m": 18.0,
            "lateral_load_kn": 24.0,
            "top_vertical_load_kn": 0.0,
        },
    }


def _truss_payload():
    return {
        "analysisType": "truss",
        "projectName": "Truss Envelope",
        "materialId": "q235",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "pinned"},
                {"id": "N2", "x": 4.0, "y": 0.0, "supportType": "roller"},
                {"id": "N3", "x": 1.0, "y": 2.0, "supportType": "free"},
                {"id": "N4", "x": 3.0, "y": 2.0, "supportType": "free"},
            ],
            "members": [
                {"id": "M1", "start": "N1", "end": "N3", "E_GPa": 210, "A_cm2": 120, "kind": "bar"},
                {"id": "M2", "start": "N3", "end": "N4", "E_GPa": 210, "A_cm2": 120, "kind": "bar"},
                {"id": "M3", "start": "N4", "end": "N2", "E_GPa": 210, "A_cm2": 120, "kind": "bar"},
                {"id": "M4", "start": "N1", "end": "N4", "E_GPa": 210, "A_cm2": 120, "kind": "bar"},
                {"id": "M5", "start": "N3", "end": "N2", "E_GPa": 210, "A_cm2": 120, "kind": "bar"},
            ],
            "loads": [
                {"type": "nodal", "node": "N3", "fxKn": 0.0, "fyKn": -10.0},
                {"type": "nodal", "node": "N4", "fxKn": 0.0, "fyKn": -10.0},
            ],
        },
    }


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


@pytest.mark.parametrize(
    ("endpoint", "payload", "analysis_type"),
    [
        ("/api/calculate", _beam_payload, "beam"),
        ("/api/calculate", _frame_payload, "frame"),
        ("/api/calculate", _truss_payload, "truss"),
        ("/api/preview", _beam_payload, "beam"),
        ("/api/preview", _frame_payload, "frame"),
        ("/api/preview", _truss_payload, "truss"),
    ],
)
def test_api_responses_include_unified_envelope(client, endpoint, payload, analysis_type):
    response = client.post(endpoint, json=payload())
    assert response.status_code == 200

    data = response.get_json()
    expected_operation = endpoint.rsplit("/", 1)[-1]
    assert data["success"] is True
    assert data["operation"] == expected_operation
    assert data["analysisType"] == analysis_type
    assert data["version"] == "v1"
    assert data["meta"]["generatedAt"]
    assert "legacyFields" in data["meta"]["compat"]
    assert data["request"]["analysisType"] == analysis_type
    assert data["model"]["analysisType"] == analysis_type
    assert data["results"]["summary"] == data["summary"]
    assert data["results"]["preview"] == data["preview"]
    assert data["results"]["diagram"] == data["diagram"]
    assert data["diagnostics"]["status"] == data["summary"]["status"]
    assert data["diagnostics"]["statusCode"] == data["summary"]["statusCode"]
    assert data["diagnostics"]["method"] == data["summary"]["method"]
    assert data["errors"] == []

    if analysis_type == "beam":
        assert data["model"]["structure"]["beamType"] == data["beam"]["beamType"]
        assert data["results"]["series"]["x_data"] == data["x_data"]
        assert data["results"]["series"]["v_data"] == data["v_data"]
        assert data["results"]["series"]["moment_data"] == data["moment_data"]
        assert data["results"]["series"]["shear_data"] == data["shear_data"]
    elif analysis_type == "frame":
        assert data["model"]["structure"]["nodes"] == data["structure"]["nodes"]
        assert data["results"]["nodeResults"] == data["nodeResults"]
        assert data["results"]["memberResults"] == data["memberResults"]
        assert data["results"]["memberDiagrams"] == data["memberDiagrams"]
        assert data["results"]["series"]["ux_data"] == data["ux_data"]
        assert data["results"]["series"]["uy_data"] == data["uy_data"]
        assert data["results"]["series"]["member_moment_data"] == data["member_moment_data"]
        assert data["diagnostics"]["constraintRank"] is not None
        assert data["diagnostics"]["freeDofCount"] is not None
        assert data["diagnostics"]["equilibrium"]["rmsRelativeError"] < 1e-9
        assert data["diagnostics"]["equilibrium"]["maxResidualN"] < 1e-6
    else:
        assert data["model"]["structure"]["nodes"] == data["structure"]["nodes"]
        assert data["results"]["nodeResults"] == data["nodeResults"]
        assert data["results"]["memberResults"] == data["memberResults"]
        assert data["results"]["series"]["ux_data"] == data["ux_data"]
        assert data["results"]["series"]["uy_data"] == data["uy_data"]
        assert data["results"]["series"]["member_axial_data"] == data["member_axial_data"]


def test_sync_calculations_do_not_treat_browser_client_id_as_idempotency_key(monkeypatch, tmp_path):
    monkeypatch.setenv("ARCHSIGHT_SOLVER_JOB_DB_PATH", str(tmp_path / "solver-jobs.sqlite3"))
    app.config["TESTING"] = True
    isolated_client = app.test_client()
    headers = {"X-Client-ID": "stable-browser-client"}

    first = isolated_client.post("/api/calculate", json=_beam_payload(), headers=headers)
    second = isolated_client.post("/api/calculate", json=_beam_payload(), headers=headers)

    assert first.status_code == 200
    assert second.status_code == 200
    first_data = first.get_json()
    second_data = second.get_json()
    assert first_data["meta"]["jobCacheStatus"] == "succeeded"
    assert second_data["meta"]["jobCacheStatus"] == "succeeded"
    assert first_data["jobId"] != second_data["jobId"]
    first_stored_result = load_job(first_data["jobId"])["result"]
    assert first_stored_result["storageSchema"] == "solver-calculation-result@1"
    assert "success" not in first_stored_result
    assert "results" not in first_stored_result
