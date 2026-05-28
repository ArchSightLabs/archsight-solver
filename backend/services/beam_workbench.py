from __future__ import annotations

from typing import Any, Dict

from backend.application.beam_analysis import build_beam_solution
from backend.exporters.beam.docx_exporter import export_docx
from backend.exporters.beam.xlsx_exporter import build_summary_tables, export_xlsx


def build_solution(data: Dict[str, Any], material_name: str) -> Dict[str, Any]:
    return build_beam_solution(data, material_name)
