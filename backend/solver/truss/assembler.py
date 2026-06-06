from __future__ import annotations

from typing import Any, Dict, List

import numpy as np

from backend.common.numbers import to_float
from backend.normalizers.truss.request_normalizer import node_dofs, node_support_dofs
from backend.solver.truss.elements import member_geometry, truss_member_stiffness
from backend.solver.linear_system import add_local_stiffness, create_stiffness_matrix, select_solver_backend


def assemble_system(request: Dict[str, Any]) -> Dict[str, Any]:
    nodes = request["structure"]["nodes"]
    members = request["structure"]["members"]
    loads = request["structure"]["loads"]

    node_index = {node["id"]: idx for idx, node in enumerate(nodes)}
    ndof = len(nodes) * 2
    solver_backend = select_solver_backend(request.get("solver_backend", "auto"), ndof)
    stiffness = create_stiffness_matrix(ndof, solver_backend)
    forces = np.zeros(ndof, dtype=float)

    member_geometries: List[Dict[str, Any]] = []
    for member in members:
        start_node = nodes[node_index[member["start"]]]
        end_node = nodes[node_index[member["end"]]]
        length, cosine, sine = member_geometry(member["id"], start_node, end_node)
        ke = truss_member_stiffness(
            member["E_GPa"] * 1e9,
            member["A_cm2"] * 1e-4,
            cosine,
            sine,
            length,
        )
        s_i, s_j = node_dofs(node_index[member["start"]])
        e_i, e_j = node_dofs(node_index[member["end"]])
        dofs = [s_i, s_j, e_i, e_j]
        add_local_stiffness(stiffness, dofs, ke)

        thermal_force_kn = 0.0
        for load in loads:
            if load.get("type") == "temperature" and load.get("member") == member["id"]:
                delta_temp = to_float(load.get("deltaTempC", 0.0), 0.0)
                alpha = to_float(load.get("alphaPerC", 1.2e-5), 1.2e-5)
                thermal_force_kn += (member["E_GPa"] * 1e9) * (member["A_cm2"] * 1e-4) * alpha * delta_temp / 1000.0

        if abs(thermal_force_kn) > 1e-9:
            forces[s_i] += -thermal_force_kn * cosine * 1000.0
            forces[s_j] += -thermal_force_kn * sine * 1000.0
            forces[e_i] += thermal_force_kn * cosine * 1000.0
            forces[e_j] += thermal_force_kn * sine * 1000.0

        member_geometries.append(
            {
                "memberId": member["id"],
                "startNode": member["start"],
                "endNode": member["end"],
                "lengthM": length,
                "cosine": cosine,
                "sine": sine,
                "E": member["E_GPa"] * 1e9,
                "A": member["A_cm2"] * 1e-4,
                "kind": member["kind"],
                "thermalForceKn": thermal_force_kn,
            }
        )

    for load in loads:
        if load.get("type", "nodal") == "nodal":
            node_idx = node_index[load["node"]]
            ux, uy = node_dofs(node_idx)
            forces[ux] += to_float(load.get("fxKn"), 0.0) * 1000.0
            forces[uy] += to_float(load.get("fyKn"), 0.0) * 1000.0

    fixed_dofs: List[int] = []
    support_dofs_by_node: Dict[str, List[int]] = {}
    for idx, node in enumerate(nodes):
        support_dofs = node_support_dofs(node["supportType"])
        mapped = [node_dofs(idx)[dof] for dof in support_dofs]
        fixed_dofs.extend(mapped)
        support_dofs_by_node[node["id"]] = mapped

    fixed_dofs = sorted(set(fixed_dofs))
    free_dofs = [dof for dof in range(ndof) if dof not in fixed_dofs]

    return {
        "nodes": nodes,
        "members": members,
        "loads": loads,
        "node_index": node_index,
        "ndof": ndof,
        "stiffness": stiffness,
        "forces": forces,
        "member_geometries": member_geometries,
        "fixed_dofs": fixed_dofs,
        "free_dofs": free_dofs,
        "support_dofs_by_node": support_dofs_by_node,
        "solver_backend": solver_backend,
    }
