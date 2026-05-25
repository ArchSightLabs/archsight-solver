from __future__ import annotations

import io
import re
from typing import Any, Dict, Optional

import pandas as pd

from backend.exporters.common.artifact import ExportArtifact
from backend.exporters.common.docx_utils import HAS_DOCX, add_df_table, add_heading, add_png_figure, add_report_title, create_document, png_from_report_images
from backend.exporters.common.evidence import build_evidence_tables
from backend.exporters.common.load_tables import build_load_combination_rows
from backend.exporters.common.report_options import include_all_result_figures, include_figures, include_overlay_figures, include_traditional_figures, normalize_report_options
from backend.exporters.common.report_figures import (
    AMBER,
    BLUE,
    GREEN,
    ChartSeries,
    line_chart_png,
    sensitivity_chart_png,
    structure_preview_png,
)
from backend.exporters.truss.xlsx_exporter import build_summary_tables


def export_docx(
    solution: Dict[str, Any],
    material_name: str,
    sensitivity_results: Optional[Dict[str, Any]] = None,
    report_images: Optional[Dict[str, str]] = None,
    report_options: Optional[Dict[str, Any]] = None,
):
    if not HAS_DOCX:
        raise RuntimeError("服务器缺少 python-docx 库，请联系系统管理员")

    df_summary, df_params, df_nodes, df_members, df_conventions = build_summary_tables(solution, material_name)
    options = normalize_report_options(report_options)
    doc = create_document(font_name="Microsoft YaHei")

    add_report_title(doc, "平面桁架工程计算书", "节点位移 / 杆件轴力 / 支座反力")

    add_heading(doc, "1. 项目概况")
    add_df_table(doc, df_summary)
    add_heading(doc, "2. 输入参数")
    add_df_table(doc, df_params)
    preview = solution.get("truss", solution.get("preview", {}))
    if include_figures(options):
        add_heading(doc, "2.1 结构预览图")
        add_png_figure(
            doc,
            _report_or_fallback(
                report_images,
                "truss.preview",
                structure_preview_png(
                    solution["structure"].get("nodes", []),
                    solution["structure"].get("members", []),
                    preview.get("deformedNodes", []),
                    solution["structure"].get("loads", []),
                ),
            ),
            "图 2-1 桁架结构预览与节点变形示意（蓝色为放大后的变形线）",
        )
    add_heading(doc, "2.2 可审查计算证据链")
    _add_evidence_tables(doc, build_evidence_tables(solution, "truss", material_name))
    _add_load_combination_table(doc, solution, "2.3 荷载组合标签")
    add_heading(doc, "3. 节点结果")
    add_df_table(doc, df_nodes)
    if include_traditional_figures(options) and include_all_result_figures(options):
        add_heading(doc, "3.1 节点水平位移图")
        add_png_figure(
            doc,
            _report_or_fallback(report_images, "truss.ux", line_chart_png(_ordinal_x(solution["nodeResults"]), [ChartSeries("节点 X 向水平位移", [item["uxMm"] for item in solution["nodeResults"]], GREEN)])),
            "图 3-1 节点 X 向水平位移（mm）",
        )
        add_heading(doc, "3.2 节点竖向位移图")
        add_png_figure(
            doc,
            _report_or_fallback(report_images, "truss.uy", line_chart_png(_ordinal_x(solution["nodeResults"]), [ChartSeries("节点 Y 向竖向位移", [item["uyMm"] for item in solution["nodeResults"]], BLUE)])),
            "图 3-2 节点 Y 向竖向位移（mm）",
        )
    add_heading(doc, "4. 杆件结果")
    add_df_table(doc, df_members)
    _add_member_figures(doc, solution, report_images, options)
    add_heading(doc, "5. 校核结论")
    add_df_table(
        doc,
        pd.DataFrame(
            [
                ["最大位移 (mm)", round(solution["summary"]["maxDisplacementMm"], 4)],
                ["允许位移 (mm)", round(solution["summary"]["allowableMm"], 4)],
                ["最大轴力 (kN)", round(solution["summary"]["maxAxialForceKn"], 4)],
                ["结果", solution["summary"]["status"]],
            ],
            columns=["项目", "数值/说明"],
        ),
    )
    add_heading(doc, "6. 符号与单位约定")
    add_df_table(doc, df_conventions)
    if sensitivity_results:
        add_heading(doc, "6.1 参数敏感性分析")
        add_df_table(doc, _sensitivity_summary_table(sensitivity_results))
        add_png_figure(doc, _report_or_fallback(report_images, "sensitivity.response", sensitivity_chart_png(sensitivity_results)), "图 6-1 参数扰动响应曲线")
    add_heading(doc, "7. 附录数据")
    add_df_table(doc, pd.DataFrame(solution["memberResults"]))

    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    safe_name = re.sub(r"[^\w\u4e00-\u9fa5]+", "_", solution["projectName"])
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


def _add_member_figures(doc, solution: Dict[str, Any], report_images: Optional[Dict[str, str]], options: Dict[str, str]) -> None:
    if not include_figures(options):
        return
    index = 1
    if include_overlay_figures(options):
        overlay_items = [("truss.overlay.axial", "杆件轴力叠加图", "杆件轴力", AMBER)]
        if include_all_result_figures(options):
            overlay_items.append(("truss.overlay.displacement", "节点位移叠加图", "节点位移", BLUE))
        for image_key, title, series_label, color in overlay_items:
            fallback_values = [item["axialForceKn"] for item in solution["memberResults"]] if series_label == "杆件轴力" else [item["displacementMm"] for item in solution["nodeResults"]]
            fallback_x = _ordinal_x(solution["memberResults"] if series_label == "杆件轴力" else solution["nodeResults"])
            add_heading(doc, f"4.{index} {title}")
            add_png_figure(
                doc,
                _report_or_fallback(report_images, image_key, line_chart_png(fallback_x, [ChartSeries(series_label, fallback_values, color)])),
                f"图 4-{index} {title}（计算简图与结果同图显示）",
            )
            index += 1
    if include_traditional_figures(options):
        add_heading(doc, f"4.{index} 杆件轴力图")
        add_png_figure(
            doc,
            _report_or_fallback(report_images, "truss.axial", line_chart_png(_ordinal_x(solution["memberResults"]), [ChartSeries("杆件轴力", [item["axialForceKn"] for item in solution["memberResults"]], AMBER)])),
            f"图 4-{index} 杆件轴力分布（kN，拉力为正、压力为负）",
        )


def _ordinal_x(items: Any) -> list[int]:
    return list(range(1, len(items) + 1))


def _report_or_fallback(report_images: Optional[Dict[str, str]], key: str, fallback: bytes) -> bytes:
    return png_from_report_images(report_images, key) or fallback


def _variation_range(variations: Any) -> str:
    values = [float(value) * 100.0 for value in variations or []]
    if not values:
        return "—"
    return f"{round(min(values), 2)}% ~ {round(max(values), 2)}%"
