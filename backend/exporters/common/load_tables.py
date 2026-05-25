from __future__ import annotations

from typing import Any, Dict, Iterable, List


def format_load_tags(tags: Iterable[Any] | None) -> str:
    return "、".join(str(tag).strip() for tag in (tags or []) if str(tag).strip())


def build_load_combination_rows(solution: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [
        {
            "id": item["id"],
            "title": item["title"],
            "tags": format_load_tags(item.get("tags")),
            "factors": str(item.get("factors", {})),
            **item.get("summary", {}),
        }
        for item in solution.get("loadCombinationResults", [])
    ]
