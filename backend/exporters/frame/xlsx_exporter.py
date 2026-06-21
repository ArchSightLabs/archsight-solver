from __future__ import annotations

import io
from typing import Any, Dict

import pandas as pd

from backend.common.material_catalog import material_report_rows
from backend.common.result_metric_catalog import result_metric_label
from backend.common.support_catalog import support_label
from backend.exporters.common.artifact import ExportArtifact
from backend.exporters.common.evidence import build_evidence_tables, build_report_review_table
from backend.exporters.common.filenames import export_filename
from backend.exporters.common.load_tables import build_load_combination_rows
from backend.exporters.common.member_materials import member_elasticity_summary
from backend.exporters.common.result_source import result_source_rows
from backend.exporters.common.xlsx_utils import HAS_OPENPYXL, apply_standard_worksheet_style, write_sectioned_sheet


def build_summary_tables(solution: Dict[str, Any], material_name: str):
    structure = solution["structure"]
    max_node_displacement_label = result_metric_label("frame", "max_node_displacement")
    max_member_moment_label = result_metric_label("frame", "max_member_moment")
    df_summary = pd.DataFrame(
        [
            ["项目名称", solution["projectName"]],
            *result_source_rows(solution),
            ["计算日期", pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")],
            ["结构类型", "二维平面框架"],
            ["材料名称", material_name],
            ["节点数量", len(structure.get("nodes", []))],
            ["构件数量", len(structure.get("members", []))],
            [f"{max_node_displacement_label} (mm)", round(solution["summary"]["maxDisplacementMm"], 3)],
            ["控制节点", solution["summary"]["maxDisplacementNodeId"] or "—"],
            [f"{max_member_moment_label} (kN·m)", round(solution["summary"]["maxMomentKnM"], 3)],
            ["结论", solution["summary"]["status"]],
        ],
        columns=["项目", "数值/说明"],
    )

    df_params = pd.DataFrame(
        [
            ["分析类型", "二维平面框架"],
            ["项目名称", solution["projectName"]],
            ["材料名称", material_name],
            *material_report_rows(solution.get("materialId")),
            ["材料适用范围", "材料名称为项目默认材料说明；框架整体刚度按各构件 E_GPa / A_cm2 / I_cm4 输入装配。"],
            ["构件弹性模量分布", member_elasticity_summary(structure.get("members", []), "构件")],
            ["跨度 (m)", round(float(max(node["x"] for node in structure["nodes"]) - min(node["x"] for node in structure["nodes"])), 3)],
            ["层高 (m)", round(float(max(node["y"] for node in structure["nodes"]) - min(node["y"] for node in structure["nodes"])), 3)],
            ["支座节点", _frame_support_summary(structure.get("nodes", []))],
            ["支座说明", "框架支座按节点 ux / uy / rz 自由度参与整体刚度矩阵；滚动支座设置 supportAngleDeg 时按法向位移约束处理。"],
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
                "ROT (deg)": round(item["rotationDeg"], 6),
                "RX (kN)": round(item["reactionFxKn"], 4),
                "RY (kN)": round(item["reactionFyKn"], 4),
                "RM (kN·m)": round(item["reactionMzKnM"], 4),
            }
            for item in solution["nodeResults"]
        ]
    )

    df_members = pd.DataFrame(
        [
            {
                "构件": item["memberId"],
                "类型": item["kind"],
                "起点": item["startNode"],
                "终点": item["endNode"],
                "起点轴力 (kN)": round(item["axialStartKn"], 4),
                "起点剪力 (kN)": round(item["shearStartKn"], 4),
                "起点弯矩 (kN·m)": round(item["momentStartKnM"], 4),
                "终点轴力 (kN)": round(item["axialEndKn"], 4),
                "终点剪力 (kN)": round(item["shearEndKn"], 4),
                "终点弯矩 (kN·m)": round(item["momentEndKnM"], 4),
            }
            for item in solution["memberResults"]
        ]
    )
    df_member_diagrams = pd.DataFrame(
        [
            {
                "构件": diagram["memberId"],
                "测站比": station,
                "测站位置 (m)": station_m,
                "轴力 (kN)": axial,
                "剪力 (kN)": shear,
                "弯矩 (kN·m)": moment,
                "局部 y 向位移 (mm)": deflection,
            }
            for diagram in solution.get("memberDiagrams", [])
            for station, station_m, axial, shear, moment, deflection in zip(
                diagram["stations"],
                diagram["stationsM"],
                diagram["axialKn"],
                diagram["shearKn"],
                diagram["momentKnM"],
                diagram["deflectionMm"],
            )
        ]
    )
    df_conventions = pd.DataFrame(
        [
            ["节点荷载方向", "fxKn 为全局 X 正向，fyKn 为全局 Y 正向，mzKnM 为节点力矩"],
            ["构件分布荷载方向", "qStartKnPerM/qEndKnPerM 表示起止强度，startRatio/endRatio 表示构件内作用范围；旧字段 wyKnPerM 等价于全跨 local_y"],
            ["构件集中荷载方向", "member_point 使用 forceKn 与 positionRatio 表示构件内集中力；全局 Y 正值向上，局部 y 正值沿构件局部 +y"],
            ["构件温度荷载", "temperature 使用 deltaTempC 与 alphaPerC 表示均匀温差自由伸缩；正温差表示升温伸长"],
            ["构件内力曲线", "memberDiagrams 按构件局部坐标输出轴力、剪力、正负号按结构力学弯矩图约定的弯矩和局部 y 向位移测站值"],
            ["位移单位", "节点平动位移以 mm 输出，节点转角以 deg 输出"],
            ["内力单位", "轴力/剪力以 kN 输出，弯矩以 kN·m 输出"],
            ["校核限值", "当前默认按结构包络尺度 L/250 形成位移控制摘要"],
        ],
        columns=["项目", "说明"],
    )
    return df_summary, df_params, df_nodes, df_members, df_member_diagrams, df_conventions


