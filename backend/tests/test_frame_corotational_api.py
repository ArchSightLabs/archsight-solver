from __future__ import annotations

import json
import math
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def _payload(options: dict) -> dict:
    return {
        "analysisType": "frame",
        "projectName": "v1.8.1 共回转 API 验收",
        "materialId": "q345",
        "analysisOptions": {"pDelta": True, "pDeltaOptions": options},
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
                {"id": "N2", "x": 0.0, "y": 4.0, "supportType": "free"},
            ],
            "members": [
                {
                    "id": "C1",
                    "start": "N1",
                    "end": "N2",
                    "E_GPa": 210.0,
                    "A_cm2": 220.0,
                    "I_cm4": 1500.0,
                    "kind": "column",
                }
            ],
            "loads": [
                {"type": "nodal", "node": "N2", "fxKn": 4.0, "fyKn": -120.0, "mzKnM": 0.0},
            ],
        },
    }


def test_unspecified_algorithm_keeps_v1_8_initial_stress_compatibility(client):
    response = client.post("/api/calculate", json=_payload({"loadSteps": 4, "maxIterations": 20, "tolerance": 1e-8}))

    assert response.status_code == 200
    second_order = response.get_json()["secondOrder"]
    assert second_order["algorithm"] == {"id": "initial_stress_v1", "version": "1"}
    assert second_order["nonlinearPathTrace"] is None


def test_corotational_algorithm_returns_versioned_path_and_separate_stability(client):
    response = client.post(
        "/api/calculate",
        json=_payload(
            {
                "algorithm": "corotational_newton_v1",
                "initialStep": 0.25,
                "memberSubdivisions": 4,
            }
        ),
    )

    assert response.status_code == 200
    data = response.get_json()
    second_order = data["secondOrder"]
    assert second_order["algorithm"] == {"id": "corotational_newton_v1", "version": "1"}
    assert second_order["method"] == "二维框架共回转全 Newton 弹性几何非线性分析"
    assert second_order["equilibriumStatus"] == "converged"
    assert second_order["stabilityStatus"] in {"stable", "near_critical", "unstable"}
    assert second_order["nonlinearPathTrace"]["schema"] == "NonlinearPathTrace@1"
    assert second_order["nonlinearPathTrace"]["steps"]
    assert second_order["final"]["summary"]["maxDisplacementMm"] == pytest.approx(
        data["summary"]["maxDisplacementMm"], rel=1e-9
    )
    assert data["payload"]["analysisOptions"]["pDeltaOptions"]["algorithm"] == "corotational_newton_v1"


def test_method_comparison_includes_first_order_legacy_and_professional_algorithms(client):
    payload = _payload(
        {
            "algorithm": "corotational_newton_v1",
            "initialStep": 0.25,
            "includeMethodComparison": True,
        }
    )
    payload["analysisOptions"]["buckling"] = True
    response = client.post(
        "/api/calculate",
        json=payload,
    )

    assert response.status_code == 200
    comparison = response.get_json()["secondOrder"]["methodComparison"]
    assert comparison["schema"] == "MethodComparison@1"
    method_ids = [method["id"] for method in comparison["methods"]]
    assert method_ids == ["linear_first_order_v1", "initial_stress_v1", "corotational_newton_v1", "linear_buckling_v1"]
    assert all(len(str(method["sourceHash"])) == 64 for method in comparison["methods"])
    assert len({method["requestHash"] for method in comparison["methods"]}) == 1
    assert len({method["modelHash"] for method in comparison["methods"]}) == 1
    assert all(method["referenceSource"]["id"] == "__primary__" for method in comparison["methods"])
    displacement = next(metric for metric in comparison["metrics"] if metric["id"] == "max_displacement_mm")
    assert displacement["comparable"] is True
    assert displacement["unavailableReason"] is None
    assert set(displacement["values"]) == {"linear_first_order_v1", "initial_stress_v1", "corotational_newton_v1"}
    buckling = next(metric for metric in comparison["metrics"] if metric["id"] == "critical_load_factor")
    assert buckling["referenceOnly"] is True
    assert buckling["values"]["linear_buckling_v1"] > 0.0


def test_corotational_failure_is_a_structured_partial_result_not_a_lost_exception(client):
    payload = _payload(
        {
            "algorithm": "corotational_newton_v1",
            "initialStep": 1.0,
            "minStep": 0.2,
            "maxIterations": 1,
            "maxCutbacks": 1,
            "relativeResidualTolerance": 1e-14,
            "absoluteResidualToleranceN": 1e-12,
            "includeMethodComparison": True,
        }
    )
    payload["structure"]["loads"][0] = {
        "type": "nodal",
        "node": "N2",
        "fxKn": 80.0,
        "fyKn": -300.0,
        "mzKnM": 0.0,
    }

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    second_order = data["secondOrder"]
    assert second_order["converged"] is False
    assert second_order["status"] == "not_converged"
    assert second_order["failureReason"]
    assert second_order["failureCode"] in {
        "GNA_MINIMUM_STEP_EXHAUSTED",
        "GNA_MAXIMUM_CUTBACKS_EXHAUSTED",
    }
    assert second_order["lastConverged"]["loadFactor"] < 1.0
    assert second_order["nonlinearPathTrace"]["attempts"]
    assert second_order["nonlinearPathTrace"]["finalAttempt"]["status"] == "failed"
    metric = second_order["methodComparison"]["metrics"][0]
    assert metric["comparable"] is False
    assert "最后收敛点" in metric["unavailableReason"]
    assert data["summary"]["method"] == "二维平面框架刚度法 + 平面梁柱单元"


