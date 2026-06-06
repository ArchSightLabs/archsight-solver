from __future__ import annotations

import itertools
from typing import Any, Dict, List, Mapping, Sequence, Tuple

from backend.common.numbers import clamp_ratio, sanitize_label, to_float
from backend.common.support_catalog import support_constraint_dofs, support_labels
from backend.common.units import to_si
from backend.config import get_max_beam_spans, resolve_output_precision
from backend.normalizers.structural_model import parse_combination_tags
from backend.solver.linear_system import normalize_solver_backend


BEAM_TYPE_LABELS = {
    "continuous": "连续梁",
    "simply_supported": "简支梁",
    "cantilever": "悬臂梁",
}

LOAD_TYPE_LABELS = {
    "none": "无荷载",
    "uniform": "均布荷载",
    "point": "集中荷载",
    "linear": "线性分布荷载",
    "distributed": "线性分布荷载",
    "combined": "组合荷载",
}

LOAD_TYPE_ALIASES = {
    "distributed": "linear",
}

BEAM_SUPPORT_LABELS = {**support_labels("beam"), "hinged": "铰支座"}

DEFAULT_PROJECT_NAME = "默认结构工程项目"
DEFAULT_MATERIAL_NAME = "自定义材料"
DEFLECTION_LIMIT_RATIO = 250.0
DEFAULT_BEAM_MAX_SPANS = 300
DEFAULT_BEAM_SPAN_LIMIT_MESSAGE = "跨度数量超出系统限制 (最大 300 跨)"


def normalize_span_properties(
    data: Dict[str, Any],
    spans: Sequence[float],
    fallback_E: float,
    fallback_I: float,
) -> Tuple[List[float], List[float]]:
    raw_properties = data.get("spanProperties", data.get("span_properties", []))
    span_count = len(spans)
    span_E_gpa = [float(fallback_E) for _ in range(span_count)]
    span_I_cm4 = [float(fallback_I) for _ in range(span_count)]

    if not isinstance(raw_properties, Sequence) or isinstance(raw_properties, (str, bytes)):
        return span_E_gpa, span_I_cm4

    properties = list(raw_properties)
    if not properties:
        return span_E_gpa, span_I_cm4

    for index in range(span_count):
        candidate = properties[min(index, len(properties) - 1)]
        if isinstance(candidate, dict):
            span_E_gpa[index] = to_float(candidate.get("E", candidate.get("E_gpa", candidate.get("E_GPa", fallback_E))), fallback_E)
            span_I_cm4[index] = to_float(candidate.get("I", candidate.get("I_cm4", candidate.get("I_Cm4", fallback_I))), fallback_I)
        else:
            span_E_gpa[index] = to_float(candidate, fallback_E)
            span_I_cm4[index] = fallback_I

    return span_E_gpa, span_I_cm4


def normalize_span_ids(data: Dict[str, Any], span_count: int) -> List[str]:
    raw_properties = data.get("spanProperties", data.get("span_properties", []))
    properties = list(raw_properties) if isinstance(raw_properties, Sequence) and not isinstance(raw_properties, (str, bytes)) else []
    seen = set()
    span_ids: List[str] = []
    for index in range(span_count):
        candidate = properties[min(index, len(properties) - 1)] if properties else None
        raw_id = ""
        if isinstance(candidate, Mapping):
            raw_id = str(candidate.get("id", candidate.get("memberId", "")) or "").strip()
        span_id = raw_id or f"({index + 1})"
        if span_id in seen:
            span_id = f"({index + 1})"
        suffix = index + 1
        while span_id in seen:
            suffix += 1
            span_id = f"({suffix})"
        seen.add(span_id)
        span_ids.append(span_id)
    return span_ids


def _parse_beam_theory(value: Any) -> str:
    theory = str(value or "euler_bernoulli").strip().lower().replace("-", "_")
    if theory in {"euler", "eb", "euler_bernoulli"}:
        return "euler_bernoulli"
    if theory in {"timoshenko", "timo"}:
        return "timoshenko"
    raise ValueError("梁理论选项必须为 euler_bernoulli 或 timoshenko")


def _support_type(value: Any, default: str = "pinned") -> str:
    key = str(value or default).strip().lower()
    if key == "hinged":
        key = "pinned"
    if key not in {"pinned", "roller", "fixed", "free"}:
        raise ValueError("梁支座类型必须为 pinned、roller、fixed 或 free")
    return key


