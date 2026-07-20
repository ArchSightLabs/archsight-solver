from __future__ import annotations

import math
from typing import Any, Dict, List

from backend.solver.truss.dofs import node_dofs


def recover_node_results(nodes: List[Dict[str, Any]], displacements, reactions) -> Dict[str, Any]:
    node_results: List[Dict[str, Any]] = []
    displacement_magnitudes: List[float] = []
    for idx, node in enumerate(nodes):
        ux, uy = node_dofs(idx)
        ux_mm = float(displacements[ux] * 1000.0)
        uy_mm = float(displacements[uy] * 1000.0)
        disp_mm = float(math.hypot(ux_mm, uy_mm))
        displacement_magnitudes.append(disp_mm)
        node_results.append(
            {
                "nodeId": node["id"],
                "x": float(node["x"]),
                "y": float(node["y"]),
                "uxMm": ux_mm,
                "uyMm": uy_mm,
                "displacementMm": disp_mm,
                "rxKn": float(reactions[ux] / 1000.0),
                "ryKn": float(reactions[uy] / 1000.0),
                "supportType": node["supportType"],
            }
        )
    return {
        "node_results": node_results,
        "displacement_magnitudes": displacement_magnitudes,
    }


def recover_member_results(
    members: List[Dict[str, Any]],
    member_geometries: List[Dict[str, Any]],
    node_index: Dict[str, int],
    displacements,
) -> Dict[str, Any]:
    member_results: List[Dict[str, Any]] = []
    axial_forces: List[float] = []
    for member, geometry in zip(members, member_geometries):
        s_idx = node_index[member["start"]]
        e_idx = node_index[member["end"]]
        s_ux, s_uy = node_dofs(s_idx)
        e_ux, e_uy = node_dofs(e_idx)
        delta = (
            geometry["cosine"] * (displacements[e_ux] - displacements[s_ux])
            + geometry["sine"] * (displacements[e_uy] - displacements[s_uy])
        )
        thermal_force_kn = geometry.get("thermalForceKn", 0.0)
        axial_force_kn = float((geometry["E"] * geometry["A"] / geometry["lengthM"]) * delta / 1000.0) - thermal_force_kn
        axial_forces.append(abs(axial_force_kn))
        stress_mpa = float(axial_force_kn * 10.0 / member["A_cm2"]) if member["A_cm2"] else 0.0
        if abs(axial_force_kn) < 1e-9:
            state = "near_zero"
        elif axial_force_kn > 0:
            state = "tension"
        else:
            state = "compression"
        member_results.append(
            {
                "memberId": member["id"],
                "kind": member["kind"],
                "startNode": member["start"],
                "endNode": member["end"],
                "lengthM": geometry["lengthM"],
                "axialForceKn": axial_force_kn,
                "axialStressMpa": stress_mpa,
                "forceState": state,
            }
        )
    return {
        "member_results": member_results,
        "axial_forces": axial_forces,
    }
