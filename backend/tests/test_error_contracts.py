import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from backend.contracts.diagnostics import error_payload, legacy_diagnostic_issues_for_message


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def assert_error_response(response, expected_error, expected_code=None):
    data = response.get_json()
    assert data["success"] is False
    assert data["version"] == "v1"
    assert data["operation"]
    assert data["error"]["message"] == expected_error
    assert data["legacyError"] == expected_error
    if expected_code is not None:
        assert data["error"]["code"] == expected_code
    assert isinstance(data["diagnostics"]["issues"], list)
    assert data["diagnostics"]["issues"]
    for issue in data["diagnostics"]["issues"]:
        assert issue["code"].strip()
        assert issue["severity"] in {"error", "warning", "info"}
        assert issue["category"] in {"input", "reference", "constraint", "solver", "result", "system"}
        assert issue["title"].strip()
        assert issue["detail"].strip()
        assert isinstance(issue["suggestions"], list)
        assert issue["suggestions"]
        assert isinstance(issue["objectRefs"], list)
        assert isinstance(issue["actions"], list)
        assert issue["actions"]


def issue_codes(response):
    return {issue["code"] for issue in response.get_json()["diagnostics"]["issues"]}


def issue_for_code(response, code):
    return next(issue for issue in response.get_json()["diagnostics"]["issues"] if issue["code"] == code)


def test_legacy_value_error_string_mapper_remains_a_compatibility_fallback():
    payload = error_payload(ValueError("节点 ID 重复: LEGACY-N1"), operation="calculate", data={"analysisType": "frame"})

    assert payload["error"]["code"] == "FRAME_INVALID_REQUEST"
    issue = payload["diagnostics"]["issues"][0]
    assert issue["code"] == "STRUCTURE_DUPLICATE_ID"
    assert {"kind": "node", "id": "LEGACY-N1"} in issue["objectRefs"]


def test_legacy_string_mapper_is_exposed_as_an_explicit_compatibility_adapter():
    issues = legacy_diagnostic_issues_for_message("节点 ID 重复: LEGACY-N2", "frame")

    assert issues[0]["code"] == "STRUCTURE_DUPLICATE_ID"
    assert {"kind": "node", "id": "LEGACY-N2"} in issues[0]["objectRefs"]


