from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional, Sequence

from backend.common.numbers import to_float
from backend.common.support_catalog import support_constraint_dof_map, support_constraint_dofs as catalog_support_constraint_dofs, support_labels
from backend.normalizers.section_library import resolve_section


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


def parse_nodes(
    raw_nodes: Sequence[Dict[str, Any]],
    *,
    labels: Mapping[str, str],
    min_count_error: str,
    max_count: int | None = None,
    max_count_error: str | None = None,
    allow_springs: bool = True,
    allow_support_angle: bool = True,
    allow_condensed_dofs: bool = True,
    unsupported_springs_error: str = "当前结构对象不支持节点弹性支座",
    unsupported_support_angle_error: str = "当前结构对象不支持滚动支座法向角",
    unsupported_condensed_dofs_error: str = "当前结构对象不支持节点凝聚自由度",
) -> List[StructuralNode]:
    nodes: List[StructuralNode] = []
    seen_ids: set[str] = set()
    for index, node in enumerate(raw_nodes):
        node_id = str(node.get("id") or node_label(index))
        if node_id in seen_ids:
            raise ValueError(f"节点 ID 重复: {node_id}")
        seen_ids.add(node_id)
        if not allow_springs and node.get("springs") not in (None, "", []):
            raise ValueError(unsupported_springs_error)
        if not allow_support_angle and (node.get("supportAngleDeg") not in (None, "") or node.get("rollerAngleDeg") not in (None, "")):
            raise ValueError(unsupported_support_angle_error)
        if not allow_condensed_dofs and node.get("condensedDofs") not in (None, "", []):
            raise ValueError(unsupported_condensed_dofs_error)
        springs = parse_node_springs(node.get("springs", []))
        support_angle_deg = parse_support_angle(node.get("supportAngleDeg", node.get("rollerAngleDeg")))
        nodes.append(
            StructuralNode(
                id=node_id,
                x=to_float(node.get("x"), 0.0),
                y=to_float(node.get("y"), 0.0),
                support_type=parse_support_type(node.get("supportType", node.get("support", "free")), labels),
                support_angle_deg=support_angle_deg,
                condensed_dofs=parse_condensed_dofs(node.get("condensedDofs", [])),
                springs=springs,
            )
        )
    if len(nodes) < 2:
        raise ValueError(min_count_error)
    if max_count is not None and len(nodes) > max_count:
        raise ValueError(max_count_error or f"节点数量超出系统限制 (最大 {max_count} 个)")
    return nodes


def parse_condensed_dofs(raw_dofs: Any) -> List[str]:
    if raw_dofs in (None, ""):
        return []
    if isinstance(raw_dofs, str):
        raw_dofs = [raw_dofs]
    if not isinstance(raw_dofs, Sequence):
        raise ValueError("节点凝聚自由度必须使用数组定义")
    dofs = [str(item).strip().lower() for item in raw_dofs]
    invalid = [dof for dof in dofs if dof not in {"ux", "uy", "rz"}]
    if invalid:
        raise ValueError("节点凝聚自由度必须为 ux、uy 或 rz")
    return sorted(set(dofs), key={"ux": 0, "uy": 1, "rz": 2}.get)


def parse_support_angle(value: Any) -> Optional[float]:
    if value in (None, ""):
        return None
    angle = to_float(value, 90.0)
    while angle < 0.0:
        angle += 180.0
    while angle >= 180.0:
        angle -= 180.0
    return angle


def parse_node_springs(raw_springs: Any) -> List[Dict[str, Any]]:
    if raw_springs in (None, ""):
        return []
    if not isinstance(raw_springs, Sequence) or isinstance(raw_springs, (str, bytes)):
        raise ValueError("弹性支座必须使用 springs 数组定义")
    springs: List[Dict[str, Any]] = []
    for spring in raw_springs:
        if not isinstance(spring, Mapping):
            raise ValueError("弹性支座必须使用对象定义")
        dof = str(spring.get("dof") or "").strip().lower()
        if dof not in {"ux", "uy", "rz"}:
            raise ValueError("弹性支座自由度必须为 ux、uy 或 rz")
        if dof == "rz":
            stiffness = to_float(
                spring.get("stiffnessKnMPerRad", spring.get("stiffness", spring.get("k"))),
                0.0,
            )
            key = "stiffnessKnMPerRad"
        else:
            stiffness = to_float(
                spring.get("stiffnessKnPerM", spring.get("stiffness", spring.get("k"))),
                0.0,
            )
            key = "stiffnessKnPerM"
        if stiffness <= 0:
            raise ValueError("弹性支座刚度必须大于 0")
        springs.append({"dof": dof, key: stiffness})
    return springs


