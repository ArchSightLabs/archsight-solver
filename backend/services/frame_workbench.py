from __future__ import annotations

from typing import Any, Dict

from backend.application.frame_analysis import build_frame_solution


def build_solution(data: Dict[str, Any], material_name: str) -> Dict[str, Any]:
    return build_frame_solution(data, material_name)
