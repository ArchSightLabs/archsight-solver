from __future__ import annotations

from typing import Any, Dict, Optional

from backend.exporters.beam.docx_exporter import export_docx as export_beam_docx
from backend.exporters.beam.xlsx_exporter import export_xlsx as export_beam_xlsx
from backend.exporters.common.artifact import ExportArtifact
from backend.exporters.common.report_model import ReportModel
from backend.exporters.frame.docx_exporter import export_docx as export_frame_docx
from backend.exporters.frame.xlsx_exporter import export_xlsx as export_frame_xlsx
from backend.exporters.truss.docx_exporter import export_docx as export_truss_docx
from backend.exporters.truss.xlsx_exporter import export_xlsx as export_truss_xlsx
from backend.services.beam_workbench import build_solution as build_beam_solution
from backend.services.frame_workbench import build_solution as build_frame_solution
from backend.services.truss_workbench import build_solution as build_truss_solution


def build_report_model(
    data: Dict[str, Any],
    *,
    analysis_type: str,
    material_name: str,
    sensitivity_results: Optional[Dict[str, Any]],
    report_images: Optional[Dict[str, str]],
    report_options: Optional[Dict[str, Any]] = None,
) -> ReportModel:
    if analysis_type == "frame":
        solution = build_frame_solution(data, material_name)
    elif analysis_type == "truss":
        solution = build_truss_solution(data, material_name)
    else:
        solution = build_beam_solution(data, material_name)
    if isinstance(data.get("benchmark"), dict):
        solution = {**solution, "benchmark": data["benchmark"]}
    return ReportModel.from_solution(
        analysis_type=analysis_type,
        material_name=material_name,
        solution=solution,
        sensitivity_results=sensitivity_results,
        report_images=report_images,
        report_options=report_options,
    )


def export_report(report: ReportModel, format_type: str) -> ExportArtifact:
    if report.analysis_type == "frame":
        if format_type == "xlsx":
            return export_frame_xlsx(report, report.material_name)
        if format_type == "docx":
            return export_frame_docx(report, report.material_name, report.sensitivity_results, report.report_images, report.report_options)
    elif report.analysis_type == "truss":
        if format_type == "xlsx":
            return export_truss_xlsx(report, report.material_name)
        if format_type == "docx":
            return export_truss_docx(report, report.material_name, report.sensitivity_results, report.report_images, report.report_options)
    else:
        if format_type == "xlsx":
            return export_beam_xlsx(report, report.material_name)
        if format_type == "docx":
            return export_beam_docx(report, report.material_name, report.sensitivity_results, report.report_images, report.report_options)
    raise ValueError("不支持的导出格式")