def parse_end_releases(raw_releases: Any, *, include_bending: bool) -> Dict[str, List[str]]:
    if not include_bending or raw_releases in (None, ""):
        return {}
    if not isinstance(raw_releases, Mapping):
        raise ValueError("构件端部释放必须使用 endReleases 对象定义")
    parsed: Dict[str, List[str]] = {}
    for end_name in ("start", "end"):
        values = raw_releases.get(end_name, [])
        if values in (None, ""):
            values = []
        if isinstance(values, str):
            values = [values]
        if not isinstance(values, Sequence):
            raise ValueError("构件端部释放自由度必须使用数组定义")
        dofs = [str(item).strip().lower() for item in values]
        invalid = [item for item in dofs if item != "rz"]
        if invalid:
            raise ValueError("框架构件端部释放首版仅支持 rz")
        if dofs:
            parsed[end_name] = ["rz"]
    return parsed


def parse_element_type(value: Any, *, expected: str, member_id: str) -> str:
    if value in (None, ""):
        return expected
    element_type = str(value).strip().lower()
    if element_type not in {"frame", "truss"}:
        raise ValueError(f"构件 {member_id} 的 elementType 必须为 frame 或 truss")
    if element_type != expected:
        raise ValueError(f"构件 {member_id} 的 elementType 必须为 {expected}")
    return element_type


def parse_members(
    raw_members: Sequence[Dict[str, Any]],
    nodes: Sequence[StructuralNode],
    *,
    include_bending: bool,
    expected_element_type: str,
    min_count_error: str,
    max_count: int | None = None,
    max_count_error: str | None = None,
) -> List[StructuralMember]:
    node_ids = {node.id for node in nodes}
    members: List[StructuralMember] = []
    seen_ids: set[str] = set()
    for index, member in enumerate(raw_members):
        member_id = str(member.get("id") or member_label(index))
        if member_id in seen_ids:
            raise ValueError(f"构件 ID 重复: {member_id}")
        seen_ids.add(member_id)
        start = str(member.get("start") or member.get("i") or "")
        end = str(member.get("end") or member.get("j") or "")
        if start not in node_ids or end not in node_ids:
            raise ValueError(f"构件 {member_id} 的起止节点无效")
        section = resolve_section(member) if include_bending else {}
        e_gpa = to_float(member.get("E_GPa", member.get("E")), 210.0)
        a_cm2 = to_float(member.get("A_cm2", member.get("A")), section.get("A_cm2", 120.0))
        i_cm4 = to_float(member.get("I_cm4", member.get("I")), section.get("I_cm4", 8000.0)) if include_bending else None
        if e_gpa <= 0:
            raise ValueError(f"构件 {member_id} 的弹性模量必须大于 0")
        if a_cm2 <= 0:
            raise ValueError(f"构件 {member_id} 的截面面积必须大于 0")
        if include_bending and (i_cm4 is None or i_cm4 <= 0):
            raise ValueError(f"构件 {member_id} 的截面惯性矩必须大于 0")
        members.append(
            StructuralMember(
                id=member_id,
                start=start,
                end=end,
                element_type=parse_element_type(member.get("elementType"), expected=expected_element_type, member_id=member_id),
                material_id=parse_member_material_id(member.get("materialId")),
                E_GPa=e_gpa,
                A_cm2=a_cm2,
                I_cm4=i_cm4,
                kind=str(member.get("kind") or "generic"),
                end_releases=parse_end_releases(member.get("endReleases"), include_bending=include_bending),
                section=section,
            )
        )
    if not members:
        raise ValueError(min_count_error)
    if max_count is not None and len(members) > max_count:
        raise ValueError(max_count_error or f"构件数量超出系统限制 (最大 {max_count} 个)")
    return members


def parse_member_material_id(value: Any) -> Optional[str]:
    if value in (None, ""):
        return None
    material_id = str(value).strip().lower()
    return material_id or None


