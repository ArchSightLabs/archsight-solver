from __future__ import annotations

import math

import numpy as np
import pytest

from backend.solver.frame.corotational import evaluate_corotational_member
from backend.solver.frame.elements import member_stiffness_local, member_transform


E = 210.0e9
A = 120.0e-4
I = 8_000.0e-8


def _rigid_motion(point: tuple[float, float], angle: float, translation: tuple[float, float]) -> tuple[float, float]:
    x, y = point
    cosine = math.cos(angle)
    sine = math.sin(angle)
    return (
        cosine * x - sine * y + translation[0],
        sine * x + cosine * y + translation[1],
    )


def test_corotational_member_is_objective_under_finite_rigid_motion():
    start = (1.2, -0.4)
    end = (4.7, 2.1)
    angle = math.radians(67.0)
    moved_start = _rigid_motion(start, angle, (3.0, -1.5))
    moved_end = _rigid_motion(end, angle, (3.0, -1.5))
    displacements = np.array(
        [
            moved_start[0] - start[0],
            moved_start[1] - start[1],
            angle,
            moved_end[0] - end[0],
            moved_end[1] - end[1],
            angle,
        ],
        dtype=float,
    )

    state = evaluate_corotational_member(start, end, displacements, E=E, A=A, I=I)

    assert state.current_length == pytest.approx(state.reference_length, rel=1e-12)
    assert state.basic_deformations == pytest.approx(np.zeros(3), abs=1e-11)
    assert state.internal_force == pytest.approx(np.zeros(6), abs=1e-5)


def test_corotational_tangent_matches_central_difference_of_internal_force():
    start = (-0.3, 0.8)
    end = (4.2, 3.4)
    displacements = np.array([0.12, -0.08, 0.09, 0.31, 0.16, -0.06], dtype=float)
    state = evaluate_corotational_member(start, end, displacements, E=E, A=A, I=I)
    numerical = np.zeros((6, 6), dtype=float)
    epsilon = 1e-7
    for column in range(6):
        plus = displacements.copy()
        minus = displacements.copy()
        plus[column] += epsilon
        minus[column] -= epsilon
        force_plus = evaluate_corotational_member(start, end, plus, E=E, A=A, I=I).internal_force
        force_minus = evaluate_corotational_member(start, end, minus, E=E, A=A, I=I).internal_force
        numerical[:, column] = (force_plus - force_minus) / (2.0 * epsilon)

    assert state.tangent_stiffness == pytest.approx(numerical, rel=2e-7, abs=2e-2)
    assert state.tangent_stiffness == pytest.approx(state.tangent_stiffness.T, abs=1e-7)


def test_corotational_zero_state_matches_existing_linear_frame_stiffness():
    start = (1.0, -0.5)
    end = (5.5, 2.5)
    length = math.hypot(end[0] - start[0], end[1] - start[1])
    cosine = (end[0] - start[0]) / length
    sine = (end[1] - start[1]) / length
    transform = member_transform(cosine, sine)
    expected = transform.T @ member_stiffness_local(E, A, I, length) @ transform

    state = evaluate_corotational_member(start, end, np.zeros(6), E=E, A=A, I=I)

    assert state.internal_force == pytest.approx(np.zeros(6), abs=1e-10)
    assert state.tangent_stiffness == pytest.approx(expected, rel=1e-12, abs=1e-5)


def test_corotational_axial_force_softens_in_compression_and_stiffens_in_tension():
    start = (0.0, 0.0)
    end = (4.0, 0.0)
    zero = evaluate_corotational_member(start, end, np.zeros(6), E=E, A=A, I=I)
    tension = evaluate_corotational_member(start, end, np.array([0.0, 0.0, 0.0, 0.004, 0.0, 0.0]), E=E, A=A, I=I)
    compression = evaluate_corotational_member(start, end, np.array([0.0, 0.0, 0.0, -0.004, 0.0, 0.0]), E=E, A=A, I=I)
    transverse_mode = np.array([0.0, -0.5, 0.0, 0.0, 0.5, 0.0])

    zero_stiffness = float(transverse_mode @ zero.tangent_stiffness @ transverse_mode)
    tension_stiffness = float(transverse_mode @ tension.tangent_stiffness @ transverse_mode)
    compression_stiffness = float(transverse_mode @ compression.tangent_stiffness @ transverse_mode)

    assert tension.basic_forces[0] > 0.0
    assert compression.basic_forces[0] < 0.0
    assert compression_stiffness < zero_stiffness < tension_stiffness


def test_corotational_release_has_zero_end_moment_and_no_released_rotational_stiffness():
    state = evaluate_corotational_member(
        (0.0, 0.0),
        (4.0, 0.0),
        np.array([0.0, 0.03, 0.12, 0.0, -0.02, -0.04]),
        E=E,
        A=A,
        I=I,
        release_dofs=[2],
    )

    assert state.basic_forces[1] == pytest.approx(0.0, abs=1e-8)
    assert state.internal_force[2] == pytest.approx(0.0, abs=1e-8)
    assert state.tangent_stiffness[2, :] == pytest.approx(np.zeros(6), abs=1e-8)
    assert state.tangent_stiffness[:, 2] == pytest.approx(np.zeros(6), abs=1e-8)


def test_corotational_thermal_extension_is_part_of_basic_strain_not_a_display_offset():
    length = 5.0
    thermal_extension = 1.2e-5 * 30.0 * length
    state = evaluate_corotational_member(
        (0.0, 0.0),
        (length, 0.0),
        np.array([0.0, 0.0, 0.0, thermal_extension, 0.0, 0.0]),
        E=E,
        A=A,
        I=I,
        thermal_extension=thermal_extension,
    )

    assert state.basic_deformations == pytest.approx(np.zeros(3), abs=1e-12)
    assert state.internal_force == pytest.approx(np.zeros(6), abs=1e-6)
