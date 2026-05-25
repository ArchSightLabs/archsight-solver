import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def _cantilever_payload(*, spring_stiffness=None, direction="local_y"):
    nodes = [
        {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
        {"id": "N2", "x": 4.0, "y": 0.0, "supportType": "free"},
    ]
    if spring_stiffness is not None:
        nodes[1]["springs"] = [{"dof": "uy", "stiffnessKnPerM": spring_stiffness}]
    return {
        "analysisType": "frame",
        "projectName": "扩展框架契约回归",
        "materialId": "q345",
        "structure": {
            "template": "explicit",
            "nodes": nodes,
            "members": [
                {"id": "B1", "start": "N1", "end": "N2", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
            ],
            "loads": [
                {"type": "distributed", "member": "B1", "direction": direction, "qStartKnPerM": -8.0, "qEndKnPerM": -12.0},
                {"type": "nodal", "node": "N2", "fxKn": 0.0, "fyKn": -8.0, "mzKnM": 0.0},
            ],
        },
    }


def _portal_payload_with_release():
    return {
        "analysisType": "frame",
        "projectName": "梁端释放回归",
        "materialId": "q345",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
                {"id": "N2", "x": 4.0, "y": 0.0, "supportType": "fixed"},
                {"id": "N3", "x": 0.0, "y": 3.0, "supportType": "free"},
                {"id": "N4", "x": 4.0, "y": 3.0, "supportType": "free"},
            ],
            "members": [
                {"id": "C1", "start": "N1", "end": "N3", "E_GPa": 210, "A_cm2": 240, "I_cm4": 12000, "kind": "column"},
                {
                    "id": "B1",
                    "start": "N3",
                    "end": "N4",
                    "E_GPa": 210,
                    "A_cm2": 220,
                    "I_cm4": 15000,
                    "kind": "beam",
                    "endReleases": {"start": ["rz"], "end": []},
                },
                {"id": "C2", "start": "N2", "end": "N4", "E_GPa": 210, "A_cm2": 240, "I_cm4": 12000, "kind": "column"},
            ],
            "loads": [
                {"type": "distributed", "member": "B1", "direction": "local_y", "qStartKnPerM": -10.0, "qEndKnPerM": -10.0},
            ],
        },
    }


def _portal_payload_with_rotational_springs(stiffness_knm_per_rad):
    payload = _portal_payload_with_release()
    for node in payload["structure"]["nodes"][:2]:
        node["supportType"] = "pinned"
        node["springs"] = [{"dof": "rz", "stiffnessKnMPerRad": stiffness_knm_per_rad}]
    payload["structure"]["members"][1].pop("endReleases", None)
    payload["structure"]["loads"].append({"type": "nodal", "node": "N4", "fxKn": 18.0, "fyKn": 0.0, "mzKnM": 0.0})
    return payload


def test_frame_response_returns_member_diagrams_as_first_class_results(client):
    response = client.post("/api/calculate", json=_cantilever_payload())

    assert response.status_code == 200
    data = response.get_json()
    diagram = data["memberDiagrams"][0]
    result = data["memberResults"][0]

    assert data["results"]["memberDiagrams"] == data["memberDiagrams"]
    assert data["diagram"]["memberDiagrams"] == data["memberDiagrams"]
    assert diagram["memberId"] == "B1"
    assert diagram["stations"] == [0.0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1.0]
    assert len(diagram["axialKn"]) == len(diagram["shearKn"]) == len(diagram["momentKnM"]) == len(diagram["deflectionMm"]) == 9
    assert diagram["momentKnM"][0] == pytest.approx(result["momentStartKnM"], abs=1e-6)
    assert diagram["momentKnM"][-1] == pytest.approx(result["momentEndKnM"], abs=1e-6)
    assert diagram["shearKn"][0] == pytest.approx(result["shearStartKn"], abs=1e-6)
    assert diagram["shearKn"][-1] == pytest.approx(result["shearEndKn"], abs=1e-6)
    assert diagram["axialKn"][0] == pytest.approx(result["axialStartKn"], abs=1e-6)
    assert diagram["axialKn"][-1] == pytest.approx(result["axialEndKn"], abs=1e-6)
    assert result["maxAbsMomentKnM"] >= abs(result["momentStartKnM"]) - 1e-6
    assert data["summary"]["peakInternalForces"]["maxAbsMomentKnM"] >= result["maxAbsMomentKnM"]
    assert data["summary"]["equilibriumRmsRelativeError"] < 1e-9
    assert data["diagnostics"]["equilibrium"]["rmsRelativeError"] < 1e-9


