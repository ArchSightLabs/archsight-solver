from __future__ import annotations

from typing import Any, Mapping

from backend.contracts.diagnostics import ApiError
from backend.common.material_catalog import get_material_name, material_catalog


def get_analysis_type(data: Mapping[str, Any]) -> str:
    raw_analysis_type = data.get("analysisType")
    analysis_type = str(raw_analysis_type if raw_analysis_type not in (None, "") else "beam").strip().lower()
    if analysis_type == "beam":
        return "beam"
    if analysis_type in {"frame", "frame2d", "portal_frame"}:
        return "frame"
    if analysis_type in {"truss", "truss2d"}:
        return "truss"
    raise ApiError(f"不支持的分析对象: {raw_analysis_type}", code="COMMON_UNSUPPORTED_ANALYSIS_TYPE")


MATERIALS = {material.id: material.name for material in material_catalog()}
