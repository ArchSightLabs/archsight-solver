from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Sequence

import numpy as np


_MIN_LENGTH_M = 1e-12


@dataclass(frozen=True)
class CorotationalMemberState:
    """Deterministic state of a two-node 2D corotational beam-column.

    The element uses three basic deformations: chord extension and the two
    nodal rotations relative to the current chord. Axial force is positive in
    tension in this low-level contract. Application presenters may convert the
    sign to the frame result convention, where compression is reported as
    positive.
    """

    reference_length: float
    current_length: float
    reference_angle: float
    current_angle: float
    chord_rotation: float
    basic_deformations: np.ndarray
    basic_forces: np.ndarray
    internal_force: np.ndarray
    tangent_stiffness: np.ndarray


def evaluate_corotational_member(
    reference_start: Sequence[float],
    reference_end: Sequence[float],
    displacements: Sequence[float],
    *,
    E: float,
    A: float,
    I: float,
    release_dofs: Sequence[int] | None = None,
    thermal_extension: float = 0.0,
) -> CorotationalMemberState:
    """Evaluate internal force and the analytic consistent tangent.

    ``displacements`` follows the global frame ordering
    ``[ux1, uy1, rz1, ux2, uy2, rz2]``. Rotational releases use the existing
    local element DOF identifiers (2 for the start and 5 for the end). The
    thermal extension is a stress-free change of chord length in metres.
    """

    start = _point(reference_start, "start")
    end = _point(reference_end, "end")
    displacement = np.asarray(displacements, dtype=float).reshape(-1)
    if displacement.size != 6 or not np.all(np.isfinite(displacement)):
        raise ValueError("二维共回转单元位移必须包含 6 个有限数值自由度")
    modulus = _positive(E, "弹性模量 E")
    area = _positive(A, "截面面积 A")
    inertia = _positive(I, "截面惯性矩 I")
    thermal = float(thermal_extension)
    if not math.isfinite(thermal):
        raise ValueError("二维共回转单元温度伸长必须为有限数值")

    reference_delta = end - start
    reference_length = float(np.linalg.norm(reference_delta))
    if reference_length <= _MIN_LENGTH_M:
        raise ValueError("二维共回转单元初始长度必须大于 0")
    reference_angle = math.atan2(float(reference_delta[1]), float(reference_delta[0]))

    current_start = start + displacement[[0, 1]]
    current_end = end + displacement[[3, 4]]
    current_delta = current_end - current_start
    current_length = float(np.linalg.norm(current_delta))
    if current_length <= _MIN_LENGTH_M:
        raise ValueError("二维共回转单元当前长度接近 0，无法建立当前弦坐标系")
    cosine = float(current_delta[0] / current_length)
    sine = float(current_delta[1] / current_length)
    current_angle = math.atan2(float(current_delta[1]), float(current_delta[0]))
    chord_rotation = _angle_difference(current_angle, reference_angle)

    basic_deformations = np.array(
        [
            current_length - reference_length - thermal,
            float(displacement[2]) - chord_rotation,
            float(displacement[5]) - chord_rotation,
        ],
        dtype=float,
    )
    basic_stiffness = _basic_stiffness(modulus, area, inertia, reference_length)
    effective_basic_stiffness = _apply_basic_rotational_releases(basic_stiffness, release_dofs or ())
    basic_forces = effective_basic_stiffness @ basic_deformations

    transform_gradient = _basic_deformation_gradient(cosine, sine, current_length)
    internal_force = transform_gradient.T @ basic_forces
    tangent_stiffness = transform_gradient.T @ effective_basic_stiffness @ transform_gradient
    tangent_stiffness += float(basic_forces[0]) * _length_hessian(cosine, sine, current_length)
    tangent_stiffness -= float(basic_forces[1] + basic_forces[2]) * _angle_hessian(cosine, sine, current_length)
    tangent_stiffness = 0.5 * (tangent_stiffness + tangent_stiffness.T)

    return CorotationalMemberState(
        reference_length=reference_length,
        current_length=current_length,
        reference_angle=reference_angle,
        current_angle=current_angle,
        chord_rotation=chord_rotation,
        basic_deformations=basic_deformations,
        basic_forces=np.asarray(basic_forces, dtype=float),
        internal_force=np.asarray(internal_force, dtype=float),
        tangent_stiffness=np.asarray(tangent_stiffness, dtype=float),
    )


