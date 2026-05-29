from __future__ import annotations

import io
from typing import Any, Dict, Optional

import pandas as pd

from backend.common.result_metric_catalog import result_metric_label
from backend.exporters.common.artifact import ExportArtifact
from backend.exporters.common.docx_utils import HAS_DOCX, add_df_table, add_heading, add_png_figure, add_report_title, create_document, png_from_report_images
from backend.exporters.common.evidence import build_evidence_tables
from backend.exporters.common.load_tables import build_load_combination_rows
from backend.exporters.common.report_figure_catalog import FRAME_REPORT_MEMBER_FIGURES, report_figures_for_scope
from backend.exporters.common.report_options import include_all_result_figures, include_figures, include_overlay_figures, include_traditional_figures, normalize_report_options
from backend.exporters.common.report_figures import (
    AMBER,
    BLUE,
    CYAN,
    GREEN,
    PURPLE,
    ChartSeries,
    line_chart_png,
    sensitivity_chart_png,
    structure_preview_png,
)
from backend.exporters.frame.xlsx_exporter import build_summary_tables


def export_docx(
    solution: Dict[str, Any],
    material_name: str,
    sensitivity_results: Optional[Dict[str, Any]] = None,
    report_images: Optional[Dict[str, str]] = None,
    report_options: Optional[Dict[str, Any]] = None,
):
    if not HAS_DOCX:
        raise RuntimeError("服务器缺少 python-docx 库，请联系系统管理员")

    df_summary, df_params, df_nodes, df_members, df_member_diagrams, df_conventions = build_summary_tables(solution, material_name)
    options = normalize_report_options(report_options)
    doc = create_document(font_name="Microsoft YaHei")

    add_report_title(doc, "平面框架工程计算书", "节点位移 / 构件内力 / 支座反力")

    add_heading(doc, "1. 项目概况")
    add_df_table(doc, df_summary)
    add_heading(doc, "2. 输入参数")
    add_df_table(doc, df_params)
    if include_figures(options):
        add_heading(doc, "2.1 结构预览图")
        add_png_figure(
            doc,
            _report_or_fallback(
                report_images,
                "frame.preview",
                structure_preview_png(
                    solution["structure"].get("nodes", []),
                    solution["structure"].get("members", []),
                    solution.get("frame", solution.get("preview", {})).get("deformedNodes", []),
                    solution["structure"].get("loads", []),
                ),
            ),
            "图 2-1 结构预览与变形示意（蓝色为放大后的变形线）",
        )
    add_heading(doc, "2.2 可审查计算证据链")
    _add_evidence_tables(doc, build_evidence_tables(solution, "frame", material_name))
    _add_load_combination_table(doc, solution, "2.3 荷载组合标签")
    add_heading(doc, "3. 节点结果")
    add_df_table(doc, df_nodes)
    if include_traditional_figures(options) and include_all_result_figures(options):
        add_heading(doc, "3.1 节点水平位移图")
        add_png_figure(
            doc,
            _report_or_fallback(report_images, "frame.ux", line_chart_png(_ordinal_x(solution["nodeResults"]), [ChartSeries("节点 X 向水平位移", [item["uxMm"] for item in solution["nodeResults"]], GREEN)])),
            "图 3-1 节点 X 向水平位移（mm）",
        )
        add_heading(doc, "3.2 节点竖向位移图")
        add_png_figure(
            doc,
            _report_or_fallback(report_images, "frame.uy", line_chart_png(_ordinal_x(solution["nodeResults"]), [ChartSeries("节点 Y 向竖向位移", [item["uyMm"] for item in solution["nodeResults"]], BLUE)])),
            "图 3-2 节点 Y 向竖向位移（mm）",
        )
    add_heading(doc, "4. 构件内力")
    add_df_table(doc, df_members)
    _add_member_diagram_figures(doc, solution, report_images, options)
    add_heading(doc, "5. 校核结论")
    max_node_displacement_label = result_metric_label("frame", "max_node_displacement")
    add_df_table(
        doc,
        pd.DataFrame(
            [
                [f"{max_node_displacement_label} (mm)", round(solution["summary"]["maxDisplacementMm"], 4)],
                ["允许位移 (mm)", round(solution["summary"]["allowableMm"], 4)],
                ["结果", solution["summary"]["status"]],
            ],
            columns=["项目", "数值/说明"],
        )
    )
    add_heading(doc, "5.1 稳定初筛")
    add_df_table(
        doc,
        pd.DataFrame(
            [
                ["二阶效应/P-Delta", solution.get("secondOrder", {}).get("riskLevel", "未启用"), solution.get("secondOrder", {}).get("limitations", "")],
                ["屈曲初步分析", solution.get("buckling", {}).get("riskLevel", "未启用"), solution.get("buckling", {}).get("limitations", "")],
            ],
            columns=["项目", "风险等级", "说明"],
        ),
    )
    add_heading(doc, "6. 符号与单位约定")
    add_df_table(doc, df_conventions)
    if sensitivity_results:
        add_heading(doc, "6.1 参数敏感性分析")
        add_df_table(doc, _sensitivity_summary_table(sensitivity_results))
        add_png_figure(doc, _report_or_fallback(report_images, "sensitivity.response", sensitivity_chart_png(sensitivity_results)), "图 6-1 参数扰动响应曲线")
    add_heading(doc, "7. 附录数据")
    if not df_member_diagrams.empty:
        add_df_table(doc, df_member_diagrams)
    add_df_table(doc, pd.DataFrame(solution["memberResults"]))

    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    filename = f"{solution['projectName']}_二维框架计算书.docx"
    return ExportArtifact(
        buffer=output,
        filename=filename,
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


def _add_member_diagram_figures(doc, solution: Dict[str, Any], report_images: Optional[Dict[str, str]], options: Dict[str, str]) -> None:
    diagrams = solution.get("memberDiagrams", [])
    if not diagrams or not include_figures(options):
        return
    index = 1
    include_all = include_all_result_figures(options)
    if include_overlay_figures(options):
        for figure in report_figures_for_scope(FRAME_REPORT_MEMBER_FIGURES, include_all):
            x_values = diagrams[0].get("stations", [])
            series = [ChartSeries(str(diagram.get("memberId", "")), diagram.get(figure.metric_key, []), _frame_figure_color(figure.metric_key)) for diagram in diagrams]
            add_heading(doc, f"4.{index} 构件{figure.label}叠加图")
            add_png_figure(
                doc,
                _report_or_fallback(report_images, figure.overlay_image_key, line_chart_png(x_values, series)),
                f"图 4-{index} 构件{figure.label}图（{figure.unit}，计算简图与结果同图显示）",
            )
            index += 1
    if not include_traditional_figures(options):
        return
    for figure in report_figures_for_scope(FRAME_REPORT_MEMBER_FIGURES, include_all):
        x_values = diagrams[0].get("stations", [])
        series = [ChartSeries(str(diagram.get("memberId", "")), diagram.get(figure.metric_key, []), _frame_figure_color(figure.metric_key)) for diagram in diagrams]
        add_heading(doc, f"4.{index} 构件{figure.label}图")
        add_png_figure(
            doc,
            _report_or_fallback(report_images, figure.traditional_image_key, line_chart_png(x_values, series)),
            f"图 4-{index} 构件{figure.label}曲线（{figure.unit}）",
        )
        index += 1


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


def _ordinal_x(items: Any) -> list[int]:
    return list(range(1, len(items) + 1))


def _frame_figure_color(metric_key: str) -> str:
    if metric_key == "shearKn":
        return GREEN
    if metric_key == "deflectionMm":
        return PURPLE
    if metric_key == "axialKn":
        return CYAN
    return AMBER


def _report_or_fallback(report_images: Optional[Dict[str, str]], key: str, fallback: bytes) -> bytes:
    return png_from_report_images(report_images, key) or fallback


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


def _variation_range(variations: Any) -> str:
    values = [float(value) * 100.0 for value in variations or []]
    if not values:
        return "—"
    return f"{round(min(values), 2)}% ~ {round(max(values), 2)}%"
