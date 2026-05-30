from __future__ import annotations

from collections import Counter
from typing import Any, Mapping, Sequence

from backend.common.material_catalog import get_material_spec


def member_elasticity_summary(members: Sequence[Mapping[str, Any]], member_label: str) -> str:
    counts: Counter[str] = Counter()
    for member in members:
        value = member.get("E_GPa")
        if value is None:
            continue
        counts[_member_material_label(member)] += 1
    if not counts:
        return f"未提供{member_label}弹性模量"
    return "；".join(
        f"{label}：{count} 个{member_label}"
        for label, count in sorted(counts.items(), key=lambda item: _sort_key(item[0]))
    )


def _member_material_label(member: Mapping[str, Any]) -> str:
    value = member.get("E_GPa")
    material_id = str(member.get("materialId") or "").strip().lower()
    if material_id and material_id != "custom":
        material = get_material_spec(material_id)
        label = material.id.upper() if material else material_id
        return f"{label} · E={_format_number(value)} GPa"
    return f"E={_format_number(value)} GPa"


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
