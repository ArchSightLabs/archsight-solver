from __future__ import annotations

from collections import Counter
from typing import Any, Mapping, Sequence


def member_elasticity_summary(members: Sequence[Mapping[str, Any]], member_label: str) -> str:
    counts: Counter[str] = Counter()
    for member in members:
        value = member.get("E_GPa")
        if value is None:
            continue
        counts[_format_number(value)] += 1
    if not counts:
        return f"未提供{member_label}弹性模量"
    return "；".join(
        f"E={elasticity} GPa：{count} 个{member_label}"
        for elasticity, count in sorted(counts.items(), key=lambda item: _sort_key(item[0]))
    )


def _format_number(value: Any) -> str:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return str(value)
    rounded = round(number, 4)
    return str(int(rounded)) if rounded.is_integer() else str(rounded)


def _sort_key(value: str) -> tuple[int, float | str]:
    try:
        return (0, float(value))
    except ValueError:
        return (1, value)