def _beam_base_payload():
    return {
        "analysisType": "beam",
        "projectName": "Contract Hardening Beam",
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


def _frame_base_payload():
    return {
        "analysisType": "frame",
        "projectName": "Contract Hardening Frame",
        "materialId": "q345",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
                {"id": "N2", "x": 4.0, "y": 0.0, "supportType": "fixed"},
                {"id": "N3", "x": 0.0, "y": 4.0, "supportType": "free"},
                {"id": "N4", "x": 4.0, "y": 4.0, "supportType": "free"},
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
    }


@pytest.mark.parametrize(
    ("payload_factory", "expected_error"),
    [
        (lambda: {**_beam_base_payload(), "spans": []}, "跨度必须大于 0"),
        (lambda: {**_beam_base_payload(), "spans": [5.0] * 301}, "跨度数量超出系统限制 (最大 300 跨)"),
        (lambda: {**_beam_base_payload(), "duration": 121}, "模拟时长超出系统限制 (最大 120s)"),
        (
            lambda: {
                **_beam_base_payload(),
                "spanProperties": [
                    {"E": 0.0, "I": 0.0},
                    {"E": 0.0, "I": 0.0},
                ],
                "E": 0.0,
                "I": 0.0,
            },
            "梁模型刚度矩阵奇异，请检查支座与跨度设置",
        ),
        (lambda: {**_beam_base_payload(), "loadType": "point", "pointLoadPositionM": 12.0}, "梁集中荷载位置必须位于梁长范围内"),
        (
            lambda: {
                **_beam_base_payload(),
                "loadCases": [
                    {"id": "LC1", "loads": [{"type": "linear", "startM": -1.0, "endM": 4.0, "qStartKnPerM": 1.0, "qEndKnPerM": 2.0}]}
                ],
            },
            "梁分布荷载作用范围必须位于梁长范围内",
        ),
    ],
)
def test_beam_error_contracts(client, payload_factory, expected_error):
    response = client.post("/api/calculate", json=payload_factory())

    assert response.status_code == 400
    expected_code = "STRUCTURE_SINGULAR_STIFFNESS" if "刚度矩阵奇异" in expected_error else "BEAM_INVALID_REQUEST"
    assert_error_response(response, expected_error, expected_code)


def test_beam_singular_error_returns_engineering_diagnostic(client):
    payload = {
        **_beam_base_payload(),
        "spanProperties": [
            {"E": 0.0, "I": 0.0},
            {"E": 0.0, "I": 0.0},
        ],
        "E": 0.0,
        "I": 0.0,
    }

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 400
    codes = issue_codes(response)
    assert "STRUCTURE_SINGULAR_STIFFNESS" in codes
    assert any("单位" in suggestion for issue in response.get_json()["diagnostics"]["issues"] for suggestion in issue["suggestions"])


def test_persistence_mode_error_contract(client, monkeypatch):
    monkeypatch.setenv("BEAM_SOLVER_PERSISTENCE_MODE", "sqlite")

    response = client.post("/api/calculate", json=_beam_base_payload())

    assert response.status_code == 400
    data = response.get_json()
    assert "当前版本仅支持无状态计算 API" in data["error"]["message"]
    assert "sqlite" in data["error"]["message"]


@pytest.mark.parametrize(
    ("payload_factory", "expected_error"),
    [
        (
            lambda: {
                **_frame_base_payload(),
                "structure": {
                    **_frame_base_payload()["structure"],
                    "nodes": [
                        {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
                        {"id": "N1", "x": 4.0, "y": 0.0, "supportType": "fixed"},
                    ],
                    "members": [
                        {"id": "B1", "start": "N1", "end": "N1", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
                    ],
                    "loads": [],
                },
            },
            "节点 ID 重复: N1",
        ),
        (
            lambda: {
                **_frame_base_payload(),
                "structure": {
                    **_frame_base_payload()["structure"],
                    "members": [
                        {"id": "B1", "start": "N1", "end": "N3", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
                        {"id": "B1", "start": "N3", "end": "N4", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
                    ],
                    "loads": [],
                },
            },
            "构件 ID 重复: B1",
        ),
        (
            lambda: {
                **_frame_base_payload(),
                "structure": {
                    **_frame_base_payload()["structure"],
                    "members": [
                        {"id": "B1", "start": "N3", "end": "NX", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
                    ],
                    "loads": [],
                },
            },
            "构件 B1 的起止节点无效",
        ),
        (
            lambda: {
                **_frame_base_payload(),
                "structure": {
                    **_frame_base_payload()["structure"],
                    "loads": [
                        {"type": "nodal", "node": "NX", "fxKn": 1.0, "fyKn": 0.0, "mzKnM": 0.0},
                    ],
                },
            },
            "节点荷载引用了不存在的节点",
        ),
        (
            lambda: {
                **_frame_base_payload(),
                "structure": {
                    **_frame_base_payload()["structure"],
                    "loads": [
                        {"type": "distributed", "member": "MX", "wyKnPerM": -18.0},
                    ],
                },
            },
            "构件荷载引用了不存在的构件",
        ),
        (
            lambda: {
                **_frame_base_payload(),
                "structure": {
                    "template": "explicit",
                    "nodes": [
                        {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "free"},
                        {"id": "N2", "x": 4.0, "y": 0.0, "supportType": "free"},
                    ],
                    "members": [
                        {"id": "B1", "start": "N1", "end": "N2", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
                    ],
                    "loads": [],
                },
            },
            "框架约束条件不足，系统无稳定自由度可求解",
        ),
        (
            lambda: {
                **_frame_base_payload(),
                "structure": {
                    **_frame_base_payload()["structure"],
                    "members": [
                        {"id": "B1", "start": "N3", "end": "N4", "E_GPa": 210, "A_cm2": 0, "I_cm4": 15000, "kind": "beam"},
                    ],
                    "loads": [],
                },
            },
            "构件 B1 的截面面积必须大于 0",
        ),
        (
            lambda: {
                **_frame_base_payload(),
                "structure": {
                    **_frame_base_payload()["structure"],
                    "members": [
                        {"id": "B1", "start": "N3", "end": "N4", "E_GPa": 210, "A_cm2": 220, "I_cm4": -1, "kind": "beam"},
                    ],
                    "loads": [],
                },
            },
            "构件 B1 的截面惯性矩必须大于 0",
        ),
        (
            lambda: {
                **_frame_base_payload(),
                "structure": {
                    **_frame_base_payload()["structure"],
                    "loads": [{"type": "thermal", "member": "B1"}],
                },
            },
            "荷载类型必须为 nodal、distributed、member_point 或 temperature",
        ),
    ],
)
def test_frame_error_contracts(client, payload_factory, expected_error):
    response = client.post("/api/calculate", json=payload_factory())

    assert response.status_code == 400
    expected_code = "FRAME_INVALID_REQUEST"
    if "ID 重复" in expected_error:
        expected_code = "STRUCTURE_DUPLICATE_ID"
    elif "引用了不存在" in expected_error or "起止节点无效" in expected_error:
        expected_code = "STRUCTURE_INVALID_REFERENCE"
    elif "约束条件不足" in expected_error:
        expected_code = "STRUCTURE_UNSTABLE_CONSTRAINTS"
    elif "截面面积必须大于 0" in expected_error or "截面惯性矩必须大于 0" in expected_error:
        expected_code = "STRUCTURE_INVALID_STIFFNESS_INPUT"
    assert_error_response(response, expected_error, expected_code)


def test_frame_invalid_reference_error_returns_engineering_diagnostic(client):
    payload = {
        **_frame_base_payload(),
        "structure": {
            **_frame_base_payload()["structure"],
            "loads": [
                {"type": "distributed", "member": "MX", "wyKnPerM": -18.0},
            ],
        },
    }

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 400
    assert "STRUCTURE_INVALID_REFERENCE" in issue_codes(response)


def test_frame_duplicate_node_diagnostic_locates_the_object_and_action(client):
    payload = {
        **_frame_base_payload(),
        "structure": {
            **_frame_base_payload()["structure"],
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
                {"id": "N1", "x": 4.0, "y": 0.0, "supportType": "fixed"},
            ],
            "members": [
                {"id": "B1", "start": "N1", "end": "N1", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
            ],
            "loads": [],
        },
    }

    response = client.post("/api/calculate", json=payload)

    issue = issue_for_code(response, "STRUCTURE_DUPLICATE_ID")
    assert issue["analysisType"] == "frame"
    assert issue["category"] == "reference"
    assert {"kind": "node", "id": "N1"} in issue["objectRefs"]
    assert issue["actions"][0]["id"] == "review_structure_ids"


def test_frame_unstable_error_returns_constraint_diagnostic(client):
    payload = {
        **_frame_base_payload(),
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "free"},
                {"id": "N2", "x": 4.0, "y": 0.0, "supportType": "free"},
            ],
            "members": [
                {"id": "B1", "start": "N1", "end": "N2", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
            ],
            "loads": [],
        },
    }

    response = client.post("/api/calculate", json=payload)

    assert response.status_code == 400
    assert "STRUCTURE_UNSTABLE_CONSTRAINTS" in issue_codes(response)


def test_unknown_analysis_type_returns_structured_error(client):
    response = client.post("/api/calculate", json={**_beam_base_payload(), "analysisType": "plate"})

    assert response.status_code == 400
    assert_error_response(response, "不支持的分析对象: plate", "COMMON_UNSUPPORTED_ANALYSIS_TYPE")
