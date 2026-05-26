import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.api.utils import build_calculation_response
from backend.tests.benchmark_catalog import load_benchmark_catalog


def _beam_payload(solver_backend: str):
    return {
        "analysisType": "beam",
        "projectName": "Dense Sparse Equivalence Beam",
        "materialId": "q345",
        "beamType": "continuous",
        "loadType": "uniform",
        "spans": [4.0, 5.0, 4.0],
        "spanProperties": [
            {"E": 210.0, "I": 4500.0},
            {"E": 206.0, "I": 8000.0},
            {"E": 210.0, "I": 4500.0},
        ],
        "loads": [
            {"type": "uniform", "qKnPerM": 8.0},
            {"type": "point", "pointLoadKn": 18.0, "x": 6.0},
        ],
        "solverBackend": solver_backend,
    }


def test_beam_dense_and_sparse_backends_match_control_values():
    dense = build_calculation_response(_beam_payload("dense"))
    sparse = build_calculation_response(_beam_payload("sparse"))

    assert sparse["diagnostics"]["solver"]["solverBackend"] == "sparse"
    for metric in ("maxDeflectionMm", "maxMomentKnM", "maxShearKn"):
        assert sparse["summary"][metric] == pytest.approx(dense["summary"][metric], rel=1e-8, abs=1e-8)


def test_truss_dense_and_sparse_backends_match_control_values():
    case = next(item for item in load_benchmark_catalog()["cases"] if item["category"] == "truss")
    payload = case["payload"]
    dense = build_calculation_response({**payload, "solverBackend": "dense"})
    sparse = build_calculation_response({**payload, "solverBackend": "sparse"})

    assert sparse["diagnostics"]["solver"]["solverBackend"] == "sparse"
    for metric in ("maxDisplacementMm", "maxAxialForceKn"):
        assert sparse["summary"][metric] == pytest.approx(dense["summary"][metric], rel=1e-8, abs=1e-8)
