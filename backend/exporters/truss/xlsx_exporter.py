from __future__ import annotations

import io
from typing import Any, Dict

import pandas as pd

from backend.common.material_catalog import material_report_rows
from backend.common.result_metric_catalog import result_metric_label
from backend.common.support_catalog import support_constraint_dofs, support_dof_indexes, support_label, support_system_note
from backend.exporters.common.artifact import ExportArtifact
from backend.exporters.common.evidence import build_evidence_tables, build_report_review_table, select_evidence_table_items
from backend.exporters.common.filenames import export_filename
from backend.exporters.common.load_tables import build_load_combination_rows
from backend.exporters.common.member_materials import member_elasticity_summary
from backend.exporters.common.result_source import result_source_rows
from backend.exporters.common.report_options import normalize_report_options
from backend.exporters.common.xlsx_utils import HAS_OPENPYXL, apply_standard_worksheet_style, write_sectioned_sheet


TRUSS_MEMBER_KIND_LABELS = {
    "top_chord": "上弦杆",
    "bottom_chord": "下弦杆",
    "web": "腹杆",
    "vertical": "竖杆",
    "diagonal": "斜杆",
    "generic": "通用杆件",
}

TRUSS_FORCE_STATE_LABELS = {
    "tension": "受拉",
    "compression": "受压",
    "near_zero": "接近零轴力",
    "zero": "零轴力",
}


def _localized_enum(value: Any, labels: Dict[str, str], fallback: str) -> str:
    text = str(value or "").strip()
    return labels.get(text.lower(), text if any("\u3400" <= char <= "\u9fff" for char in text) else fallback)


def _result_status_label(value: Any) -> str:
    return _localized_enum(value, {"pass": "通过", "review": "需复核", "failed": "未通过"}, "状态待确认")


def _truss_model_tables(structure: Dict[str, Any]) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    nodes = pd.DataFrame(structure.get("nodes", [])).rename(
        columns={
            "id": "节点编号",
            "x": "X 坐标（m）",
            "y": "Y 坐标（m）",
            "supportType": "支座类型",
            "uxConstraint": "X 向约束",
            "uyConstraint": "Y 向约束",
        }
    )
    if "支座类型" in nodes:
        nodes["支座类型"] = nodes["支座类型"].map(lambda value: support_label("truss", str(value)))
    members = pd.DataFrame(structure.get("members", [])).rename(
        columns={
            "id": "杆件编号",
            "start": "起点",
            "end": "终点",
            "kind": "类型",
            "E_GPa": "弹性模量（GPa）",
            "A_cm2": "截面面积（cm²）",
        }
    )
    if "类型" in members:
        members["类型"] = members["类型"].map(lambda value: _localized_enum(value, TRUSS_MEMBER_KIND_LABELS, "其他杆件"))
    loads = pd.DataFrame(structure.get("loads", [])).rename(
        columns={
            "type": "荷载类型",
            "node": "节点编号",
            "member": "杆件编号",
            "fxKn": "X 向荷载（kN）",
            "fyKn": "Y 向荷载（kN）",
            "forceKn": "集中力（kN）",
            "positionRatio": "相对位置",
        }
    )
    if "荷载类型" in loads:
        labels = {"nodal": "节点荷载", "member_point": "杆件集中荷载", "temperature": "温度荷载"}
        loads["荷载类型"] = loads["荷载类型"].map(lambda value: labels.get(str(value).lower(), "其他荷载"))
    return nodes, members, loads


TRUSS_STANDARD_EVIDENCE_TABLES = (
    "模型假定与适用范围",
    "计算方法说明",
    "校核证据",
    "关键点表",
)

TRUSS_COMPLETE_EVIDENCE_TABLES = (
    "计算过程技术审计（CalculationTrace）",
    "复核点表",
    "包络来源",
    "计算快照",
)


