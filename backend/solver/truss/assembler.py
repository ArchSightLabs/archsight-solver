from __future__ import annotations

from typing import Any, Dict, List

import numpy as np

from backend.common.numbers import to_float
from backend.normalizers.truss.request_normalizer import node_dofs, node_support_dofs
from backend.solver.truss.elements import member_geometry, truss_member_stiffness


def assemble_system(request: Dict[str, Any]) -> Dict[str, Any]:
    nodes = request["structure"]["nodes"]
    members = request["structure"]["members"]
    loads = request["structure"]["loads"]

    node_index = {node["id"]: idx for idx, node in enumerate(nodes)}
    ndof = len(nodes) * 2
    stiffness = np.zeros((ndof, ndof), dtype=float)
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
        for i in range(4):
            for j in range(4):
                stiffness[dofs[i], dofs[j]] += ke[i, j]
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
            }
        )

    for load in loads:
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
    }
