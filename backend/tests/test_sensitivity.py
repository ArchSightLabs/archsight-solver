import json
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def _frame_payload():
    return {
        "analysisType": "frame",
        "projectName": "Sensitivity Portal Frame",
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
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
                {"id": "N2", "x": 6.0, "y": 0.0, "supportType": "fixed"},
                {"id": "N3", "x": 0.0, "y": 4.0, "supportType": "free"},
                {"id": "N4", "x": 6.0, "y": 4.0, "supportType": "free"},
            ],
            "members": [
                {"id": "C1", "start": "N1", "end": "N3", "E_GPa": 210, "A_cm2": 240, "I_cm4": 12000, "kind": "column"},
                {"id": "B1", "start": "N3", "end": "N4", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
                {"id": "C2", "start": "N2", "end": "N4", "E_GPa": 210, "A_cm2": 240, "I_cm4": 12000, "kind": "column"},
            ],
            "loads": [
                {"type": "distributed", "member": "B1", "wyKnPerM": -18.0},
                {"type": "nodal", "node": "N4", "fxKn": 24.0, "fyKn": 0.0, "mzKnM": 0.0},
            ],
        },
        "config": {"range": 20, "steps": 2},
    }


def _truss_payload():
    return {
        "analysisType": "truss",
        "projectName": "Sensitivity Truss",
        "materialId": "q345",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "pinned"},
                {"id": "N2", "x": 6.0, "y": 0.0, "supportType": "roller"},
                {"id": "N3", "x": 2.0, "y": 3.0, "supportType": "free"},
                {"id": "N4", "x": 4.0, "y": 3.0, "supportType": "free"},
            ],
            "members": [
                {"id": "M1", "start": "N1", "end": "N3", "E_GPa": 210, "A_cm2": 24},
                {"id": "M2", "start": "N3", "end": "N4", "E_GPa": 210, "A_cm2": 24},
                {"id": "M3", "start": "N4", "end": "N2", "E_GPa": 210, "A_cm2": 24},
                {"id": "M4", "start": "N3", "end": "N2", "E_GPa": 210, "A_cm2": 24},
                {"id": "M5", "start": "N1", "end": "N4", "E_GPa": 210, "A_cm2": 24},
            ],
            "loads": [
                {"type": "nodal", "node": "N3", "fxKn": 0.0, "fyKn": -50.0},
                {"type": "nodal", "node": "N4", "fxKn": 0.0, "fyKn": -50.0},
            ],
        },
        "config": {"range": 20, "steps": 2},
    }


def test_beam_zero_variation_consistency(client):
    payload = {
        "spans": [5.0, 5.0],
        "targetSpanIndex": 0,
        "q": 10.0,
        "E": 200.0,
        "I": 10000.0,
        "freq": 2.0,
        "config": {"range": 20, "steps": 2},
    }

    response = client.post("/api/sensitivity", data=json.dumps(payload), content_type="application/json")
    assert response.status_code == 200
    data = response.get_json()

    assert data["responseLabel"] == "最大挠度"
    assert data["responseUnit"] == "毫米"
    assert data["responseMetric"] == "max_deflection"
    assert [series["key"] for series in data["series"]] == ["q", "E", "I", "freq"]
    assert len(data["variations"]) == 3
    assert len(data["q"]) == 3
    assert len(data["E"]) == 3
    assert len(data["I"]) == 3

    base_response = client.post("/api/calculate", data=json.dumps(payload), content_type="application/json")
    assert base_response.status_code == 200
    base_data = base_response.get_json()

    v_span1 = [abs(v) for v in base_data["v_data"][:100]]
    base_max_mm = max(v_span1) * 1000

    assert data["q"][1] == pytest.approx(base_max_mm, abs=0.1)
    assert data["E"][1] == pytest.approx(base_max_mm, abs=0.1)
    assert data["I"][1] == pytest.approx(base_max_mm, abs=0.1)


def test_beam_sensitivity_supports_professional_response_metric_switch(client):
    response = client.post(
        "/api/sensitivity",
        json={
            "spans": [6.0],
            "q": 12.0,
            "E": 206.0,
            "I": 85000.0,
            "freq": 2.0,
            "config": {"range": 20, "steps": 2, "responseMetric": "max_moment"},
        },
    )
    assert response.status_code == 200
    data = response.get_json()

    assert data["responseLabel"] == "最大弯矩"
    assert data["responseUnit"] == "千牛·米"
    assert data["responseMetric"] == "max_moment"
    assert data["q"][0] != data["q"][2]


def test_frame_sensitivity_returns_generic_series_payload(client):
    response = client.post("/api/sensitivity", json=_frame_payload())
    assert response.status_code == 200
    data = response.get_json()

    assert data["responseLabel"] == "最大水平位移"
    assert data["responseUnit"] == "毫米"
    assert data["responseMetric"] == "max_ux"
    assert [series["key"] for series in data["series"]] == ["beamLoad", "lateralLoad", "E", "I"]
    assert len(data["variations"]) == 3
    assert all(len(data[key]) == 3 for key in ("beamLoad", "lateralLoad", "E", "I"))
    assert data["beamLoad"][0] != data["beamLoad"][2]


def test_frame_sensitivity_supports_professional_response_metric_switch(client):
    payload = _frame_payload()
    payload["config"]["responseMetric"] = "max_member_moment"
    response = client.post("/api/sensitivity", json=payload)
    assert response.status_code == 200
    data = response.get_json()

    assert data["responseLabel"] == "最大构件弯矩"
    assert data["responseUnit"] == "千牛·米"
    assert data["responseMetric"] == "max_member_moment"
    assert data["beamLoad"][0] != data["beamLoad"][2]


def test_truss_sensitivity_returns_generic_series_payload(client):
    response = client.post("/api/sensitivity", json=_truss_payload())
    assert response.status_code == 200
    data = response.get_json()

    assert data["responseLabel"] == "最大节点位移"
    assert data["responseUnit"] == "毫米"
    assert data["responseMetric"] == "max_node_displacement"
    assert [series["key"] for series in data["series"]] == ["fx", "fy", "E", "A"]
    assert len(data["variations"]) == 3
    assert all(len(data[key]) == 3 for key in ("fx", "fy", "E", "A"))
    assert data["A"][0] != data["A"][2]


def test_truss_sensitivity_supports_professional_response_metric_switch(client):
    payload = _truss_payload()
    payload["config"]["responseMetric"] = "max_member_stress"
    response = client.post("/api/sensitivity", json=payload)
    assert response.status_code == 200
    data = response.get_json()

    assert data["responseLabel"] == "最大杆件轴应力"
    assert data["responseUnit"] == "兆帕"
    assert data["responseMetric"] == "max_member_stress"
    assert data["A"][0] != data["A"][2]


def test_sensitivity_rejects_unbounded_step_count(client):
    payload = _frame_payload()
    payload["config"] = {"range": 20, "steps": 1000}

    response = client.post("/api/sensitivity", json=payload)

    assert response.status_code == 400
    data = response.get_json()
    assert data["success"] is False
    assert data["operation"] == "sensitivity"
    assert data["error"]["message"] == "敏感性分析步数必须位于 1 到 50 之间"


def test_sensitivity_rejects_unbounded_variation_range(client):
    payload = _truss_payload()
    payload["config"] = {"range": 120, "steps": 2}

    response = client.post("/api/sensitivity", json=payload)

    assert response.status_code == 400
    data = response.get_json()
    assert data["success"] is False
    assert data["operation"] == "sensitivity"
    assert data["error"]["message"] == "敏感性分析扰动范围必须位于 0 到 80% 之间"
