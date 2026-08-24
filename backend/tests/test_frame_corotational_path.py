from __future__ import annotations

import math

import numpy as np
import pytest

from backend.solver.frame.nonlinear_path import solve_corotational_path


def _cantilever(*, axial_kn: float, lateral_kn: float, length_m: float = 4.0, inertia_cm4: float = 1500.0) -> dict:
    return {
        "template": "explicit",
        "nodes": [
            {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
            {"id": "N2", "x": 0.0, "y": length_m, "supportType": "free"},
        ],
        "members": [
            {
                "id": "C1",
                "start": "N1",
                "end": "N2",
                "E_GPa": 210.0,
                "A_cm2": 220.0,
                "I_cm4": inertia_cm4,
                "kind": "column",
            }
        ],
        "loads": [
            {"type": "nodal", "node": "N2", "fxKn": lateral_kn, "fyKn": -axial_kn, "mzKnM": 0.0},
        ],
    }


def _tip(result) -> tuple[float, float, float]:
    return tuple(float(value) for value in result.displacements[3:6])


def test_corotational_path_matches_linear_cantilever_in_small_displacement_limit():
    length = 4.0
    lateral_kn = 0.001
    result = solve_corotational_path(
        _cantilever(axial_kn=0.0, lateral_kn=lateral_kn, length_m=length),
        options={"initialStep": 0.25, "maxStep": 0.5},
    )
    expected = lateral_kn * 1000.0 * length**3 / (3.0 * 210.0e9 * 1500.0e-8)

    assert result.success is True
    assert result.equilibrium_status == "converged"
    assert _tip(result)[0] == pytest.approx(expected, rel=2e-6)
    assert result.load_factor == pytest.approx(1.0, abs=1e-12)
    assert result.path_trace["schema"] == "NonlinearPathTrace@1"


def test_corotational_path_reports_compression_amplification_and_tension_stiffening():
    lateral_kn = 2.0
    neutral = solve_corotational_path(_cantilever(axial_kn=0.0, lateral_kn=lateral_kn))
    compression = solve_corotational_path(_cantilever(axial_kn=120.0, lateral_kn=lateral_kn))
    tension = solve_corotational_path(_cantilever(axial_kn=-120.0, lateral_kn=lateral_kn))

    assert neutral.success and compression.success and tension.success
    assert abs(_tip(tension)[0]) < abs(_tip(neutral)[0]) < abs(_tip(compression)[0])
    assert compression.stability_status in {"stable", "near_critical"}
    assert tension.stability_status == "stable"
    key_points = compression.path_trace["keyPoints"]
    assert {point["kind"] for point in key_points} >= {"start", "residual_peak", "last_converged"}
    assert all(point["source"] and isinstance(point["sourceIndex"], int) for point in key_points)


def test_equilibrium_convergence_is_not_reported_as_stability_above_euler_load():
    length = 4.0
    e = 210.0e9
    i = 1500.0e-8
    cantilever_pcr_kn = math.pi**2 * e * i / ((2.0 * length) ** 2) / 1000.0
    result = solve_corotational_path(
        _cantilever(axial_kn=1.2 * cantilever_pcr_kn, lateral_kn=0.0, length_m=length),
        options={"initialStep": 0.1, "maxStep": 0.1},
    )

    assert result.success is True
    assert result.equilibrium_status == "converged"
    assert result.stability_status == "unstable"
    assert result.path_trace["summary"]["minimumTangentEigenvalue"] < 0.0
    assert any(record["stabilityStatus"] == "unstable" for record in result.path_trace["steps"])


def test_corotational_path_preserves_last_converged_state_after_cutback_exhaustion():
    result = solve_corotational_path(
        _cantilever(axial_kn=300.0, lateral_kn=60.0, length_m=6.0, inertia_cm4=120.0),
        options={
            "initialStep": 1.0,
            "minStep": 0.2,
            "maxStep": 1.0,
            "maxIterations": 1,
            "maxCutbacks": 2,
            "relativeResidualTolerance": 1e-14,
            "absoluteResidualToleranceN": 1e-12,
        },
    )

    assert result.success is False
    assert result.equilibrium_status == "not_converged"
    assert result.load_factor == pytest.approx(0.0, abs=1e-12)
    assert result.termination_reason in {"minimum_step_exhausted", "maximum_cutbacks_exhausted"}
    assert result.path_trace["lastConverged"]["loadFactor"] == pytest.approx(0.0, abs=1e-12)
    assert result.path_trace["attempts"]
    assert any(attempt["status"] == "cutback" for attempt in result.path_trace["attempts"])
    assert result.path_trace["finalAttempt"]["status"] == "failed"
    assert {point["kind"] for point in result.path_trace["keyPoints"]} >= {"cutback", "failure"}


def test_corotational_path_supports_temperature_strain_and_prescribed_displacement():
    structure = _cantilever(axial_kn=0.0, lateral_kn=0.0)
    structure["nodes"][1]["supportType"] = "roller"
    structure["nodes"][1]["supportAngleDeg"] = 0.0
    structure["nodes"][1]["supportDisplacements"] = [{"dof": "n", "displacementMm": 1.5}]
    structure["loads"] = [
        {"type": "temperature", "member": "C1", "deltaTempC": 30.0, "alphaPerC": 1.2e-5},
    ]

    result = solve_corotational_path(structure)

    assert result.success is True
    normal_displacement = float(result.displacements[3])
    assert normal_displacement == pytest.approx(0.0015, abs=1e-10)
    assert np.all(np.isfinite(result.reactions))


def test_explicit_initial_imperfection_changes_reference_geometry_and_response():
    perfect = solve_corotational_path(_cantilever(axial_kn=120.0, lateral_kn=0.0))
    imperfect = solve_corotational_path(
        _cantilever(axial_kn=120.0, lateral_kn=0.0),
        options={
            "initialImperfection": {
                "type": "explicit",
                "nodeOffsets": [{"nodeId": "N2", "uxMm": 8.0, "uyMm": 0.0}],
            }
        },
    )

    assert perfect.success and imperfect.success
    assert _tip(perfect)[0] == pytest.approx(0.0, abs=1e-12)
    assert abs(_tip(imperfect)[0]) > 1e-6
    evidence = imperfect.path_trace["mesh"]["initialImperfection"]
    assert evidence["type"] == "explicit"
    assert evidence["maximumAmplitudeMm"] == pytest.approx(8.0, abs=1e-9)


def test_fixed_preload_is_converged_before_variable_load_path():
    structure = _cantilever(axial_kn=0.0, lateral_kn=0.0)
    structure["loads"] = [
        {"type": "nodal", "node": "N2", "fxKn": 0.0, "fyKn": -120.0, "mzKnM": 0.0, "pathRole": "fixed"},
        {"type": "nodal", "node": "N2", "fxKn": 2.0, "fyKn": 0.0, "mzKnM": 0.0, "pathRole": "variable"},
    ]

    result = solve_corotational_path(structure, options={"initialStep": 0.25, "maxStep": 0.5})

    assert result.success is True
    assert result.fixed_load_factor == pytest.approx(1.0)
    assert result.load_factor == pytest.approx(1.0)
    steps = result.path_trace["steps"]
    preload_end = next(step for step in steps if step["pathPhase"] == "fixed_preload" and step["fixedLoadFactor"] == 1.0)
    assert preload_end["loadFactor"] == pytest.approx(0.0)
    assert any(step["pathPhase"] == "variable" and step["loadFactor"] > 0.0 for step in steps)
    assert result.path_trace["control"]["type"] == "fixed_preload_then_adaptive_variable_load"


def test_corotational_path_stops_with_evidence_when_accepted_step_limit_is_reached():
    result = solve_corotational_path(
        _cantilever(axial_kn=0.0, lateral_kn=0.001),
        options={"initialStep": 0.25, "maxStep": 0.25, "maxAcceptedSteps": 1},
    )

    assert result.success is False
    assert result.termination_reason == "maximum_accepted_steps_exhausted"
    assert result.load_factor == pytest.approx(0.25)
    assert result.path_trace["summary"]["acceptedSteps"] == 1
    assert result.path_trace["finalAttempt"]["status"] == "failed"
    assert result.path_trace["finalAttempt"]["terminationReason"] == "maximum_accepted_steps_exhausted"


def test_fixed_only_load_path_finishes_after_preload_without_a_fake_variable_phase():
    structure = _cantilever(axial_kn=0.0, lateral_kn=0.0)
    structure["loads"] = [
        {"type": "nodal", "node": "N2", "fxKn": 0.0, "fyKn": -120.0, "mzKnM": 0.0, "pathRole": "fixed"},
    ]

    result = solve_corotational_path(structure, options={"initialStep": 0.25, "maxStep": 0.5})

    assert result.success is True
    assert result.fixed_load_factor == pytest.approx(1.0)
    assert result.load_factor == pytest.approx(0.0)
    assert {step["pathPhase"] for step in result.path_trace["steps"]} == {"fixed_preload"}
    assert result.path_trace["summary"]["equilibriumStatus"] == "converged"
    assert result.path_trace["control"]["type"] == "adaptive_fixed_load_control"


def test_playback_keyframes_remain_bounded_and_distributed_over_long_paths():
    result = solve_corotational_path(
        _cantilever(axial_kn=0.0, lateral_kn=0.001),
        options={"initialStep": 0.01, "maxStep": 0.01, "minStep": 0.01},
    )

    keyframes = result.path_trace["keyframes"]
    assert len(keyframes) == 48
    assert keyframes[0]["loadFactor"] == pytest.approx(0.0)
    assert keyframes[-1]["loadFactor"] == pytest.approx(1.0)
    assert any(0.2 <= frame["loadFactor"] <= 0.3 for frame in keyframes)
    assert any(0.45 <= frame["loadFactor"] <= 0.55 for frame in keyframes)
    assert any(0.7 <= frame["loadFactor"] <= 0.8 for frame in keyframes)
    assert any(0.85 <= frame["loadFactor"] < 1.0 for frame in keyframes)
