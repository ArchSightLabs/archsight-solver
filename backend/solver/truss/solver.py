from __future__ import annotations

from typing import Any, Dict

import numpy as np


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

    reduced = stiffness[np.ix_(free_dofs, free_dofs)]
    reduced_forces = forces[free_dofs]

    if np.linalg.matrix_rank(reduced) < reduced.shape[0]:
        raise ValueError("桁架刚度矩阵奇异，请检查支座与杆件连接")

    try:
        displacements = np.zeros(ndof, dtype=float)
        displacements[free_dofs] = np.linalg.solve(reduced, reduced_forces)
    except np.linalg.LinAlgError as exc:  # pragma: no cover
        raise ValueError("桁架刚度矩阵奇异，请检查支座与杆件连接") from exc

    reactions = stiffness @ displacements - forces
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
        },
    }
