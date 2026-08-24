from __future__ import annotations

import math
from typing import Any, Dict, List, Mapping, Sequence

import numpy as np

from backend.presenters.frame.assembler import build_frame_solution_response
from backend.solver.frame.assembler import assemble_global_system
from backend.solver.frame.elements import member_transform
from backend.solver.frame.nonlinear_path import CorotationalPathResult
from backend.solver.frame.recover import recover_node_results


def build_corotational_solution_response(
    *,
    request: Mapping[str, Any],
    structure: Mapping[str, Any],
    result: CorotationalPathResult,
) -> Dict[str, Any]:
    """Project a refined nonlinear path back to the public frame contract."""

    original_node_count = len(structure.get("nodes", []))
    original_dof_count = original_node_count * 3
    node_results = recover_node_results(
        list(structure.get("nodes", [])),
        np.asarray(result.displacements[:original_dof_count], dtype=float),
        np.asarray(result.reactions[:original_dof_count], dtype=float),
        [
            spring
            for spring in result.assembly.get("spring_records", [])
            if int(spring.get("matrix_index", original_dof_count)) < original_dof_count
        ],
    )
    imperfection_offsets = {
        str(item.get("nodeId")): item
        for item in result.path_trace.get("mesh", {}).get("initialImperfection", {}).get("nodeOffsets", [])
        if isinstance(item, Mapping)
    }
    for node_result in node_results:
        offset = imperfection_offsets.get(str(node_result["nodeId"]), {})
        initial_ux = float(offset.get("uxMm", 0.0))
        initial_uy = float(offset.get("uyMm", 0.0))
        node_result["initialImperfectionUxMm"] = initial_ux
        node_result["initialImperfectionUyMm"] = initial_uy
        node_result["totalUxMm"] = float(node_result["uxMm"]) + initial_ux
        node_result["totalUyMm"] = float(node_result["uyMm"]) + initial_uy
        node_result["totalResultantMm"] = math.hypot(node_result["totalUxMm"], node_result["totalUyMm"])
    records_by_id = {str(record["id"]): record for record in result.assembly["member_records"]}
    member_segments = result.path_trace.get("mesh", {}).get("memberSegments", {})
    member_results: List[Dict[str, Any]] = []
    member_diagrams: List[Dict[str, Any]] = []
    for member in structure.get("members", []):
        member_id = str(member["id"])
        segment_ids = [str(item) for item in member_segments.get(member_id, [])]
        if not segment_ids:
            continue
        segment_end_forces: List[np.ndarray] = []
        segment_records: List[Mapping[str, Any]] = []
        for segment_id in segment_ids:
            record = records_by_id[segment_id]
            state = result.member_states[segment_id]
            segment_records.append(record)
            segment_end_forces.append(
                _current_local_end_force(
                    record,
                    state,
                    result.load_factor,
                    result.fixed_load_factor,
                )
            )
        member_results.append(_member_result(member, segment_records, segment_end_forces))
        member_diagrams.append(
            _member_diagram(
                member_id=member_id,
                segment_records=segment_records,
                segment_states=[result.member_states[segment_id] for segment_id in segment_ids],
                segment_end_forces=segment_end_forces,
                load_factor=result.load_factor,
                fixed_load_factor=result.fixed_load_factor,
            )
        )

    original_assembly = assemble_global_system(dict(structure), solver_backend=request.get("solver_backend", "auto"))
    last_iteration = result.path_trace.get("iterations", [])[-1] if result.path_trace.get("iterations") else {}
    diagnostics = {
        "equilibriumRmsRelativeError": float(last_iteration.get("equilibriumResidualRelative", 0.0)),
        "equilibriumMaxResidualN": float(last_iteration.get("equilibriumMaxResidualN", 0.0)),
        "constraintRank": None,
        "freeDofCount": sum(result.path_trace.get("steps", [{}])[-1].get("tangentInertia", {}).values())
        if result.path_trace.get("steps")
        else None,
        "solver": {
            "solverBackend": "dense-corotational-newton",
            "globalDofCount": int(result.displacements.size),
            "originalDofCount": original_dof_count,
            "algorithmId": "corotational_newton_v1",
        },
    }
    response = build_frame_solution_response(
        request=dict(request),
        structure=dict(structure),
        node_results=node_results,
        member_results=member_results,
        member_diagrams=member_diagrams,
        member_records=original_assembly["member_records"],
        diagnostics=diagnostics,
    )
    response["diagnostics"]["nonlinearPath"] = {
        "equilibriumStatus": result.equilibrium_status,
        "stabilityStatus": result.stability_status,
        "loadFactor": result.load_factor,
        "terminationReason": result.termination_reason,
        "mesh": result.path_trace.get("mesh", {}),
    }
    response["summary"]["method"] = "二维框架共回转全量牛顿弹性几何非线性分析"
    return response


