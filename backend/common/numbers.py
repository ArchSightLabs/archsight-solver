from __future__ import annotations

from typing import Any, Dict, List, Sequence


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        if isinstance(value, str) and not value.strip():
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def clamp_ratio(value: Any, default: float) -> float:
    return max(0.0, min(1.0, to_float(value, default)))


def sanitize_label(value: Any, mapping: Dict[str, str], default_key: str) -> str:
    key = str(value or default_key).strip()
    return key if key in mapping else default_key


def round_list(values: Sequence[float], ndigits: int = 4) -> List[float]:
    return [round(float(v), ndigits) for v in values]


def cumulative(values: Sequence[float]) -> List[float]:
    total = 0.0
    out = [0.0]
    for item in values:
        total += float(item)
        out.append(total)
    return out
