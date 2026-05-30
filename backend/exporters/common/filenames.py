from __future__ import annotations

import re


ANALYSIS_FILENAME_LABELS = {
    "beam": "梁系",
    "frame": "平面框架",
    "truss": "平面桁架",
}

EXPORT_KIND_LABELS = {
    "docx": "计算书",
    "xlsx": "参数表",
}


def safe_filename_segment(value: object, fallback: str = "未命名项目") -> str:
    sanitized = re.sub(r"[^\w\u4e00-\u9fa5]+", "_", str(value or "").strip()).strip("_")
    return sanitized or fallback


def export_filename(project_name: object, analysis_type: str, extension: str) -> str:
    normalized_extension = extension.lstrip(".").lower()
    analysis_label = ANALYSIS_FILENAME_LABELS.get(analysis_type, "结构分析")
    kind_label = EXPORT_KIND_LABELS.get(normalized_extension, "导出文件")
    return f"{safe_filename_segment(project_name)}_{analysis_label}_{kind_label}.{normalized_extension}"
