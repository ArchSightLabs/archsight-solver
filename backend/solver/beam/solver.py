from __future__ import annotations

import math
from typing import Any, Dict, List, Sequence, Tuple

import numpy as np

from backend.common.numbers import cumulative, round_list, to_float
from backend.common.units import from_si, to_si
from backend.normalizers.beam.request_normalizer import DEFLECTION_LIMIT_RATIO
from backend.solver.beam.elements import (
    beam_element_equivalent_load,
    beam_element_stiffness,
    beam_point_equivalent_load,
    shape_functions,
    timoshenko_beam_element_stiffness,
)


def build_mesh(
    spans: Sequence[float],
    target_step: float = 0.25,
    extra_node_positions: Sequence[float] | None = None,
) -> Tuple[List[float], List[Tuple[float, float]], List[int], List[int]]:
    node_positions: List[float] = [0.0]
    elements: List[Tuple[float, float]] = []
    span_boundary_node_indices: List[int] = [0]
    element_span_indices: List[int] = []
    current_x = 0.0
    extra_positions = sorted({round(float(position), 12) for position in (extra_node_positions or []) if position >= 0.0})

    for span_index, span in enumerate(spans):
        span_length = float(span)
        span_start = current_x
        span_end = current_x + span_length
        subdivisions = max(6, int(math.ceil(span_length / target_step)))
        step = span_length / subdivisions
        span_points = [round(span_start + step * idx, 12) for idx in range(1, subdivisions + 1)]
        span_points.extend(position for position in extra_positions if span_start < position < span_end)
        for x2 in sorted(set(span_points)):
            if x2 <= current_x + 1e-12:
                continue
            x1 = current_x
            elements.append((x1, x2))
            element_span_indices.append(span_index)
            node_positions.append(round(x2, 12))
            current_x = x2
        span_boundary_node_indices.append(len(node_positions) - 1)

    return node_positions, elements, span_boundary_node_indices, element_span_indices


def support_node_indices(beam_type: str, span_boundary_node_indices: Sequence[int], node_count: int) -> List[int]:
    if beam_type == "continuous":
        return list(span_boundary_node_indices)
    if beam_type == "simply_supported":
        return [0, node_count - 1]
    if beam_type == "cantilever":
        return [0]
    return list(span_boundary_node_indices)


def constraint_dofs(beam_type: str, support_nodes: Sequence[int]) -> List[int]:
    dofs: List[int] = []
    for node_index in support_nodes:
        dofs.append(node_index * 2)
        if beam_type == "cantilever" and node_index == 0:
            dofs.append(node_index * 2 + 1)
    return sorted(set(dofs))


def node_index_for_position(node_positions: Sequence[float], position: float) -> int:
    distances = [abs(float(node_position) - float(position)) for node_position in node_positions]
    index = int(np.argmin(distances))
    if distances[index] > 1e-6:
        raise ValueError("梁支座或查询点未能映射到有限元节点")
    return index


def _is_symbolic_check_supported(
    beam_type: str,
    load_type: str,
    support_specs: Sequence[Dict[str, Any]] | None,
    total_length: float,
) -> bool:
    if load_type != "uniform":
        return False
    if beam_type == "simply_supported" and len(support_specs or []) == 2:
        return True
    if not support_specs or len(support_specs) != 2:
        return False
    positions = sorted(round(float(support["x"]), 9) for support in support_specs)
    types = {str(support.get("type", "")).lower() for support in support_specs}
    return positions == [0.0, round(total_length, 9)] and types <= {"pinned", "roller"}


