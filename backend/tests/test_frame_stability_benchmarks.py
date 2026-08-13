from __future__ import annotations

import copy
import math
import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from backend.benchmarks.catalog import load_benchmark_catalog


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def _calculate(client, payload):
    response = client.post("/api/calculate", json=payload)
    assert response.status_code == 200
    return response.get_json()


def _explicit_frame_payload(
    *,
    support_start: str = "fixed",
    support_end: str = "free",
    axial_temperature_c: float | None = None,
    lateral_force_kn: float = 12.0,
    include_spring: bool = False,
    include_oblique_support: bool = False,
    include_support_displacement: bool = False,
    include_end_release: bool = False,
) -> dict:
    nodes = [
        {"id": "N1", "x": 0.0, "y": 0.0, "supportType": support_start},
        {"id": "N2", "x": 0.0, "y": 4.0, "supportType": support_end},
    ]
    if include_support_displacement:
        nodes[0]["supportDisplacements"] = [{"dof": "uy", "displacementMm": -2.5}]
    if include_spring:
        nodes[0]["springs"] = [{"dof": "rz", "stiffnessKnMPerRad": 50000.0}]
    if include_oblique_support:
        nodes[1] = {"id": "N2", "x": 0.0, "y": 4.0, "supportType": "roller", "supportAngleDeg": 45.0}

    loads = [{"type": "nodal", "node": "N2", "fxKn": lateral_force_kn, "fyKn": 0.0, "mzKnM": 0.0}]
    if axial_temperature_c is not None:
        loads.insert(
            0,
            {
                "type": "temperature",
                "member": "C1",
                "deltaTempC": axial_temperature_c,
                "alphaPerC": 1e-5,
            },
        )

    member = {"id": "C1", "start": "N1", "end": "N2", "E_GPa": 210, "A_cm2": 240, "I_cm4": 12000, "kind": "column"}
    if include_end_release:
        member["endReleases"] = {"start": ["rz"], "end": []}

    return {
        "analysisType": "frame",
        "projectName": "stability-validation",
        "materialId": "q345",
        "analysisOptions": {"pDelta": True, "buckling": True},
        "structure": {
            "template": "explicit",
            "nodes": nodes,
            "members": [member],
            "loads": loads,
        },
    }


def _temperature_column_payload(support_start: str, support_end: str, temperature_c: float = 30.0) -> dict:
    return _explicit_frame_payload(
        support_start=support_start,
        support_end=support_end,
        axial_temperature_c=temperature_c,
        lateral_force_kn=0.0,
    )


def _euler_critical_load_kn(e_gpa: float, i_cm4: float, length_m: float, effective_length_factor: float) -> float:
    elastic_modulus_pa = e_gpa * 1_000_000_000.0
    inertia_m4 = i_cm4 * 1e-8
    return math.pi**2 * elastic_modulus_pa * inertia_m4 / ((effective_length_factor * length_m) ** 2) / 1000.0


def test_frame_pdelta_returns_unity_when_axial_force_is_zero(client):
    data = _calculate(
        client,
        _explicit_frame_payload(
            support_start="fixed",
            support_end="free",
            axial_temperature_c=None,
            lateral_force_kn=12.0,
        ),
    )

    assert data["summary"]["secondOrderAmplificationFactor"] == pytest.approx(1.0, abs=1e-12)
    assert data["secondOrder"]["amplificationFactor"] == pytest.approx(1.0, abs=1e-12)
    assert data["buckling"]["status"] == "no_compression"
    assert data["buckling"]["modeCount"] == 0
    assert data["buckling"]["controllingMembers"] == []


def test_frame_second_order_amplification_matches_cantilever_euler_formula(client):
    data = _calculate(
        client,
        _explicit_frame_payload(
            support_start="fixed",
            support_end="free",
            axial_temperature_c=30.0,
            lateral_force_kn=12.0,
        ),
    )

    member = data["memberResults"][0]
    axial_kn = abs(member["axialStartKn"])
    expected = 1.0 / (
        1.0
        - axial_kn
        / _euler_critical_load_kn(
            e_gpa=210.0,
            i_cm4=12000.0,
            length_m=member["lengthM"],
            effective_length_factor=2.0,
        )
    )

    assert data["secondOrder"]["converged"] is True
    assert data["secondOrder"]["amplificationFactor"] == pytest.approx(expected, rel=1e-3)
    assert data["summary"]["secondOrderAmplificationFactor"] == pytest.approx(expected, rel=1e-3)


def test_frame_sway_frame_displaces_more_than_braced_frame_under_same_loads(client):
    catalog = load_benchmark_catalog()
    braced_case = next(case for case in catalog["cases"] if case["id"] == "frame-template-braced-frame")
    braced = copy.deepcopy(braced_case["payload"])
    sway = copy.deepcopy(braced)

    braced["analysisOptions"] = {"pDelta": True, "buckling": True}
    sway["analysisOptions"] = {"pDelta": True, "buckling": True}
    braced["structure"]["loads"].append({"type": "temperature", "member": "C1", "deltaTempC": 30.0, "alphaPerC": 1e-5})
    braced["structure"]["loads"].append({"type": "temperature", "member": "C2", "deltaTempC": 30.0, "alphaPerC": 1e-5})
    sway["structure"]["loads"].append({"type": "temperature", "member": "C1", "deltaTempC": 30.0, "alphaPerC": 1e-5})
    sway["structure"]["loads"].append({"type": "temperature", "member": "C2", "deltaTempC": 30.0, "alphaPerC": 1e-5})
    sway["structure"]["members"] = [member for member in sway["structure"]["members"] if member.get("kind") != "brace"]

    braced_result = _calculate(client, braced)
    sway_result = _calculate(client, sway)

    assert sway_result["summary"]["maxDisplacementMm"] > braced_result["summary"]["maxDisplacementMm"]
    assert sway_result["secondOrder"]["amplificationFactor"] > braced_result["secondOrder"]["amplificationFactor"]
    assert sway_result["buckling"]["modes"][0]["normalizedResidual"] < 1e-8
    assert braced_result["buckling"]["modes"][0]["normalizedResidual"] < 1e-8


