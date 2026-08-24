from __future__ import annotations

import io
from typing import Any, Dict

import pandas as pd

from backend.common.material_catalog import material_report_rows
from backend.common.result_metric_catalog import result_metric_label
from backend.common.support_catalog import support_label
from backend.exporters.common.artifact import ExportArtifact
from backend.exporters.common.evidence import (
    FRAME_STABILITY_FULL_TABLES,
    FRAME_STABILITY_STANDARD_TABLES,
    build_evidence_tables,
    build_report_review_table,
)
from backend.exporters.common.filenames import export_filename
from backend.exporters.common.load_tables import build_load_combination_rows
from backend.exporters.common.member_materials import member_elasticity_summary
from backend.exporters.common.result_source import result_source_rows
from backend.exporters.common.report_options import normalize_report_options
from backend.exporters.common.xlsx_utils import HAS_OPENPYXL, apply_standard_worksheet_style, write_sectioned_sheet


FRAME_MEMBER_KIND_LABELS = {
    "beam": "梁",
    "column": "柱",
    "brace": "斜撑",
    "generic": "通用构件",
}

FRAME_METHOD_LABELS = {
    "initial_stress_v1": "初始应力迭代法",
    "corotational_newton_v1": "共回转 Newton 法",
    "linear_buckling_v1": "线性屈曲特征值法",
}


def _frame_member_kind_label(value: Any) -> str:
    text = str(value or "").strip()
    return FRAME_MEMBER_KIND_LABELS.get(text.lower(), text if any("\u3400" <= char <= "\u9fff" for char in text) else "其他构件")


def _result_status_label(value: Any) -> str:
    text = str(value or "").strip()
    labels = {
        "pass": "通过",
        "review": "需复核",
        "failed": "未通过",
        "converged": "已收敛",
        "not_converged": "未收敛",
        "not_enabled": "未启用",
        "disabled": "未启用",
        "stable": "切线稳定",
        "near_critical": "接近临界",
        "unstable": "切线不稳定",
        "no_compression": "无受压控制构件",
    }
    return labels.get(text.lower(), text if any("\u3400" <= char <= "\u9fff" for char in text) else "状态待确认")


def _frame_method_label(value: Any) -> str:
    text = str(value or "").strip()
    return FRAME_METHOD_LABELS.get(text.lower(), text if any("\u3400" <= char <= "\u9fff" for char in text) else "其他求解方法")


