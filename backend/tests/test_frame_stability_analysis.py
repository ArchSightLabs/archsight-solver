import math
import os
import sys
from typing import Any, Mapping

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def _frame_payload(
    *,
    nodes: list[dict[str, Any]],
    members: list[dict[str, Any]],
    loads: list[dict[str, Any]] | None = None,
    analysis_options: dict[str, Any] | None = None,
    load_cases: list[dict[str, Any]] | None = None,
    load_combinations: list[dict[str, Any]] | None = None,
    project_name: str = "稳定分析门禁回归",
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "analysisType": "frame",
        "projectName": project_name,
        "materialId": "q345",
        "structure": {
            "template": "explicit",
            "nodes": nodes,
            "members": members,
            "loads": loads or [],
        },
    }
    if analysis_options is not None:
        payload["analysisOptions"] = analysis_options
    if load_cases is not None:
        payload["structure"]["loadCases"] = load_cases
    if load_combinations is not None:
        payload["structure"]["loadCombinations"] = load_combinations
    return payload


def _summary(snapshot: Mapping[str, Any]) -> Mapping[str, Any]:
    summary = snapshot.get("summary")
    assert isinstance(summary, Mapping), f"missing summary in {snapshot!r}"
    return summary


def _second_order_snapshot(data: Mapping[str, Any]) -> Mapping[str, Any]:
    second_order = data["secondOrder"]
    assert isinstance(second_order, Mapping)
    return second_order


def _buckling_snapshot(data: Mapping[str, Any]) -> Mapping[str, Any]:
    buckling = data["buckling"]
    assert isinstance(buckling, Mapping)
    return buckling


def _first_order_reference(second_order: Mapping[str, Any]) -> Mapping[str, Any]:
    candidates = (
        second_order.get("firstOrder"),
        second_order.get("reference"),
    )
    comparison = second_order.get("comparison")
    if isinstance(comparison, Mapping):
        candidates += (comparison.get("firstOrder"), comparison.get("reference"))
    for candidate in candidates:
        if isinstance(candidate, Mapping):
            return candidate
    raise AssertionError(f"missing first-order reference in {second_order!r}")


def _final_second_order(second_order: Mapping[str, Any]) -> Mapping[str, Any]:
    candidates = (
        second_order.get("secondOrder"),
        second_order.get("solution"),
        second_order.get("final"),
    )
    comparison = second_order.get("comparison")
    if isinstance(comparison, Mapping):
        candidates += (comparison.get("secondOrder"), comparison.get("solution"), comparison.get("final"))
    for candidate in candidates:
        if isinstance(candidate, Mapping):
            return candidate
    raise AssertionError(f"missing final second-order snapshot in {second_order!r}")