def test_frame_end_release_condenses_member_end_moment(client):
    response = client.post("/api/calculate", json=_portal_payload_with_release())

    assert response.status_code == 200
    data = response.get_json()
    member_results = {item["memberId"]: item for item in data["memberResults"]}
    member_diagrams = {item["memberId"]: item for item in data["memberDiagrams"]}

    assert member_results["B1"]["momentStartKnM"] == pytest.approx(0.0, abs=1e-6)
    assert member_diagrams["B1"]["momentKnM"][0] == pytest.approx(0.0, abs=1e-6)


def test_frame_elastic_support_reduces_vertical_displacement(client):
    baseline = client.post("/api/calculate", json=_cantilever_payload()).get_json()
    with_spring = client.post("/api/calculate", json=_cantilever_payload(spring_stiffness=20000.0)).get_json()
    baseline_tip = next(item for item in baseline["nodeResults"] if item["nodeId"] == "N2")
    spring_tip = next(item for item in with_spring["nodeResults"] if item["nodeId"] == "N2")

    assert abs(spring_tip["uyMm"]) < abs(baseline_tip["uyMm"])
    assert abs(spring_tip["reactionFyKn"]) > 0.0


def test_frame_rotational_spring_portal_benchmark_trend(client):
    soft = client.post("/api/calculate", json=_portal_payload_with_rotational_springs(1000.0)).get_json()
    stiff = client.post("/api/calculate", json=_portal_payload_with_rotational_springs(50000.0)).get_json()

    soft_reactions = {item["nodeId"]: item for item in soft["nodeResults"]}
    stiff_reactions = {item["nodeId"]: item for item in stiff["nodeResults"]}

    assert stiff["summary"]["maxDisplacementMm"] < soft["summary"]["maxDisplacementMm"]
    assert abs(stiff_reactions["N1"]["reactionMzKnM"]) > abs(soft_reactions["N1"]["reactionMzKnM"])
    assert abs(stiff_reactions["N2"]["reactionMzKnM"]) > abs(soft_reactions["N2"]["reactionMzKnM"])


def test_frame_distributed_load_direction_is_explicit_for_inclined_member(client):
    payload = _cantilever_payload()
    payload["structure"]["nodes"][1] = {"id": "N2", "x": 3.0, "y": 4.0, "supportType": "free"}
    payload["structure"]["loads"] = [
        {"type": "distributed", "member": "B1", "direction": "global_y", "qStartKnPerM": -10.0, "qEndKnPerM": -10.0},
    ]

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    diagram = response.get_json()["memberDiagrams"][0]
    assert max(abs(value) for value in diagram["axialKn"]) > 1.0


def test_frame_member_point_load_acts_inside_member_and_uses_sagging_positive_moment(client):
    payload = {
        "analysisType": "frame",
        "projectName": "构件集中荷载回归",
        "materialId": "q345",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "pinned"},
                {"id": "N2", "x": 4.0, "y": 0.0, "supportType": "roller"},
            ],
            "members": [
                {"id": "B1", "start": "N1", "end": "N2", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
            ],
            "loads": [
                {"type": "member_point", "member": "B1", "direction": "local_y", "forceKn": -10.0, "positionRatio": 0.5},
            ],
        },
    }

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    node_results = {item["nodeId"]: item for item in data["nodeResults"]}
    diagram = data["memberDiagrams"][0]
    assert node_results["N1"]["reactionFyKn"] == pytest.approx(5.0, abs=1e-6)
    assert node_results["N2"]["reactionFyKn"] == pytest.approx(5.0, abs=1e-6)
    assert max(diagram["momentKnM"]) == pytest.approx(10.0, abs=1e-6)
    assert diagram["momentKnM"][diagram["stationsM"].index(2.0)] == pytest.approx(10.0, abs=1e-6)
    assert data["preview"]["loads"][0]["type"] == "member_point"


