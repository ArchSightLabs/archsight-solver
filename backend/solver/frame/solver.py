from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
from scipy.sparse import issparse

from backend.normalizers.frame.request_normalizer import parse_node_support_dofs
from backend.solver.linear_system import solve_free_dofs


def solve_frame_system(structure: Dict[str, Any], assembly: Dict[str, Any]) -> Dict[str, Any]:
    stiffness = assembly["stiffness"]
    load_vector = assembly["load_vector"]
    nodes = structure["nodes"]
    ndof = len(nodes) * 3

    constrained_dofs: List[int] = []
    constraint_rows: List[np.ndarray] = []
    constraint_values: List[float] = []
    direct_constraint_values: Dict[int, float] = {}
    has_general_constraint = False
    for idx, node in enumerate(nodes):
        support_type = str(node["supportType"])
        prescribed_values = _node_prescribed_values(node)
        if support_type == "roller" and node.get("supportAngleDeg") is not None:
            has_general_constraint = True
            angle = np.deg2rad(float(node["supportAngleDeg"]))
            row = np.zeros(ndof, dtype=float)
            row[idx * 3] = np.cos(angle)
            row[idx * 3 + 1] = np.sin(angle)
            constraint_rows.append(row)
            constraint_values.append(prescribed_values.get("n", 0.0))
            support_dofs = []
        else:
            support_dofs = parse_node_support_dofs(support_type)
        for local_dof in support_dofs:
            _add_direct_constraint(
                idx,
                local_dof,
                ndof,
                constraint_rows,
                constraint_values,
                direct_constraint_values,
                prescribed_values.get(_dof_name(local_dof), 0.0),
            )
        for local_dof in [_dof_index(dof) for dof in node.get("condensedDofs", [])]:
            _add_direct_constraint(
                idx,
                local_dof,
                ndof,
                constraint_rows,
                constraint_values,
                direct_constraint_values,
                0.0,
            )
    constrained_dofs = sorted(direct_constraint_values)
    constraint_matrix = np.vstack(constraint_rows) if constraint_rows else np.zeros((0, ndof), dtype=float)
    constraint_target = np.array(constraint_values, dtype=float) if constraint_values else np.zeros(0, dtype=float)
    constraint_rank = int(np.linalg.matrix_rank(constraint_matrix)) if constraint_rows else 0
    if constraint_rank < 3:
        raise ValueError("框架约束条件不足，系统无稳定自由度可求解")
    free_dofs = [i for i in range(ndof) if i not in constrained_dofs]
    if not free_dofs:
        raise ValueError("框架约束条件过多，系统无自由度可求解")

    if not has_general_constraint:
        prescribed_displacements = np.zeros(ndof, dtype=float)
        for dof, value in direct_constraint_values.items():
            prescribed_displacements[dof] = value
        solved = solve_free_dofs(
            stiffness=stiffness,
            load_vector=load_vector,
            free_dofs=free_dofs,
            singular_message="框架刚度矩阵奇异，请检查支座与构件连接",
            backend=assembly.get("solver_backend", "dense"),
            prescribed_displacements=prescribed_displacements,
        )
        displacements = solved["displacements"]
        reactions = solved["reactions"]
        residual = (stiffness @ displacements - load_vector)[free_dofs]
        load_norm = max(float(np.linalg.norm(load_vector[free_dofs])), 1.0)
        diagnostics = {
            "equilibriumRmsRelativeError": float(np.linalg.norm(residual) / load_norm),
            "equilibriumMaxResidualN": float(np.max(np.abs(residual))) if residual.size else 0.0,
            "constraintRank": constraint_rank,
            "freeDofCount": len(free_dofs),
            "prescribedDofCount": _prescribed_count(constraint_target),
            "solver": solved["diagnostics"],
        }
        return {
            "constrained_dofs": constrained_dofs,
            "free_dofs": free_dofs,
            "constraint_matrix": constraint_matrix,
            "displacements": displacements,
            "reactions": reactions,
            "diagnostics": diagnostics,
        }

    stiffness_dense = stiffness.toarray() if issparse(stiffness) else stiffness
    free_basis = _null_space(constraint_matrix, ndof)
    if free_basis.shape[1] == 0:
        raise ValueError("框架约束条件过多，系统无自由度可求解")

    particular_displacements = _particular_solution(constraint_matrix, constraint_target, ndof)
    k_reduced = free_basis.T @ stiffness_dense @ free_basis
    f_reduced = free_basis.T @ (load_vector - stiffness_dense @ particular_displacements)
    if np.linalg.matrix_rank(k_reduced) < k_reduced.shape[0]:
        raise ValueError("框架刚度矩阵奇异，请检查支座与构件连接")

    generalized_displacements = np.linalg.solve(k_reduced, f_reduced)
    displacements = particular_displacements + free_basis @ generalized_displacements
    reactions = stiffness_dense @ displacements - load_vector
    residual = free_basis.T @ (stiffness_dense @ displacements - load_vector)
    load_norm = max(float(np.linalg.norm(f_reduced)), 1.0)
    diagnostics = {
        "equilibriumRmsRelativeError": float(np.linalg.norm(residual) / load_norm),
        "equilibriumMaxResidualN": float(np.max(np.abs(residual))) if residual.size else 0.0,
        "constraintRank": constraint_rank,
        "freeDofCount": int(free_basis.shape[1]),
        "prescribedDofCount": _prescribed_count(constraint_target),
        "solver": {
            "solverBackend": "dense-nullspace",
            "globalDofCount": ndof,
            "freeDofCount": int(free_basis.shape[1]),
        },
    }

    return {
        "constrained_dofs": constrained_dofs,
        "free_dofs": free_dofs,
        "constraint_matrix": constraint_matrix,
        "displacements": displacements,
        "reactions": reactions,
        "diagnostics": diagnostics,
    }


