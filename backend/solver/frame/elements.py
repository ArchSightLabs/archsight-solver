from __future__ import annotations

import numpy as np


def member_stiffness_local(E: float, A: float, I: float, length: float) -> np.ndarray:
    L = float(length)
    EA_L = E * A / L
    EI = E * I
    factor_1 = 12.0 * EI / (L**3)
    factor_2 = 6.0 * EI / (L**2)
    factor_3 = 4.0 * EI / L
    factor_4 = 2.0 * EI / L
    return np.array(
        [
            [EA_L, 0.0, 0.0, -EA_L, 0.0, 0.0],
            [0.0, factor_1, factor_2, 0.0, -factor_1, factor_2],
            [0.0, factor_2, factor_3, 0.0, -factor_2, factor_4],
            [-EA_L, 0.0, 0.0, EA_L, 0.0, 0.0],
            [0.0, -factor_1, -factor_2, 0.0, factor_1, -factor_2],
            [0.0, factor_2, factor_4, 0.0, -factor_2, factor_3],
        ],
        dtype=float,
    )


def member_transform(cosine: float, sine: float) -> np.ndarray:
    return np.array(
        [
            [cosine, sine, 0.0, 0.0, 0.0, 0.0],
            [-sine, cosine, 0.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0, cosine, sine, 0.0],
            [0.0, 0.0, 0.0, -sine, cosine, 0.0],
            [0.0, 0.0, 0.0, 0.0, 0.0, 1.0],
        ],
        dtype=float,
    )


def distributed_load_local_vector(
    wy_npm: float,
    length: float,
    *,
    wx_npm: float = 0.0,
    wx_end_npm: float | None = None,
    wy_end_npm: float | None = None,
    start_ratio: float = 0.0,
    end_ratio: float = 1.0,
) -> np.ndarray:
    wx_start = float(wx_npm)
    wy_start = float(wy_npm)
    wx_end = wx_start if wx_end_npm is None else float(wx_end_npm)
    wy_end = wy_start if wy_end_npm is None else float(wy_end_npm)
    if max(abs(wx_start), abs(wx_end), abs(wy_start), abs(wy_end)) < 1e-12:
        return np.zeros(6, dtype=float)
    L = float(length)
    start = min(1.0, max(0.0, float(start_ratio)))
    end = min(1.0, max(0.0, float(end_ratio)))
    if end < start:
        start, end = end, start
        wx_start, wx_end = wx_end, wx_start
        wy_start, wy_end = wy_end, wy_start
    if end - start <= 1e-12:
        return np.zeros(6, dtype=float)

    # 3-point Gauss integration is exact for cubic beam shape functions
    # multiplied by a linear distributed load over any sub-interval.
    gauss_points = (-0.7745966692414834, 0.0, 0.7745966692414834)
    gauss_weights = (0.5555555555555556, 0.8888888888888888, 0.5555555555555556)
    x0 = start * L
    x1 = end * L
    half_span = (x1 - x0) / 2.0
    center = (x0 + x1) / 2.0
    vector = np.zeros(6, dtype=float)
    for point, weight in zip(gauss_points, gauss_weights):
        x = center + half_span * point
        xi = x / L
        load_ratio = (x - x0) / max(x1 - x0, 1e-12)
        wx = wx_start + (wx_end - wx_start) * load_ratio
        wy = wy_start + (wy_end - wy_start) * load_ratio
        n1 = 1.0 - xi
        n2 = xi
        h1 = 1.0 - 3.0 * xi**2 + 2.0 * xi**3
        h2 = L * (xi - 2.0 * xi**2 + xi**3)
        h3 = 3.0 * xi**2 - 2.0 * xi**3
        h4 = L * (-xi**2 + xi**3)
        vector += weight * half_span * np.array([n1 * wx, h1 * wy, h2 * wy, n2 * wx, h3 * wy, h4 * wy], dtype=float)
    return vector


def point_load_local_vector(
    py_n: float,
    length: float,
    *,
    px_n: float = 0.0,
    position_ratio: float = 0.5,
) -> np.ndarray:
    px = float(px_n)
    py = float(py_n)
    if max(abs(px), abs(py)) < 1e-12:
        return np.zeros(6, dtype=float)
    L = float(length)
    r = min(1.0, max(0.0, float(position_ratio)))
    r2 = r * r
    r3 = r2 * r
    return np.array(
        [
            px * (1.0 - r),
            py * (1.0 - 3.0 * r2 + 2.0 * r3),
            py * L * (r - 2.0 * r2 + r3),
            px * r,
            py * (3.0 * r2 - 2.0 * r3),
            py * L * (-r2 + r3),
        ],
        dtype=float,
    )


def apply_rotational_releases(k_local: np.ndarray, f_local: np.ndarray, release_dofs: list[int]) -> tuple[np.ndarray, np.ndarray]:
    if not release_dofs:
        return k_local, f_local
    released = sorted(set(release_dofs))
    retained = [idx for idx in range(6) if idx not in released]
    k_rr = k_local[np.ix_(retained, retained)]
    k_rc = k_local[np.ix_(retained, released)]
    k_cr = k_local[np.ix_(released, retained)]
    k_cc = k_local[np.ix_(released, released)]
    f_r = f_local[retained]
    f_c = f_local[released]
    correction = np.linalg.solve(k_cc, k_cr)
    load_correction = np.linalg.solve(k_cc, f_c)
    k_condensed = np.zeros((6, 6), dtype=float)
    f_condensed = np.zeros(6, dtype=float)
    k_condensed[np.ix_(retained, retained)] = k_rr - k_rc @ correction
    f_condensed[retained] = f_r - k_rc @ load_correction
    return k_condensed, f_condensed