def _support_constraints(support_type: str) -> List[str]:
    return support_constraint_dofs("beam", support_type)


def _parse_beam_support_constraints(raw_constraints: Any, support_type: str) -> List[str]:
    if raw_constraints in (None, ""):
        return _support_constraints(support_type)
    if not isinstance(raw_constraints, Sequence) or isinstance(raw_constraints, (str, bytes)):
        raise ValueError("梁支座约束必须使用 constraints 数组定义")
    constraints: List[str] = []
    for item in raw_constraints:
        dof = str(item or "").strip().lower()
        if dof in {"uy", "y"}:
            dof = "v"
        if dof in {"theta", "rotation", "m"}:
            dof = "rz"
        if dof not in {"v", "rz"}:
            raise ValueError("梁支座约束自由度必须为 v 或 rz")
        if dof not in constraints:
            constraints.append(dof)
    return constraints


def _parse_beam_support_springs(raw_springs: Any) -> List[Dict[str, Any]]:
    if raw_springs in (None, ""):
        return []
    if not isinstance(raw_springs, Sequence) or isinstance(raw_springs, (str, bytes)):
        raise ValueError("梁系支座弹性约束必须使用 springs 数组定义")
    springs: List[Dict[str, Any]] = []
    for spring in raw_springs:
        if not isinstance(spring, Mapping):
            raise ValueError("梁系支座弹性约束必须使用对象定义")
        dof = str(spring.get("dof") or "v").strip().lower()
        if dof in {"uy", "y"}:
            dof = "v"
        if dof in {"theta", "rotation", "m"}:
            dof = "rz"
        if dof not in {"v", "rz"}:
            raise ValueError("梁系支座弹性约束自由度必须为 v 或 rz")
        if dof == "rz":
            stiffness = to_float(spring.get("stiffnessKnMPerRad", spring.get("stiffness", spring.get("k"))), 0.0)
            key = "stiffnessKnMPerRad"
        else:
            stiffness = to_float(spring.get("stiffnessKnPerM", spring.get("stiffness", spring.get("k"))), 0.0)
            key = "stiffnessKnPerM"
        if stiffness <= 0:
            raise ValueError("梁系支座弹性约束刚度必须大于 0")
        springs.append({"dof": dof, key: stiffness})
    return springs


def normalize_beam_supports(raw_supports: Any, *, beam_type: str, span_boundaries: Sequence[float], total_length: float) -> List[Dict[str, Any]]:
    if raw_supports not in (None, ""):
        if not isinstance(raw_supports, Sequence) or isinstance(raw_supports, (str, bytes)):
            raise ValueError("梁支座必须使用 supports 数组定义")
        supports: List[Dict[str, Any]] = []
        for index, support in enumerate(raw_supports):
            if not isinstance(support, Mapping):
                raise ValueError("梁支座必须使用对象定义")
            x = to_float(support.get("x", support.get("xM", support.get("position"))), 0.0)
            if x < -1e-9 or x > total_length + 1e-9:
                raise ValueError("梁支座位置必须位于梁长范围内")
            support_type = _support_type(support.get("type", support.get("supportType")), "pinned")
            constraints = _parse_beam_support_constraints(support.get("constraints"), support_type)
            springs = _parse_beam_support_springs(support.get("springs", []))
            supports.append(
                {
                    "id": str(support.get("id") or f"S{index + 1}"),
                    "x": round(min(max(x, 0.0), total_length), 9),
                    "type": support_type,
                    "constraints": constraints,
                    "springs": springs,
                }
            )
        if not supports:
            raise ValueError("梁支座至少需要 1 个")
        return supports

    if beam_type == "cantilever":
        return [{"id": "S1", "x": 0.0, "type": "fixed", "constraints": ["v", "rz"], "springs": []}]
    if beam_type == "simply_supported":
        return [
            {"id": "S1", "x": 0.0, "type": "pinned", "constraints": ["v"], "springs": []},
            {"id": "S2", "x": round(total_length, 9), "type": "roller", "constraints": ["v"], "springs": []},
        ]
    return [
        {"id": f"S{index + 1}", "x": round(float(position), 9), "type": "pinned", "constraints": ["v"], "springs": []}
        for index, position in enumerate(span_boundaries)
    ]


