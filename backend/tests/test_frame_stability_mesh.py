import math
import os
import sys

import pytest
import numpy as np
from scipy.linalg import eig as scipy_generalized_eig
from scipy.sparse.linalg import eigsh as scipy_sparse_eigsh

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.solver.frame import stability_mesh
from backend.solver.frame.stability_mesh import solve_frame_stability_mesh


def _expected_euler_critical_load_kn(e_gpa: float, i_cm4: float, length_m: float, effective_length_factor: float) -> float:
    e = e_gpa * 1_000_000_000.0
    i = i_cm4 * 1e-8
    return math.pi**2 * e * i / ((effective_length_factor * length_m) ** 2) / 1000.0


def _two_identical_pinned_columns():
    structure = {
        "nodes": [
            {"id": "A1", "x": 0.0, "y": 0.0, "supportType": "pinned"},
            {"id": "A2", "x": 0.0, "y": 4.0, "supportType": "pinned"},
            {"id": "B1", "x": 3.0, "y": 0.0, "supportType": "pinned"},
            {"id": "B2", "x": 3.0, "y": 4.0, "supportType": "pinned"},
        ],
        "members": [
            {"id": "C1", "start": "A1", "end": "A2", "E_GPa": 210.0, "A_cm2": 220.0, "I_cm4": 1500.0},
            {"id": "C2", "start": "B1", "end": "B2", "E_GPa": 210.0, "A_cm2": 220.0, "I_cm4": 1500.0},
        ],
    }
    member_results = [
        {"memberId": "C1", "axialStartKn": 1.0, "axialEndKn": 1.0},
        {"memberId": "C2", "axialStartKn": 1.0, "axialEndKn": 1.0},
    ]
    return structure, member_results


@pytest.mark.parametrize(
    ("start_support", "end_support", "effective_length_factor"),
    [
        ("pinned", "pinned", 1.0),
        ("fixed", "pinned", 0.699),
        ("fixed", "fixed", 0.5),
    ],
)
def test_mesh_buckling_matches_euler_for_standard_end_conditions(start_support: str, end_support: str, effective_length_factor: float):
    structure = {
        "nodes": [
            {"id": "N1", "x": 0.0, "y": 0.0, "supportType": start_support},
            {"id": "N2", "x": 0.0, "y": 4.0, "supportType": end_support},
        ],
        "members": [
            {
                "id": "C1",
                "start": "N1",
                "end": "N2",
                "E_GPa": 210.0,
                "A_cm2": 220.0,
                "I_cm4": 1500.0,
                "kind": "column",
            }
        ],
    }
    member_results = [{"memberId": "C1", "axialStartKn": 1.0, "axialEndKn": 1.0}]

    result = solve_frame_stability_mesh(structure, member_results, 1)
    mode = result["modes"][0]
    expected = _expected_euler_critical_load_kn(210.0, 1500.0, 4.0, effective_length_factor)

    assert result["criticalLoadFactor"] == pytest.approx(expected, rel=0.002)
    assert mode["eigenResidualNorm"] <= 1e-8
    assert mode["constraintResidualNorm"] <= 1e-10
    assert len(mode["nodeDisplacements"]) == 2
    assert result["meshDiagnostics"]["solverMode"] == "dense"
    assert result["meshDiagnostics"]["memberSubdivisions"][0]["subdivisions"] == 8


def test_mesh_buckling_invokes_the_dense_generalized_eigen_solver(monkeypatch):
    calls = 0

    def tracked_eig(material, geometric):
        nonlocal calls
        calls += 1
        return scipy_generalized_eig(material, geometric)

    monkeypatch.setattr(stability_mesh, "dense_generalized_eig", tracked_eig)
    structure = {
        "nodes": [
            {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "pinned"},
            {"id": "N2", "x": 0.0, "y": 4.0, "supportType": "pinned"},
        ],
        "members": [
            {"id": "C1", "start": "N1", "end": "N2", "E_GPa": 210.0, "A_cm2": 220.0, "I_cm4": 1500.0},
        ],
    }

    result = solve_frame_stability_mesh(
        structure,
        [{"memberId": "C1", "axialStartKn": 1.0, "axialEndKn": 1.0}],
        1,
    )

    assert calls == 1
    assert result["meshDiagnostics"]["solverMode"] == "dense"
    assert result["modes"][0]["eigenResidualNorm"] <= 1e-8


def test_mesh_buckling_sparse_generalized_eigen_path_is_release_gated(monkeypatch):
    calls = 0

    def tracked_eigsh(*args, **kwargs):
        nonlocal calls
        calls += 1
        return scipy_sparse_eigsh(*args, **kwargs)

    monkeypatch.setattr(stability_mesh, "eigsh", tracked_eigsh)
    structure = {
        "nodes": [
            {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "pinned"},
            {"id": "N2", "x": 0.0, "y": 4.0, "supportType": "pinned"},
        ],
        "members": [
            {"id": "C1", "start": "N1", "end": "N2", "E_GPa": 210.0, "A_cm2": 220.0, "I_cm4": 1500.0},
        ],
    }

    result = solve_frame_stability_mesh(
        structure,
        [{"memberId": "C1", "axialStartKn": 1.0, "axialEndKn": 1.0}],
        1,
        dense_dof_limit=1,
    )

    expected = _expected_euler_critical_load_kn(210.0, 1500.0, 4.0, 1.0)
    assert calls == 1
    assert result["meshDiagnostics"]["solverMode"] == "sparse"
    assert result["criticalLoadFactor"] == pytest.approx(expected, rel=0.002)
    assert result["modes"][0]["eigenResidualNorm"] <= 1e-8