def expand_member_internal_hinges(
    raw_nodes: Sequence[Dict[str, Any]],
    raw_members: Sequence[Dict[str, Any]],
    raw_loads: Sequence[Dict[str, Any]],
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]], Dict[str, List[tuple[str, float, float]]]]:
    node_by_id = {str(node.get("id") or node_label(index)): node for index, node in enumerate(raw_nodes)}
    expanded_nodes = [dict(node) for node in raw_nodes]
    expanded_members: List[Dict[str, Any]] = []
    split_map: Dict[str, List[tuple[str, float, float]]] = {}
    existing_node_ids = set(node_by_id)

    for member_index, raw_member in enumerate(raw_members):
        member = dict(raw_member)
        member_id = str(member.get("id") or member_label(member_index))
        hinge_ratios = parse_internal_hinge_ratios(member.get("internalHinges", member.get("internalHingeRatios", [])), member_id)
        if not hinge_ratios:
            expanded_members.append(member)
            continue
        start_id = str(member.get("start") or member.get("i") or "")
        end_id = str(member.get("end") or member.get("j") or "")
        start_node = node_by_id.get(start_id)
        end_node = node_by_id.get(end_id)
        if not start_node or not end_node:
            expanded_members.append(member)
            continue
        chain_ids = [start_id]
        for hinge_index, ratio in enumerate(hinge_ratios, start=1):
            hinge_id = f"{member_id}_H{hinge_index}"
            while hinge_id in existing_node_ids:
                hinge_id = f"{hinge_id}_"
            existing_node_ids.add(hinge_id)
            expanded_nodes.append(
                {
                    "id": hinge_id,
                    "x": interpolate(to_float(start_node.get("x"), 0.0), to_float(end_node.get("x"), 0.0), ratio),
                    "y": interpolate(to_float(start_node.get("y"), 0.0), to_float(end_node.get("y"), 0.0), ratio),
                    "supportType": "free",
                    "condensedDofs": ["rz"],
                }
            )
            chain_ids.append(hinge_id)
        chain_ids.append(end_id)
        segment_bounds = [0.0, *hinge_ratios, 1.0]
        split_map[member_id] = []
        for segment_index, (segment_start, segment_end) in enumerate(zip(chain_ids, chain_ids[1:]), start=1):
            segment_id = f"{member_id}_{segment_index}"
            segment_member = {
                key: value
                for key, value in member.items()
                if key not in {"internalHinges", "internalHingeRatios", "id", "start", "end", "i", "j", "endReleases"}
            }
            segment_member.update(
                {
                    "id": segment_id,
                    "start": segment_start,
                    "end": segment_end,
                    "endReleases": _segment_releases(member.get("endReleases", {}), segment_index, len(chain_ids) - 1),
                }
            )
            expanded_members.append(segment_member)
            split_map[member_id].append((segment_id, segment_bounds[segment_index - 1], segment_bounds[segment_index]))

    return expanded_nodes, expanded_members, expand_loads_for_split_members(raw_loads, split_map), split_map


def parse_internal_hinge_ratios(raw_hinges: Any, member_id: str) -> List[float]:
    if raw_hinges in (None, ""):
        return []
    if not isinstance(raw_hinges, Sequence) or isinstance(raw_hinges, (str, bytes)):
        raise ValueError("构件内部铰必须使用 internalHinges 数组定义")
    ratios: List[float] = []
    for raw_hinge in raw_hinges:
        if isinstance(raw_hinge, Mapping):
            ratio = to_float(raw_hinge.get("ratio"), 0.0)
        else:
            ratio = to_float(raw_hinge, 0.0)
        if ratio <= 0.0 or ratio >= 1.0:
            raise ValueError(f"构件 {member_id} 的内部铰位置必须在 0 到 1 之间")
        ratios.append(ratio)
    return sorted(set(ratios))


def interpolate(start: float, end: float, ratio: float) -> float:
    return start + (end - start) * ratio


def _segment_releases(raw_releases: Any, segment_index: int, segment_count: int) -> Dict[str, List[str]]:
    releases: Dict[str, List[str]] = {}
    if isinstance(raw_releases, Mapping):
        if segment_index == 1 and raw_releases.get("start"):
            releases["start"] = list(raw_releases.get("start", []))
        if segment_index == segment_count and raw_releases.get("end"):
            releases["end"] = list(raw_releases.get("end", []))
    if segment_index > 1:
        releases["start"] = ["rz"]
    if segment_index < segment_count:
        releases["end"] = ["rz"]
    return releases


