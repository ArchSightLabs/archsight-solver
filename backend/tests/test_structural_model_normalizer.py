import pytest

from backend.normalizers.frame.request_normalizer import normalize_frame_request
from backend.normalizers.structural_model import (
    FRAME_SUPPORT_LABELS,
    build_structural_model,
    support_constraint_dofs,
)
from backend.normalizers.truss.request_normalizer import normalize_truss_request


def test_shared_structural_model_preserves_frame_contract_shape():
    model = build_structural_model(
        analysis_type="frame",
        template="explicit",
        raw_nodes=[
            {"id": "N1", "x": 0, "y": 0, "supportType": "fixed"},
            {"id": "N2", "x": 4, "y": 0, "supportType": "roller"},
        ],
        raw_members=[
            {"id": "B1", "start": "N1", "end": "N2", "E_GPa": 210, "A_cm2": 120, "I_cm4": 8000},
        ],
        raw_loads=[
            {"type": "distributed", "member": "B1", "wyKnPerM": -12},
            {"type": "nodal", "node": "N2", "fxKn": 3, "fyKn": -4, "mzKnM": 5},
        ],
        labels=FRAME_SUPPORT_LABELS,
        include_bending=True,
        allow_distributed=True,
        min_nodes_error="框架至少需要 2 个节点",
        min_members_error="框架至少需要 1 个构件",
    )

    assert model.supports[0].constraints == ["ux", "uy", "rz"]
    assert model.supports[1].constraints == ["uy"]
    assert model.to_structure_contract(include_bending=True) == {
        "template": "explicit",
        "nodes": [
            {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
            {"id": "N2", "x": 4.0, "y": 0.0, "supportType": "roller"},
        ],
        "members": [
            {
                "id": "B1",
                "start": "N1",
                "end": "N2",
                "elementType": "frame",
                "E_GPa": 210.0,
                "A_cm2": 120.0,
                "I_cm4": 8000.0,
                "kind": "generic",
            },
        ],
        "loads": [
            {"type": "distributed", "member": "B1", "direction": "local_y", "qStartKnPerM": -12.0, "qEndKnPerM": -12.0, "startRatio": 0.0, "endRatio": 1.0},
            {"type": "nodal", "node": "N2", "fxKn": 3.0, "fyKn": -4.0, "mzKnM": 5.0},
        ],
    }


def test_shared_structural_model_preserves_springs_releases_and_load_direction():
    model = build_structural_model(
        analysis_type="frame",
        template="explicit",
        raw_nodes=[
            {"id": "N1", "x": 0, "y": 0, "supportType": "fixed"},
            {"id": "N2", "x": 4, "y": 0, "supportType": "free", "springs": [{"dof": "uy", "stiffnessKnPerM": 12000}]},
        ],
        raw_members=[
            {
                "id": "B1",
                "start": "N1",
                "end": "N2",
                "E_GPa": 210,
                "A_cm2": 120,
                "I_cm4": 8000,
                "endReleases": {"start": [], "end": ["rz"]},
            },
        ],
        raw_loads=[
            {"type": "distributed", "member": "B1", "direction": "global_y", "qStartKnPerM": -8, "qEndKnPerM": -12},
            {"type": "member_point", "member": "B1", "direction": "local_y", "forceKn": -10, "positionRatio": 0.5},
        ],
        labels=FRAME_SUPPORT_LABELS,
        include_bending=True,
        allow_distributed=True,
        min_nodes_error="框架至少需要 2 个节点",
        min_members_error="框架至少需要 1 个构件",
    )

    structure = model.to_structure_contract(include_bending=True)
    assert structure["nodes"][1]["springs"] == [{"dof": "uy", "stiffnessKnPerM": 12000.0}]
    assert structure["members"][0]["elementType"] == "frame"
    assert structure["members"][0]["endReleases"] == {"end": ["rz"]}
    assert structure["loads"] == [
        {"type": "distributed", "member": "B1", "direction": "global_y", "qStartKnPerM": -8.0, "qEndKnPerM": -12.0, "startRatio": 0.0, "endRatio": 1.0},
        {"type": "member_point", "member": "B1", "direction": "local_y", "forceKn": -10.0, "positionRatio": 0.5},
    ]


def test_frame_member_point_load_is_mapped_to_split_member_segment():
    request = normalize_frame_request(
        {
            "analysisType": "frame",
            "structure": {
                "template": "explicit",
                "nodes": [
                    {"id": "N1", "x": 0, "y": 0, "supportType": "fixed"},
                    {"id": "N2", "x": 4, "y": 0, "supportType": "roller"},
                ],
                "members": [
                    {"id": "B1", "start": "N1", "end": "N2", "E_GPa": 210, "A_cm2": 120, "I_cm4": 8000, "internalHinges": [{"ratio": 0.5}]},
                ],
                "loads": [
                    {"type": "member_point", "member": "B1", "direction": "local_y", "forceKn": -6, "positionRatio": 0.75},
                ],
            },
        }
    )

    assert request["structure"]["loads"] == [
        {"type": "member_point", "member": "B1_2", "direction": "local_y", "forceKn": -6.0, "positionRatio": 0.5},
    ]


def test_frame_partial_distributed_load_is_mapped_to_split_member_segments():
    request = normalize_frame_request(
        {
            "analysisType": "frame",
            "structure": {
                "template": "explicit",
                "nodes": [
                    {"id": "N1", "x": 0, "y": 0, "supportType": "fixed"},
                    {"id": "N2", "x": 4, "y": 0, "supportType": "roller"},
                ],
                "members": [
                    {"id": "B1", "start": "N1", "end": "N2", "E_GPa": 210, "A_cm2": 120, "I_cm4": 8000, "internalHinges": [{"ratio": 0.5}]},
                ],
                "loads": [
                    {"type": "distributed", "member": "B1", "direction": "local_y", "qStartKnPerM": -6, "qEndKnPerM": -10, "startRatio": 0.25, "endRatio": 0.75},
                ],
            },
        }
    )

    assert request["structure"]["loads"] == [
        {"type": "distributed", "member": "B1_1", "direction": "local_y", "qStartKnPerM": -6.0, "qEndKnPerM": -8.0, "startRatio": 0.5, "endRatio": 1.0},
        {"type": "distributed", "member": "B1_2", "direction": "local_y", "qStartKnPerM": -8.0, "qEndKnPerM": -10.0, "startRatio": 0.0, "endRatio": 0.5},
    ]


def test_frame_explicit_model_rejects_configured_member_limit(monkeypatch):
    monkeypatch.setenv("ARCHSIGHT_MAX_FRAME_MEMBERS", "1")

    with pytest.raises(ValueError, match="框架构件数量超出系统限制"):
        normalize_frame_request(
            {
                "analysisType": "frame",
                "structure": {
                    "template": "explicit",
                    "nodes": [
                        {"id": "N1", "x": 0, "y": 0, "supportType": "fixed"},
                        {"id": "N2", "x": 4, "y": 0, "supportType": "roller"},
                        {"id": "N3", "x": 8, "y": 0, "supportType": "free"},
                    ],
                    "members": [
                        {"id": "B1", "start": "N1", "end": "N2", "E_GPa": 210, "A_cm2": 120, "I_cm4": 8000},
                        {"id": "B2", "start": "N2", "end": "N3", "E_GPa": 210, "A_cm2": 120, "I_cm4": 8000},
                    ],
                    "loads": [],
                },
            }
        )


def test_truss_explicit_model_rejects_configured_node_limit(monkeypatch):
    monkeypatch.setenv("ARCHSIGHT_MAX_TRUSS_NODES", "2")

    with pytest.raises(ValueError, match="桁架节点数量超出系统限制"):
        normalize_truss_request(
            {
                "analysisType": "truss",
                "structure": {
                    "template": "explicit",
                    "nodes": [
                        {"id": "N1", "x": 0, "y": 0, "supportType": "pinned"},
                        {"id": "N2", "x": 4, "y": 0, "supportType": "roller"},
                        {"id": "N3", "x": 2, "y": 2, "supportType": "free"},
                    ],
                    "members": [
                        {"id": "M1", "start": "N1", "end": "N3", "E_GPa": 210, "A_cm2": 24},
                        {"id": "M2", "start": "N2", "end": "N3", "E_GPa": 210, "A_cm2": 24},
                    ],
                    "loads": [],
                },
            }
        )


def test_shared_structural_model_preserves_load_combination_tags():
    model = build_structural_model(
        analysis_type="frame",
        template="explicit",
        raw_nodes=[
            {"id": "N1", "x": 0, "y": 0, "supportType": "fixed"},
            {"id": "N2", "x": 4, "y": 0, "supportType": "free"},
        ],
        raw_members=[
            {"id": "B1", "start": "N1", "end": "N2", "E_GPa": 210, "A_cm2": 120, "I_cm4": 8000},
        ],
        raw_loads=[],
        raw_load_cases=[
            {"id": "DL", "title": "恒载", "loads": [{"type": "distributed", "member": "B1", "wyKnPerM": -8}]},
        ],
        raw_load_combinations=[
            {"id": "SLS1", "title": "正常使用组合", "factors": {"DL": 1.0}, "tags": ["SLS", "包络", "SLS", ""]},
        ],
        labels=FRAME_SUPPORT_LABELS,
        include_bending=True,
        allow_distributed=True,
        min_nodes_error="框架至少需要 2 个节点",
        min_members_error="框架至少需要 1 个构件",
    )

    structure = model.to_structure_contract(include_bending=True)
    assert structure["loadCombinations"][0]["tags"] == ["SLS", "包络"]


@pytest.mark.parametrize(
    ("payload_patch", "expected_error"),
    [
        (
            {"nodes": [{"id": "N1", "x": 0, "y": 0, "supportType": "fixed", "springs": [{"dof": "uz", "stiffnessKnPerM": 1}]}]},
            "弹性支座自由度必须为 ux、uy 或 rz",
        ),
        (
            {"members": [{"id": "M1", "start": "N1", "end": "N2", "endReleases": {"start": ["uy"]}}]},
            "框架构件端部释放首版仅支持 rz",
        ),
        (
            {"loads": [{"type": "distributed", "member": "M1", "direction": "wind", "wyKnPerM": -1}]},
            "构件分布荷载方向必须为 local_y 或 global_y",
        ),
        (
            {"loads": [{"type": "distributed", "member": "M1", "direction": "local_y", "wyKnPerM": -1, "startRatio": 0.8, "endRatio": 0.2}]},
            "构件分布荷载作用范围比例必须满足",
        ),
    ],
)
def test_shared_structural_model_validates_extended_frame_contract(payload_patch, expected_error):
    payload = {
        "analysisType": "frame",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0, "y": 0, "supportType": "fixed"},
                {"id": "N2", "x": 1, "y": 0, "supportType": "free"},
            ],
            "members": [{"id": "M1", "start": "N1", "end": "N2"}],
            "loads": [],
        },
    }
    payload["structure"].update(payload_patch)

    with pytest.raises(ValueError, match=expected_error):
        normalize_frame_request(payload)


