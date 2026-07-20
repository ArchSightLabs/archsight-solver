from __future__ import annotations

from typing import Any, Dict, List, Mapping, Sequence

from backend.common.domain_errors import DuplicateStructureIdError, InvalidStiffnessInputError, InvalidStructureReferenceError
from backend.common.numbers import to_float
from backend.normalizers.section_library import resolve_section
from backend.normalizers.structural_model_shared import interpolate, parse_ratio_range
from backend.normalizers.structural_model_types import StructuralMember, StructuralNode, member_label, node_label


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


def parse_member_material_id(value: Any) -> str | None:
    if value in (None, ""):
        return None
    material_id = str(value).strip().lower()
    return material_id or None


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
            raise DuplicateStructureIdError("member", member_id, f"构件 ID 重复: {member_id}")
        seen_ids.add(member_id)
        start = str(member.get("start") or member.get("i") or "")
        end = str(member.get("end") or member.get("j") or "")
        if start not in node_ids or end not in node_ids:
            invalid_node = start if start not in node_ids else end
            raise InvalidStructureReferenceError(
                "member",
                member_id,
                f"构件 {member_id} 的起止节点无效",
                referenced_kind="node",
                referenced_id=invalid_node,
            )
        section = resolve_section(member) if include_bending else {}
        e_gpa = to_float(member.get("E_GPa", member.get("E")), 210.0)
        a_cm2 = to_float(member.get("A_cm2", member.get("A")), section.get("A_cm2", 120.0))
        i_cm4 = to_float(member.get("I_cm4", member.get("I")), section.get("I_cm4", 8000.0)) if include_bending else None
        if e_gpa <= 0:
            raise InvalidStiffnessInputError("member", member_id, f"构件 {member_id} 的弹性模量必须大于 0")
        if a_cm2 <= 0:
            raise InvalidStiffnessInputError("member", member_id, f"构件 {member_id} 的截面面积必须大于 0")
        if include_bending and (i_cm4 is None or i_cm4 <= 0):
            raise InvalidStiffnessInputError("member", member_id, f"构件 {member_id} 的截面惯性矩必须大于 0")
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
        if load_type not in {"distributed", "member_point", "temperature"} or member_id not in split_map:
            expanded_loads.append(load)
            continue
        if load_type == "temperature":
            for segment_id, _, _ in split_map[member_id]:
                expanded_loads.append({**load, "member": segment_id})
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
                expanded_loads.append(
                    {
                        "type": "distributed",
                        "member": segment_id,
                        "direction": direction,
                        "qStartKnPerM": interpolate(q_start, q_end, (overlap_start - load_start) / load_span),
                        "qEndKnPerM": interpolate(q_start, q_end, (overlap_end - load_start) / load_span),
                        "startRatio": (overlap_start - start_ratio) / segment_span,
                        "endRatio": (overlap_end - start_ratio) / segment_span,
                    },
                )
            continue
        point_ratio = to_float(load.get("positionRatio", load.get("ratio", 0.5)), 0.5)
        for segment_id, start_ratio, end_ratio in split_map[member_id]:
            if point_ratio < start_ratio - 1e-9 or point_ratio > end_ratio + 1e-9:
                continue
            segment_span = max(end_ratio - start_ratio, 1e-9)
            expanded_loads.append(
                {
                    **load,
                    "member": segment_id,
                    "positionRatio": min(1.0, max(0.0, (point_ratio - start_ratio) / segment_span)),
                },
            )
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
