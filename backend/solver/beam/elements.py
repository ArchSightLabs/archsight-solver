from __future__ import annotations

import math

import numpy as np


def shape_functions(xi: float, length: float) -> np.ndarray:
    return np.array(
        [
            1 - 3 * xi**2 + 2 * xi**3,
            length * (xi - 2 * xi**2 + xi**3),
            3 * xi**2 - 2 * xi**3,
            length * (-xi**2 + xi**3),
        ],
        dtype=float,
    )


def beam_element_stiffness(EI: float, length: float) -> np.ndarray:
    L = float(length)
    factor = EI / (L**3)
    return factor * np.array(
        [
            [12, 6 * L, -12, 6 * L],
            [6 * L, 4 * L**2, -6 * L, 2 * L**2],
            [-12, -6 * L, 12, -6 * L],
            [6 * L, 2 * L**2, -6 * L, 4 * L**2],
        ],
        dtype=float,
    )


def timoshenko_beam_element_stiffness(EI: float, shear_stiffness: float, length: float) -> np.ndarray:
    L = float(length)
    if shear_stiffness <= 0:
        return beam_element_stiffness(EI, L)
    phi = 12.0 * EI / (shear_stiffness * L**2)
    factor = EI / (L**3 * (1.0 + phi))
    return factor * np.array(
        [
            [12, 6 * L, -12, 6 * L],
            [6 * L, (4 + phi) * L**2, -6 * L, (2 - phi) * L**2],
            [-12, -6 * L, 12, -6 * L],
            [6 * L, (2 - phi) * L**2, -6 * L, (4 + phi) * L**2],
        ],
        dtype=float,
    )


def beam_element_equivalent_load(x_start: float, length: float, load_intensity_fn) -> np.ndarray:
    gauss_points = [
        (-math.sqrt(3.0 / 5.0), 5.0 / 9.0),
        (0.0, 8.0 / 9.0),
        (math.sqrt(3.0 / 5.0), 5.0 / 9.0),
    ]
    result = np.zeros(4, dtype=float)
    for xi_raw, weight in gauss_points:
        xi = 0.5 * (xi_raw + 1.0)
        x_global = x_start + xi * length
        q_x = float(load_intensity_fn(x_global))
        result += shape_functions(xi, length) * q_x * weight * length / 2.0
    return result


def beam_point_equivalent_load(local_x: float, length: float, load_value: float) -> np.ndarray:
    xi = local_x / length
    return shape_functions(xi, length) * float(load_value)
