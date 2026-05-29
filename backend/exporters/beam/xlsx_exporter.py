from __future__ import annotations

import io
import re
from typing import Any, Dict

import numpy as np
import pandas as pd

from backend.common.material_catalog import material_report_rows
from backend.exporters.common.artifact import ExportArtifact
from backend.exporters.common.evidence import build_evidence_tables
from backend.exporters.common.load_tables import build_load_combination_rows
from backend.exporters.common.xlsx_utils import HAS_OPENPYXL, apply_standard_worksheet_style, write_sectioned_sheet


def build_summary_tables(solution: Dict[str, Any], material_name: str):
    request = solution["request"]
    df_summary = pd.DataFrame(
        [
            ["项目名称", request["project_name"]],
            ["计算日期", pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")],
            ["梁型", request["beam_type_label"]],
            ["荷载类型", request["load_type_label"]],
            ["材料名称", material_name],
            ["总长度 (m)", round(request["total_length"], 3)],
            ["最大挠度 (mm)", round(solution["max_deflection_mm"], 3)],
            ["最大挠度位置 (m)", round(solution["max_deflection_position_m"], 3)],
            ["允许挠度限值 (mm)", round(solution["allowable_mm"], 3)],
            ["结论", solution["status"]],
        ],
        columns=["项目", "数值/说明"],
    )

    param_rows = [
        ["材料名称", material_name],
        *material_report_rows(request.get("material_id")),
        ["梁型", request["beam_type_label"]],
        ["荷载类型", request["load_type_label"]],
        ["弹性模量 E (GPa)", request["E_gpa"]],
        ["截面惯性矩 I (cm^4)", request["I_cm4"]],
        ["跨度列表 (m)", " + ".join([str(s) for s in request["spans"]])],
        ["模拟时长 (s)", request["duration"]],
        ["动荷载主频 (Hz)", request["freq"]],
    ]
    if request["load_type"] == "uniform":
        param_rows.append(["均布荷载 q (kN/m)", request["q_kn"]])
    elif request["load_type"] == "point":
        param_rows.extend([["集中荷载 P (kN)", request["point_load_kn"]], ["集中荷载位置 (m)", round(request["point_position"], 3)]])
    else:
        param_rows.extend(
            [
                ["线性分布荷载起点 (kN/m)", request["distributed_start_kn"]],
                ["线性分布荷载终点 (kN/m)", request["distributed_end_kn"]],
                ["线性分布荷载起点 (m)", round(request["distributed_start"], 3)],
                ["线性分布荷载终点 (m)", round(request["distributed_end"], 3)],
            ]
        )
    df_params = pd.DataFrame(param_rows, columns=["参数", "值"])
    df_loads = pd.DataFrame(
        [["梁型", request["beam_type_label"]], ["荷载类型", request["load_type_label"]], ["求解器", solution["solver"]]],
        columns=["项目", "说明"],
    )
    df_details = pd.DataFrame({"位置 x (m)": np.round(solution["x_data"], 4), "挠度 v (mm)": np.round(solution["v_data"], 4)})
    return df_summary, df_params, df_loads, df_details


def export_xlsx(solution: Dict[str, Any], material_name: str):
    if not HAS_OPENPYXL:
        raise RuntimeError("服务器缺少 openpyxl 库，请联系系统管理员")

    request = solution["request"]
    df_summary, df_params, df_loads, df_details = build_summary_tables(solution, material_name)
    evidence_tables = build_evidence_tables(solution, "beam", material_name)
    df_check = pd.DataFrame(
        [
            ["最大挠度 (mm)", round(solution["max_deflection_mm"], 4)],
            ["允许挠度 (mm)", round(solution["allowable_mm"], 4)],
            ["结果", solution["status"]],
        ],
        columns=["项目", "数值/说明"],
    )
    df_reactions = pd.DataFrame(solution.get("reactions", []))
    df_query = pd.DataFrame(solution.get("queryResults", []))
    df_load_cases = pd.DataFrame(
        [
            {"id": item["id"], "title": item["title"], **item.get("summary", {})}
            for item in solution.get("loadCaseResults", [])
        ]
    )
    df_load_combinations = pd.DataFrame(build_load_combination_rows(solution))
    df_envelope = pd.DataFrame([solution.get("envelope", {})]) if solution.get("envelope") else pd.DataFrame()
    df_symbolic = pd.DataFrame([solution.get("symbolicCheck", {})]) if solution.get("symbolicCheck") else pd.DataFrame()
    df_sensitivity = pd.DataFrame(
        [
            ["参数名称", "变动范围", "最大挠度响应"],
            ["荷载 q", "±20%", f"{round(solution['max_deflection_mm'] * 1.2, 3)} mm (预估)"],
            ["模量 E", "±20%", f"{round(solution['max_deflection_mm'] * 0.8, 3)} mm (预估)"],
            ["惯性矩 I", "±20%", f"{round(solution['max_deflection_mm'] * 0.8, 3)} mm (预估)"],
            ["频率 f", "±20%", f"{round(solution['max_deflection_mm'] * 1.05, 3)} mm (预估)"],
            ["备注", "", "详细敏感度曲线请参考系统图表"],
        ],
        columns=["项目", "条件", "说明"],
    )

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        write_sectioned_sheet(
            writer,
            "01_复核总览",
            [
                ("项目结论", df_summary),
                ("关键控制项", evidence_tables["关键控制项"]),
                ("控制包络", df_envelope),
            ],
        )
        write_sectioned_sheet(
            writer,
            "02_输入模型",
            [
                ("工程输入摘要", evidence_tables["工程输入摘要"]),
                ("参数记录", df_params),
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
                ("教学校核", df_symbolic),
            ],
        )
        write_sectioned_sheet(
            writer,
            "06_结果明细",
            [
                ("校核结论", df_check),
                ("支座反力", df_reactions),
                ("截面查询", df_query),
                ("敏感性摘要", df_sensitivity),
            ],
        )
        write_sectioned_sheet(
            writer,
            "99_原始数据",
            [
                ("挠度曲线采样", df_details),
                ("荷载工况", df_load_cases),
                ("荷载组合", df_load_combinations),
            ],
        )

        apply_standard_worksheet_style(writer.book)

    output.seek(0)
    safe_name = re.sub(r"[^\w\u4e00-\u9fa5]+", "_", request["project_name"])
    return ExportArtifact(
        buffer=output,
        filename=f"计算报告_{safe_name}.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
