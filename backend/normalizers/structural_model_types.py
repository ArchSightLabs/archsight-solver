from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional

from backend.common.support_catalog import (
    support_constraint_dof_map,
    support_constraint_dofs as catalog_support_constraint_dofs,
    support_labels,
)

DEFAULT_THERMAL_EXPANSION_PER_C = 1.2e-5
FRAME_SUPPORT_LABELS = support_labels("frame")
TRUSS_SUPPORT_LABELS = support_labels("truss")
SUPPORT_DOF_MAP = support_constraint_dof_map()


@dataclass(frozen=True)
class StructuralNode:
    id: str
    x: float
    y: float
    support_type: str
    support_angle_deg: Optional[float] = None
    condensed_dofs: List[str] = field(default_factory=list)
    springs: List[Dict[str, Any]] = field(default_factory=list)
    support_displacements: List[Dict[str, Any]] = field(default_factory=list)

    def to_contract(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "x": self.x,
            "y": self.y,
            "supportType": self.support_type,
        }
        if self.support_angle_deg is not None:
            data["supportAngleDeg"] = self.support_angle_deg
        if self.condensed_dofs:
            data["condensedDofs"] = self.condensed_dofs
        if self.springs:
            data["springs"] = self.springs
        if self.support_displacements:
            data["supportDisplacements"] = self.support_displacements
        return data


@dataclass(frozen=True)
class StructuralMember:
    id: str
    start: str
    end: str
    element_type: str
    material_id: Optional[str]
    E_GPa: float
    A_cm2: float
    I_cm4: Optional[float] = None
    kind: str = "generic"
    end_releases: Dict[str, List[str]] = field(default_factory=dict)
    section: Dict[str, Any] = field(default_factory=dict)

    def to_contract(self, *, include_bending: bool) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "start": self.start,
            "end": self.end,
            "elementType": self.element_type,
            "E_GPa": self.E_GPa,
            "A_cm2": self.A_cm2,
        }
        if self.material_id:
            data["materialId"] = self.material_id
        if include_bending:
            data["I_cm4"] = self.I_cm4 if self.I_cm4 is not None else 8000.0
            if self.end_releases:
                data["endReleases"] = self.end_releases
            if self.section:
                data["section"] = self.section
                data["sectionId"] = self.section.get("sectionId")
        data["kind"] = self.kind
        return data


@dataclass(frozen=True)
class SupportCondition:
    node_id: str
    constraints: List[str]
    springs: List[Dict[str, Any]] = field(default_factory=list)


@dataclass(frozen=True)
class StructuralLoad:
    type: str
    target: str
    values: Dict[str, Any]

    def to_contract(self) -> Dict[str, Any]:
        if self.type == "nodal":
            return {"type": "nodal", "node": self.target, **self.values}
        if self.type == "member_point":
            return {"type": "member_point", "member": self.target, **self.values}
        if self.type == "temperature":
            return {"type": "temperature", "member": self.target, **self.values}
        return {"type": "distributed", "member": self.target, **self.values}


@dataclass(frozen=True)
class LoadCase:
    id: str
    title: str
    loads: List[StructuralLoad]

    def to_contract(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "title": self.title,
            "loads": [load.to_contract() for load in self.loads],
        }


@dataclass(frozen=True)
class LoadCombination:
    id: str
    title: str
    factors: Dict[str, float]
    tags: List[str] = field(default_factory=list)

    def to_contract(self) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "id": self.id,
            "title": self.title,
            "factors": self.factors,
        }
        if self.tags:
            data["tags"] = self.tags
        return data


@dataclass(frozen=True)
class StructuralModel:
    analysis_type: str
    template: str
    nodes: List[StructuralNode]
    members: List[StructuralMember]
    loads: List[StructuralLoad]
    supports: List[SupportCondition]
    load_cases: List[LoadCase] = field(default_factory=list)
    load_combinations: List[LoadCombination] = field(default_factory=list)

    def to_structure_contract(self, *, include_bending: bool) -> Dict[str, Any]:
        data: Dict[str, Any] = {
            "template": self.template,
            "nodes": [node.to_contract() for node in self.nodes],
            "members": [member.to_contract(include_bending=include_bending) for member in self.members],
            "loads": [load.to_contract() for load in self.loads],
        }
        if self.load_cases:
            data["loadCases"] = [load_case.to_contract() for load_case in self.load_cases]
        if self.load_combinations:
            data["loadCombinations"] = [combination.to_contract() for combination in self.load_combinations]
        return data


def node_label(index: int) -> str:
    return f"N{index + 1}"


def member_label(index: int) -> str:
    return f"M{index + 1}"


def parse_support_type(value: Any, labels: Mapping[str, str], default: str = "free") -> str:
    key = str(value or default).strip().lower()
    if key == "fixed" and "fixed" not in labels and "pinned" in labels:
        return "pinned"
    return key if key in labels else default


def support_constraint_dofs(analysis_type: str, support_type: str) -> List[str]:
    if analysis_type not in {"beam", "frame", "truss"}:
        return []
    return catalog_support_constraint_dofs(analysis_type, support_type)  # type: ignore[arg-type]


def support_dof_indexes(analysis_type: str, support_type: str) -> List[int]:
    constraints = support_constraint_dofs(analysis_type, support_type)
    index_map = {"ux": 0, "uy": 1, "rz": 2}
    return [index_map[item] for item in constraints]