def build_summary_tables(solution: Dict[str, Any], material_name: str):
    structure = solution["structure"]
    max_node_displacement_label = result_metric_label("truss", "max_node_displacement")
    max_member_axial_label = result_metric_label("truss", "max_member_axial")
    df_summary = pd.DataFrame(
        [
            ["项目名称", solution["projectName"]],
            *result_source_rows(solution),
            ["计算日期", pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")],
            ["结构类型", "二维平面桁架"],
            ["材料名称", material_name],
            ["节点数量", len(structure.get("nodes", []))],
            ["杆件数量", len(structure.get("members", []))],
            [f"{max_node_displacement_label} (mm)", round(solution["summary"]["maxDisplacementMm"], 3)],
            ["控制节点", solution["summary"]["maxDisplacementNodeId"] or "—"],
            [f"{max_member_axial_label} (kN)", round(solution["summary"]["maxAxialForceKn"], 3)],
            ["结论", _result_status_label(solution["summary"]["status"])],
        ],
        columns=["项目", "数值/说明"],
    )

    df_params = pd.DataFrame(
        [
            ["分析类型", "二维平面桁架"],
            ["项目名称", solution["projectName"]],
            ["材料名称", material_name],
            *material_report_rows(solution.get("materialId")),
            ["材料适用范围", "材料名称为项目默认材料说明；桁架整体刚度按各杆件弹性模量 E 和截面面积 A 输入装配。"],
            ["杆件弹性模量分布", member_elasticity_summary(structure.get("members", []), "杆件")],
            ["节点数量", len(structure.get("nodes", []))],
            ["杆件数量", len(structure.get("members", []))],
            ["支座节点", _truss_support_summary(structure.get("nodes", []))],
            ["支座说明", support_system_note("truss")],
            ["约束自由度", sum(len(support_dof_indexes("truss", node["supportType"])) for node in structure.get("nodes", []))],
            ["允许位移 (mm)", round(solution["summary"]["allowableMm"], 3)],
        ],
        columns=["参数", "值"],
    )

    df_nodes = pd.DataFrame(
        [
            {
                "节点": item["nodeId"],
                "X 坐标（m）": round(item["x"], 4),
                "Y 坐标（m）": round(item["y"], 4),
                "X 向位移（mm）": round(item["uxMm"], 4),
                "Y 向位移（mm）": round(item["uyMm"], 4),
                "合位移（mm）": round(item["displacementMm"], 4),
                "X 向反力（kN）": round(item["rxKn"], 4),
                "Y 向反力（kN）": round(item["ryKn"], 4),
            }
            for item in solution["nodeResults"]
        ]
    )

    df_members = pd.DataFrame(
        [
            {
                "杆件": item["memberId"],
                "类型": _localized_enum(item["kind"], TRUSS_MEMBER_KIND_LABELS, "其他杆件"),
                "起点": item["startNode"],
                "终点": item["endNode"],
                "长度 (m)": round(item["lengthM"], 4),
                "轴力 (kN)": round(item["axialForceKn"], 4),
                "轴应力 (MPa)": round(item["axialStressMpa"], 4),
                "状态": _localized_enum(item["forceState"], TRUSS_FORCE_STATE_LABELS, "受力状态待确认"),
            }
            for item in solution["memberResults"]
        ]
    )

    df_conventions = pd.DataFrame(
        [
            ["节点荷载方向", "fxKn 为全局 X 正向，fyKn 为全局 Y 正向"],
            ["支座类型", "pinned 为铰支座，roller 为滚动支座，free 为自由端"],
            ["位移单位", "节点平动位移以 mm 输出"],
            ["内力单位", "节点反力以 kN 输出，杆件轴力以 kN 输出"],
            ["应力单位", "杆件轴应力以 MPa 输出"],
        ],
        columns=["项目", "说明"],
    )

    return df_summary, df_params, df_nodes, df_members, df_conventions


def _truss_support_summary(nodes: list[Dict[str, Any]]) -> str:
    rows: list[str] = []
    for node in nodes:
        support_type = str(node.get("supportType", "free")).strip().lower()
        if support_type == "free":
            continue
        constraints = support_constraint_dofs("truss", support_type)
        constraint_text = f"（约束 {'、'.join(constraints)}）" if constraints else ""
        rows.append(f"{node.get('id', '—')}：{support_label('truss', support_type)}{constraint_text}")
    return "；".join(rows) if rows else "无支座节点"


def export_xlsx(solution: Dict[str, Any], material_name: str, report_options: Dict[str, Any] | None = None):
    if not HAS_OPENPYXL:
        raise RuntimeError("服务器缺少 openpyxl 库，请联系系统管理员")

    options = normalize_report_options(report_options)
    df_summary, df_params, df_nodes, df_members, df_conventions = build_summary_tables(solution, material_name)
    evidence_tables = build_evidence_tables(solution, "truss", material_name, options)
    df_model_nodes, df_model_members, df_loads = _truss_model_tables(solution["structure"])
    df_load_cases = pd.DataFrame(
        [
            {"id": item["id"], "title": item["title"], **item.get("summary", {})}
            for item in solution.get("loadCaseResults", [])
        ]
    )
    df_load_combinations = pd.DataFrame(build_load_combination_rows(solution))
    df_detail = pd.concat(
        [
            pd.DataFrame(solution["nodeResults"]),
            pd.DataFrame(solution["memberResults"]),
        ],
        axis=0,
        ignore_index=True,
        sort=False,
    )

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        max_node_displacement_label = result_metric_label("truss", "max_node_displacement")
        max_member_axial_label = result_metric_label("truss", "max_member_axial")
        df_check = pd.DataFrame(
            [
                [f"{max_node_displacement_label} (mm)", round(solution["summary"]["maxDisplacementMm"], 4)],
                ["允许位移 (mm)", round(solution["summary"]["allowableMm"], 4)],
                [f"{max_member_axial_label} (kN)", round(solution["summary"]["maxAxialForceKn"], 4)],
                ["结果", _result_status_label(solution["summary"]["status"])],
            ],
            columns=["项目", "数值/说明"],
        )
        write_sectioned_sheet(
            writer,
            "01_复核总览",
            [
                ("项目结论", df_summary),
                ("审阅状态与签发边界", build_report_review_table(solution, "truss", report_options)),
                ("关键控制项", evidence_tables["关键控制项"]),
            ],
        )
        write_sectioned_sheet(
            writer,
            "02_输入模型",
            [
                ("工程输入摘要", evidence_tables["工程输入摘要"]),
                ("输入参数", df_params),
                ("节点模型", df_model_nodes),
                ("杆件模型", df_model_members),
                ("荷载与模型", df_loads),
            ],
        )
        write_sectioned_sheet(writer, "03_单位换算", [("单位换算表", evidence_tables["单位换算表"])])
        write_sectioned_sheet(writer, "04_边界条件", [("边界条件表", evidence_tables["边界条件表"])])
        write_sectioned_sheet(
            writer,
            "05_校核证据",
            [
                *select_evidence_table_items(evidence_tables, TRUSS_STANDARD_EVIDENCE_TABLES).items(),
                ("符号约定", df_conventions),
            ],
        )
        write_sectioned_sheet(
            writer,
            "06_结果明细",
            [
                ("校核结论", df_check),
                ("节点结果", df_nodes),
                ("杆件结果", df_members),
            ],
        )
        write_sectioned_sheet(
            writer,
            "99_原始数据",
            [
                ("荷载工况", df_load_cases),
                ("荷载组合", df_load_combinations),
                ("详细数据", df_detail),
            ],
        )
        if options.get("template") == "complete":
            write_sectioned_sheet(
                writer,
                "07_完整证据链",
                [
                    *select_evidence_table_items(evidence_tables, TRUSS_COMPLETE_EVIDENCE_TABLES).items(),
                ],
            )

        apply_standard_worksheet_style(writer.book)

    output.seek(0)
    return ExportArtifact(
        buffer=output,
        filename=export_filename(solution["projectName"], "truss", "xlsx"),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