def expand_loads_for_split_members(raw_loads: Sequence[Dict[str, Any]], split_map: Dict[str, List[tuple[str, float, float]]]) -> List[Dict[str, Any]]:
    expanded_loads: List[Dict[str, Any]] = []
    for raw_load in raw_loads:
        load = dict(raw_load)
        load_type = str(load.get("type") or "").strip().lower()
        member_id = str(load.get("member") or "")
        if load_type not in {"distributed", "member_point"} or member_id not in split_map:
            expanded_loads.append(load)
            continue
        if load_type == "distributed":
            direction = load.get("direction", "local_y")
            q_start = to_float(load.get("qStartKnPerM", load.get("wyKnPerM", 0.0)), 0.0)
            q_end = to_float(load.get("qEndKnPerM", load.get("wyKnPerM", q_start)), q_start)
            load_start, load_end = parse_ratio_range(
                load.get("startRatio", load.get("loadStartRatio", 0.0)),
                load.get("endRatio", load.get("loadEndRatio", 1.0)),
                "构件分布荷载作用范围比例",
            )
            for segment_id, start_ratio, end_ratio in split_map[member_id]:
                overlap_start = max(load_start, start_ratio)
                overlap_end = min(load_end, end_ratio)
                if overlap_end <= overlap_start + 1e-12:
                    continue
                load_span = max(load_end - load_start, 1e-12)
                segment_span = max(end_ratio - start_ratio, 1e-12)
                segment_load = {
                    "type": "distributed",
                    "member": segment_id,
                    "direction": direction,
                    "qStartKnPerM": interpolate(q_start, q_end, (overlap_start - load_start) / load_span),
                    "qEndKnPerM": interpolate(q_start, q_end, (overlap_end - load_start) / load_span),
                    "startRatio": (overlap_start - start_ratio) / segment_span,
                    "endRatio": (overlap_end - start_ratio) / segment_span,
                }
                expanded_loads.append(segment_load)
            continue
        point_ratio = to_float(load.get("positionRatio", load.get("ratio", 0.5)), 0.5)
        for segment_id, start_ratio, end_ratio in split_map[member_id]:
            if point_ratio < start_ratio - 1e-9 or point_ratio > end_ratio + 1e-9:
                continue
            segment_span = max(end_ratio - start_ratio, 1e-9)
            segment_load = {
                **load,
                "member": segment_id,
                "positionRatio": min(1.0, max(0.0, (point_ratio - start_ratio) / segment_span)),
            }
            expanded_loads.append(segment_load)
            break
        else:
            expanded_loads.append(load)
    return expanded_loads


def expand_load_cases_for_split_members(raw_load_cases: Any, split_map: Dict[str, List[tuple[str, float, float]]]) -> Any:
    if not split_map or raw_load_cases in (None, ""):
        return raw_load_cases
    if not isinstance(raw_load_cases, Sequence) or isinstance(raw_load_cases, (str, bytes)):
        return raw_load_cases
    expanded_cases = []
    for raw_case in raw_load_cases:
        if not isinstance(raw_case, Mapping):
            expanded_cases.append(raw_case)
            continue
        expanded_case = dict(raw_case)
        expanded_case["loads"] = expand_loads_for_split_members(raw_case.get("loads", []), split_map)
        expanded_cases.append(expanded_case)
    return expanded_cases


