from __future__ import annotations

import io
from typing import Any, Dict

import pandas as pd

from backend.common.material_catalog import material_report_rows
from backend.common.result_metric_catalog import result_metric_label
from backend.exporters.common.artifact import ExportArtifact
from backend.exporters.common.evidence import build_evidence_tables
from backend.exporters.common.filenames import export_filename
from backend.exporters.common.load_tables import build_load_combination_rows
from backend.exporters.common.xlsx_utils import HAS_OPENPYXL, apply_standard_worksheet_style, write_sectioned_sheet
from backend.normalizers.truss.request_normalizer import node_support_dofs


def build_summary_tables(solution: Dict[str, Any], material_name: str):
    structure = solution["structure"]
    max_node_displacement_label = result_metric_label("truss", "max_node_displacement")
    max_member_axial_label = result_metric_label("truss", "max_member_axial")
    df_summary = pd.DataFrame(
        [
            ["项目名称", solution["projectName"]],
            ["计算日期", pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")],
            ["结构类型", "二维平面桁架"],
            ["材料名称", material_name],
            ["节点数量", len(structure.get("nodes", []))],
            ["杆件数量", len(structure.get("members", []))],
            [f"{max_node_displacement_label} (mm)", round(solution["summary"]["maxDisplacementMm"], 3)],
            ["控制节点", solution["summary"]["maxDisplacementNodeId"] or "—"],
            [f"{max_member_axial_label} (kN)", round(solution["summary"]["maxAxialForceKn"], 3)],
            ["结论", solution["summary"]["status"]],
        ],
        columns=["项目", "数值/说明"],
    )

    df_params = pd.DataFrame(
        [
            ["分析类型", "二维平面桁架"],
            ["项目名称", solution["projectName"]],
            ["材料名称", material_name],
            *material_report_rows(solution.get("materialId")),
            ["节点数量", len(structure.get("nodes", []))],
            ["杆件数量", len(structure.get("members", []))],
            ["约束自由度", sum(len(node_support_dofs(node["supportType"])) for node in structure.get("nodes", []))],
            ["允许位移 (mm)", round(solution["summary"]["allowableMm"], 3)],
        ],
        columns=["参数", "值"],
    )

    df_nodes = pd.DataFrame(
        [
            {
                "节点": item["nodeId"],
                "X (m)": round(item["x"], 4),
                "Y (m)": round(item["y"], 4),
                "UX (mm)": round(item["uxMm"], 4),
                "UY (mm)": round(item["uyMm"], 4),
                "位移 (mm)": round(item["displacementMm"], 4),
                "RX (kN)": round(item["rxKn"], 4),
                "RY (kN)": round(item["ryKn"], 4),
            }
            for item in solution["nodeResults"]
        ]
    )

    df_members = pd.DataFrame(
        [
            {
                "杆件": item["memberId"],
                "类型": item["kind"],
                "起点": item["startNode"],
                "终点": item["endNode"],
                "长度 (m)": round(item["lengthM"], 4),
                "轴力 (kN)": round(item["axialForceKn"], 4),
                "轴应力 (MPa)": round(item["axialStressMpa"], 4),
                "状态": item["forceState"],
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


def export_xlsx(solution: Dict[str, Any], material_name: str):
    if not HAS_OPENPYXL:
        raise RuntimeError("服务器缺少 openpyxl 库，请联系系统管理员")

    df_summary, df_params, df_nodes, df_members, df_conventions = build_summary_tables(solution, material_name)
    evidence_tables = build_evidence_tables(solution, "truss", material_name)
    df_loads = pd.DataFrame(solution["structure"].get("loads", []))
    df_model_nodes = pd.DataFrame(solution["structure"].get("nodes", []))
    df_model_members = pd.DataFrame(solution["structure"].get("members", []))
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
                ["结果", solution["summary"]["status"]],
            ],
            columns=["项目", "数值/说明"],
        )
        write_sectioned_sheet(
            writer,
            "01_复核总览",
            [
                ("项目结论", df_summary),
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
                ("模型假定与适用范围", evidence_tables["模型假定与适用范围"]),
                ("计算方法说明", evidence_tables["计算方法说明"]),
                ("校核证据", evidence_tables["校核证据"]),
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

        apply_standard_worksheet_style(writer.book)

    output.seek(0)
    return ExportArtifact(
        buffer=output,
        filename=export_filename(solution["projectName"], "truss", "xlsx"),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
