from __future__ import annotations

from typing import Any, Dict, List

from backend.config import get_max_truss_members, get_max_truss_nodes
from backend.common.solver_backend import normalize_solver_backend
from backend.normalizers.structural_model import (
    TRUSS_SUPPORT_LABELS,
    build_structural_model,
    parse_support_type as parse_structural_support_type,
)


DEFAULT_PROJECT_NAME = "默认二维桁架项目"
DEFAULT_MATERIAL_NAME = "自定义材料"

SUPPORT_LABELS = TRUSS_SUPPORT_LABELS


def parse_support_type(value: Any, default: str = "free") -> str:
    return parse_structural_support_type(value, SUPPORT_LABELS, default)


def normalize_truss_request(data: Dict[str, Any]) -> Dict[str, Any]:
    structure_source = data.get("structure") or data.get("truss") or {}
    if not isinstance(structure_source, dict):
        structure_source = {}

    project_name = str(data.get("projectName") or structure_source.get("projectName") or DEFAULT_PROJECT_NAME)
    material_id = str(data.get("materialId") or structure_source.get("materialId") or "custom")

    raw_nodes = structure_source.get("nodes", [])
    raw_members = structure_source.get("members", [])
    raw_loads = structure_source.get("loads", [])

    max_nodes = get_max_truss_nodes()
    max_members = get_max_truss_members()
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
        max_nodes=max_nodes,
        max_members=max_members,
        max_nodes_error=f"桁架节点数量超出系统限制 (最大 {max_nodes} 个)",
        max_members_error=f"桁架杆件数量超出系统限制 (最大 {max_members} 根)",
    )

    return {
        "analysis_type": "truss",
        "project_name": project_name,
        "material_id": material_id,
        "structure": model.to_structure_contract(include_bending=False),
        "format": data.get("format", "xlsx"),
        "solver_backend": normalize_solver_backend(data.get("solverBackend", data.get("solver_backend"))),
    }
