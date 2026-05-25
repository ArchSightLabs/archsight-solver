from __future__ import annotations

from typing import Any, Dict, List

from backend.common.numbers import to_float
from backend.normalizers.structural_model import (
    FRAME_SUPPORT_LABELS,
    build_structural_model,
    parse_support_type as parse_structural_support_type,
    support_dof_indexes,
)


DEFAULT_PROJECT_NAME = "默认二维框架项目"
DEFAULT_MATERIAL_NAME = "自定义材料"

SUPPORT_LABELS = FRAME_SUPPORT_LABELS


def _first_value(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def parse_support_type(value: Any, default: str = "free") -> str:
    return parse_structural_support_type(value, SUPPORT_LABELS, default)


def parse_node_support_dofs(support_type: str) -> List[int]:
    return support_dof_indexes("frame", support_type)


def normalize_frame_request(data: Dict[str, Any]) -> Dict[str, Any]:
    structure_source = data.get("structure") or data.get("frame") or {}
    if not isinstance(structure_source, dict):
        structure_source = {}

    project_name = str(data.get("projectName") or structure_source.get("projectName") or DEFAULT_PROJECT_NAME)
    material_id = str(data.get("materialId") or structure_source.get("materialId") or "custom")
    analysis_options = data.get("analysisOptions") or structure_source.get("analysisOptions") or {}
    if not isinstance(analysis_options, dict):
        analysis_options = {}

    if structure_source.get("nodes") and structure_source.get("members"):
        model = build_structural_model(
            analysis_type="frame",
            template=structure_source.get("template", "explicit"),
            raw_nodes=structure_source.get("nodes", []),
            raw_members=structure_source.get("members", []),
            raw_loads=structure_source.get("loads", []),
            raw_load_cases=structure_source.get("loadCases"),
            raw_load_combinations=structure_source.get("loadCombinations"),
            labels=SUPPORT_LABELS,
            include_bending=True,
            allow_distributed=True,
            min_nodes_error="框架至少需要 2 个节点",
            min_members_error="框架至少需要 1 个构件",
        )
        return {
            "analysis_type": "frame",
            "project_name": project_name,
            "material_id": material_id,
            "structure": model.to_structure_contract(include_bending=True),
            "analysisOptions": analysis_options,
        }

    span = max(0.1, to_float(structure_source.get("span", data.get("span", 6.0)), 6.0))
    height = max(0.1, to_float(structure_source.get("height", data.get("height", 4.0)), 4.0))
    beam_load_kn_per_m = max(
        0.0,
        to_float(
            _first_value(
                structure_source.get("beam_load_kn_per_m"),
                structure_source.get("beamLoadKnPerM"),
                data.get("beam_load_kn_per_m"),
                data.get("beamLoadKnPerM"),
                20.0,
            ),
            20.0,
        ),
    )
    lateral_load_kn = to_float(
        _first_value(
            structure_source.get("lateral_load_kn"),
            structure_source.get("lateralLoadKn"),
            data.get("lateral_load_kn"),
            data.get("lateralLoadKn"),
            20.0,
        ),
        20.0,
    )
    top_vertical_load_kn = to_float(
        _first_value(
            structure_source.get("top_vertical_load_kn"),
            structure_source.get("topVerticalLoadKn"),
            data.get("top_vertical_load_kn"),
            data.get("topVerticalLoadKn"),
            0.0,
        ),
        0.0,
    )
    left_support = parse_support_type(
        _first_value(
            structure_source.get("left_support"),
            structure_source.get("supportLeft"),
            data.get("left_support"),
            data.get("supportLeft"),
            "fixed",
        ),
        "fixed",
    )
    right_support = parse_support_type(
        _first_value(
            structure_source.get("right_support"),
            structure_source.get("supportRight"),
            data.get("right_support"),
            data.get("supportRight"),
            "fixed",
        ),
        "fixed",
    )

    common_e = to_float(structure_source.get("E", data.get("E", 210.0)), 210.0)
    common_a = to_float(structure_source.get("A_cm2", data.get("A_cm2", data.get("A", 120.0))), 120.0)
    common_i = to_float(structure_source.get("I_cm4", data.get("I_cm4", data.get("I", 8000.0))), 8000.0)

    column_e = to_float(structure_source.get("columnE_GPa", data.get("columnE_GPa", common_e)), common_e)
    beam_e = to_float(structure_source.get("beamE_GPa", data.get("beamE_GPa", common_e)), common_e)
    column_a = to_float(structure_source.get("columnA_cm2", data.get("columnA_cm2", common_a)), common_a)
    beam_a = to_float(structure_source.get("beamA_cm2", data.get("beamA_cm2", common_a)), common_a)
    column_i = to_float(structure_source.get("columnI_cm4", data.get("columnI_cm4", common_i)), common_i)
    beam_i = to_float(structure_source.get("beamI_cm4", data.get("beamI_cm4", common_i)), common_i)

    nodes = [
        {"id": "N1", "x": 0.0, "y": 0.0, "supportType": left_support},
        {"id": "N2", "x": span, "y": 0.0, "supportType": right_support},
        {"id": "N3", "x": 0.0, "y": height, "supportType": "free"},
        {"id": "N4", "x": span, "y": height, "supportType": "free"},
    ]
    members = [
        {"id": "C1", "start": "N1", "end": "N3", "E_GPa": column_e, "A_cm2": column_a, "I_cm4": column_i, "kind": "column"},
        {"id": "B1", "start": "N3", "end": "N4", "E_GPa": beam_e, "A_cm2": beam_a, "I_cm4": beam_i, "kind": "beam"},
        {"id": "C2", "start": "N2", "end": "N4", "E_GPa": column_e, "A_cm2": column_a, "I_cm4": column_i, "kind": "column"},
    ]
    loads = [
        {"type": "distributed", "member": "B1", "wyKnPerM": -beam_load_kn_per_m},
        {"type": "nodal", "node": "N4", "fxKn": lateral_load_kn, "fyKn": -top_vertical_load_kn, "mzKnM": 0.0},
    ]
    return {
        "analysis_type": "frame",
        "project_name": project_name,
        "material_id": material_id,
        "structure": {
            "template": "portal_frame",
            "span": span,
            "height": height,
            "left_support": left_support,
            "right_support": right_support,
            "beam_load_kn_per_m": beam_load_kn_per_m,
            "lateral_load_kn": lateral_load_kn,
            "top_vertical_load_kn": top_vertical_load_kn,
            "nodes": nodes,
            "members": members,
            "loads": loads,
        },
        "analysisOptions": analysis_options,
    }
