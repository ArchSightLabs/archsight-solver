from __future__ import annotations

import math
from typing import Any, Dict, List

import numpy as np

from backend.common.numbers import to_float
from backend.solver.frame.elements import apply_rotational_releases, distributed_load_local_vector, member_stiffness_local, member_transform, point_load_local_vector, temperature_load_local_vector
from backend.solver.linear_system import add_diagonal_stiffness, add_local_stiffness, create_stiffness_matrix, select_solver_backend


DOF_INDEX = {"ux": 0, "uy": 1, "rz": 2}


def assemble_global_system(structure: Dict[str, Any], solver_backend: str = "auto") -> Dict[str, Any]:
    nodes = structure["nodes"]
    members = structure["members"]
    loads = structure.get("loads", [])
    node_index = {node["id"]: idx for idx, node in enumerate(nodes)}
    ndof = len(nodes) * 3
    resolved_solver_backend = select_solver_backend(solver_backend, ndof)
    stiffness = create_stiffness_matrix(ndof, resolved_solver_backend)
    load_vector = np.zeros(ndof, dtype=float)
    spring_records: List[Dict[str, Any]] = []

    for load in loads:
        if load["type"] == "nodal":
            idx = node_index[load["node"]]
            load_vector[idx * 3] += to_float(load.get("fxKn"), 0.0) * 1000.0
            load_vector[idx * 3 + 1] += to_float(load.get("fyKn"), 0.0) * 1000.0
            load_vector[idx * 3 + 2] += to_float(load.get("mzKnM"), 0.0) * 1000.0

    for idx, node in enumerate(nodes):
        for spring in node.get("springs", []):
            dof = str(spring.get("dof") or "").lower()
            local_dof = DOF_INDEX[dof]
            matrix_index = idx * 3 + local_dof
            if dof == "rz":
                stiffness_value = to_float(spring.get("stiffnessKnMPerRad"), 0.0) * 1000.0
            else:
                stiffness_value = to_float(spring.get("stiffnessKnPerM"), 0.0) * 1000.0
            add_diagonal_stiffness(stiffness, matrix_index, stiffness_value)
            spring_records.append(
                {
                    "node": node["id"],
                    "dof": dof,
                    "matrix_index": matrix_index,
                    "stiffness": stiffness_value,
                }
            )

    member_records: List[Dict[str, Any]] = []

    for index, member in enumerate(members):
        start = nodes[node_index[member["start"]]]
        end = nodes[node_index[member["end"]]]
        x1, y1 = float(start["x"]), float(start["y"])
        x2, y2 = float(end["x"]), float(end["y"])
        dx = x2 - x1
        dy = y2 - y1
        length = math.hypot(dx, dy)
        if length <= 0:
            raise ValueError(f"构件 {member['id']} 长度必须大于 0")

        cosine = dx / length
        sine = dy / length
        e = to_float(member.get("E_GPa"), 210.0) * 1e9
        a = to_float(member.get("A_cm2"), 120.0) * 1e-4
        i = to_float(member.get("I_cm4"), 8000.0) * 1e-8
        k_base_local = member_stiffness_local(e, a, i, length)
        transform = member_transform(cosine, sine)

        dofs = [
            node_index[member["start"]] * 3,
            node_index[member["start"]] * 3 + 1,
            node_index[member["start"]] * 3 + 2,
            node_index[member["end"]] * 3,
            node_index[member["end"]] * 3 + 1,
            node_index[member["end"]] * 3 + 2,
        ]

        f_base_local = np.zeros(6, dtype=float)
        load_components: List[Dict[str, Any]] = []
        for load in loads:
            if load["type"] == "distributed" and load["member"] == member["id"]:
                q_start_kn, q_end_kn, direction, start_ratio, end_ratio = _distributed_load_contract(load)
                qx_start, qy_start = _load_components_to_local(direction, q_start_kn * 1000.0, cosine, sine)
                qx_end, qy_end = _load_components_to_local(direction, q_end_kn * 1000.0, cosine, sine)
                f_base_local += distributed_load_local_vector(
                    qy_start,
                    length,
                    wx_npm=qx_start,
                    wx_end_npm=qx_end,
                    wy_end_npm=qy_end,
                    start_ratio=start_ratio,
                    end_ratio=end_ratio,
                )
                load_components.append(
                    {
                        "type": "distributed",
                        "direction": direction,
                        "qxStartNPerM": qx_start,
                        "qxEndNPerM": qx_end,
                        "qyStartNPerM": qy_start,
                        "qyEndNPerM": qy_end,
                        "startRatio": start_ratio,
                        "endRatio": end_ratio,
                        "xStartM": start_ratio * length,
                        "xEndM": end_ratio * length,
                    }
                )
            elif load["type"] == "member_point" and load["member"] == member["id"]:
                force_kn, position_ratio, direction = _member_point_load_contract(load)
                px, py = _load_components_to_local(direction, force_kn * 1000.0, cosine, sine)
                f_base_local += point_load_local_vector(
                    py,
                    length,
                    px_n=px,
                    position_ratio=position_ratio,
                )
                load_components.append(
                    {
                        "type": "member_point",
                        "direction": direction,
                        "pxN": px,
                        "pyN": py,
                        "positionRatio": position_ratio,
                        "xM": position_ratio * length,
                    }
                )
            elif load["type"] == "temperature" and load["member"] == member["id"]:
                delta_temp_c, alpha_per_c = _temperature_load_contract(load)
                f_base_local += temperature_load_local_vector(e, a, alpha_per_c, delta_temp_c)
                load_components.append(
                    {
                        "type": "temperature",
                        "deltaTempC": delta_temp_c,
                        "alphaPerC": alpha_per_c,
                        "freeStrain": alpha_per_c * delta_temp_c,
                    }
                )

        release_dofs = _release_dofs(member.get("endReleases", {}))
        k_local, f_local = apply_rotational_releases(k_base_local, f_base_local, release_dofs)
        k_global = transform.T @ k_local @ transform
        load_vector[dofs] += transform.T @ f_local
        add_local_stiffness(stiffness, dofs, k_global)
        member_records.append(
            {
                "index": index,
                "id": member["id"],
                "kind": member.get("kind", "generic"),
                "start": member["start"],
                "end": member["end"],
                "start_coords": (x1, y1),
                "end_coords": (x2, y2),
                "length": length,
                "cosine": cosine,
                "sine": sine,
                "e": e,
                "a": a,
                "i": i,
                "k_base_local": k_base_local,
                "k_local": k_local,
                "transform": transform,
                "f_base_local": f_base_local,
                "f_local": f_local,
                "loads": load_components,
                "endReleases": member.get("endReleases", {}),
                "section": member.get("section", {}),
                "release_dofs": release_dofs,
                "dofs": dofs,
            }
        )

    return {
        "stiffness": stiffness,
        "load_vector": load_vector,
        "member_records": member_records,
        "node_index": node_index,
        "spring_records": spring_records,
        "solver_backend": resolved_solver_backend,
    }