def _current_local_end_force(
    record: Mapping[str, Any],
    state,
    load_factor: float,
    fixed_load_factor: float,
) -> np.ndarray:
    current_transform = member_transform(
        math.cos(float(state.current_angle)),
        math.sin(float(state.current_angle)),
    )
    internal_local = current_transform @ np.asarray(state.internal_force, dtype=float)
    member_load_local = (
        np.asarray(record.get("f_fixed_local", np.zeros(6)), dtype=float) * float(fixed_load_factor)
        + np.asarray(record.get("f_variable_local", record["f_local"]), dtype=float) * float(load_factor)
    )
    member_load_global = record["transform"].T @ member_load_local
    member_load_current_local = current_transform @ member_load_global
    return np.asarray(internal_local - member_load_current_local, dtype=float)


def _member_result(
    member: Mapping[str, Any],
    segment_records: Sequence[Mapping[str, Any]],
    segment_end_forces: Sequence[np.ndarray],
) -> Dict[str, Any]:
    start_force = segment_end_forces[0]
    end_force = segment_end_forces[-1]
    return {
        "memberId": str(member["id"]),
        "kind": member.get("kind", "generic"),
        "startNode": member["start"],
        "endNode": member["end"],
        "axialStartKn": float(start_force[0] / 1000.0),
        "shearStartKn": float(start_force[1] / 1000.0),
        "momentStartKnM": float(-start_force[2] / 1000.0),
        "axialEndKn": float(-end_force[3] / 1000.0),
        "shearEndKn": float(-end_force[4] / 1000.0),
        "momentEndKnM": float(end_force[5] / 1000.0),
        "lengthM": float(sum(float(record["length"]) for record in segment_records)),
    }


def _member_diagram(
    *,
    member_id: str,
    segment_records: Sequence[Mapping[str, Any]],
    segment_states: Sequence[Any],
    segment_end_forces: Sequence[np.ndarray],
    load_factor: float,
    fixed_load_factor: float,
) -> Dict[str, Any]:
    total_length = float(sum(float(record["length"]) for record in segment_records))
    stations_m: List[float] = []
    axial: List[float] = []
    shear: List[float] = []
    moment: List[float] = []
    deflection: List[float] = []
    offset = 0.0
    for record, state, end_force in zip(segment_records, segment_states, segment_end_forces):
        length = float(record["length"])
        local_loads = _loads_in_current_local(record, state, load_factor, fixed_load_factor)
        local_stations = _segment_stations(length, local_loads)
        n_start = float(end_force[0])
        v_start = float(end_force[1])
        m_start = float(end_force[2])
        phi_start = float(state.basic_deformations[1])
        phi_end = float(state.basic_deformations[2])
        for x in local_stations:
            axial_n = n_start
            shear_n = v_start
            moment_nm = m_start - v_start * x
            for load in local_loads:
                if load["type"] == "distributed":
                    axial_force, _ = _integrated_linear_load(load, x, "qx")
                    shear_force, load_moment = _integrated_linear_load(load, x, "qy")
                    axial_n += axial_force
                    shear_n += shear_force
                    moment_nm -= load_moment
                elif load["type"] == "member_point" and x + 1e-10 >= load["xM"]:
                    axial_n += load["pxN"]
                    shear_n += load["pyN"]
                    moment_nm -= load["pyN"] * (x - load["xM"])
            ratio = x / length if length else 0.0
            relative_v = length * (
                (ratio - 2.0 * ratio**2 + ratio**3) * phi_start
                + (-ratio**2 + ratio**3) * phi_end
            )
            stations_m.append(round(offset + x, 9))
            axial.append(round(axial_n / 1000.0, 6))
            shear.append(round(shear_n / 1000.0, 6))
            moment.append(round(-moment_nm / 1000.0, 6))
            deflection.append(round(relative_v * 1000.0, 6))
        offset += length
    return {
        "memberId": member_id,
        "stationsM": [round(value, 6) for value in stations_m],
        "stations": [round(value / total_length, 6) if total_length else 0.0 for value in stations_m],
        "axialKn": axial,
        "shearKn": shear,
        "momentKnM": moment,
        "deflectionMm": deflection,
    }


