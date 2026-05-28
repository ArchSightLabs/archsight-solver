from __future__ import annotations

import io
import re
from typing import Any, Dict, Optional

import pandas as pd

from backend.exporters.common.artifact import ExportArtifact
from backend.exporters.common.docx_utils import HAS_DOCX, add_df_table, add_heading, add_png_figure, add_report_title, create_document, png_from_report_images, style_table_header_row
from backend.exporters.common.evidence import build_evidence_tables
from backend.exporters.common.load_tables import build_load_combination_rows
from backend.exporters.common.report_figure_catalog import BEAM_REPORT_OVERLAY_FIGURES, BEAM_REPORT_TRADITIONAL_FIGURES, report_figures_for_scope
from backend.exporters.common.report_options import include_all_result_figures, include_figures, include_overlay_figures, include_traditional_figures, normalize_report_options
from backend.exporters.common.report_figures import (
    AMBER,
    BLUE,
    GREEN,
    ChartSeries,
    beam_preview_png,
    line_chart_png,
    sensitivity_chart_png,
)


def export_docx(
    solution: Dict[str, Any],
    material_name: str,
    sensitivity_results: Optional[Dict[str, Any]] = None,
    report_images: Optional[Dict[str, str]] = None,
    report_options: Optional[Dict[str, Any]] = None,
):
    if not HAS_DOCX:
        raise RuntimeError("服务器缺少 python-docx 库，请联系系统管理员")

    request = solution["request"]
    options = normalize_report_options(report_options)
    doc = create_document(font_name="Times New Roman", east_asia_font="微软雅黑")

    add_report_title(doc, "梁系工程计算书", f"{request['beam_type_label']} / {request['load_type_label']}")

    add_heading(doc, "1. 项目概况")
    doc.add_paragraph(f"项目名称: {request['project_name']}")
    doc.add_paragraph(f"导出日期: {pd.Timestamp.now().strftime('%Y-%m-%d %H:%M:%S')}")
    doc.add_paragraph(f"梁型: {request['beam_type_label']}")
    doc.add_paragraph(f"荷载类型: {request['load_type_label']}")
    doc.add_paragraph(f"总长度: {round(request['total_length'], 3)} m")

    add_heading(doc, "2. 输入参数")
    table = doc.add_table(rows=1, cols=2)
    table.style = "Table Grid"
    table.rows[0].cells[0].text = "参数名称"
    table.rows[0].cells[1].text = "数值"
    style_table_header_row(table)
    rows = [
        ("材料名称", material_name),
        ("弹性模量 E", f"{request['E_gpa']} GPa"),
        ("截面惯性矩 I", f"{request['I_cm4']} cm^4"),
        ("梁理论", request.get("beam_theory_label", "Euler-Bernoulli 梁理论")),
        ("跨度布置", " + ".join([str(s) for s in request["spans"]])),
        ("模拟时长", f"{request['duration']} s"),
        ("主频", f"{request['freq']} Hz"),
    ]
    if request["load_type"] == "uniform":
        rows.append(("均布荷载 q", f"{request['q_kn']} kN/m"))
    elif request["load_type"] == "point":
        rows.extend([("集中荷载 P", f"{request['point_load_kn']} kN"), ("作用位置", f"x = {round(request['point_position'], 3)} m")])
    else:
        rows.extend(
            [
                ("线性分布荷载起点", f"{request['distributed_start_kn']} kN/m"),
                ("线性分布荷载终点", f"{request['distributed_end_kn']} kN/m"),
                ("线性分布荷载范围", f"{round(request['distributed_start'], 3)} m ~ {round(request['distributed_end'], 3)} m"),
            ]
        )
    for left, right in rows:
        row = table.add_row().cells
        row[0].text = str(left)
        row[1].text = str(right)

    if include_figures(options) and solution.get("beam"):
        add_heading(doc, "2.1 结构预览图")
        add_png_figure(doc, _report_or_fallback(report_images, "beam.preview", beam_preview_png(solution["beam"])), "图 2-1 梁体结构预览、支座与荷载示意")

    if solution.get("queryResults"):
        add_heading(doc, "2.2 指定截面查询")
        query_table = doc.add_table(rows=1, cols=4)
        query_table.style = "Table Grid"
        for cell, label in zip(query_table.rows[0].cells, ["位置 x (m)", "挠度 (mm)", "弯矩 (kN·m)", "剪力 (kN)"]):
            cell.text = label
        style_table_header_row(query_table)
        for item in solution["queryResults"]:
            row = query_table.add_row().cells
            row[0].text = str(item["xM"])
            row[1].text = str(item["deflectionMm"])
            row[2].text = str(item["momentKnM"])
            row[3].text = str(item["shearKn"])

    if solution.get("symbolicCheck"):
        add_heading(doc, "2.3 教学校核")
        symbolic = solution["symbolicCheck"]
        doc.add_paragraph(symbolic.get("scope", "首版教学校核"))
        if symbolic.get("available"):
            doc.add_paragraph("教材公式: " + "；".join(symbolic.get("equations", [])))
            doc.add_paragraph(
                f"校核反力 {symbolic.get('reactionKn')} kN，"
                f"最大弯矩 {symbolic.get('maxMomentKnM')} kN·m，"
                f"最大挠度 {symbolic.get('maxDeflectionMm')} mm。"
            )
        doc.add_paragraph(symbolic.get("limitations", "该内容用于教学解释和量级复核。"))

    add_heading(doc, "2.4 可审查计算证据链")
    _add_evidence_tables(doc, build_evidence_tables(solution, "beam", material_name))

    add_heading(doc, "3. 计算摘要")
    summary = doc.add_paragraph()
    summary.add_run("最大挠度: ").bold = True
    summary.add_run(f"{round(solution['max_deflection_mm'], 3)} mm")
    doc.add_paragraph(f"最大挠度位置: x = {round(solution['max_deflection_position_m'], 3)} m")
    doc.add_paragraph(f"允许挠度限值: {round(solution['allowable_mm'], 3)} mm (L/250)")
    if solution.get("envelope"):
        doc.add_paragraph(
            f"控制包络: 最大挠度 {solution['envelope'].get('maxDeflectionMm', 0)} mm，"
            f"最大弯矩 {solution['envelope'].get('maxMomentKnM', 0)} kN·m，"
            f"最大正弯矩 {solution['envelope'].get('maxPositiveMomentKnM', 0)} kN·m，"
            f"最大负弯矩 {solution['envelope'].get('maxNegativeMomentKnM', 0)} kN·m，"
            f"最大剪力 {solution['envelope'].get('maxShearKn', 0)} kN。"
        )
    _add_load_combination_table(doc, solution, "3.1 荷载组合标签")
    status_paragraph = doc.add_paragraph()
    status_paragraph.add_run("设计判定: ").bold = True
    status_paragraph.add_run(solution["status"])

    add_heading(doc, "4. 结果汇总")
    doc.add_paragraph("本计算书使用工作台中的梁型与荷载配置生成结构计算结果。")
    result_table = doc.add_table(rows=1, cols=3)
    result_table.style = "Table Grid"
    result_table.rows[0].cells[0].text = "项目"
    result_table.rows[0].cells[1].text = "数值"
    result_table.rows[0].cells[2].text = "说明"
    style_table_header_row(result_table)
    result_rows = [
        ("梁型", request["beam_type_label"], "决定支座约束模式"),
        ("荷载类型", request["load_type_label"], "决定荷载分布方式"),
        ("求解器", solution["solver"], "连续梁默认 UDL 保留解析解，其余工况使用数值求解"),
    ]
    for a, b, c in result_rows:
        row = result_table.add_row().cells
        row[0].text = str(a)
        row[1].text = str(b)
        row[2].text = str(c)

    _add_result_figures(doc, solution, report_images, options)

    add_heading(doc, "5. 校核结论")
    if solution.get("reactions"):
        reaction_table = doc.add_table(rows=1, cols=2)
        reaction_table.style = "Table Grid"
        reaction_table.rows[0].cells[0].text = "支座位置 (m)"
        reaction_table.rows[0].cells[1].text = "竖向反力 (kN)"
        style_table_header_row(reaction_table)
        for item in solution["reactions"]:
            row = reaction_table.add_row().cells
            row[0].text = str(item["position"])
            row[1].text = str(item["vertical"])

    if sensitivity_results:
        add_heading(doc, "5.1 参数敏感性分析")
        add_df_table(doc, _sensitivity_summary_table(sensitivity_results))
        add_png_figure(doc, _report_or_fallback(report_images, "sensitivity.response", sensitivity_chart_png(sensitivity_results)), "图 5-1 参数扰动响应曲线")

    add_heading(doc, "6. 附录数据")
    appendix_table = doc.add_table(rows=1, cols=3)
    appendix_table.style = "Table Grid"
    appendix_table.rows[0].cells[0].text = "位置 x (m)"
    appendix_table.rows[0].cells[1].text = "挠度 v (mm)"
    appendix_table.rows[0].cells[2].text = "弯矩包络 (kN·m)"
    style_table_header_row(appendix_table)
    sample_size = min(12, len(solution.get("x_data", [])))
    for index in range(sample_size):
        row = appendix_table.add_row().cells
        row[0].text = str(round(float(solution["x_data"][index]), 4))
        row[1].text = str(round(float(solution["v_data"][index]), 4))
        row[2].text = str(round(float(solution["element_end_moments"][index]), 4))

    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    safe_name = re.sub(r"[^\w\u4e00-\u9fa5]+", "_", request["project_name"])
    return ExportArtifact(
        buffer=output,
        filename=f"计算报告_{safe_name}.docx",
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


def _sensitivity_summary_table(results: Dict[str, Any]) -> pd.DataFrame:
    rows = [
        ["响应指标", results.get("responseLabel", "—")],
        ["响应单位", results.get("responseUnit", "—")],
        ["扰动范围", _variation_range(results.get("variations", []))],
    ]
    for series in results.get("series", []):
        values = [float(value) for value in series.get("values", [])]
        if values:
            rows.append([f"{series.get('label', series.get('key', '参数'))} 响应范围", f"{round(min(values), 4)} ~ {round(max(values), 4)}"])
    return pd.DataFrame(rows, columns=["项目", "数值/说明"])


def _add_evidence_tables(doc, tables: Dict[str, pd.DataFrame]) -> None:
    for title, frame in tables.items():
        add_heading(doc, title)
        add_df_table(doc, frame)


def _add_load_combination_table(doc, solution: Dict[str, Any], title: str) -> None:
    rows = build_load_combination_rows(solution)
    if not rows:
        return
    add_heading(doc, title)
    add_df_table(doc, pd.DataFrame(rows))


def _add_result_figures(doc, solution: Dict[str, Any], report_images: Optional[Dict[str, str]], options: Dict[str, str]) -> None:
    if not include_figures(options):
        return
    section_index = 1
    figure_index = 1
    include_all = include_all_result_figures(options)
    if include_overlay_figures(options):
        for figure in report_figures_for_scope(BEAM_REPORT_OVERLAY_FIGURES, include_all):
            add_heading(doc, f"4.{section_index} {figure.title}")
            add_png_figure(
                doc,
                _report_or_fallback(
                    report_images,
                    figure.image_key,
                    line_chart_png(solution.get("x_data", []), [ChartSeries(figure.series_label, _beam_series(solution, figure.series_label), _beam_figure_color(figure.series_label))]),
                ),
                f"图 4-{figure_index} 梁系{figure.title}（计算简图与结果同图显示）",
            )
            section_index += 1
            figure_index += 1
    if include_traditional_figures(options):
        for figure in report_figures_for_scope(BEAM_REPORT_TRADITIONAL_FIGURES, include_all):
            add_heading(doc, f"4.{section_index} {figure.title}")
            add_png_figure(
                doc,
                _report_or_fallback(
                    report_images,
                    figure.image_key,
                    line_chart_png(solution.get("x_data", []), [ChartSeries(figure.series_label, _beam_series(solution, figure.series_label), _beam_figure_color(figure.series_label))]),
                ),
                f"图 4-{figure_index} {figure.title}（{figure.unit}）",
            )
            section_index += 1
            figure_index += 1


def _beam_series(solution: Dict[str, Any], label: str) -> list[float]:
    if label == "剪力":
        return solution.get("shear_data", solution.get("element_end_shears", []))
    if label == "挠度":
        return [float(value) * 1000.0 for value in solution.get("v_data", [])]
    return solution.get("moment_data", solution.get("element_end_moments", []))


def _beam_figure_color(label: str) -> str:
    if label == "剪力":
        return AMBER
    if label == "挠度":
        return BLUE
    return GREEN


def _report_or_fallback(report_images: Optional[Dict[str, str]], key: str, fallback: bytes) -> bytes:
    return png_from_report_images(report_images, key) or fallback


def _variation_range(variations: Any) -> str:
    values = [float(value) * 100.0 for value in variations or []]
    if not values:
        return "—"
    return f"{round(min(values), 2)}% ~ {round(max(values), 2)}%"