def test_repeated_mode_subspace_is_canonical_under_rotated_dense_eigen_bases(monkeypatch):
    structure, member_results = _two_identical_pinned_columns()
    rotation_angle = 0.31

    def rotated_degenerate_basis(material, geometric):
        eigenvalues, eigenvectors = scipy_generalized_eig(material, geometric)
        positive = [
            index
            for index, value in enumerate(eigenvalues)
            if abs(value.imag) <= 1e-8 and np.isfinite(value.real) and value.real > 0
        ]
        positive.sort(key=lambda index: float(eigenvalues[index].real))
        first, second = positive[:2]
        cosine = math.cos(rotation_angle)
        sine = math.sin(rotation_angle)
        rotation = np.array([[cosine, -sine], [sine, cosine]], dtype=float)
        eigenvectors[:, [first, second]] = eigenvectors[:, [first, second]] @ rotation
        return eigenvalues, eigenvectors

    monkeypatch.setattr(stability_mesh, "dense_generalized_eig", rotated_degenerate_basis)
    first = solve_frame_stability_mesh(structure, member_results, 2)
    rotation_angle = 1.17
    second = solve_frame_stability_mesh(structure, member_results, 2)

    assert first["modes"] == second["modes"]
    assert first["modes"][0]["criticalLoadFactor"] == pytest.approx(first["modes"][1]["criticalLoadFactor"], rel=1e-10)
    assert all(mode["eigenResidualNorm"] <= 1e-8 for mode in first["modes"])
    assert all(mode["constraintResidualNorm"] <= 1e-10 for mode in first["modes"])
    first_mode_nodes = {node["nodeId"]: node for node in first["modes"][0]["nodeDisplacements"]}
    second_mode_nodes = {node["nodeId"]: node for node in first["modes"][1]["nodeDisplacements"]}
    assert abs(first_mode_nodes["A1"]["rz"]) > 0.1
    assert abs(first_mode_nodes["B1"]["rz"]) <= 1e-8
    assert abs(second_mode_nodes["A1"]["rz"]) <= 1e-8
    assert abs(second_mode_nodes["B1"]["rz"]) > 0.1


def test_near_repeated_modes_are_ritz_refined_and_sorted_before_numbering():
    angle = math.radians(60.0)
    physical_basis = np.array(
        [
            [math.cos(angle), -math.sin(angle), 0.0],
            [math.sin(angle), math.cos(angle), 0.0],
            [0.0, 0.0, 1.0],
        ],
        dtype=float,
    )
    expected_values = np.array([1.0, 1.0 + 9e-9, 10.0], dtype=float)
    material = physical_basis @ np.diag(expected_values) @ physical_basis.T
    geometric = np.eye(3, dtype=float)
    mixing_angle = math.radians(27.0)
    mixing = np.array(
        [
            [math.cos(mixing_angle), -math.sin(mixing_angle)],
            [math.sin(mixing_angle), math.cos(mixing_angle)],
        ],
        dtype=float,
    )
    mixed_vectors = physical_basis[:, :2] @ mixing
    candidates = [
        (float(expected_values[0]), mixed_vectors[:, 0]),
        (float(expected_values[1]), mixed_vectors[:, 1]),
    ]

    refined = stability_mesh._canonicalize_eigen_clusters(
        candidates,
        material,
        geometric,
        np.eye(3, dtype=float),
        {"nodes": [{"id": "N1", "x": 0.0, "y": 0.0}]},
    )

    assert [value for value, _ in refined] == sorted(value for value, _ in refined)
    assert refined[0][0] == pytest.approx(expected_values[0], abs=1e-12)
    assert refined[1][0] == pytest.approx(expected_values[1], abs=1e-12)
    assert all(stability_mesh._buckling_residual(material, geometric, vector, value) <= 1e-8 for value, vector in refined)


def test_sparse_boundary_cluster_uses_dense_fallback_instead_of_truncating():
    candidates, solver_mode = stability_mesh._sparse_eigen_candidates(
        np.eye(9, dtype=float),
        np.eye(9, dtype=float),
        2,
    )

    assert solver_mode == "dense-fallback"
    assert len(candidates) == 9
    assert all(value == pytest.approx(1.0) for value, _ in candidates)


def test_repeated_mode_subspace_is_stable_on_forced_sparse_path():
    structure, member_results = _two_identical_pinned_columns()

    first = solve_frame_stability_mesh(structure, member_results, 2, dense_dof_limit=1)
    second = solve_frame_stability_mesh(structure, member_results, 2, dense_dof_limit=1)

    assert first["meshDiagnostics"]["solverMode"] == "sparse"
    assert first["modes"] == second["modes"]
    assert first["criticalLoadFactor"] == min(mode["criticalLoadFactor"] for mode in first["modes"])