def test_frame_partial_distributed_load_uses_member_range_and_sagging_moment(client):
    payload = {
        "analysisType": "frame",
        "projectName": "局部分布荷载回归",
        "materialId": "q345",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "pinned"},
                {"id": "N2", "x": 10.0, "y": 0.0, "supportType": "roller"},
            ],
            "members": [
                {"id": "B1", "start": "N1", "end": "N2", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
            ],
            "loads": [
                {
                    "type": "distributed",
                    "member": "B1",
                    "direction": "local_y",
                    "qStartKnPerM": -10.0,
                    "qEndKnPerM": -10.0,
                    "startRatio": 0.3,
                    "endRatio": 0.7,
                },
            ],
        },
    }

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    node_results = {item["nodeId"]: item for item in data["nodeResults"]}
    diagram = data["memberDiagrams"][0]
    assert node_results["N1"]["reactionFyKn"] == pytest.approx(20.0, abs=1e-6)
    assert node_results["N2"]["reactionFyKn"] == pytest.approx(20.0, abs=1e-6)
    assert 3.0 in diagram["stationsM"]
    assert 7.0 in diagram["stationsM"]
    assert max(diagram["momentKnM"]) == pytest.approx(80.0, abs=1e-6)
    assert diagram["momentKnM"][diagram["stationsM"].index(5.0)] == pytest.approx(80.0, abs=1e-6)
    assert data["preview"]["loads"][0]["startRatio"] == pytest.approx(0.3)
    assert data["preview"]["loads"][0]["endRatio"] == pytest.approx(0.7)


def test_frame_inclined_roller_support_uses_linear_constraint(client):
    payload = _cantilever_payload()
    payload["structure"]["nodes"][1] = {"id": "N2", "x": 4.0, "y": 0.0, "supportType": "roller", "supportAngleDeg": 45.0}
    payload["structure"]["loads"] = [{"type": "nodal", "node": "N2", "fxKn": 0.0, "fyKn": -12.0, "mzKnM": 0.0}]

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    node_results = {item["nodeId"]: item for item in response.get_json()["nodeResults"]}
    assert node_results["N2"]["reactionFxKn"] == pytest.approx(node_results["N2"]["reactionFyKn"], abs=1e-6)
    assert abs(node_results["N2"]["reactionFyKn"]) > 0.0


def test_frame_load_cases_and_combinations_are_solved(client):
    payload = _portal_payload_with_release()
    payload["structure"]["loads"] = []
    payload["structure"]["loadCases"] = [
        {
            "id": "DL",
            "title": "恒载",
            "loads": [{"type": "distributed", "member": "B1", "direction": "local_y", "qStartKnPerM": -8.0, "qEndKnPerM": -8.0}],
        },
        {
            "id": "WL",
            "title": "风载",
            "loads": [{"type": "nodal", "node": "N4", "fxKn": 10.0, "fyKn": 0.0, "mzKnM": 0.0}],
        },
    ]
    payload["structure"]["loadCombinations"] = [{"id": "ULS1", "title": "基本组合", "factors": {"DL": 1.2, "WL": 1.5}, "tags": ["ULS", "包络"]}]

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    assert [item["id"] for item in data["loadCaseResults"]] == ["DL", "WL"]
    assert data["loadCombinationResults"][0]["id"] == "ULS1"
    assert data["structure"]["loadCombinations"][0]["tags"] == ["ULS", "包络"]
    assert data["loadCombinationResults"][0]["tags"] == ["ULS", "包络"]
    assert data["loadCaseResults"][0]["diagnostics"]["constraintRank"] is not None
    assert data["loadCaseResults"][0]["diagnostics"]["freeDofCount"] is not None
    assert data["loadCaseResults"][0]["diagnostics"]["equilibrium"]["rmsRelativeError"] < 1e-9
    assert data["loadCombinationResults"][0]["diagnostics"]["constraintRank"] is not None
    assert data["loadCombinationResults"][0]["diagnostics"]["freeDofCount"] is not None
    assert data["loadCombinationResults"][0]["diagnostics"]["equilibrium"]["rmsRelativeError"] < 1e-9
    assert data["results"]["loadCombinationResults"][0]["diagnostics"] == data["loadCombinationResults"][0]["diagnostics"]
    assert data["loadCombinationResults"][0]["summary"]["maxDisplacementMm"] > data["loadCaseResults"][0]["summary"]["maxDisplacementMm"]