def normalize_query_points(data: Dict[str, Any], total_length: float) -> List[float]:
    raw_points = data.get("queryPointsM", data.get("queryPoints", []))
    points: List[float] = []
    if isinstance(raw_points, Sequence) and not isinstance(raw_points, (str, bytes)):
        for point in raw_points:
            x = to_float(point.get("x", point.get("xM")) if isinstance(point, Mapping) else point, 0.0)
            if 0.0 <= x <= total_length:
                points.append(float(x))
    raw_ratios = data.get("queryPointRatios", [])
    if isinstance(raw_ratios, Sequence) and not isinstance(raw_ratios, (str, bytes)):
        for ratio in raw_ratios:
            points.append(clamp_ratio(ratio, 0.0) * total_length)
    return sorted({round(point, 9) for point in points})


def normalize_load_range(
    *,
    start_value: Any,
    end_value: Any,
    start_ratio: Any,
    end_ratio: Any,
    total_length: float,
    label: str,
) -> Tuple[float, float, float, float]:
    if start_value not in (None, ""):
        start = to_float(start_value, 0.0)
    else:
        start = clamp_ratio(start_ratio, 0.0) * total_length
    if end_value not in (None, ""):
        end = to_float(end_value, total_length)
    else:
        end = clamp_ratio(end_ratio, 1.0) * total_length

    if start < -1e-9 or start > total_length + 1e-9 or end < -1e-9 or end > total_length + 1e-9:
        raise ValueError(f"梁{label}作用范围必须位于梁长范围内")
    start = min(max(start, 0.0), total_length)
    end = min(max(end, 0.0), total_length)
    if end < start:
        start, end = end, start
    if abs(end - start) < 1e-9:
        raise ValueError(f"梁{label}作用范围必须具有正长度")
    return (
        start,
        end,
        start / total_length if total_length else 0.0,
        end / total_length if total_length else 1.0,
    )


def _legacy_load_values(base: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "load_type": base["load_type"],
        "q_kn": base["q_kn"],
        "uniform_q_npm": base["uniform_q_npm"],
        "uniform_start_ratio": base["uniform_start_ratio"],
        "uniform_end_ratio": base["uniform_end_ratio"],
        "uniform_start": base["uniform_start"],
        "uniform_end": base["uniform_end"],
        "point_load_kn": base["point_load_kn"],
        "point_load_n": base["point_load_n"],
        "point_position_ratio": base["point_position_ratio"],
        "point_position": base["point_position"],
        "distributed_start_ratio": base["distributed_start_ratio"],
        "distributed_end_ratio": base["distributed_end_ratio"],
        "distributed_start": base["distributed_start"],
        "distributed_end": base["distributed_end"],
        "distributed_start_kn": base["distributed_start_kn"],
        "distributed_end_kn": base["distributed_end_kn"],
        "distributed_start_npm": base["distributed_start_npm"],
        "distributed_end_npm": base["distributed_end_npm"],
    }


def _compact_load(values: Dict[str, Any]) -> Dict[str, Any]:
    load_type = values["load_type"]
    if load_type == "uniform":
        return {
            "type": "uniform",
            "q_kn": values["q_kn"],
            "uniform_q_npm": values["uniform_q_npm"],
            "uniform_start_ratio": values["uniform_start_ratio"],
            "uniform_end_ratio": values["uniform_end_ratio"],
            "uniform_start": values["uniform_start"],
            "uniform_end": values["uniform_end"],
        }
    if load_type == "point":
        return {
            "type": "point",
            "point_load_kn": values["point_load_kn"],
            "point_load_n": values["point_load_n"],
            "point_position": values["point_position"],
            "point_position_ratio": values["point_position_ratio"],
        }
    return {
        "type": "linear",
        "distributed_start": values["distributed_start"],
        "distributed_end": values["distributed_end"],
        "distributed_start_ratio": values["distributed_start_ratio"],
        "distributed_end_ratio": values["distributed_end_ratio"],
        "distributed_start_kn": values["distributed_start_kn"],
        "distributed_end_kn": values["distributed_end_kn"],
        "distributed_start_npm": values["distributed_start_npm"],
        "distributed_end_npm": values["distributed_end_npm"],
    }


