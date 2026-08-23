from __future__ import annotations

import io
from typing import Any, Dict, List

import pandas as pd

from backend.contracts.failure_review import FAILURE_REVIEW_MATERIAL_TYPE, normalize_failure_review_payload
from backend.exporters.common.artifact import ExportArtifact
from backend.exporters.common.docx_utils import HAS_DOCX, add_df_table, add_heading, add_report_note, add_report_title, create_document
from backend.exporters.common.filenames import export_filename
from backend.exporters.common.xlsx_utils import HAS_OPENPYXL, apply_standard_worksheet_style, write_sectioned_sheet


def export_docx(review: Dict[str, Any], format_type: str = "docx") -> ExportArtifact:
    if not HAS_DOCX:
        raise RuntimeError("服务器缺少 python-docx 库，请联系系统管理员")

    normalized = _ensure_normalized(review)
    doc = create_document(font_name="Microsoft YaHei")

    add_report_title(doc, "失败审查材料", normalized["stableErrorCode"])
    add_report_note(doc, "本材料仅保留输入标识、已完成阶段、稳定错误码、对象定位、诊断、hash 和建议动作。")

    add_heading(doc, "1. 失败审查总览")
    add_df_table(doc, _overview_table(normalized))

    add_heading(doc, "2. 对象定位")
    add_df_table(doc, _object_ref_table(normalized["objectRefs"]))

    add_heading(doc, "3. 诊断记录")
    add_df_table(doc, _diagnostics_table(normalized["diagnostics"]))

    add_heading(doc, "4. 建议动作")
    add_df_table(doc, _actions_table(normalized["suggestedActions"]))

    output = io.BytesIO()
    doc.save(output)
    output.seek(0)
    return ExportArtifact(
        buffer=output,
        filename=export_filename(normalized["inputId"], FAILURE_REVIEW_MATERIAL_TYPE, format_type, artifact_label="审查材料"),
        mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


def export_xlsx(review: Dict[str, Any], format_type: str = "xlsx") -> ExportArtifact:
    if not HAS_OPENPYXL:
        raise RuntimeError("服务器缺少 openpyxl 库，请联系系统管理员")

    normalized = _ensure_normalized(review)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        write_sectioned_sheet(writer, "01_失败审查总览", [("失败审查总览", _overview_table(normalized))])
        write_sectioned_sheet(writer, "02_对象定位", [("对象定位", _object_ref_table(normalized["objectRefs"]))])
        write_sectioned_sheet(writer, "03_诊断记录", [("诊断记录", _diagnostics_table(normalized["diagnostics"]))])
        write_sectioned_sheet(writer, "04_建议动作", [("建议动作", _actions_table(normalized["suggestedActions"]))])
        apply_standard_worksheet_style(writer.book)

    output.seek(0)
    return ExportArtifact(
        buffer=output,
        filename=export_filename(normalized["inputId"], FAILURE_REVIEW_MATERIAL_TYPE, format_type, artifact_label="审查材料"),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


def _ensure_normalized(review: Dict[str, Any]) -> Dict[str, Any]:
    if review.get("materialType") == FAILURE_REVIEW_MATERIAL_TYPE and "inputId" in review:
        return review
    return normalize_failure_review_payload(review)


def _overview_table(review: Dict[str, Any]) -> pd.DataFrame:
    hash_text = "；".join(f"{row['name']}={row['value']}" for row in review["hashes"]) or "—"
    return pd.DataFrame(
        [
            ["输入标识", review["inputId"]],
            ["已完成阶段", "；".join(review["completedStages"])],
            ["稳定错误码", review["stableErrorCode"]],
            ["对象数量", len(review["objectRefs"])],
            ["诊断条目数", len(review["diagnostics"])],
            ["hash", hash_text],
        ],
        columns=["项目", "数值/说明"],
    )


def _object_ref_table(object_refs: List[Dict[str, str]]) -> pd.DataFrame:
    rows = [[item.get("kind", "—"), item.get("id", "—")] for item in object_refs] or [["—", "—"]]
    return pd.DataFrame(rows, columns=["对象类型", "对象编号"])


def _diagnostics_table(diagnostics: List[Dict[str, str]]) -> pd.DataFrame:
    rows = [[item.get("code", "—"), item.get("title", "—"), item.get("detail", "—"), item.get("severity", "—")] for item in diagnostics] or [["—", "—", "—", "—"]]
    return pd.DataFrame(rows, columns=["错误码", "标题", "说明", "级别"])


def _actions_table(actions: List[str]) -> pd.DataFrame:
    rows = [[index + 1, action] for index, action in enumerate(actions)] or [[1, "—"]]
    return pd.DataFrame(rows, columns=["序号", "建议动作"])
