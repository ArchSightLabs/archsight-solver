from __future__ import annotations

from typing import Any, Dict, List, Mapping, Sequence

from backend.common.domain_errors import InvalidStructureReferenceError
from backend.common.material_catalog import get_material_spec
from backend.common.numbers import to_float
from backend.normalizers.structural_model_members import expand_member_internal_hinges, parse_members
from backend.normalizers.structural_model_nodes import parse_nodes
from backend.normalizers.structural_model_shared import parse_ratio_range
from backend.normalizers.structural_model_types import (
    DEFAULT_THERMAL_EXPANSION_PER_C,
    LoadCase,
    LoadCombination,
    StructuralMember,
    StructuralLoad,
    StructuralModel,
    StructuralNode,
    SupportCondition,
    support_constraint_dofs,
)


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


def material_thermal_expansion_per_c(material_id: str | None) -> float:
    material = get_material_spec(material_id)
    if material:
        return material.thermal_expansion_per_c
    return DEFAULT_THERMAL_EXPANSION_PER_C


def parse_temperature_load_values(load: Mapping[str, Any], *, member: StructuralMember | None = None) -> Dict[str, Any]:
    delta_temp = to_float(
        load.get("deltaTempC", load.get("temperatureDeltaC", load.get("deltaTC", load.get("valueC", 0.0)))),
        0.0,
    )
    alpha_default = material_thermal_expansion_per_c(member.material_id if member else None)
    alpha = to_float(load.get("alphaPerC", load.get("thermalExpansionPerC", alpha_default)), alpha_default)
    if alpha < 0.0:
        raise ValueError("构件温度荷载线膨胀系数 alphaPerC 不能为负")
    return {
        "deltaTempC": delta_temp,
        "alphaPerC": alpha,
    }


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
        if load_type not in {"distributed", "member_load", "member", "temperature"}:
            raise ValueError("桁架当前仅支持节点荷载或可等效为节点荷载的构件荷载")

        member_id = str(load.get("member") or "")
        member = member_by_id.get(member_id)
        if not member:
            raise InvalidStructureReferenceError("load", member_id or "unknown", "桁架构件荷载引用了不存在的杆件", referenced_kind="member", referenced_id=member_id or "unknown")
        start_node = node_by_id[member.start]
        end_node = node_by_id[member.end]
        length = ((end_node.x - start_node.x) ** 2 + (end_node.y - start_node.y) ** 2) ** 0.5
        if length <= 0:
            raise ValueError(f"杆件 {member_id} 长度必须大于 0")

        if load_type == "temperature":
            values = parse_temperature_load_values(load, member=member)
            equivalent_loads.append(
                {
                    "type": "temperature",
                    "member": member.id,
                    **values,
                }
            )
            continue

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
    member_by_id = {member.id: member for member in members}
    parsed_loads: List[StructuralLoad] = []
    for load in raw_loads:
        load_type = str(load.get("type") or "nodal").strip().lower()
        if load_type == "nodal":
            node_id = str(load.get("node") or "")
            if node_id not in node_ids:
                raise InvalidStructureReferenceError("load", node_id or "unknown", "节点荷载引用了不存在的节点", referenced_kind="node", referenced_id=node_id or "unknown")
            values = {
                "fxKn": to_float(load.get("fxKn", 0.0), 0.0),
                "fyKn": to_float(load.get("fyKn", 0.0), 0.0),
            }
            if allow_distributed:
                values["mzKnM"] = to_float(load.get("mzKnM", 0.0), 0.0)
            parsed_loads.append(StructuralLoad(type="nodal", target=node_id, values=values))
        elif load_type == "distributed":
            if not allow_distributed:
                raise ValueError("桁架当前仅支持节点荷载")
            member_id = str(load.get("member") or "")
            if member_id not in member_ids:
                raise InvalidStructureReferenceError("load", member_id or "unknown", "构件荷载引用了不存在的构件", referenced_kind="member", referenced_id=member_id or "unknown")
            values = parse_distributed_load_values(load)
            parsed_loads.append(StructuralLoad(type="distributed", target=member_id, values=values))
        elif load_type == "member_point":
            if not allow_distributed:
                raise ValueError("桁架当前仅支持节点荷载")
            member_id = str(load.get("member") or "")
            if member_id not in member_ids:
                raise InvalidStructureReferenceError("load", member_id or "unknown", "构件荷载引用了不存在的构件", referenced_kind="member", referenced_id=member_id or "unknown")
            parsed_loads.append(StructuralLoad(type="member_point", target=member_id, values=parse_member_point_load_values(load)))
        elif load_type == "temperature":
            member_id = str(load.get("member") or "")
            if member_id not in member_ids:
                raise InvalidStructureReferenceError("load", member_id or "unknown", "构件荷载引用了不存在的构件", referenced_kind="member", referenced_id=member_id or "unknown")
            parsed_loads.append(StructuralLoad(type="temperature", target=member_id, values=parse_temperature_load_values(load, member=member_by_id.get(member_id))))
        elif not allow_distributed:
            raise ValueError("桁架当前仅支持节点荷载")
        else:
            raise ValueError("荷载类型必须为 nodal、distributed、member_point 或 temperature")
    return parsed_loads


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
        load_cases.append(LoadCase(id=case_id, title=str(raw_case.get("title") or case_id), loads=loads))
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
            raise InvalidStructureReferenceError("loadCombination", combination_id, f"荷载组合引用了不存在的工况: {unknown[0]}", referenced_kind="loadCase", referenced_id=unknown[0])
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
        allow_support_displacements=include_bending,
        unsupported_springs_error="桁架节点不支持节点弹性约束；当前桁架支座仅使用 pinned、roller、free 刚性平动约束",
        unsupported_support_angle_error="桁架节点不支持滚动支座法向角；当前 roller 固定约束 uy、释放 ux",
        unsupported_condensed_dofs_error="桁架节点不支持凝聚/转角释放自由度；桁架节点仅含 ux、uy 平动自由度",
        unsupported_support_displacements_error="桁架节点不支持支座位移；当前桁架支座仅使用 pinned、roller、free 刚性平动约束",
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
