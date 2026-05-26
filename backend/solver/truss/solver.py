from __future__ import annotations

from typing import Any, Dict

import numpy as np

from backend.solver.linear_system import solve_free_dofs


def solve_truss_system(assembly: Dict[str, Any]) -> Dict[str, Any]:
    fixed_dofs = assembly["fixed_dofs"]
    free_dofs = assembly["free_dofs"]
    stiffness = assembly["stiffness"]
    forces = assembly["forces"]
    ndof = assembly["ndof"]

    if len(fixed_dofs) < 3:
        raise ValueError("桁架约束条件不足，系统无稳定自由度可求解")
    if not free_dofs:
        raise ValueError("桁架约束条件过多，系统无自由度可求解")

    reduced_forces = forces[free_dofs]

    try:
        solved = solve_free_dofs(
            stiffness=stiffness,
            load_vector=forces,
            free_dofs=free_dofs,
            singular_message="桁架刚度矩阵奇异，请检查支座与杆件连接",
            backend=assembly.get("solver_backend", "dense"),
        )
        displacements = solved["displacements"]
        reactions = solved["reactions"]
    except (np.linalg.LinAlgError, ValueError) as exc:
        raise ValueError("桁架刚度矩阵奇异，请检查支座与杆件连接") from exc

    residual = (stiffness @ displacements - forces)[free_dofs]
    load_norm = max(float(np.linalg.norm(reduced_forces)), 1.0)
    return {
        "displacements": displacements,
        "reactions": reactions,
        "diagnostics": {
            "equilibriumRmsRelativeError": float(np.linalg.norm(residual) / load_norm),
            "equilibriumMaxResidualN": float(np.max(np.abs(residual))) if residual.size else 0.0,
            "freeDofCount": len(free_dofs),
            "fixedDofCount": len(fixed_dofs),
            "solver": solved["diagnostics"],
        },
    }