def _frame_model_tables(structure: Dict[str, Any]) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    nodes = pd.DataFrame(structure.get("nodes", [])).rename(
        columns={
            "id": "节点编号",
            "x": "X 坐标（m）",
            "y": "Y 坐标（m）",
            "supportType": "支座类型",
            "supportAngleDeg": "支座角度（°）",
            "uxConstraint": "X 向约束",
            "uyConstraint": "Y 向约束",
            "rzConstraint": "转角约束",
        }
    )
    if "支座类型" in nodes:
        nodes["支座类型"] = nodes["支座类型"].map(lambda value: support_label("frame", str(value)))
    members = pd.DataFrame(structure.get("members", [])).rename(
        columns={
            "id": "构件编号",
            "start": "起点",
            "end": "终点",
            "kind": "类型",
            "E_GPa": "弹性模量（GPa）",
            "A_cm2": "截面面积（cm²）",
            "I_cm4": "截面惯性矩（cm⁴）",
        }
    )
    if "类型" in members:
        members["类型"] = members["类型"].map(_frame_member_kind_label)
    loads = pd.DataFrame(structure.get("loads", [])).rename(
        columns={
            "type": "荷载类型",
            "node": "节点编号",
            "member": "构件编号",
            "fxKn": "X 向荷载（kN）",
            "fyKn": "Y 向荷载（kN）",
            "mzKnM": "节点力矩（kN·m）",
            "forceKn": "集中力（kN）",
            "positionRatio": "相对位置",
            "qStartKnPerM": "起点线荷载（kN/m）",
            "qEndKnPerM": "终点线荷载（kN/m）",
            "startRatio": "起始相对位置",
            "endRatio": "终止相对位置",
        }
    )
    if "荷载类型" in loads:
        labels = {"nodal": "节点荷载", "member_point": "构件集中荷载", "distributed": "构件分布荷载", "temperature": "温度荷载"}
        loads["荷载类型"] = loads["荷载类型"].map(lambda value: labels.get(str(value).lower(), "其他荷载"))
    return nodes, members, loads


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
            ["结论", _result_status_label(solution["summary"]["status"])],
        ],
        columns=["项目", "数值/说明"],
    )

    df_params = pd.DataFrame(
        [
            ["分析类型", "二维平面框架"],
            ["项目名称", solution["projectName"]],
            ["材料名称", material_name],
            *material_report_rows(solution.get("materialId")),
            ["材料适用范围", "材料名称为项目默认材料说明；框架整体刚度按各构件弹性模量 E、截面面积 A 和截面惯性矩 I 输入装配。"],
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
                "X 坐标（m）": round(item["x"], 4),
                "Y 坐标（m）": round(item["y"], 4),
                "X 向位移（mm）": round(item["uxMm"], 4),
                "Y 向位移（mm）": round(item["uyMm"], 4),
                "转角（°）": round(item["rotationDeg"], 6),
                "X 向反力（kN）": round(item["reactionFxKn"], 4),
                "Y 向反力（kN）": round(item["reactionFyKn"], 4),
                "约束弯矩（kN·m）": round(item["reactionMzKnM"], 4),
            }
            for item in solution["nodeResults"]
        ]
    )

    df_members = pd.DataFrame(
        [
            {
                "构件": item["memberId"],
                "类型": _frame_member_kind_label(item["kind"]),
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
            ["位移单位", "节点平动位移以 mm 输出，节点转角以度（°）输出"],
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

    options = normalize_report_options(report_options)
    df_summary, df_params, df_nodes, df_members, df_member_diagrams, df_conventions = build_summary_tables(solution, material_name)
    evidence_tables = build_evidence_tables(solution, "frame", material_name, options)
    df_model_nodes, df_model_members, df_loads = _frame_model_tables(solution["structure"])
    df_load_cases = pd.DataFrame(
        [
            {"id": item["id"], "title": item["title"], **item.get("summary", {})}
            for item in solution.get("loadCaseResults", [])
        ]
    )
    df_load_combinations = pd.DataFrame(build_load_combination_rows(solution))
    df_stability = pd.DataFrame(
        [
            {
                "类别": "二阶效应/P-Delta",
                "状态": _result_status_label(solution.get("secondOrder", {}).get("status", "disabled")),
                "方法": _frame_method_label(solution.get("secondOrder", {}).get("method", "—")),
                "放大系数": solution.get("secondOrder", {}).get("amplificationFactor", "—"),
                "收敛": "是" if solution.get("secondOrder", {}).get("converged", False) else "否",
                "失败原因": solution.get("secondOrder", {}).get("failureReason", "—") or "—",
            },
            {
                "类别": "屈曲分析",
                "状态": _result_status_label(solution.get("buckling", {}).get("status", "disabled")),
                "方法": _frame_method_label(solution.get("buckling", {}).get("method", "—")),
                "临界系数": solution.get("buckling", {}).get("criticalLoadFactor", "—"),
                "模态数": solution.get("buckling", {}).get("modeCount", 0),
                "失败原因": solution.get("buckling", {}).get("failureReason", "—") or "—",
            },
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
                ["结果", _result_status_label(solution["summary"]["status"])],
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
                ("稳定审查摘要", df_stability),
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
                *_frame_stability_sheet_items(evidence_tables, options["template"]),
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


def _frame_stability_sheet_items(evidence_tables: Dict[str, pd.DataFrame], template: str):
    yield ("稳定审查摘要", evidence_tables["稳定审查摘要"])
    if template == "standard":
        for table_name in FRAME_STABILITY_STANDARD_TABLES[1:]:
            if table_name in evidence_tables:
                yield (table_name, evidence_tables[table_name])
        return
    for table_name in FRAME_STABILITY_FULL_TABLES[1:]:
        if table_name in evidence_tables:
            yield (table_name, evidence_tables[table_name])