def test_frame_load_combination_rejects_zero_factors(client):
    payload = _portal_payload_with_release()
    payload["structure"]["loads"] = []
    payload["structure"]["loadCases"] = [
        {
            "id": "DL",
            "title": "恒载",
            "loads": [{"type": "distributed", "member": "B1", "direction": "local_y", "qStartKnPerM": -8.0, "qEndKnPerM": -8.0}],
        },
    ]
    payload["structure"]["loadCombinations"] = [{"id": "ULS1", "title": "基本组合", "factors": {"DL": 0.0}}]

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 400
    assert response.get_json()["error"]["message"] == "荷载组合 factors 不能全部为 0"


def test_frame_load_combination_trims_case_ids_and_factor_keys(client):
    payload = _portal_payload_with_release()
    payload["structure"]["loads"] = []
    payload["structure"]["loadCases"] = [
        {
            "id": " DL ",
            "title": "恒载",
            "loads": [{"type": "distributed", "member": "B1", "direction": "local_y", "qStartKnPerM": -8.0, "qEndKnPerM": -8.0}],
        },
    ]
    payload["structure"]["loadCombinations"] = [{"id": " ULS1 ", "title": "基本组合", "factors": {" DL ": 1.2}}]

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    assert data["loadCaseResults"][0]["id"] == "DL"
    assert data["loadCombinationResults"][0]["id"] == "ULS1"
    assert data["loadCombinationResults"][0]["factors"] == {"DL": 1.2}


def test_frame_member_internal_hinge_splits_member_and_releases_moment(client):
    payload = _cantilever_payload()
    payload["structure"]["nodes"][1] = {"id": "N2", "x": 4.0, "y": 0.0, "supportType": "roller"}
    payload["structure"]["members"][0]["internalHinges"] = [{"ratio": 0.5}]
    payload["structure"]["loads"] = [{"type": "distributed", "member": "B1", "wyKnPerM": -10.0}]

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    assert "B1_H1" in {node["id"] for node in data["structure"]["nodes"]}
    member_results = {item["memberId"]: item for item in data["memberResults"]}
    assert member_results["B1_1"]["momentEndKnM"] == pytest.approx(0.0, abs=1e-6)
    assert member_results["B1_2"]["momentStartKnM"] == pytest.approx(0.0, abs=1e-6)


def test_frame_section_library_and_stability_summaries(client):
    payload = _portal_payload_with_release()
    payload["analysisOptions"] = {"pDelta": True, "buckling": True}
    payload["structure"]["members"][0]["sectionId"] = "rect_300x500"
    payload["structure"]["members"][0].pop("A_cm2", None)
    payload["structure"]["members"][0].pop("I_cm4", None)
    payload["structure"]["loads"].append({"type": "nodal", "node": "N3", "fxKn": 0.0, "fyKn": -120.0, "mzKnM": 0.0})

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 200
    data = response.get_json()
    member = next(item for item in data["structure"]["members"] if item["id"] == "C1")
    assert member["sectionId"] == "rect_300x500"
    assert member["A_cm2"] == pytest.approx(1500.0)
    assert data["secondOrder"]["enabled"] is True
    assert data["secondOrder"]["amplificationFactor"] >= 1.0
    assert data["buckling"]["enabled"] is True
    assert "limitations" in data["buckling"]


def test_frame_unknown_section_id_returns_stable_error(client):
    payload = _portal_payload_with_release()
    payload["structure"]["members"][0]["sectionId"] = "missing_section"

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 400
    assert response.get_json()["error"]["message"] == "未知截面库 ID: missing_section"