def test_frame_and_truss_normalizers_share_id_and_load_validation_errors():
    frame_payload = {
        "analysisType": "frame",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0, "y": 0, "supportType": "fixed"},
                {"id": "N1", "x": 1, "y": 0, "supportType": "free"},
            ],
            "members": [{"id": "M1", "start": "N1", "end": "N2"}],
            "loads": [],
        },
    }
    with pytest.raises(ValueError, match="节点 ID 重复: N1"):
        normalize_frame_request(frame_payload)

    truss_payload = {
        "analysisType": "truss",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0, "y": 0, "supportType": "pinned"},
                {"id": "N2", "x": 1, "y": 0, "supportType": "roller"},
            ],
            "members": [{"id": "M1", "start": "N1", "end": "N2"}],
            "loads": [{"type": "thermal", "member": "M1", "wyKnPerM": -1}],
        },
    }
    with pytest.raises(ValueError, match="桁架当前仅支持节点荷载或可等效为节点荷载的构件荷载"):
        normalize_truss_request(truss_payload)


def test_support_constraint_dofs_are_analysis_type_specific():
    assert support_constraint_dofs("frame", "fixed") == ["ux", "uy", "rz"]
    assert support_constraint_dofs("frame", "roller") == ["uy"]
    assert support_constraint_dofs("truss", "pinned") == ["ux", "uy"]
    assert support_constraint_dofs("truss", "free") == []