def build_symbolic_check(
    *,
    beam_type: str,
    load_type: str,
    support_specs: Sequence[Dict[str, Any]] | None,
    total_length: float,
    uniform_q_npm: float,
    E: float,
    I: float,
) -> Dict[str, Any]:
    if not _is_symbolic_check_supported(beam_type, load_type, support_specs, total_length):
        return {
            "available": False,
            "scope": "首版教学校核仅覆盖静定简支梁在全跨均布荷载作用下的教材公式。",
            "equations": [],
        }

    length = float(total_length)
    q = float(uniform_q_npm)
    max_deflection_m = 5.0 * abs(q) * length**4 / (384.0 * float(E) * float(I))
    return {
        "available": True,
        "scope": "静定简支梁全跨均布荷载教材公式校核",
        "signConvention": "竖向荷载向下取正用于工程量级校核；输出反力、弯矩和挠度均取绝对控制值。",
        "equations": [
            "R_A = R_B = qL / 2",
            "M_max = qL^2 / 8",
            "v_max = 5qL^4 / (384EI)",
        ],
        "reactionKn": round(from_si(abs(q) * length / 2.0, "force", "kN"), 6),
        "maxMomentKnM": round(from_si(abs(q) * length**2 / 8.0, "moment", "kN.m"), 6),
        "maxDeflectionMm": round(from_si(max_deflection_m, "deflection", "mm"), 6),
        "limitations": "该校核用于教学解释和量级复核，不替代多跨连续梁、弹簧支座或组合工况有限元结果。",
    }


def support_records_from_specs(support_specs: Sequence[Dict[str, Any]], node_positions: Sequence[float]) -> List[Dict[str, Any]]:
    records: List[Dict[str, Any]] = []
    for index, support in enumerate(support_specs):
        node_index = node_index_for_position(node_positions, float(support["x"]))
        records.append(
            {
                "id": support.get("id", f"S{index + 1}"),
                "x": float(node_positions[node_index]),
                "node_index": node_index,
                "type": support.get("type", "pinned"),
                "constraints": list(support.get("constraints", [])),
                "springs": list(support.get("springs", [])),
            }
        )
    return records


def constrained_dofs_from_supports(support_records: Sequence[Dict[str, Any]]) -> List[int]:
    dofs: List[int] = []
    for record in support_records:
        node_index = int(record["node_index"])
        if "v" in record.get("constraints", []):
            dofs.append(node_index * 2)
        if "rz" in record.get("constraints", []):
            dofs.append(node_index * 2 + 1)
    return sorted(set(dofs))