def preprocess_truss_member_loads(
    raw_loads: Sequence[Dict[str, Any]],
    nodes: Sequence[StructuralNode],
    members: Sequence[StructuralMember],
) -> List[Dict[str, Any]]:
    node_by_id = {node.id: node for node in nodes}
    member_by_id = {member.id: member for member in members}
    equivalent_loads: List[Dict[str, Any]] = []
    for load in raw_loads:
        load_type = str(load.get("type") or "nodal").strip().lower()
        if load_type == "nodal":
            equivalent_loads.append(dict(load))
            continue
        if load_type not in {"distributed", "member_load", "member"}:
            raise ValueError("桁架当前仅支持节点荷载或可等效为节点荷载的构件荷载")

        member_id = str(load.get("member") or "")
        member = member_by_id.get(member_id)
        if not member:
            raise ValueError("桁架构件荷载引用了不存在的杆件")
        start_node = node_by_id[member.start]
        end_node = node_by_id[member.end]
        length = ((end_node.x - start_node.x) ** 2 + (end_node.y - start_node.y) ** 2) ** 0.5
        if length <= 0:
            raise ValueError(f"杆件 {member_id} 长度必须大于 0")

        if "selfWeightKnPerM" in load:
            direction = "global_y"
            q_start = -abs(to_float(load.get("selfWeightKnPerM"), 0.0))
            q_end = -abs(to_float(load.get("selfWeightKnPerM"), 0.0))
        else:
            direction = str(load.get("direction") or "global_y").strip().lower()
            q_start = to_float(load.get("qStartKnPerM", load.get("wyKnPerM", 0.0)), 0.0)
            q_end = to_float(load.get("qEndKnPerM", load.get("wyKnPerM", q_start)), q_start)
        if direction not in {"global_x", "global_y"}:
            raise ValueError("桁架构件荷载方向必须为 global_x 或 global_y")

        start_force = length * (2.0 * q_start + q_end) / 6.0
        end_force = length * (q_start + 2.0 * q_end) / 6.0
        start_values = {"fxKn": start_force, "fyKn": 0.0} if direction == "global_x" else {"fxKn": 0.0, "fyKn": start_force}
        end_values = {"fxKn": end_force, "fyKn": 0.0} if direction == "global_x" else {"fxKn": 0.0, "fyKn": end_force}
        equivalent_loads.extend(
            [
                {"type": "nodal", "node": member.start, **start_values},
                {"type": "nodal", "node": member.end, **end_values},
            ]
        )
    return equivalent_loads


def preprocess_truss_load_cases(
    raw_load_cases: Any,
    nodes: Sequence[StructuralNode],
    members: Sequence[StructuralMember],
) -> Any:
    if raw_load_cases in (None, ""):
        return raw_load_cases
    if not isinstance(raw_load_cases, Sequence) or isinstance(raw_load_cases, (str, bytes)):
        return raw_load_cases
    expanded_cases = []
    for raw_case in raw_load_cases:
        if not isinstance(raw_case, Mapping):
            expanded_cases.append(raw_case)
            continue
        expanded_case = dict(raw_case)
        expanded_case["loads"] = preprocess_truss_member_loads(raw_case.get("loads", []), nodes, members)
        expanded_cases.append(expanded_case)
    return expanded_cases


def parse_loads(
    raw_loads: Sequence[Dict[str, Any]],
    nodes: Sequence[StructuralNode],
    members: Sequence[StructuralMember],
    *,
    allow_distributed: bool,
) -> List[StructuralLoad]:
    node_ids = {node.id for node in nodes}
    member_ids = {member.id for member in members}
    loads: List[StructuralLoad] = []
    for load in raw_loads:
        load_type = str(load.get("type") or "nodal").strip().lower()
        if load_type == "nodal":
            node_id = str(load.get("node") or "")
            if node_id not in node_ids:
                raise ValueError("节点荷载引用了不存在的节点")
            values = {
                "fxKn": to_float(load.get("fxKn", 0.0), 0.0),
                "fyKn": to_float(load.get("fyKn", 0.0), 0.0),
            }
            if allow_distributed:
                values["mzKnM"] = to_float(load.get("mzKnM", 0.0), 0.0)
            loads.append(StructuralLoad(type="nodal", target=node_id, values=values))
        elif load_type == "distributed":
            if not allow_distributed:
                raise ValueError("桁架当前仅支持节点荷载")
            member_id = str(load.get("member") or "")
            if member_id not in member_ids:
                raise ValueError("构件荷载引用了不存在的构件")
            values = parse_distributed_load_values(load)
            loads.append(
                StructuralLoad(
                    type="distributed",
                    target=member_id,
                    values=values,
                )
            )
        elif load_type == "member_point":
            if not allow_distributed:
                raise ValueError("桁架当前仅支持节点荷载")
            member_id = str(load.get("member") or "")
            if member_id not in member_ids:
                raise ValueError("构件荷载引用了不存在的构件")
            loads.append(
                StructuralLoad(
                    type="member_point",
                    target=member_id,
                    values=parse_member_point_load_values(load),
                )
            )
        elif not allow_distributed:
            raise ValueError("桁架当前仅支持节点荷载")
        else:
            raise ValueError("荷载类型必须为 nodal、distributed 或 member_point")
    return loads