def test_truss_member_self_weight_is_preprocessed_to_equivalent_nodal_loads():
    payload = {
        "analysisType": "truss",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0, "y": 0, "supportType": "pinned"},
                {"id": "N2", "x": 4, "y": 0, "supportType": "roller"},
            ],
            "members": [{"id": "M1", "start": "N1", "end": "N2", "elementType": "truss"}],
            "loads": [{"type": "distributed", "member": "M1", "selfWeightKnPerM": 2.0}],
        },
    }

    request = normalize_truss_request(payload)

    assert request["structure"]["members"][0]["elementType"] == "truss"
    assert request["structure"]["loads"] == [
        {"type": "nodal", "node": "N1", "fxKn": 0.0, "fyKn": -4.0},
        {"type": "nodal", "node": "N2", "fxKn": 0.0, "fyKn": -4.0},
    ]


def test_element_type_must_match_analysis_type():
    payload = {
        "analysisType": "frame",
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0, "y": 0, "supportType": "fixed"},
                {"id": "N2", "x": 1, "y": 0, "supportType": "free"},
            ],
            "members": [{"id": "M1", "start": "N1", "end": "N2", "elementType": "truss"}],
            "loads": [],
        },
    }

    with pytest.raises(ValueError, match="构件 M1 的 elementType 必须为 frame"):
        normalize_frame_request(payload)
