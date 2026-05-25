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
) -> np.ndarray:
    wx_start = float(wx_npm)
    wy_start = float(wy_npm)
    wx_end = wx_start if wx_end_npm is None else float(wx_end_npm)
    wy_end = wy_start if wy_end_npm is None else float(wy_end_npm)
    if max(abs(wx_start), abs(wx_end), abs(wy_start), abs(wy_end)) < 1e-12:
        return np.zeros(6, dtype=float)
    L = float(length)
    return np.array(
        [
            L * (2.0 * wx_start + wx_end) / 6.0,
            L * (7.0 * wy_start + 3.0 * wy_end) / 20.0,
            L**2 * (3.0 * wy_start + 2.0 * wy_end) / 60.0,
            L * (wx_start + 2.0 * wx_end) / 6.0,
            L * (3.0 * wy_start + 7.0 * wy_end) / 20.0,
            -L**2 * (2.0 * wy_start + 3.0 * wy_end) / 60.0,
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