def parse_load_cases(
    raw_load_cases: Any,
    nodes: Sequence[StructuralNode],
    members: Sequence[StructuralMember],
    *,
    allow_distributed: bool,
) -> List[LoadCase]:
    if raw_load_cases in (None, ""):
        return []
    if not isinstance(raw_load_cases, Sequence) or isinstance(raw_load_cases, (str, bytes)):
        raise ValueError("荷载工况必须使用 loadCases 数组定义")
    load_cases: List[LoadCase] = []
    seen_ids: set[str] = set()
    for index, raw_case in enumerate(raw_load_cases):
        if not isinstance(raw_case, Mapping):
            raise ValueError("荷载工况必须使用对象定义")
        case_id = str(raw_case.get("id") or f"LC{index + 1}").strip() or f"LC{index + 1}"
        if case_id in seen_ids:
            raise ValueError(f"荷载工况 ID 重复: {case_id}")
        seen_ids.add(case_id)
        loads = parse_loads(raw_case.get("loads", []), nodes, members, allow_distributed=allow_distributed)
        load_cases.append(
            LoadCase(
                id=case_id,
                title=str(raw_case.get("title") or case_id),
                loads=loads,
            )
        )
    return load_cases


def parse_load_combinations(raw_combinations: Any, load_cases: Sequence[LoadCase]) -> List[LoadCombination]:
    if raw_combinations in (None, ""):
        return []
    if not load_cases:
        raise ValueError("荷载组合必须引用已定义的 loadCases")
    if not isinstance(raw_combinations, Sequence) or isinstance(raw_combinations, (str, bytes)):
        raise ValueError("荷载组合必须使用 loadCombinations 数组定义")
    case_ids = {load_case.id for load_case in load_cases}
    combinations: List[LoadCombination] = []
    seen_ids: set[str] = set()
    for index, raw_combination in enumerate(raw_combinations):
        if not isinstance(raw_combination, Mapping):
            raise ValueError("荷载组合必须使用对象定义")
        combination_id = str(raw_combination.get("id") or f"COMB{index + 1}").strip() or f"COMB{index + 1}"
        if combination_id in seen_ids:
            raise ValueError(f"荷载组合 ID 重复: {combination_id}")
        seen_ids.add(combination_id)
        raw_factors = raw_combination.get("factors", {})
        if not isinstance(raw_factors, Mapping) or not raw_factors:
            raise ValueError("荷载组合 factors 不能为空")
        factors = {str(case_id).strip(): to_float(factor, 0.0) for case_id, factor in raw_factors.items()}
        unknown = sorted(set(factors) - case_ids)
        if unknown:
            raise ValueError(f"荷载组合引用了不存在的工况: {unknown[0]}")
        if all(abs(value) < 1e-12 for value in factors.values()):
            raise ValueError("荷载组合 factors 不能全部为 0")
        combinations.append(
            LoadCombination(
                id=combination_id,
                title=str(raw_combination.get("title") or combination_id),
                factors=factors,
                tags=parse_combination_tags(raw_combination.get("tags", raw_combination.get("comboTags", []))),
            )
        )
    return combinations


def parse_combination_tags(raw_tags: Any) -> List[str]:
    if raw_tags in (None, ""):
        return []
    if isinstance(raw_tags, str):
        raw_tags = [raw_tags]
    if not isinstance(raw_tags, Sequence):
        raise ValueError("荷载组合 tags 必须使用数组定义")
    tags: List[str] = []
    seen: set[str] = set()
    for raw_tag in raw_tags:
        tag = str(raw_tag).strip()
        if not tag or tag in seen:
            continue
        seen.add(tag)
        tags.append(tag)
    return tags


def parse_distributed_load_values(load: Mapping[str, Any]) -> Dict[str, Any]:
    direction = str(load.get("direction") or "local_y").strip().lower()
    if direction not in {"local_y", "global_y"}:
        raise ValueError("构件分布荷载方向必须为 local_y 或 global_y")
    q_start = to_float(load.get("qStartKnPerM", load.get("wyKnPerM", 0.0)), 0.0)
    q_end = to_float(load.get("qEndKnPerM", load.get("wyKnPerM", q_start)), q_start)
    start_ratio, end_ratio = parse_ratio_range(
        load.get("startRatio", load.get("loadStartRatio", 0.0)),
        load.get("endRatio", load.get("loadEndRatio", 1.0)),
        "构件分布荷载作用范围比例",
    )
    return {
        "direction": direction,
        "qStartKnPerM": q_start,
        "qEndKnPerM": q_end,
        "startRatio": start_ratio,
        "endRatio": end_ratio,
    }


