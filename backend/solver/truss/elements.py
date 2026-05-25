from __future__ import annotations

import math
from typing import Dict, Tuple

import numpy as np


def member_geometry(member_id: str, node_a: Dict[str, float], node_b: Dict[str, float]) -> Tuple[float, float, float]:
    dx = float(node_b["x"]) - float(node_a["x"])
    dy = float(node_b["y"]) - float(node_a["y"])
    length = math.hypot(dx, dy)
    if length <= 0:
        raise ValueError(f"构件 {member_id} 长度必须大于 0")
    return length, dx / length, dy / length


def truss_member_stiffness(E: float, A: float, c: float, s: float, length: float) -> np.ndarray:
    factor = (E * A) / length
    return factor * np.array(
        [
            [c * c, c * s, -c * c, -c * s],
            [c * s, s * s, -c * s, -s * s],
            [-c * c, -c * s, c * c, c * s],
            [-c * s, -s * s, c * s, s * s],
        ],
        dtype=float,
    )
