from __future__ import annotations

from typing import Any, Dict, List

import numpy as np

from backend.normalizers.frame.request_normalizer import parse_node_support_dofs


def solve_frame_system(structure: Dict[str, Any], assembly: Dict[str, Any]) -> Dict[str, Any]:
    stiffness = assembly["stiffness"]
    load_vector = assembly["load_vector"]
    nodes = structure["nodes"]
    ndof = len(nodes) * 3

    constrained_dofs: List[int] = []
    constraint_rows: List[np.ndarray] = []
    for idx, node in enumerate(nodes):
        support_type = str(node["supportType"])
        if support_type == "roller" and node.get("supportAngleDeg") is not None:
            angle = np.deg2rad(float(node["supportAngleDeg"]))
            row = np.zeros(ndof, dtype=float)
            row[idx * 3] = np.cos(angle)
            row[idx * 3 + 1] = np.sin(angle)
            constraint_rows.append(row)
            support_dofs = []
        else:
            support_dofs = parse_node_support_dofs(support_type)
        for local_dof in [*support_dofs, *[_dof_index(dof) for dof in node.get("condensedDofs", [])]]:
            constrained_dofs.append(idx * 3 + local_dof)
            row = np.zeros(ndof, dtype=float)
            row[idx * 3 + local_dof] = 1.0
            constraint_rows.append(row)
    constrained_dofs = sorted(set(constrained_dofs))
    constraint_matrix = np.vstack(constraint_rows) if constraint_rows else np.zeros((0, ndof), dtype=float)
    constraint_rank = int(np.linalg.matrix_rank(constraint_matrix)) if constraint_rows else 0
    if constraint_rank < 3:
        raise ValueError("框架约束条件不足，系统无稳定自由度可求解")
    free_basis = _null_space(constraint_matrix, ndof)
    if free_basis.shape[1] == 0:
        raise ValueError("框架约束条件过多，系统无自由度可求解")

    k_reduced = free_basis.T @ stiffness @ free_basis
    f_reduced = free_basis.T @ load_vector
    if np.linalg.matrix_rank(k_reduced) < k_reduced.shape[0]:
        raise ValueError("框架刚度矩阵奇异，请检查支座与构件连接")

    generalized_displacements = np.linalg.solve(k_reduced, f_reduced)
    displacements = free_basis @ generalized_displacements
    reactions = stiffness @ displacements - load_vector
    residual = free_basis.T @ (stiffness @ displacements - load_vector)
    load_norm = max(float(np.linalg.norm(f_reduced)), 1.0)
    diagnostics = {
        "equilibriumRmsRelativeError": float(np.linalg.norm(residual) / load_norm),
        "equilibriumMaxResidualN": float(np.max(np.abs(residual))) if residual.size else 0.0,
        "constraintRank": constraint_rank,
        "freeDofCount": int(free_basis.shape[1]),
    }
    free_dofs = [i for i in range(ndof) if i not in constrained_dofs]

    return {
        "constrained_dofs": constrained_dofs,
        "free_dofs": free_dofs,
        "constraint_matrix": constraint_matrix,
        "displacements": displacements,
        "reactions": reactions,
        "diagnostics": diagnostics,
    }


def _null_space(constraint_matrix: np.ndarray, ndof: int) -> np.ndarray:
    if constraint_matrix.size == 0:
        return np.eye(ndof, dtype=float)
    _, singular_values, vh = np.linalg.svd(constraint_matrix)
    tolerance = np.finfo(float).eps * max(constraint_matrix.shape) * (singular_values[0] if singular_values.size else 1.0)
    rank = int((singular_values > tolerance).sum())
    return vh[rank:].T.copy()


def _dof_index(dof: str) -> int:
    return {"ux": 0, "uy": 1, "rz": 2}[str(dof).lower()]
