from __future__ import annotations

from typing import Any, Dict

from backend.application.truss_analysis import build_truss_solution
from backend.exporters.truss.docx_exporter import export_docx
from backend.exporters.truss.xlsx_exporter import build_summary_tables, export_xlsx


def build_solution(data: Dict[str, Any], material_name: str) -> Dict[str, Any]:
    return build_truss_solution(data, material_name)
