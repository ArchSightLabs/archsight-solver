from __future__ import annotations

import warnings
from typing import Any, Dict, Sequence

import numpy as np
from scipy.sparse import issparse, lil_matrix
from scipy.sparse.linalg import MatrixRankWarning, spsolve

from backend.config import get_solver_backend, get_sparse_dof_threshold


SPARSE_BACKENDS = {"sparse"}
SUPPORTED_BACKENDS = {"auto", "dense", "sparse"}


def normalize_solver_backend(value: Any) -> str:
    requested = str(value or get_solver_backend()).strip().lower()
    return requested if requested in SUPPORTED_BACKENDS else get_solver_backend()


def select_solver_backend(requested: str | None, ndof: int) -> str:
    backend = normalize_solver_backend(requested)
    if backend == "auto":
        return "sparse" if int(ndof) >= get_sparse_dof_threshold() else "dense"
    return backend


def create_stiffness_matrix(ndof: int, backend: str):
    if backend in SPARSE_BACKENDS:
        return lil_matrix((ndof, ndof), dtype=float)
    return np.zeros((ndof, ndof), dtype=float)


def add_local_stiffness(stiffness, dofs: Sequence[int], local_stiffness: np.ndarray) -> None:
    if issparse(stiffness):
        for row_index, global_row in enumerate(dofs):
            for col_index, global_col in enumerate(dofs):
                stiffness[global_row, global_col] += float(local_stiffness[row_index, col_index])
        return
    stiffness[np.ix_(dofs, dofs)] += local_stiffness


def add_diagonal_stiffness(stiffness, matrix_index: int, value: float) -> None:
    stiffness[matrix_index, matrix_index] += float(value)


def solve_free_dofs(
    *,
    stiffness,
    load_vector: np.ndarray,
    free_dofs: Sequence[int],
    singular_message: str,
    backend: str,
    prescribed_displacements: np.ndarray | None = None,
) -> Dict[str, Any]:
    free_dof_list = list(free_dofs)
    prescribed = np.zeros(load_vector.shape[0], dtype=float) if prescribed_displacements is None else np.asarray(prescribed_displacements, dtype=float)
    if prescribed.shape[0] != load_vector.shape[0]:
        raise ValueError(singular_message)
    if issparse(stiffness):
        k_ff = stiffness[free_dof_list, :][:, free_dof_list].tocsc()
        f_f = load_vector[free_dof_list] - np.asarray(stiffness[free_dof_list, :] @ prescribed, dtype=float).reshape(len(free_dof_list))
        try:
            with warnings.catch_warnings():
                warnings.simplefilter("error", MatrixRankWarning)
                solved = np.asarray(spsolve(k_ff, f_f), dtype=float)
        except (MatrixRankWarning, ValueError, RuntimeError) as exc:
            raise ValueError(singular_message) from exc
        if solved.shape[0] != len(free_dof_list) or not np.all(np.isfinite(solved)):
            raise ValueError(singular_message)
        sparse_nnz = int(k_ff.nnz)
        sparse_density = float(sparse_nnz / max(1, k_ff.shape[0] * k_ff.shape[1]))
    else:
        k_ff = stiffness[np.ix_(free_dof_list, free_dof_list)]
        all_dofs = list(range(load_vector.shape[0]))
        f_f = load_vector[free_dof_list] - stiffness[np.ix_(free_dof_list, all_dofs)] @ prescribed
        if np.linalg.matrix_rank(k_ff) < len(free_dof_list):
            raise ValueError(singular_message)
        solved = np.linalg.solve(k_ff, f_f)
        sparse_nnz = None
        sparse_density = None

    displacement = prescribed.copy()
    displacement[free_dof_list] = solved
    reactions = stiffness @ displacement - load_vector
    reactions = np.asarray(reactions, dtype=float).reshape(load_vector.shape[0])
    diagnostics = {
        "solverBackend": backend,
        "globalDofCount": int(load_vector.shape[0]),
        "freeDofCount": len(free_dof_list),
    }
    if sparse_nnz is not None:
        diagnostics["sparseNnz"] = sparse_nnz
        diagnostics["sparseDensity"] = sparse_density
    return {
        "displacements": displacement,
        "reactions": reactions,
        "diagnostics": diagnostics,
    }
