from __future__ import annotations

from typing import Any

from backend.common.numbers import to_float


def parse_ratio_range(raw_start: Any, raw_end: Any, label: str) -> tuple[float, float]:
    start_ratio = to_float(raw_start, 0.0)
    end_ratio = to_float(raw_end, 1.0)
    if start_ratio < 0.0 or start_ratio > 1.0 or end_ratio < 0.0 or end_ratio > 1.0 or start_ratio >= end_ratio:
        raise ValueError(f"{label}必须满足 0 <= startRatio < endRatio <= 1")
    return start_ratio, end_ratio


def interpolate(start: float, end: float, ratio: float) -> float:
    return start + (end - start) * ratio
