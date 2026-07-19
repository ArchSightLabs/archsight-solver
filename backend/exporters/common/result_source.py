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


def validate_result_source(solution: Mapping[str, Any]) -> None:
    source = solution.get("resultSource")
    if source is None:
        return
    if not isinstance(source, Mapping):
        raise ValueError("结果来源必须是结构化对象")
    source_type = str(source.get("source") or "primary")
    source_id = str(source.get("id") or "__primary__")
    if source_type == "primary":
        if source_id != "__primary__":
            raise ValueError(f"主结果来源 ID 无效: {source_id}")
        return
    result_key = "loadCaseResults" if source_type == "case" else "loadCombinationResults" if source_type == "combination" else None
    if result_key is None:
        raise ValueError(f"不支持的结果来源类型: {source_type}")
    available_ids = {
        str(item.get("id") or "")
        for item in solution.get(result_key, [])
        if isinstance(item, Mapping)
    }
    if source_id not in available_ids:
        raise ValueError(f"所选结果来源不存在于当前计算结果: {source_type} {source_id}")