def _point(value: Sequence[float], label: str) -> np.ndarray:
    point = np.asarray(value, dtype=float).reshape(-1)
    if point.size != 2 or not np.all(np.isfinite(point)):
        raise ValueError(f"二维共回转单元 {label} 坐标必须包含 2 个有限数值")
    return point


def _positive(value: float, label: str) -> float:
    numeric = float(value)
    if not math.isfinite(numeric) or numeric <= 0.0:
        raise ValueError(f"二维共回转单元{label}必须大于 0")
    return numeric


def _angle_difference(current: float, reference: float) -> float:
    difference = float(current) - float(reference)
    return math.atan2(math.sin(difference), math.cos(difference))


def _basic_stiffness(E: float, A: float, I: float, length: float) -> np.ndarray:
    axial = E * A / length
    bending = E * I / length
    return np.array(
        [
            [axial, 0.0, 0.0],
            [0.0, 4.0 * bending, 2.0 * bending],
            [0.0, 2.0 * bending, 4.0 * bending],
        ],
        dtype=float,
    )


def _apply_basic_rotational_releases(stiffness: np.ndarray, release_dofs: Sequence[int]) -> np.ndarray:
    released = sorted({{2: 1, 5: 2}[int(dof)] for dof in release_dofs if int(dof) in {2, 5}})
    if not released:
        return stiffness
    retained = [index for index in range(3) if index not in released]
    retained_stiffness = stiffness[np.ix_(retained, retained)]
    coupling = stiffness[np.ix_(retained, released)]
    released_stiffness = stiffness[np.ix_(released, released)]
    condensed = retained_stiffness - coupling @ np.linalg.solve(released_stiffness, coupling.T)
    effective = np.zeros((3, 3), dtype=float)
    effective[np.ix_(retained, retained)] = condensed
    return effective


def _basic_deformation_gradient(cosine: float, sine: float, length: float) -> np.ndarray:
    axial = np.array([-cosine, -sine, 0.0, cosine, sine, 0.0], dtype=float)
    chord = np.array([-sine / length, cosine / length, 0.0, sine / length, -cosine / length, 0.0], dtype=float)
    start_rotation = chord.copy()
    start_rotation[2] = 1.0
    end_rotation = chord.copy()
    end_rotation[5] = 1.0
    return np.vstack((axial, start_rotation, end_rotation))


def _embed_translation_hessian(delta_hessian: np.ndarray) -> np.ndarray:
    matrix = np.zeros((6, 6), dtype=float)
    start = [0, 1]
    end = [3, 4]
    matrix[np.ix_(start, start)] = delta_hessian
    matrix[np.ix_(start, end)] = -delta_hessian
    matrix[np.ix_(end, start)] = -delta_hessian
    matrix[np.ix_(end, end)] = delta_hessian
    return matrix


def _length_hessian(cosine: float, sine: float, length: float) -> np.ndarray:
    transverse = np.array([-sine, cosine], dtype=float)
    return _embed_translation_hessian(np.outer(transverse, transverse) / length)


def _angle_hessian(cosine: float, sine: float, length: float) -> np.ndarray:
    inverse_length_squared = 1.0 / (length * length)
    delta_hessian = inverse_length_squared * np.array(
        [
            [2.0 * cosine * sine, sine * sine - cosine * cosine],
            [sine * sine - cosine * cosine, -2.0 * cosine * sine],
        ],
        dtype=float,
    )
    return _embed_translation_hessian(delta_hessian)