def normalize_beam_loads(raw_loads: Any, base: Dict[str, Any]) -> List[Dict[str, Any]]:
    if raw_loads in (None, ""):
        return [_compact_load(_legacy_load_values(base))]
    if not isinstance(raw_loads, Sequence) or isinstance(raw_loads, (str, bytes)):
        raise ValueError("梁荷载必须使用 loads 数组定义")
    loads: List[Dict[str, Any]] = []
    for raw_load in list(raw_loads)[:128]:
        if not isinstance(raw_load, Mapping):
            raise ValueError("梁荷载项必须使用对象定义")
        enabled = raw_load.get("enabled", True)
        if enabled is False:
            continue
        loads.append(_compact_load(_load_case_load_values(raw_load, base)))
    return loads


def reference_load_from_loads(loads: Sequence[Mapping[str, Any]], total_length: float) -> float:
    reference = 0.0
    length = max(float(total_length), 1e-9)
    for load in loads:
        load_type = load.get("type")
        if load_type == "uniform":
            start = float(load.get("uniform_start", 0.0))
            end = float(load.get("uniform_end", total_length))
            reference += float(load.get("q_kn", 0.0)) * max(0.0, end - start) / length
        elif load_type == "point":
            reference += float(load.get("point_load_kn", 0.0)) / length
        elif load_type == "linear":
            start = float(load.get("distributed_start", 0.0))
            end = float(load.get("distributed_end", 0.0))
            region_ratio = max(0.0, end - start) / length
            reference += ((float(load.get("distributed_start_kn", 0.0)) + float(load.get("distributed_end_kn", 0.0))) / 2.0) * region_ratio
    return reference


def primary_load_type(loads: Sequence[Mapping[str, Any]]) -> str:
    if not loads:
        return "none"
    types = {str(load.get("type", "uniform")) for load in loads}
    return next(iter(types)) if len(types) == 1 and len(loads) == 1 else "combined"


def _load_case_load_values(load: Mapping[str, Any], base: Dict[str, Any]) -> Dict[str, Any]:
    raw_type = str(load.get("type", "uniform") or "uniform").strip()
    if raw_type.lower() == "temperature":
        raise ValueError("梁对象不支持温度荷载（缺少轴向自由度），请使用框架模型计算温度应力")
    load_type = sanitize_label(LOAD_TYPE_ALIASES.get(raw_type, raw_type), LOAD_TYPE_LABELS, "uniform")
    values = {
        "load_type": load_type,
        "load_type_label": LOAD_TYPE_LABELS[load_type],
        "q_kn": base["q_kn"],
        "uniform_q_npm": base["uniform_q_npm"],
        "uniform_start_ratio": base["uniform_start_ratio"],
        "uniform_end_ratio": base["uniform_end_ratio"],
        "uniform_start": base["uniform_start"],
        "uniform_end": base["uniform_end"],
        "point_load_kn": base["point_load_kn"],
        "point_load_n": base["point_load_n"],
        "point_position_ratio": base["point_position_ratio"],
        "point_position": base["point_position"],
        "distributed_start_ratio": base["distributed_start_ratio"],
        "distributed_end_ratio": base["distributed_end_ratio"],
        "distributed_start": base["distributed_start"],
        "distributed_end": base["distributed_end"],
        "distributed_start_kn": base["distributed_start_kn"],
        "distributed_end_kn": base["distributed_end_kn"],
        "distributed_start_npm": base["distributed_start_npm"],
        "distributed_end_npm": base["distributed_end_npm"],
    }
    if load_type == "uniform":
        q_kn = to_float(load.get("qKnPerM", load.get("q", load.get("magnitudeKnPerM", base["q_kn"]))), base["q_kn"])
        start, end, start_ratio, end_ratio = normalize_load_range(
            start_value=load.get("start", load.get("startM")),
            end_value=load.get("end", load.get("endM")),
            start_ratio=load.get("startRatio", load.get("uniformLoadStartRatio", base["uniform_start_ratio"])),
            end_ratio=load.get("endRatio", load.get("uniformLoadEndRatio", base["uniform_end_ratio"])),
            total_length=base["total_length"],
            label="均布荷载",
        )
        values.update(
            {
                "q_kn": q_kn,
                "uniform_q_npm": to_si(q_kn, "distributed", "kN/m"),
                "uniform_start": start,
                "uniform_end": end,
                "uniform_start_ratio": start_ratio,
                "uniform_end_ratio": end_ratio,
            }
        )
    elif load_type == "point":
        p_kn = to_float(load.get("pointLoadKn", load.get("magnitudeKn", load.get("P", base["point_load_kn"]))), base["point_load_kn"])
        x = to_float(load.get("x", load.get("xM", load.get("position", base["point_position"]))), base["point_position"])
        if x < -1e-9 or x > base["total_length"] + 1e-9:
            raise ValueError("梁集中荷载位置必须位于梁长范围内")
        x = min(max(x, 0.0), base["total_length"])
        values.update({"point_load_kn": p_kn, "point_load_n": to_si(p_kn, "force", "kN"), "point_position": x, "point_position_ratio": x / base["total_length"] if base["total_length"] else 0.0})
    else:
        start_x = to_float(load.get("start", load.get("startM", base["distributed_start"])), base["distributed_start"])
        end_x = to_float(load.get("end", load.get("endM", base["distributed_end"])), base["distributed_end"])
        q_start = to_float(load.get("qStartKnPerM", load.get("startMagnitudeKnPerM", load.get("wyKnPerM", base["distributed_start_kn"]))), base["distributed_start_kn"])
        q_end = to_float(load.get("qEndKnPerM", load.get("endMagnitudeKnPerM", load.get("wyKnPerM", q_start))), q_start)
        if start_x < -1e-9 or start_x > base["total_length"] + 1e-9 or end_x < -1e-9 or end_x > base["total_length"] + 1e-9:
            raise ValueError("梁分布荷载作用范围必须位于梁长范围内")
        start_x = min(max(start_x, 0.0), base["total_length"])
        end_x = min(max(end_x, 0.0), base["total_length"])
        if end_x < start_x:
            start_x, end_x = end_x, start_x
            q_start, q_end = q_end, q_start
        values.update(
            {
                "distributed_start": start_x,
                "distributed_end": end_x,
                "distributed_start_ratio": start_x / base["total_length"] if base["total_length"] else 0.0,
                "distributed_end_ratio": end_x / base["total_length"] if base["total_length"] else 1.0,
                "distributed_start_kn": q_start,
                "distributed_end_kn": q_end,
                "distributed_start_npm": to_si(q_start, "distributed", "kN/m"),
                "distributed_end_npm": to_si(q_end, "distributed", "kN/m"),
            }
        )
    return values