def _format_angle(value: Any) -> str:
    if value is None:
        return ""
    try:
        angle = round(float(value), 4)
    except (TypeError, ValueError):
        return str(value)
    return str(int(angle)) if angle.is_integer() else str(angle)


def _frame_support_summary(nodes: list[Dict[str, Any]]) -> str:
    rows: list[str] = []
    for node in nodes:
        support_type = str(node.get("supportType", "free")).strip().lower()
        if support_type == "free":
            continue
        angle = node.get("supportAngleDeg")
        angle_text = f"，法向角 {_format_angle(angle)}°" if support_type == "roller" and angle is not None else ""
        rows.append(f"{node.get('id', '—')}：{support_label('frame', support_type)}{angle_text}")
    return "；".join(rows) if rows else "无支座节点"


def export_xlsx(solution: Dict[str, Any], material_name: str, report_options: Dict[str, Any] | None = None):
    if not HAS_OPENPYXL:
        raise RuntimeError("服务器缺少 openpyxl 库，请联系系统管理员")

    df_summary, df_params, df_nodes, df_members, df_member_diagrams, df_conventions = build_summary_tables(solution, material_name)
    evidence_tables = build_evidence_tables(solution, "frame", material_name)
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
    df_stability = pd.DataFrame(
        [
            {"类别": "二阶效应/P-Delta", **solution.get("secondOrder", {})},
            {"类别": "屈曲初步分析", **solution.get("buckling", {})},
        ]
    )
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
        max_node_displacement_label = result_metric_label("frame", "max_node_displacement")
        df_check = pd.DataFrame(
            [
                [f"{max_node_displacement_label} (mm)", round(solution["summary"]["maxDisplacementMm"], 4)],
                ["允许位移 (mm)", round(solution["summary"]["allowableMm"], 4)],
                ["结果", solution["summary"]["status"]],
            ],
            columns=["项目", "数值/说明"],
        )
        write_sectioned_sheet(
            writer,
            "01_复核总览",
            [
                ("项目结论", df_summary),
                ("审阅状态与签发边界", build_report_review_table(solution, "frame", report_options)),
                ("关键控制项", evidence_tables["关键控制项"]),
                ("稳定初筛", df_stability),
            ],
        )
        write_sectioned_sheet(
            writer,
            "02_输入模型",
            [
                ("工程输入摘要", evidence_tables["工程输入摘要"]),
                ("输入参数", df_params),
                ("节点模型", df_model_nodes),
                ("构件模型", df_model_members),
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
                ("构件结果", df_members),
            ],
        )
        write_sectioned_sheet(
            writer,
            "99_原始数据",
            [
                ("构件内力曲线", df_member_diagrams),
                ("荷载工况", df_load_cases),
                ("荷载组合", df_load_combinations),
                ("详细数据", df_detail),
            ],
        )

        apply_standard_worksheet_style(writer.book)

    output.seek(0)
    return ExportArtifact(
        buffer=output,
        filename=export_filename(solution["projectName"], "frame", "xlsx"),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
