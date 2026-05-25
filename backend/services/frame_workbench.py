from __future__ import annotations

from typing import Any, Dict

from backend.application.frame_analysis import build_frame_solution
from backend.exporters.frame.docx_exporter import export_docx
from backend.exporters.frame.xlsx_exporter import build_summary_tables, export_xlsx


def build_solution(data: Dict[str, Any], material_name: str) -> Dict[str, Any]:
    return build_frame_solution(data, material_name)
