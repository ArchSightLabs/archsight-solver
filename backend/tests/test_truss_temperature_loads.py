import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def test_truss_temperature_load_uses_member_material_alpha_and_free_expansion(client):
    payload = {
        "analysisType": "truss",
        "projectName": "truss-temperature-free-expansion",
        "materialId": "q345",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "pinned"},
                {"id": "N2", "x": 4.0, "y": 0.0, "supportType": "roller"},
            ],
            "members": [
                {"id": "M1", "start": "N1", "end": "N2", "materialId": "c30", "E_GPa": 30.0, "A_cm2": 24.0, "kind": "bar"},
            ],
            "loads": [
                {"type": "temperature", "member": "M1", "deltaTempC": 20.0},
            ],
        },
    }

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    node_results = {item["nodeId"]: item for item in data["nodeResults"]}
    member = data["memberResults"][0]
    assert data["structure"]["loads"] == [{"type": "temperature", "member": "M1", "deltaTempC": 20.0, "alphaPerC": 1e-5}]
    assert node_results["N2"]["uxMm"] == pytest.approx(0.8, abs=1e-9)
    assert max(abs(node_results[node_id][axis]) for node_id in ("N1", "N2") for axis in ("rxKn", "ryKn")) < 1e-9
    assert member["axialForceKn"] == pytest.approx(0.0, abs=1e-9)
    assert member["forceState"] == "near_zero"
    assert data["diagnostics"]["equilibrium"]["rmsRelativeError"] < 1e-9


def test_truss_temperature_load_restrained_member_generates_compression(client):
    payload = {
        "analysisType": "truss",
        "projectName": "truss-temperature-restrained-expansion",
        "materialId": "q345",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "pinned"},
                {"id": "N2", "x": 4.0, "y": 0.0, "supportType": "pinned"},
                {"id": "N3", "x": 1.0, "y": 1.0, "supportType": "roller"},
            ],
            "members": [
                {"id": "M1", "start": "N1", "end": "N2", "materialId": "q345", "E_GPa": 210.0, "A_cm2": 24.0, "kind": "bar"},
                {"id": "M2", "start": "N1", "end": "N3", "materialId": "q345", "E_GPa": 210.0, "A_cm2": 24.0, "kind": "bar"},
            ],
            "loads": [
                {"type": "temperature", "member": "M1", "deltaTempC": 30.0, "alphaPerC": 1e-5},
            ],
        },
    }

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    expected_compression_kn = 210e9 * 24e-4 * 1e-5 * 30.0 / 1000.0
    node_results = {item["nodeId"]: item for item in data["nodeResults"]}
    member_results = {item["memberId"]: item for item in data["memberResults"]}
    assert node_results["N1"]["rxKn"] == pytest.approx(expected_compression_kn, rel=1e-9)
    assert node_results["N2"]["rxKn"] == pytest.approx(-expected_compression_kn, rel=1e-9)
    assert member_results["M1"]["axialForceKn"] == pytest.approx(-expected_compression_kn, rel=1e-9)
    assert member_results["M1"]["forceState"] == "compression"
    assert member_results["M2"]["axialForceKn"] == pytest.approx(0.0, abs=1e-9)
    assert data["summary"]["maxAxialForceKn"] == pytest.approx(expected_compression_kn, rel=1e-9)
    assert data["diagnostics"]["equilibrium"]["rmsRelativeError"] < 1e-9
