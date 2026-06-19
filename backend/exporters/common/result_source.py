from __future__ import annotations

from collections.abc import Mapping
from typing import Any, List


SOURCE_LABELS = {
    "primary": "主结果",
    "case": "荷载工况",
    "combination": "荷载组合",
}


def result_source_text(solution: Mapping[str, Any]) -> str:
    source = solution.get("resultSource")
    if not isinstance(source, Mapping):
        return "主结果（基本荷载）"

    source_type = str(source.get("source") or "primary")
    source_id = str(source.get("id") or "__primary__")
    label = str(source.get("label") or SOURCE_LABELS.get(source_type, "主结果"))
    description = str(source.get("description") or "").strip()
    prefix = SOURCE_LABELS.get(source_type, "主结果")
    if source_type == "primary":
        return f"{prefix}（{description or '基本荷载'}）"
    suffix = f" / {description}" if description else ""
    return f"{prefix}: {label} [{source_id}]{suffix}"


def result_source_rows(solution: Mapping[str, Any]) -> List[List[str]]:
    return [["结果来源", result_source_text(solution)]]