def _release_dofs(end_releases: Dict[str, Any]) -> List[int]:
    release_dofs: List[int] = []
    if "rz" in end_releases.get("start", []):
        release_dofs.append(2)
    if "rz" in end_releases.get("end", []):
        release_dofs.append(5)
    return release_dofs


def _distributed_load_contract(load: Dict[str, Any]) -> tuple[float, float, str, float, float]:
    if "qStartKnPerM" in load or "qEndKnPerM" in load:
        q_start = to_float(load.get("qStartKnPerM", load.get("wyKnPerM", 0.0)), 0.0)
        q_end = to_float(load.get("qEndKnPerM", load.get("wyKnPerM", q_start)), q_start)
        direction = str(load.get("direction") or "local_y").lower()
    else:
        q_start = q_end = to_float(load.get("wyKnPerM"), 0.0)
        direction = str(load.get("direction") or "local_y").lower()
    start_ratio = min(1.0, max(0.0, to_float(load.get("startRatio", load.get("loadStartRatio", 0.0)), 0.0)))
    end_ratio = min(1.0, max(0.0, to_float(load.get("endRatio", load.get("loadEndRatio", 1.0)), 1.0)))
    if end_ratio < start_ratio:
        start_ratio, end_ratio = end_ratio, start_ratio
        q_start, q_end = q_end, q_start
    if end_ratio - start_ratio <= 1e-12:
        end_ratio = min(1.0, start_ratio + 1e-6)
        if end_ratio - start_ratio <= 1e-12:
            start_ratio = max(0.0, end_ratio - 1e-6)
    return q_start, q_end, direction, start_ratio, end_ratio


def _member_point_load_contract(load: Dict[str, Any]) -> tuple[float, float, str]:
    force = to_float(load.get("forceKn", load.get("magnitudeKn", load.get("pKn", 0.0))), 0.0)
    position_ratio = min(1.0, max(0.0, to_float(load.get("positionRatio", load.get("ratio", 0.5)), 0.5)))
    direction = str(load.get("direction") or "local_y").lower()
    return force, position_ratio, direction


def _temperature_load_contract(load: Dict[str, Any]) -> tuple[float, float]:
    delta_temp = to_float(load.get("deltaTempC", load.get("temperatureDeltaC", load.get("deltaTC", 0.0))), 0.0)
    alpha = to_float(load.get("alphaPerC", load.get("thermalExpansionPerC", 1.2e-5)), 1.2e-5)
    return delta_temp, alpha


def _load_components_to_local(direction: str, q_kn_per_m: float, cosine: float, sine: float) -> tuple[float, float]:
    if direction == "global_y":
        return sine * q_kn_per_m, cosine * q_kn_per_m
    return 0.0, q_kn_per_m