def normalize_beam_load_cases(raw_cases: Any, raw_combinations: Any, base: Dict[str, Any]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    if raw_cases in (None, ""):
        return [], []
    if not isinstance(raw_cases, Sequence) or isinstance(raw_cases, (str, bytes)):
        raise ValueError("梁荷载工况必须使用 loadCases 数组定义")
    cases: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()
    for index, raw_case in enumerate(raw_cases):
        if not isinstance(raw_case, Mapping):
            raise ValueError("梁荷载工况必须使用对象定义")
        case_id = str(raw_case.get("id") or f"LC{index + 1}").strip() or f"LC{index + 1}"
        if case_id in seen_ids:
            raise ValueError(f"梁荷载工况 ID 重复: {case_id}")
        seen_ids.add(case_id)
        loads = raw_case.get("loads", [])
        if not isinstance(loads, Sequence) or isinstance(loads, (str, bytes)) or not loads:
            raise ValueError("梁荷载工况 loads 不能为空")
        if len(loads) != 1:
            raise ValueError("梁荷载工况首版每个工况仅支持一个荷载定义")
        load = loads[0]
        if not isinstance(load, Mapping):
            raise ValueError("梁荷载工况 loads 必须使用对象定义")
        cases.append({"id": case_id, "title": str(raw_case.get("title") or case_id), **_load_case_load_values(load, base)})

    if raw_combinations in (None, ""):
        return cases, []
    if not isinstance(raw_combinations, Sequence) or isinstance(raw_combinations, (str, bytes)):
        raise ValueError("梁荷载组合必须使用 loadCombinations 数组定义")
    case_ids = {case["id"] for case in cases}
    combinations: List[Dict[str, Any]] = []
    seen_combinations: set[str] = set()
    for index, raw_combination in enumerate(raw_combinations):
        if not isinstance(raw_combination, Mapping):
            raise ValueError("梁荷载组合必须使用对象定义")
        combination_id = str(raw_combination.get("id") or f"COMB{index + 1}").strip() or f"COMB{index + 1}"
        if combination_id in seen_combinations:
            raise ValueError(f"梁荷载组合 ID 重复: {combination_id}")
        seen_combinations.add(combination_id)
        raw_factors = raw_combination.get("factors", {})
        if not isinstance(raw_factors, Mapping) or not raw_factors:
            raise ValueError("梁荷载组合 factors 不能为空")
        factors = {str(case_id).strip(): to_float(factor, 0.0) for case_id, factor in raw_factors.items()}
        unknown = sorted(set(factors) - case_ids)
        if unknown:
            raise ValueError(f"梁荷载组合引用了不存在的工况: {unknown[0]}")
        if all(abs(value) < 1e-12 for value in factors.values()):
            raise ValueError("梁荷载组合 factors 不能全部为 0")
        combination = {"id": combination_id, "title": str(raw_combination.get("title") or combination_id), "factors": factors}
        tags = parse_combination_tags(raw_combination.get("tags", raw_combination.get("comboTags", [])))
        if tags:
            combination["tags"] = tags
        combinations.append(combination)
    return cases, combinations


def normalize_beam_request(data: Dict[str, Any]) -> Dict[str, Any]:
    spans = [float(x) for x in data.get("spans", [])]
    if not spans or any(span <= 0 for span in spans):
        raise ValueError("跨度必须大于 0")
    max_spans = get_max_beam_spans()
    if len(spans) > max_spans:
        message = DEFAULT_BEAM_SPAN_LIMIT_MESSAGE if max_spans == DEFAULT_BEAM_MAX_SPANS else f"跨度数量超出系统限制 (最大 {max_spans} 跨)"
        raise ValueError(message)

    beam_type = sanitize_label(data.get("beamType", "continuous"), BEAM_TYPE_LABELS, "continuous")
    raw_load_type = str(data.get("loadType", "uniform") or "uniform").strip()
    if raw_load_type.lower() == "temperature":
        raise ValueError("梁对象不支持温度荷载（缺少轴向自由度），请使用框架模型计算温度应力")
    load_type = sanitize_label(LOAD_TYPE_ALIASES.get(raw_load_type, raw_load_type), LOAD_TYPE_LABELS, "uniform")

    q_kn = to_float(data.get("q"), 0.0)
    E_gpa = to_float(data.get("E"), 1.0)
    I_cm4 = to_float(data.get("I"), 1.0)
    span_E_gpa, span_I_cm4 = normalize_span_properties(data, spans, E_gpa, I_cm4)
    span_ids = normalize_span_ids(data, len(spans))
    duration = to_float(data.get("duration"), 5.0)
    if duration > 120:
        raise ValueError("模拟时长超出系统限制 (最大 120s)")
    freq = to_float(data.get("freq"), 2.0)

    point_load_kn = to_float(data.get("pointLoad", data.get("pointLoadKn", q_kn)), q_kn)
    raw_point_position_m = data.get("pointLoadPositionM", data.get("pointPositionM", data.get("loadPositionM")))
    point_position_ratio = clamp_ratio(data.get("pointLoadPositionRatio", data.get("pointPositionRatio", 0.5)), 0.5)
    raw_uniform_start_m = data.get("uniformLoadStartM", data.get("uniformStartM"))
    raw_uniform_end_m = data.get("uniformLoadEndM", data.get("uniformEndM"))
    distributed_start_ratio = clamp_ratio(data.get("distributedLoadStartRatio", 0.0), 0.0)
    distributed_end_ratio = clamp_ratio(data.get("distributedLoadEndRatio", 1.0), 1.0)
    distributed_start_kn = to_float(data.get("distributedLoadStart", q_kn), q_kn)
    distributed_end_kn = to_float(data.get("distributedLoadEnd", q_kn), q_kn)

    total_length = float(sum(spans))
    if total_length <= 0:
        raise ValueError("梁总长度必须大于 0")
    if raw_point_position_m not in (None, ""):
        point_position_m = to_float(raw_point_position_m, 0.5 * total_length)
        if point_position_m < -1e-9 or point_position_m > total_length + 1e-9:
            raise ValueError("梁集中荷载位置必须位于梁长范围内")
        point_position_ratio = min(max(point_position_m, 0.0), total_length) / total_length
    has_custom_supports = data.get("supports") not in (None, "")
    if not has_custom_supports and beam_type in {"simply_supported", "cantilever"} and len(spans) > 1:
        spans = spans[:1]
        span_E_gpa = span_E_gpa[:1]
        span_I_cm4 = span_I_cm4[:1]
        span_ids = span_ids[:1]
        total_length = float(sum(spans))
    uniform_start, uniform_end, uniform_start_ratio, uniform_end_ratio = normalize_load_range(
        start_value=raw_uniform_start_m,
        end_value=raw_uniform_end_m,
        start_ratio=data.get("uniformLoadStartRatio", 0.0),
        end_ratio=data.get("uniformLoadEndRatio", 1.0),
        total_length=total_length,
        label="均布荷载",
    )

    uniform_q_npm = to_si(q_kn, "distributed", "kN/m")
    point_load_n = to_si(point_load_kn, "force", "kN")
    distributed_start_npm = to_si(distributed_start_kn, "distributed", "kN/m")
    distributed_end_npm = to_si(distributed_end_kn, "distributed", "kN/m")
    distributed_start = distributed_start_ratio * total_length
    distributed_end = distributed_end_ratio * total_length
    if distributed_end < distributed_start:
        distributed_start, distributed_end = distributed_end, distributed_start
        distributed_start_npm, distributed_end_npm = distributed_end_npm, distributed_start_npm

    span_boundaries = [0.0, *[float(value) for value in itertools.accumulate(spans)]]
    support_specs = normalize_beam_supports(data.get("supports"), beam_type=beam_type, span_boundaries=span_boundaries, total_length=total_length)
    query_points_m = normalize_query_points(data, total_length)
    beam_theory = _parse_beam_theory(data.get("beamTheory", data.get("theory", "euler_bernoulli")))
    G_gpa = to_float(data.get("G", data.get("G_GPa")), max(E_gpa / 2.6, 1.0))
    A_cm2 = to_float(data.get("A_cm2", data.get("A")), 120.0)
    shear_correction_factor = to_float(data.get("shearCorrectionFactor", data.get("kappa")), 5.0 / 6.0)

    request = {
        "spans": spans,
        "total_length": total_length,
        "beam_type": beam_type,
        "beam_type_label": BEAM_TYPE_LABELS[beam_type],
        "load_type": load_type,
        "load_type_label": LOAD_TYPE_LABELS[load_type],
        "q_kn": q_kn,
        "E_gpa": E_gpa,
        "I_cm4": I_cm4,
        "E": to_si(E_gpa, "elastic_modulus", "GPa"),
        "I": to_si(I_cm4, "moment_of_inertia", "cm4"),
        "span_E_gpa": span_E_gpa,
        "span_I_cm4": span_I_cm4,
        "span_ids": span_ids,
        "G_gpa": G_gpa,
        "A_cm2": A_cm2,
        "shear_correction_factor": shear_correction_factor,
        "beam_theory": beam_theory,
        "beam_theory_label": "Timoshenko 梁理论" if beam_theory == "timoshenko" else "Euler-Bernoulli 梁理论",
        "supports": support_specs,
        "query_points_m": query_points_m,
        "duration": duration,
        "freq": freq,
        "point_load_kn": point_load_kn,
        "point_load_n": point_load_n,
        "point_position_ratio": point_position_ratio,
        "point_position": point_position_ratio * total_length,
        "uniform_start_ratio": uniform_start_ratio,
        "uniform_end_ratio": uniform_end_ratio,
        "uniform_start": uniform_start,
        "uniform_end": uniform_end,
        "distributed_start_ratio": distributed_start_ratio,
        "distributed_end_ratio": distributed_end_ratio,
        "distributed_start": distributed_start,
        "distributed_end": distributed_end,
        "distributed_start_kn": distributed_start_kn,
        "distributed_end_kn": distributed_end_kn,
        "distributed_start_npm": distributed_start_npm,
        "distributed_end_npm": distributed_end_npm,
        "uniform_q_npm": uniform_q_npm,
        "material_id": data.get("materialId", "custom"),
        "project_name": data.get("projectName", DEFAULT_PROJECT_NAME),
        "format": data.get("format", "xlsx"),
        "solver_backend": normalize_solver_backend(data.get("solverBackend", data.get("solver_backend"))),
        "output_precision": resolve_output_precision(data),
    }
    loads = normalize_beam_loads(data.get("loads"), request)
    request["loads"] = loads
    request["load_type"] = primary_load_type(loads)
    request["load_type_label"] = LOAD_TYPE_LABELS[request["load_type"]]
    request["reference_load_kn_per_m"] = reference_load_from_loads(loads, total_length)
    load_cases, load_combinations = normalize_beam_load_cases(
        data.get("loadCases", data.get("load_cases")),
        data.get("loadCombinations", data.get("load_combinations")),
        request,
    )
    request["loadCases"] = load_cases
    request["loadCombinations"] = load_combinations
    return request
