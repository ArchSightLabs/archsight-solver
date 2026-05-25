from __future__ import annotations

from typing import Any, Dict, List, Tuple

from backend.normalizers.structural_model import (
    TRUSS_SUPPORT_LABELS,
    build_structural_model,
    parse_support_type as parse_structural_support_type,
    support_dof_indexes,
)


DEFAULT_PROJECT_NAME = "默认二维桁架项目"
DEFAULT_MATERIAL_NAME = "自定义材料"
ALLOWABLE_RATIO = 250.0

SUPPORT_LABELS = TRUSS_SUPPORT_LABELS


def parse_support_type(value: Any, default: str = "free") -> str:
    return parse_structural_support_type(value, SUPPORT_LABELS, default)


def node_dofs(node_index: int) -> Tuple[int, int]:
    return node_index * 2, node_index * 2 + 1


def node_support_dofs(support_type: str) -> List[int]:
    return support_dof_indexes("truss", support_type)


def normalize_truss_request(data: Dict[str, Any]) -> Dict[str, Any]:
    structure_source = data.get("structure") or data.get("truss") or {}
    if not isinstance(structure_source, dict):
        structure_source = {}

    project_name = str(data.get("projectName") or structure_source.get("projectName") or DEFAULT_PROJECT_NAME)
    material_id = str(data.get("materialId") or structure_source.get("materialId") or "custom")

    raw_nodes = structure_source.get("nodes", [])
    raw_members = structure_source.get("members", [])
    raw_loads = structure_source.get("loads", [])

    model = build_structural_model(
        analysis_type="truss",
        template=structure_source.get("template", "explicit"),
        raw_nodes=raw_nodes,
        raw_members=raw_members,
        raw_loads=raw_loads,
        raw_load_cases=structure_source.get("loadCases"),
        raw_load_combinations=structure_source.get("loadCombinations"),
        labels=SUPPORT_LABELS,
        include_bending=False,
        allow_distributed=False,
        min_nodes_error="桁架至少需要 2 个节点",
        min_members_error="桁架至少需要 1 个杆件",
    )

    return {
        "analysis_type": "truss",
        "project_name": project_name,
        "material_id": material_id,
        "structure": model.to_structure_contract(include_bending=False),
        "format": data.get("format", "xlsx"),
    }