def finite_element_solution(
    spans: Sequence[float],
    span_E_gpa: Sequence[float],
    span_I_cm4: Sequence[float],
    beam_type: str,
    load_type: str,
    load_spec: Dict[str, Any],
    E: float,
    I: float,
    support_specs: Sequence[Dict[str, Any]] | None = None,
    query_points_m: Sequence[float] | None = None,
    beam_theory: str = "euler_bernoulli",
    G: float | None = None,
    A: float | None = None,
    shear_correction_factor: float = 5.0 / 6.0,
) -> Dict[str, Any]:
    total_length = float(sum(spans))
    extra_node_positions: List[float] = []
    if support_specs:
        extra_node_positions.extend(float(support["x"]) for support in support_specs)
    if query_points_m:
        extra_node_positions.extend(float(point) for point in query_points_m)
    beam_loads = list(load_spec.get("loads") or [])
    if not beam_loads:
        beam_loads = [
            {
                "type": load_type,
                "q_kn": load_spec.get("q_kn", 0.0),
                "uniform_q_npm": load_spec.get("uniform_q_npm", 0.0),
                "point_load_kn": load_spec.get("point_load_kn", 0.0),
                "point_load_n": load_spec.get("point_load_n", 0.0),
                "point_position": load_spec.get("point_position", 0.0),
                "point_position_ratio": load_spec.get("point_position_ratio", 0.0),
                "distributed_start": load_spec.get("distributed_start", 0.0),
                "distributed_end": load_spec.get("distributed_end", 0.0),
                "distributed_start_kn": load_spec.get("distributed_start_kn", 0.0),
                "distributed_end_kn": load_spec.get("distributed_end_kn", 0.0),
                "distributed_start_npm": load_spec.get("distributed_start_npm", 0.0),
                "distributed_end_npm": load_spec.get("distributed_end_npm", 0.0),
            }
        ]
    for load in beam_loads:
        if load.get("type") == "point":
            extra_node_positions.append(float(load.get("point_position", 0.0)))
        elif load.get("type") == "linear":
            extra_node_positions.append(float(load.get("distributed_start", 0.0)))
            extra_node_positions.append(float(load.get("distributed_end", 0.0)))
    node_positions, elements, span_boundary_node_indices, element_span_indices = build_mesh(spans, extra_node_positions=extra_node_positions)
    node_count = len(node_positions)
    if support_specs is None:
        support_nodes = support_node_indices(beam_type, span_boundary_node_indices, node_count)
        support_specs = [
            {
                "id": f"S{index + 1}",
                "x": float(node_positions[node_index]),
                "type": "fixed" if beam_type == "cantilever" and node_index == 0 else "pinned",
                "constraints": ["v", "rz"] if beam_type == "cantilever" and node_index == 0 else ["v"],
                "springs": [],
            }
            for index, node_index in enumerate(support_nodes)
        ]
    support_records = support_records_from_specs(support_specs, node_positions)
    constrained_dofs = constrained_dofs_from_supports(support_records)

    ndof = node_count * 2
    stiffness = np.zeros((ndof, ndof), dtype=float)
    load_vector = np.zeros(ndof, dtype=float)
    element_data: List[Dict[str, Any]] = []

    def load_intensity(x_global: float) -> float:
        intensity = 0.0
        for load in beam_loads:
            current_type = load.get("type")
            if current_type == "uniform":
                intensity += float(load.get("uniform_q_npm", 0.0))
            elif current_type == "linear":
                distributed_start = float(load.get("distributed_start", 0.0))
                distributed_end = float(load.get("distributed_end", 0.0))
                if x_global < distributed_start or x_global > distributed_end:
                    continue
                distributed_start_npm = float(load.get("distributed_start_npm", 0.0))
                distributed_end_npm = float(load.get("distributed_end_npm", 0.0))
                if abs(distributed_end - distributed_start) < 1e-12:
                    intensity += distributed_end_npm
                else:
                    progress = (x_global - distributed_start) / (distributed_end - distributed_start)
                    intensity += distributed_start_npm + progress * (distributed_end_npm - distributed_start_npm)
        return intensity

    for element_index, (x1, x2) in enumerate(elements):
        length = float(x2 - x1)
        span_index = element_span_indices[element_index]
        span_e = to_float(span_E_gpa[min(span_index, len(span_E_gpa) - 1)], E / 1e9) * 1e9
        span_i = to_float(span_I_cm4[min(span_index, len(span_I_cm4) - 1)], I / 1e-8) * 1e-8
        left_node = element_index
        right_node = element_index + 1
        dofs = [left_node * 2, left_node * 2 + 1, right_node * 2, right_node * 2 + 1]
        EI = span_e * span_i
        if beam_theory == "timoshenko":
            shear_stiffness = float(shear_correction_factor) * float(G or E / 2.6) * float(A or 0.012)
            k_local = timoshenko_beam_element_stiffness(EI, shear_stiffness, length)
        else:
            k_local = beam_element_stiffness(EI, length)
        f_local = beam_element_equivalent_load(x1, length, load_intensity)

        for load in beam_loads:
            if load.get("type") != "point":
                continue
            point_position = float(load.get("point_position", 0.0))
            point_load_n = float(load.get("point_load_n", 0.0))
            is_last_element = element_index == len(elements) - 1
            in_element = (x1 <= point_position < x2) or (is_last_element and abs(point_position - x2) <= 1e-12)
            if in_element:
                local_x = min(max(point_position - x1, 0.0), length)
                f_local += beam_point_equivalent_load(local_x, length, point_load_n)

        stiffness[np.ix_(dofs, dofs)] += k_local
        load_vector[dofs] += f_local
        element_data.append(
            {
                "index": element_index,
                "x_start": x1,
                "x_end": x2,
                "length": length,
                "dofs": dofs,
                "k_local": k_local,
                "f_local": f_local,
            }
        )

    spring_reactions: Dict[int, float] = {}
    for record in support_records:
        node_index = int(record["node_index"])
        for spring in record.get("springs", []):
            dof = str(spring.get("dof") or "v")
            matrix_index = node_index * 2 + (1 if dof == "rz" else 0)
            if dof == "rz":
                stiffness_value = to_si(float(spring.get("stiffnessKnMPerRad", 0.0)), "rotational_stiffness", "kN.m/rad")
            else:
                stiffness_value = to_si(float(spring.get("stiffnessKnPerM", 0.0)), "stiffness", "kN/m")
            stiffness[matrix_index, matrix_index] += stiffness_value
            spring_reactions[matrix_index] = stiffness_value

    free_dofs = [i for i in range(ndof) if i not in constrained_dofs]
    if not free_dofs:
        raise ValueError("约束条件过多，系统无自由度可求解")

    displacement = np.zeros(ndof, dtype=float)
    k_ff = stiffness[np.ix_(free_dofs, free_dofs)]
    f_f = load_vector[free_dofs]
    if np.linalg.matrix_rank(k_ff) < len(free_dofs):
        raise ValueError("梁模型刚度矩阵奇异，请检查支座与跨度设置")

    displacement[free_dofs] = np.linalg.solve(k_ff, f_f)
    reactions = stiffness @ displacement - load_vector

    x_values: List[float] = []
    v_values: List[float] = []
    moment_values: List[float] = []
    shear_values: List[float] = []
    reaction_summary: List[Dict[str, Any]] = []

    for support_index, record in enumerate(support_records):
        node_index = int(record["node_index"])
        vertical_dof = node_index * 2
        moment_dof = node_index * 2 + 1
        spring_vertical = -spring_reactions.get(vertical_dof, 0.0) * displacement[vertical_dof]
        spring_moment = -spring_reactions.get(moment_dof, 0.0) * displacement[moment_dof]
        reaction_summary.append(
            {
                "id": record.get("id", f"S{support_index + 1}"),
                "position": round(float(node_positions[node_index]), 6),
                "x": round(float(node_positions[node_index]), 6),
                "type": record.get("type", "pinned"),
                "vertical": round(from_si(float(reactions[vertical_dof] + spring_vertical), "force", "kN"), 4),
                "moment": round(from_si(float(reactions[moment_dof] + spring_moment), "moment", "kN.m"), 4),
                "springVertical": round(from_si(float(spring_vertical), "force", "kN"), 4),
                "springMoment": round(from_si(float(spring_moment), "moment", "kN.m"), 4),
            }
        )

    for element in element_data:
        dofs = element["dofs"]
        d_local = displacement[dofs]
        sample_count = max(8, int(math.ceil(element["length"] / total_length * 80)))
        local_x = np.linspace(0.0, element["length"], sample_count)
        for index, lx in enumerate(local_x):
            if index == sample_count - 1 and element["index"] < len(element_data) - 1:
                continue
            xi = lx / element["length"]
            displacement_value = float(shape_functions(xi, element["length"]) @ d_local)
            internal_forces = element["k_local"] @ d_local - element["f_local"]
            x_values.append(element["x_start"] + lx)
            v_values.append(displacement_value)
            moment_values.append(float(internal_forces[1]))
            shear_values.append(float(internal_forces[0]))

    x_values.append(total_length)
    v_values.append(float(displacement[-2]))
    moment_values.append(moment_values[-1] if moment_values else 0.0)
    shear_values.append(shear_values[-1] if shear_values else 0.0)

    deflections_mm = [abs(v) * 1000.0 for v in v_values]
    max_index = int(np.argmax(deflections_mm)) if deflections_mm else 0
    max_deflection_mm = float(deflections_mm[max_index]) if deflections_mm else 0.0
    max_deflection_position_m = float(x_values[max_index]) if x_values else 0.0
    allowable_mm = total_length * 1000.0 / DEFLECTION_LIMIT_RATIO
    status = "合格" if max_deflection_mm <= allowable_mm else "需校核"

    load_items: List[Dict[str, Any]] = []
    for load in beam_loads:
        current_type = load.get("type")
        if current_type == "uniform":
            load_items.append({"type": "uniform", "start": 0.0, "end": total_length, "magnitudeKnPerM": round(from_si(float(load.get("uniform_q_npm", 0.0)), "distributed", "kN/m"), 4)})
        elif current_type == "point":
            load_items.append({"type": "point", "position": round(float(load.get("point_position", 0.0)), 6), "magnitudeKn": round(from_si(float(load.get("point_load_n", 0.0)), "force", "kN"), 4)})
        elif current_type == "linear":
            load_items.append(
                {
                    "type": "linear",
                    "start": round(float(load.get("distributed_start", 0.0)), 6),
                    "end": round(float(load.get("distributed_end", 0.0)), 6),
                    "startMagnitudeKnPerM": round(from_si(float(load.get("distributed_start_npm", 0.0)), "distributed", "kN/m"), 4),
                    "endMagnitudeKnPerM": round(from_si(float(load.get("distributed_end_npm", 0.0)), "distributed", "kN/m"), 4),
                }
            )

    query_results: List[Dict[str, Any]] = []
    for point in query_points_m or []:
        x = min(max(float(point), 0.0), total_length)
        query_results.append(
            {
                "xM": round(x, 6),
                "deflectionMm": round(from_si(float(-np.interp(x, x_values, v_values)), "deflection", "mm"), 6),
                "momentKnM": round(from_si(float(np.interp(x, x_values, moment_values)), "moment", "kN.m"), 6),
                "shearKn": round(from_si(float(np.interp(x, x_values, shear_values)), "force", "kN"), 6),
            }
        )

    return {
        "x_data": round_list(x_values, 6),
        "v_data": round_list([-v for v in v_values], 8),
        "support_positions": round_list([float(record["x"]) for record in support_records], 6),
        "support_specs": list(support_specs),
        "span_boundaries": round_list(cumulative(spans), 6),
        "element_end_moments": round_list(moment_values, 6),
        "element_end_shears": round_list(shear_values, 6),
        "reactions": reaction_summary,
        "queryResults": query_results,
        "load_items": load_items,
        "solver": "finite_element",
        "beamTheory": beam_theory,
        "beamTheoryLabel": "Timoshenko 梁理论" if beam_theory == "timoshenko" else "Euler-Bernoulli 梁理论",
        "warnings": ["Timoshenko 选项采用一阶剪切变形梁单元近似，适用于短深梁趋势校核。"] if beam_theory == "timoshenko" else [],
        "teachingNotes": {
            "theory": "Euler-Bernoulli 梁理论忽略剪切变形；Timoshenko 梁理论近似考虑剪切变形。",
            "resultMetrics": "梁系主控指标为挠度、弯矩、剪力和支座反力。",
            "signConvention": "计算内核采用 SI 单位，接口按 m、kN、kN·m、mm 输出。",
        },
        "symbolicCheck": build_symbolic_check(
            beam_type=beam_type,
            load_type=load_type,
            support_specs=support_specs,
            total_length=total_length,
            uniform_q_npm=float(beam_loads[0].get("uniform_q_npm", 0.0)) if len(beam_loads) == 1 and beam_loads[0].get("type") == "uniform" else 0.0,
            E=E,
            I=I,
        ),
        "max_deflection_mm": round(max_deflection_mm, 4),
        "max_deflection_position_m": round(max_deflection_position_m, 6),
        "allowable_mm": round(allowable_mm, 4),
        "status": status,
    }


def build_time_history(reference_load_kn_per_m: float, freq: float, duration: float) -> Tuple[List[float], List[float]]:
    t_data = np.linspace(0.0, duration, 512)
    q0 = reference_load_kn_per_m
    q_data = q0 * (
        1
        + 0.1 * np.sin(2 * np.pi * freq * t_data)
        + 0.05 * np.sin(4 * np.pi * freq * t_data) * np.exp(-0.2 * t_data)
    )
    return t_data.tolist(), q_data.tolist()
