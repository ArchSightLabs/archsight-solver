import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from backend.normalizers.beam.request_normalizer import normalize_beam_request


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def _beam_payload():
    return {
        "analysisType": "beam",
        "projectName": "Solver Configuration Beam",
        "materialId": "q345",
        "beamType": "continuous",
        "loadType": "uniform",
        "spans": [5.0, 5.0],
        "spanProperties": [{"E": 210.0, "I": 4500.0}, {"E": 210.0, "I": 4500.0}],
        "q": 10.0,
        "freq": 2.0,
        "duration": 5.0,
    }


def test_beam_span_limit_can_be_raised_by_environment(monkeypatch):
    monkeypatch.setenv("ARCHSIGHT_MAX_BEAM_SPANS", "100")

    request = normalize_beam_request({**_beam_payload(), "spans": [1.0] * 65})

    assert len(request["spans"]) == 65


def test_beam_default_limits_and_display_precision_follow_configuration():
    request = normalize_beam_request({**_beam_payload(), "spans": [1.0] * 300})

    assert len(request["spans"]) == 300
    assert request["output_precision"]["displayDecimals"] == 4


def test_beam_output_precision_can_keep_small_nonzero_deflection(client):
    payload = {
        **_beam_payload(),
        "beamType": "simply_supported",
        "spans": [6.0],
        "q": 0.001,
        "E": 206.0,
        "I": 85000.0,
        "spanProperties": [{"E": 206.0, "I": 85000.0}],
        "outputPrecision": {"summaryDecimals": 6},
    }

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    assert data["summary"]["maxDeflectionMm"] == pytest.approx(0.000096, abs=1e-6)
    assert data["diagnostics"]["outputPrecision"]["summaryDecimals"] == 6


def test_beam_sparse_solver_backend_is_explicitly_selectable(client):
    response = client.post("/api/calculate", json={**_beam_payload(), "solverBackend": "sparse"})

    assert response.status_code == 200
    data = response.get_json()
    assert data["payload"]["solverBackend"] == "sparse"
    assert data["diagnostics"]["solver"]["solverBackend"] == "sparse"