def _loads_in_current_local(
    record: Mapping[str, Any],
    state,
    load_factor: float,
    fixed_load_factor: float,
) -> List[Dict[str, Any]]:
    current_cosine = math.cos(float(state.current_angle))
    current_sine = math.sin(float(state.current_angle))
    initial_cosine = float(record["cosine"])
    initial_sine = float(record["sine"])
    transformed: List[Dict[str, Any]] = []
    for load in record.get("loads", []):
        load_type = str(load.get("type"))
        path_factor = fixed_load_factor if str(load.get("pathRole") or "variable") == "fixed" else load_factor
        if load_type == "distributed":
            qx_start, qy_start = _rotate_components(
                float(load.get("qxStartNPerM", 0.0)) * path_factor,
                float(load.get("qyStartNPerM", 0.0)) * path_factor,
                initial_cosine,
                initial_sine,
                current_cosine,
                current_sine,
            )
            qx_end, qy_end = _rotate_components(
                float(load.get("qxEndNPerM", 0.0)) * path_factor,
                float(load.get("qyEndNPerM", 0.0)) * path_factor,
                initial_cosine,
                initial_sine,
                current_cosine,
                current_sine,
            )
            transformed.append(
                {
                    "type": "distributed",
                    "xStartM": float(load.get("xStartM", 0.0)),
                    "xEndM": float(load.get("xEndM", record["length"])),
                    "qxStartNPerM": qx_start,
                    "qxEndNPerM": qx_end,
                    "qyStartNPerM": qy_start,
                    "qyEndNPerM": qy_end,
                }
            )
        elif load_type == "member_point":
            px, py = _rotate_components(
                float(load.get("pxN", 0.0)) * path_factor,
                float(load.get("pyN", 0.0)) * path_factor,
                initial_cosine,
                initial_sine,
                current_cosine,
                current_sine,
            )
            transformed.append(
                {
                    "type": "member_point",
                    "xM": float(load.get("xM", 0.0)),
                    "pxN": px,
                    "pyN": py,
                }
            )
    return transformed


def _rotate_components(
    local_x: float,
    local_y: float,
    initial_cosine: float,
    initial_sine: float,
    current_cosine: float,
    current_sine: float,
) -> tuple[float, float]:
    global_x = initial_cosine * local_x - initial_sine * local_y
    global_y = initial_sine * local_x + initial_cosine * local_y
    return (
        current_cosine * global_x + current_sine * global_y,
        -current_sine * global_x + current_cosine * global_y,
    )


def _segment_stations(length: float, loads: Sequence[Mapping[str, Any]]) -> List[float]:
    stations = [float(value) for value in np.linspace(0.0, length, 5)]
    for load in loads:
        if load.get("type") == "distributed":
            stations.extend([float(load["xStartM"]), float(load["xEndM"])])
        elif load.get("type") == "member_point":
            stations.append(float(load["xM"]))
    return sorted({round(min(length, max(0.0, value)), 9) for value in stations})


def _integrated_linear_load(load: Mapping[str, Any], x: float, axis: str) -> tuple[float, float]:
    x_start = float(load["xStartM"])
    x_end = float(load["xEndM"])
    if x <= x_start + 1e-12 or x_end <= x_start + 1e-12:
        return 0.0, 0.0
    upper = min(x, x_end)
    distance = upper - x_start
    span = x_end - x_start
    q_start = float(load[f"{axis}StartNPerM"])
    q_end = float(load[f"{axis}EndNPerM"])
    slope = (q_end - q_start) / span
    force = q_start * distance + 0.5 * slope * distance**2
    moment = (
        (x - x_start) * q_start * distance
        - 0.5 * q_start * distance**2
        + slope * ((x - x_start) * distance**2 / 2.0 - distance**3 / 3.0)
    )
    return force, moment