def parse_ratio_range(raw_start: Any, raw_end: Any, label: str) -> tuple[float, float]:
    start_ratio = to_float(raw_start, 0.0)
    end_ratio = to_float(raw_end, 1.0)
    if start_ratio < 0.0 or start_ratio > 1.0 or end_ratio < 0.0 or end_ratio > 1.0 or start_ratio >= end_ratio:
        raise ValueError(f"{label}必须满足 0 <= startRatio < endRatio <= 1")
    return start_ratio, end_ratio


def parse_member_point_load_values(load: Mapping[str, Any]) -> Dict[str, Any]:
    direction = str(load.get("direction") or "local_y").strip().lower()
    if direction not in {"local_y", "global_y"}:
        raise ValueError("构件集中荷载方向必须为 local_y 或 global_y")
    position_ratio = to_float(load.get("positionRatio", load.get("ratio", 0.5)), 0.5)
    if position_ratio < 0.0 or position_ratio > 1.0:
        raise ValueError("构件集中荷载位置比例必须在 0 到 1 之间")
    return {
        "direction": direction,
        "forceKn": to_float(load.get("forceKn", load.get("magnitudeKn", load.get("pKn", 0.0))), 0.0),
        "positionRatio": position_ratio,
    }


def build_structural_model(
    *,
    analysis_type: str,
    template: str,
    raw_nodes: Sequence[Dict[str, Any]],
    raw_members: Sequence[Dict[str, Any]],
    raw_loads: Sequence[Dict[str, Any]],
    labels: Mapping[str, str],
    include_bending: bool,
    allow_distributed: bool,
    min_nodes_error: str,
    min_members_error: str,
    max_nodes: int | None = None,
    max_members: int | None = None,
    max_nodes_error: str | None = None,
    max_members_error: str | None = None,
    raw_load_cases: Any = None,
    raw_load_combinations: Any = None,
) -> StructuralModel:
    if include_bending:
        raw_nodes, raw_members, raw_loads, split_map = expand_member_internal_hinges(raw_nodes, raw_members, raw_loads)
        raw_load_cases = expand_load_cases_for_split_members(raw_load_cases, split_map)
    nodes = parse_nodes(
        raw_nodes,
        labels=labels,
        min_count_error=min_nodes_error,
        max_count=max_nodes,
        max_count_error=max_nodes_error,
        allow_springs=include_bending,
        allow_support_angle=include_bending,
        allow_condensed_dofs=include_bending,
        unsupported_springs_error="桁架节点不支持弹性支座；当前桁架支座仅使用 pinned、roller、free 刚性平动约束",
        unsupported_support_angle_error="桁架节点不支持滚动支座法向角；当前 roller 固定约束 uy、释放 ux",
        unsupported_condensed_dofs_error="桁架节点不支持凝聚/转角释放自由度；桁架节点仅含 ux、uy 平动自由度",
    )
    members = parse_members(
        raw_members,
        nodes,
        include_bending=include_bending,
        expected_element_type=analysis_type,
        min_count_error=min_members_error,
        max_count=max_members,
        max_count_error=max_members_error,
    )
    if not allow_distributed:
        raw_loads = preprocess_truss_member_loads(raw_loads, nodes, members)
        raw_load_cases = preprocess_truss_load_cases(raw_load_cases, nodes, members)
    loads = parse_loads(raw_loads, nodes, members, allow_distributed=allow_distributed)
    load_cases = parse_load_cases(raw_load_cases, nodes, members, allow_distributed=allow_distributed)
    load_combinations = parse_load_combinations(raw_load_combinations, load_cases)
    supports = [
        SupportCondition(
            node_id=node.id,
            constraints=support_constraint_dofs(analysis_type, node.support_type),
        )
        for node in nodes
    ]
    return StructuralModel(
        analysis_type=analysis_type,
        template=template,
        nodes=nodes,
        members=members,
        loads=loads,
        supports=supports,
        load_cases=load_cases,
        load_combinations=load_combinations,
    )
