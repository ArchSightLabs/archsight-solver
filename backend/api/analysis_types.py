from __future__ import annotations

from typing import Any, Mapping

from backend.api.errors import ApiError


MATERIALS = {
    "custom": "自定义 (手动输入)",
    "q235": "Q235 碳素结构钢",
    "q345": "Q345 低合金高强度结构钢",
    "c30": "C30 混凝土",
    "c35": "C35 混凝土",
    "c40": "C40 混凝土",
    "c50": "C50 混凝土",
}


def get_material_name(material_id: Any) -> str:
    return MATERIALS.get(material_id or "custom", "自定义材料")


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