def test_buckling_mode_imperfection_is_resolved_into_the_nonlinear_reference_geometry(client):
    payload = _payload(
        {
            "algorithm": "corotational_newton_v1",
            "initialImperfection": {
                "type": "buckling_mode",
                "modeNumber": 1,
                "amplitudeMm": 6.0,
                "direction": 1,
            },
        }
    )
    payload["analysisOptions"]["buckling"] = True
    payload["structure"]["loads"][0]["fxKn"] = 0.0

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    second_order = response.get_json()["secondOrder"]
    imperfection = second_order["initialImperfection"]
    assert imperfection["type"] == "explicit"
    assert imperfection["source"]["type"] == "linear_buckling_mode"
    assert imperfection["source"]["modeNumber"] == 1
    assert imperfection["source"]["amplitudeMm"] == pytest.approx(6.0)
    assert imperfection["memberShapeOffsets"]


def test_mode_imperfection_matches_euler_column_amplification_without_double_counting_shape(client):
    length_m = 3.0
    elastic_modulus_pa = 200e9
    inertia_m4 = 800e-8
    euler_load_kn = math.pi**2 * elastic_modulus_pa * inertia_m4 / length_m**2 / 1000.0
    load_ratio = 0.4
    imperfection_mm = 10.0
    payload = {
        "analysisType": "frame",
        "projectName": "Euler 初始缺陷柱解析回归",
        "materialId": "elastic-steel",
        "analysisOptions": {
            "pDelta": True,
            "buckling": True,
            "pDeltaOptions": {
                "algorithm": "corotational_newton_v1",
                "initialStep": 0.1,
                "maxStep": 0.1,
                "memberSubdivisions": 6,
                "initialImperfection": {
                    "type": "buckling_mode",
                    "modeNumber": 1,
                    "amplitudeMm": imperfection_mm,
                    "direction": 1,
                },
            },
        },
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "pinned"},
                {"id": "N2", "x": 0.0, "y": 1.5, "supportType": "free"},
                {"id": "N3", "x": 0.0, "y": 3.0, "supportType": "roller", "supportAngleDeg": 0.0},
            ],
            "members": [
                {"id": "C1", "start": "N1", "end": "N2", "E_GPa": 200.0, "A_cm2": 100.0, "I_cm4": 800.0, "kind": "column"},
                {"id": "C2", "start": "N2", "end": "N3", "E_GPa": 200.0, "A_cm2": 100.0, "I_cm4": 800.0, "kind": "column"},
            ],
            "loads": [
                {"type": "nodal", "node": "N3", "fxKn": 0.0, "fyKn": -load_ratio * euler_load_kn, "mzKnM": 0.0},
            ],
        },
    }

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    second_order = data["secondOrder"]
    midspan = next(
        item for item in second_order["lastConvergedSolution"]["nodeResults"] if item["nodeId"] == "N2"
    )
    expected_incremental_mm = imperfection_mm * load_ratio / (1.0 - load_ratio)
    expected_total_mm = imperfection_mm / (1.0 - load_ratio)
    assert second_order["initialImperfection"]["maximumAmplitudeMm"] == pytest.approx(imperfection_mm)
    assert second_order["amplificationFactor"] is None
    assert "不可比" in second_order["amplificationUnavailableReason"]
    json.dumps(data, ensure_ascii=False, allow_nan=False)
    assert midspan["uxMm"] == pytest.approx(expected_incremental_mm, abs=0.2)
    assert midspan["totalUxMm"] == pytest.approx(expected_total_mm, abs=0.2)
    assert data["buckling"]["criticalLoadFactor"] == pytest.approx(1.0 / load_ratio, rel=1e-4)


def test_load_path_roles_survive_normalization_and_reach_the_canonical_trace(client):
    payload = _payload({"algorithm": "corotational_newton_v1", "initialStep": 0.5, "maxStep": 0.5})
    payload["structure"]["loads"] = [
        {"type": "nodal", "node": "N2", "fxKn": 0.0, "fyKn": -120.0, "mzKnM": 0.0, "pathRole": "fixed"},
        {"type": "nodal", "node": "N2", "fxKn": 4.0, "fyKn": 0.0, "mzKnM": 0.0, "pathRole": "variable"},
    ]

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    roles = [load["pathRole"] for load in data["structure"]["loads"]]
    assert roles == ["fixed", "variable"]
    trace = data["secondOrder"]["nonlinearPathTrace"]
    assert trace["control"]["type"] == "fixed_preload_then_adaptive_variable_load"
    assert trace["lastConverged"]["fixedLoadFactor"] == pytest.approx(1.0)
    assert trace["lastConverged"]["loadFactor"] == pytest.approx(1.0)