def _node_prescribed_values(node: Dict[str, Any]) -> Dict[str, float]:
    values: Dict[str, float] = {}
    for displacement in node.get("supportDisplacements", []):
        dof = str(displacement.get("dof") or "").lower()
        if dof == "rz":
            values[dof] = float(np.deg2rad(float(displacement.get("rotationDeg", 0.0))))
        elif dof in {"ux", "uy", "n"}:
            values[dof] = float(displacement.get("displacementMm", 0.0)) / 1000.0
    return values


def _add_direct_constraint(
    node_index: int,
    local_dof: int,
    ndof: int,
    constraint_rows: List[np.ndarray],
    constraint_values: List[float],
    direct_constraint_values: Dict[int, float],
    value: float,
) -> None:
    matrix_index = node_index * 3 + local_dof
    prior = direct_constraint_values.get(matrix_index)
    if prior is not None and abs(prior - value) > 1e-12:
        raise ValueError("框架同一自由度存在互相矛盾的支座位移约束")
    if prior is not None:
        return
    direct_constraint_values[matrix_index] = value
    row = np.zeros(ndof, dtype=float)
    row[matrix_index] = 1.0
    constraint_rows.append(row)
    constraint_values.append(value)


def _particular_solution(constraint_matrix: np.ndarray, constraint_target: np.ndarray, ndof: int) -> np.ndarray:
    if constraint_matrix.size == 0:
        return np.zeros(ndof, dtype=float)
    solution, *_ = np.linalg.lstsq(constraint_matrix, constraint_target, rcond=None)
    residual = constraint_matrix @ solution - constraint_target
    target_norm = max(float(np.linalg.norm(constraint_target)), 1.0)
    if float(np.linalg.norm(residual)) / target_norm > 1e-10:
        raise ValueError("框架支座位移约束与其他边界约束互相矛盾")
    return np.asarray(solution, dtype=float)


def _prescribed_count(values: np.ndarray) -> int:
    return int(np.count_nonzero(np.abs(values) > 1e-12))


def _null_space(constraint_matrix: np.ndarray, ndof: int) -> np.ndarray:
    if constraint_matrix.size == 0:
        return np.eye(ndof, dtype=float)
    _, singular_values, vh = np.linalg.svd(constraint_matrix)
    tolerance = np.finfo(float).eps * max(constraint_matrix.shape) * (singular_values[0] if singular_values.size else 1.0)
    rank = int((singular_values > tolerance).sum())
    return vh[rank:].T.copy()


def _dof_index(dof: str) -> int:
    return {"ux": 0, "uy": 1, "rz": 2}[str(dof).lower()]


def _dof_name(dof_index: int) -> str:
    return {0: "ux", 1: "uy", 2: "rz"}[int(dof_index)]