def _buckling_modes(buckling: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    for key in ("modes", "modeShapes", "eigenModes"):
        candidate = buckling.get(key)
        if isinstance(candidate, list) and candidate:
            return [mode for mode in candidate if isinstance(mode, Mapping)]
    raise AssertionError(f"missing buckling modes in {buckling!r}")


def _node_displacements(mode: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    for key in ("nodeDisplacements", "nodes", "shapeNodes"):
        candidate = mode.get(key)
        if isinstance(candidate, list) and candidate:
            return [node for node in candidate if isinstance(node, Mapping)]
    raise AssertionError(f"missing mode node displacements in {mode!r}")


def _member_mode_shapes(mode: Mapping[str, Any]) -> list[Mapping[str, Any]]:
    for key in ("memberModeShapes", "memberModes", "memberShapes"):
        candidate = mode.get(key)
        if isinstance(candidate, list) and candidate:
            return [shape for shape in candidate if isinstance(shape, Mapping)]
    raise AssertionError(f"missing member mode shapes in {mode!r}")


def _node_translation_abs_max(node: Mapping[str, Any]) -> float:
    values: list[float] = []
    for key in ("uxMm", "uyMm", "ux", "uy"):
        if key in node:
            values.append(abs(float(node[key])))
    assert values, f"missing translation components in {node!r}"
    return max(values)


def _member_shape_translation_abs_max(shape: Mapping[str, Any]) -> float:
    values: list[float] = []
    for key in ("uxMm", "uyMm", "ux", "uy"):
        series = shape.get(key)
        if isinstance(series, list):
            values.extend(abs(float(item)) for item in series if item is not None)
        elif series is not None:
            values.append(abs(float(series)))
    stations = shape.get("stations")
    if isinstance(stations, list):
        for station in stations:
            if isinstance(station, Mapping):
                values.extend(
                    abs(float(station[key]))
                    for key in ("uxMm", "uyMm", "ux", "uy")
                    if key in station
                )
    assert values, f"missing translation components in member shape {shape!r}"
    return max(values)


def _collection_first(mapping: Mapping[str, Any], *keys: str) -> Mapping[str, Any]:
    for key in keys:
        value = mapping.get(key)
        if isinstance(value, list) and value and isinstance(value[0], Mapping):
            return value[0]
    raise AssertionError(f"missing collection {keys} in {mapping!r}")


def _expected_euler_critical_load_kn(e_gpa: float, i_cm4: float, length_m: float, effective_length_factor: float) -> float:
    e = e_gpa * 1_000_000_000.0
    i = i_cm4 * 1e-8
    return math.pi**2 * e * i / ((effective_length_factor * length_m) ** 2) / 1000.0


def _column_payload(
    *,
    start_support: str,
    end_support: str,
    end_condensed_dofs: list[str] | None = None,
    axial_load_kn: float = 1.0,
    lateral_load_kn: float = 0.0,
    analysis_options: dict[str, Any] | None = None,
    e_gpa: float = 210.0,
    a_cm2: float = 220.0,
    i_cm4: float = 1500.0,
    length_m: float = 4.0,
) -> dict[str, Any]:
    end_node: dict[str, Any] = {
        "id": "N2",
        "x": 0.0,
        "y": length_m,
        "supportType": end_support,
    }
    if end_condensed_dofs:
        end_node["condensedDofs"] = end_condensed_dofs

    return _frame_payload(
        nodes=[
            {"id": "N1", "x": 0.0, "y": 0.0, "supportType": start_support},
            end_node,
        ],
        members=[
            {
                "id": "C1",
                "start": "N1",
                "end": "N2",
                "E_GPa": e_gpa,
                "A_cm2": a_cm2,
                "I_cm4": i_cm4,
                "kind": "column",
            }
        ],
        loads=[
            {"type": "nodal", "node": "N2", "fxKn": lateral_load_kn, "fyKn": -axial_load_kn, "mzKnM": 0.0},
        ],
        analysis_options=analysis_options,
    )


def _cantilever_payload(*, axial_load_kn: float, lateral_load_kn: float, analysis_options: dict[str, Any] | None = None):
    return _column_payload(
        start_support="fixed",
        end_support="free",
        axial_load_kn=axial_load_kn,
        lateral_load_kn=lateral_load_kn,
        analysis_options=analysis_options,
    )


def test_frame_second_order_reduces_to_first_order_when_axial_force_is_zero(client):
    payload = _cantilever_payload(
        axial_load_kn=0.0,
        lateral_load_kn=12.0,
        analysis_options={"pDelta": True, "pDeltaOptions": {"loadSteps": 8, "maxIterations": 20, "tolerance": 1e-8}},
    )

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    second_order = _second_order_snapshot(data)
    first_order = _first_order_reference(second_order)
    final_order = _final_second_order(second_order)

    assert second_order["enabled"] is True
    assert second_order["status"] == "converged"
    assert second_order["amplificationFactor"] == pytest.approx(1.0, abs=1e-8)
    assert _summary(final_order)["maxDisplacementMm"] == pytest.approx(_summary(first_order)["maxDisplacementMm"], abs=1e-8)
    assert _summary(final_order)["maxDisplacementMm"] == pytest.approx(data["summary"]["maxDisplacementMm"], abs=1e-8)
    assert _collection_first(final_order, "nodeResults")["uyMm"] == pytest.approx(_collection_first(data, "nodeResults")["uyMm"], abs=1e-8)
    assert _collection_first(final_order, "memberResults")["momentEndKnM"] == pytest.approx(_collection_first(data, "memberResults")["momentEndKnM"], abs=1e-8)
    assert _collection_first(final_order, "memberDiagrams")["momentKnM"] == _collection_first(data, "memberDiagrams")["momentKnM"]


def test_frame_second_order_amplifies_compression_cantilever(client):
    payload = _cantilever_payload(
        axial_load_kn=120.0,
        lateral_load_kn=12.0,
        analysis_options={"pDelta": True, "pDeltaOptions": {"loadSteps": 12, "maxIterations": 30, "tolerance": 1e-8}},
    )

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    second_order = _second_order_snapshot(data)
    first_order = _first_order_reference(second_order)
    final_order = _final_second_order(second_order)

    assert second_order["enabled"] is True
    assert second_order["status"] == "converged"
    assert second_order["amplificationFactor"] > 1.0
    assert _summary(final_order)["maxDisplacementMm"] > _summary(first_order)["maxDisplacementMm"]
    assert _summary(final_order)["maxDisplacementMm"] == pytest.approx(data["summary"]["maxDisplacementMm"], rel=1e-8)
    assert _collection_first(final_order, "nodeResults")["uyMm"] == pytest.approx(_collection_first(data, "nodeResults")["uyMm"], rel=1e-8)
    assert _collection_first(final_order, "memberResults")["shearStartKn"] == pytest.approx(_collection_first(data, "memberResults")["shearStartKn"], rel=1e-8)
    assert _collection_first(final_order, "memberDiagrams")["deflectionMm"] == _collection_first(data, "memberDiagrams")["deflectionMm"]


@pytest.mark.parametrize(
    ("start_support", "end_condensed_dofs", "effective_length_factor"),
    [
        ("pinned", ["ux"], 1.0),
        ("fixed", ["ux"], 0.699),
        ("fixed", ["ux", "rz"], 0.5),
    ],
)
def test_frame_buckling_returns_euler_critical_load_factor_for_standard_end_conditions(
    client,
    start_support: str,
    end_condensed_dofs: list[str],
    effective_length_factor: float,
):
    payload = _column_payload(
        start_support=start_support,
        end_support="free",
        end_condensed_dofs=end_condensed_dofs,
        axial_load_kn=1.0,
        lateral_load_kn=0.0,
        analysis_options={"buckling": True, "bucklingOptions": {"modeCount": 1}},
    )

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    buckling = _buckling_snapshot(data)
    expected = _expected_euler_critical_load_kn(210.0, 1500.0, 4.0, effective_length_factor)

    assert buckling["enabled"] is True
    assert buckling["status"] == "converged"
    assert buckling["criticalLoadFactor"] == pytest.approx(expected, rel=0.002)


def test_frame_buckling_mode_is_normalized_and_reports_residuals(client):
    payload = _column_payload(
        start_support="fixed",
        end_support="free",
        end_condensed_dofs=["ux"],
        axial_load_kn=1.0,
        lateral_load_kn=0.0,
        analysis_options={"buckling": True, "bucklingOptions": {"modeCount": 2}},
    )

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    buckling = _buckling_snapshot(response.get_json())
    mode = _buckling_modes(buckling)[0]
    shapes = _member_mode_shapes(mode)
    nodes = _node_displacements(mode)

    residual = mode.get("normalizedResidual", mode.get("residualNorm", mode.get("residual")))
    constraint_residual = mode.get("constraintResidual", mode.get("constraintResidualNorm"))
    max_translation = max(_member_shape_translation_abs_max(shape) for shape in shapes)

    assert residual is not None
    assert float(residual) <= 1e-8
    assert constraint_residual is not None
    assert float(constraint_residual) <= 1e-10
    assert max_translation == pytest.approx(1.0, abs=1e-8)
    assert {node["nodeId"] for node in nodes} <= {"N1", "N2"}
    assert buckling.get("meshDiagnostics", {}).get("memberSubdivisions")


def test_frame_buckling_reports_no_compression_without_prestress(client):
    payload = _cantilever_payload(
        axial_load_kn=0.0,
        lateral_load_kn=12.0,
        analysis_options={"buckling": True, "bucklingOptions": {"modeCount": 2}},
    )

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    buckling = _buckling_snapshot(response.get_json())
    assert buckling["enabled"] is True
    assert buckling["status"] == "no_compression"
    assert buckling["criticalLoadFactor"] is None
    assert buckling["modes"] == []


def test_frame_buckling_end_releases_use_the_eigen_system(client):
    payload = _frame_payload(
        nodes=[
            {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
            {"id": "N2", "x": 0.0, "y": 4.0, "supportType": "free", "condensedDofs": ["ux", "rz"]},
        ],
        members=[
            {
                "id": "C1",
                "start": "N1",
                "end": "N2",
                "E_GPa": 210.0,
                "A_cm2": 220.0,
                "I_cm4": 1500.0,
                "kind": "column",
                "endReleases": {"start": ["rz"], "end": ["rz"]},
            }
        ],
        loads=[{"type": "nodal", "node": "N2", "fxKn": 0.0, "fyKn": -1.0, "mzKnM": 0.0}],
        analysis_options={"buckling": True, "bucklingOptions": {"modeCount": 1}},
    )

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    buckling = _buckling_snapshot(response.get_json())
    expected = _expected_euler_critical_load_kn(210.0, 1500.0, 4.0, 1.0)
    assert buckling["status"] == "converged"
    assert buckling["criticalLoadFactor"] == pytest.approx(expected, rel=0.002)
    assert buckling.get("meshDiagnostics", {}).get("memberSubdivisions")
    mode = _buckling_modes(buckling)[0]
    assert float(mode["normalizedResidual"]) <= 1e-8


def test_frame_stability_reports_explicit_failure_when_iterations_are_exhausted(client):
    pcr_kn = _expected_euler_critical_load_kn(210.0, 120.0, 6.0, 2.0)
    payload = _frame_payload(
        nodes=[
            {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
            {"id": "N2", "x": 0.0, "y": 6.0, "supportType": "free"},
        ],
        members=[
            {"id": "C1", "start": "N1", "end": "N2", "E_GPa": 210.0, "A_cm2": 220.0, "I_cm4": 120.0, "kind": "column"},
        ],
        loads=[
            {"type": "nodal", "node": "N2", "fxKn": 4.0, "fyKn": -(0.98 * pcr_kn), "mzKnM": 0.0},
        ],
        analysis_options={"pDelta": True, "pDeltaOptions": {"loadSteps": 1, "maxIterations": 1, "tolerance": 1e-14}},
    )

    response = client.post("/api/calculate", json=payload)

    if response.status_code == 200:
        second_order = _second_order_snapshot(response.get_json())
        failure_text = (
            second_order.get("failureReason")
            or second_order.get("message")
            or second_order.get("error")
            or second_order.get("statusMessage")
        )

        assert second_order["enabled"] is True
        assert second_order["status"] in {"failed", "not_converged"}
        assert failure_text
    else:
        assert response.status_code in {400, 422, 500}
        body = response.get_json()
        error = body.get("error") if isinstance(body, Mapping) else None
        message = ""
        if isinstance(error, Mapping):
            message = str(error.get("message") or "")
        if not message and isinstance(body, Mapping):
            message = str(body.get("message") or body.get("detail") or "")
        assert message
        assert any(keyword in message for keyword in ("收敛", "屈曲", "稳定", "临界", "失败"))


def test_frame_load_cases_and_combinations_solve_stability_independently(client):
    payload = _frame_payload(
        nodes=[
            {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
            {"id": "N2", "x": 0.0, "y": 5.0, "supportType": "free"},
        ],
        members=[
            {"id": "C1", "start": "N1", "end": "N2", "E_GPa": 210.0, "A_cm2": 220.0, "I_cm4": 1200.0, "kind": "column"},
        ],
        loads=[],
        load_cases=[
            {
                "id": "DL",
                "title": "恒载",
                "loads": [{"type": "nodal", "node": "N2", "fxKn": 0.0, "fyKn": -40.0, "mzKnM": 0.0}],
            },
            {
                "id": "WL",
                "title": "风载",
                "loads": [{"type": "nodal", "node": "N2", "fxKn": 8.0, "fyKn": 0.0, "mzKnM": 0.0}],
            },
        ],
        load_combinations=[
            {"id": "ULS1", "title": "基本组合", "factors": {"DL": 1.2, "WL": 1.5}},
        ],
        analysis_options={"pDelta": True, "buckling": True, "pDeltaOptions": {"loadSteps": 8, "maxIterations": 20, "tolerance": 1e-8}},
    )

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    case_results = {item["id"]: item for item in data["loadCaseResults"]}
    combination = data["loadCombinationResults"][0]

    assert set(case_results) == {"DL", "WL"}
    assert case_results["DL"]["secondOrder"]["enabled"] is True
    assert case_results["WL"]["secondOrder"]["enabled"] is True
    assert combination["secondOrder"]["enabled"] is True
    assert case_results["DL"]["buckling"]["enabled"] is True
    assert case_results["WL"]["buckling"]["enabled"] is True
    assert combination["buckling"]["enabled"] is True
    assert case_results["DL"]["secondOrder"]["referenceSource"]["id"] == "DL"
    assert case_results["DL"]["buckling"]["referenceSource"]["id"] == "DL"
    assert combination["secondOrder"]["referenceSource"]["id"] == "ULS1"
    assert combination["buckling"]["referenceSource"]["id"] == "ULS1"
    assert data["secondOrder"]["referenceSource"]["id"] == "ULS1"

    dl_second = _second_order_snapshot(case_results["DL"])
    combo_second = _second_order_snapshot(combination)
    dl_final = _final_second_order(dl_second)
    combo_final = _final_second_order(combo_second)

    assert _summary(combo_final)["maxDisplacementMm"] != pytest.approx(_summary(dl_final)["maxDisplacementMm"], rel=1e-3)
    assert data["summary"]["maxDisplacementMm"] == pytest.approx(_summary(combo_final)["maxDisplacementMm"], rel=1e-8)
    dl_buckling = case_results["DL"]["buckling"].get("criticalLoadFactor")
    combo_buckling = combination["buckling"].get("criticalLoadFactor")
    assert dl_buckling is not None
    assert combo_buckling is not None
    assert combo_buckling != pytest.approx(dl_buckling, rel=1e-3)