def test_frame_support_compatibility_keeps_prescribed_displacement_oblique_support_end_release_and_spring(client):
    data = _calculate(
        client,
        _explicit_frame_payload(
            support_start="pinned",
            support_end="roller",
            include_support_displacement=True,
            include_spring=True,
            include_oblique_support=True,
            include_end_release=True,
            lateral_force_kn=8.0,
        ),
    )

    node_results = {item["nodeId"]: item for item in data["nodeResults"]}
    member_results = {item["memberId"]: item for item in data["memberResults"]}

    assert node_results["N1"]["uyMm"] == pytest.approx(-2.5, abs=1e-6)
    assert node_results["N2"]["reactionFxKn"] == pytest.approx(node_results["N2"]["reactionFyKn"], abs=1e-6)
    assert member_results["C1"]["momentStartKnM"] == pytest.approx(0.0, abs=1e-6)
    assert data["structure"]["nodes"][0]["springs"][0]["dof"] == "rz"
    assert data["secondOrder"]["converged"] is True
    assert data["buckling"]["converged"] is True


def test_frame_load_cases_and_combinations_use_independent_sources(client):
    payload = _explicit_frame_payload(
        support_start="fixed",
        support_end="pinned",
        axial_temperature_c=None,
        lateral_force_kn=0.0,
    )
    payload["structure"]["loads"] = []
    payload["structure"]["loadCases"] = [
        {
            "id": "T1",
            "title": "温差工况 1",
            "loads": [{"type": "temperature", "member": "C1", "deltaTempC": 30.0, "alphaPerC": 1e-5}],
        },
        {
            "id": "T2",
            "title": "温差工况 2",
            "loads": [{"type": "temperature", "member": "C1", "deltaTempC": 10.0, "alphaPerC": 1e-5}],
        },
    ]
    payload["structure"]["loadCombinations"] = [
        {"id": "COMB-1", "title": "组合 1", "factors": {"T1": 0.5, "T2": 0.0}},
        {"id": "COMB-2", "title": "组合 2", "factors": {"T1": 0.0, "T2": 1.0}},
    ]

    data = _calculate(client, payload)
    load_case_results = {item["id"]: item for item in data["loadCaseResults"]}
    load_combination_results = {item["id"]: item for item in data["loadCombinationResults"]}

    assert load_case_results["T1"]["memberResults"][0]["axialStartKn"] == pytest.approx(
        2.0 * load_combination_results["COMB-1"]["memberResults"][0]["axialStartKn"],
        rel=1e-9,
    )
    assert load_combination_results["COMB-1"]["memberResults"][0]["axialStartKn"] != load_combination_results["COMB-2"]["memberResults"][0]["axialStartKn"]
    assert load_case_results["T1"]["summary"]["secondOrderAmplificationFactor"] == pytest.approx(1.0, abs=1e-12)


@pytest.mark.parametrize(
    ("support_start", "support_end", "effective_length_factor"),
    [
        ("pinned", "pinned", 1.0),
        ("fixed", "pinned", 0.699),
        ("fixed", "fixed", 0.5),
    ],
)
def test_frame_buckling_critical_load_factor_matches_euler_effective_length_for_pp_fp_ff(
    client,
    support_start,
    support_end,
    effective_length_factor,
):
    data = _calculate(
        client,
        _temperature_column_payload(support_start=support_start, support_end=support_end),
    )

    member = data["memberResults"][0]
    axial_kn = abs(member["axialStartKn"])
    expected = _euler_critical_load_kn(
        e_gpa=210.0,
        i_cm4=12000.0,
        length_m=member["lengthM"],
        effective_length_factor=effective_length_factor,
    ) / axial_kn

    assert data["buckling"]["status"] == "converged"
    assert data["buckling"]["criticalLoadFactor"] == pytest.approx(expected, rel=1e-3)
    assert data["buckling"]["modes"][0]["normalizedResidual"] < 1e-8


def test_frame_stability_solution_is_deterministic_for_repeated_requests(client):
    payload = _explicit_frame_payload(
        support_start="fixed",
        support_end="pinned",
        axial_temperature_c=30.0,
        lateral_force_kn=12.0,
    )

    first = _calculate(client, payload)
    second = _calculate(client, copy.deepcopy(payload))

    assert first["summary"]["secondOrderAmplificationFactor"] == pytest.approx(
        second["summary"]["secondOrderAmplificationFactor"],
        abs=1e-12,
    )
    assert first["secondOrder"]["amplificationFactor"] == pytest.approx(
        second["secondOrder"]["amplificationFactor"],
        abs=1e-12,
    )
    assert first["buckling"]["criticalLoadFactor"] == pytest.approx(
        second["buckling"]["criticalLoadFactor"],
        abs=1e-12,
    )
    assert first["buckling"]["modes"][0]["normalizedResidual"] == pytest.approx(
        second["buckling"]["modes"][0]["normalizedResidual"],
        abs=1e-15,
    )
    assert first["nodeResults"] == second["nodeResults"]
    assert first["memberResults"] == second["memberResults"]
