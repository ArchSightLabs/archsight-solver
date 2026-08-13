import math
import os
import sys

import pytest
from scipy.linalg import eig as scipy_generalized_eig
from scipy.sparse.linalg import eigsh as scipy_sparse_eigsh

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.solver.frame import stability_mesh
from backend.solver.frame.stability_mesh import solve_frame_stability_mesh


def _expected_euler_critical_load_kn(e_gpa: float, i_cm4: float, length_m: float, effective_length_factor: float) -> float:
    e = e_gpa * 1_000_000_000.0
    i = i_cm4 * 1e-8
    return math.pi**2 * e * i / ((effective_length_factor * length_m) ** 2) / 1000.0


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
