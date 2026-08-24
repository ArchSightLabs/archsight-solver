from __future__ import annotations

import io
from typing import Any, Dict

import numpy as np
import pandas as pd

from backend.common.material_catalog import material_report_rows
from backend.exporters.common.artifact import ExportArtifact
from backend.exporters.common.evidence import build_evidence_tables, build_report_review_table, select_evidence_table_items
from backend.exporters.common.filenames import export_filename
from backend.exporters.common.load_tables import build_load_combination_rows
from backend.exporters.common.result_source import result_source_rows
from backend.exporters.common.report_options import normalize_report_options
from backend.exporters.common.xlsx_utils import HAS_OPENPYXL, apply_standard_worksheet_style, write_sectioned_sheet


def _result_status_label(value: Any) -> str:
    text = str(value or "").strip()
    return {"pass": "通过", "review": "需复核", "failed": "未通过"}.get(text.lower(), text if any("\u3400" <= char <= "\u9fff" for char in text) else "状态待确认")


def _solver_label(value: Any) -> str:
    text = str(value or "").strip()
    labels = {
        "analytical": "解析法",
        "matrix-stiffness": "矩阵位移法",
        "fem": "有限元法",
        "sparse": "稀疏矩阵求解",
        "dense": "稠密矩阵求解",
    }
    return labels.get(text.lower(), text if any("\u3400" <= char <= "\u9fff" for char in text) else "结构力学求解器")


BEAM_STANDARD_EVIDENCE_TABLES = (
    "模型假定与适用范围",
    "计算方法说明",
    "校核证据",
    "关键点表",
)

BEAM_COMPLETE_EVIDENCE_TABLES = (
    "计算过程技术审计（CalculationTrace）",
    "复核点表",
    "包络来源",
    "计算快照",
)


def build_summary_tables(solution: Dict[str, Any], material_name: str):
    request = solution["request"]
    df_summary = pd.DataFrame(
        [
            ["项目名称", request["project_name"]],
            *result_source_rows(solution),
            ["计算日期", pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S")],
            ["梁型", request["beam_type_label"]],
            ["荷载类型", request["load_type_label"]],
            ["材料名称", material_name],
            ["总长度 (m)", round(request["total_length"], 3)],
            ["最大挠度 (mm)", round(solution["max_deflection_mm"], 3)],
            ["最大挠度位置 (m)", round(solution["max_deflection_position_m"], 3)],
            ["允许挠度限值 (mm)", round(solution["allowable_mm"], 3)],
            ["结论", _result_status_label(solution["status"])],
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
    elif request["load_type"] in {"linear", "distributed"}:
        param_rows.extend(
            [
                ["线性分布荷载起点 (kN/m)", request["distributed_start_kn"]],
                ["线性分布荷载终点 (kN/m)", request["distributed_end_kn"]],
                ["线性分布荷载起点 (m)", round(request["distributed_start"], 3)],
                ["线性分布荷载终点 (m)", round(request["distributed_end"], 3)],
            ]
        )
    elif request["load_type"] == "combination":
        combination = request.get("selected_load_combination", {})
        factors = combination.get("factors", {})
        expression = " + ".join(f"{float(factor):g}×{case_id}" for case_id, factor in factors.items()) or "—"
        param_rows.extend(
            [
                ["荷载组合", f"{combination.get('title', combination.get('id', '—'))} [{combination.get('id', '—')}]"],
                ["组合表达式", expression],
                ["组合竖向荷载合计 (kN)", request.get("resultant_load_kn", 0.0)],
            ]
        )
    df_params = pd.DataFrame(param_rows, columns=["参数", "值"])
    df_loads = pd.DataFrame(
        [["梁型", request["beam_type_label"]], ["荷载类型", request["load_type_label"]], ["求解器", _solver_label(solution["solver"])]],
        columns=["项目", "说明"],
    )
    df_details = pd.DataFrame({"位置 x (m)": np.round(solution["x_data"], 4), "挠度 v (mm)": np.round(solution["v_data"], 4)})
    return df_summary, df_params, df_loads, df_details


def export_xlsx(solution: Dict[str, Any], material_name: str, report_options: Dict[str, Any] | None = None):
    if not HAS_OPENPYXL:
        raise RuntimeError("服务器缺少 openpyxl 库，请联系系统管理员")

    request = solution["request"]
    options = normalize_report_options(report_options)
    df_summary, df_params, df_loads, df_details = build_summary_tables(solution, material_name)
    evidence_tables = build_evidence_tables(solution, "beam", material_name, options)
    df_check = pd.DataFrame(
        [
            ["最大挠度 (mm)", round(solution["max_deflection_mm"], 4)],
            ["允许挠度 (mm)", round(solution["allowable_mm"], 4)],
            ["结果", _result_status_label(solution["status"])],
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
                ("审阅状态与签发边界", build_report_review_table(solution, "beam", report_options)),
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
                ("跨段刚度输入", evidence_tables["跨段刚度输入"]),
                ("荷载与模型", df_loads),
            ],
        )
        write_sectioned_sheet(writer, "03_单位换算", [("单位换算表", evidence_tables["单位换算表"])])
        write_sectioned_sheet(writer, "04_边界条件", [("边界条件表", evidence_tables["边界条件表"])])
        write_sectioned_sheet(
            writer,
            "05_校核证据",
            [
                *select_evidence_table_items(evidence_tables, BEAM_STANDARD_EVIDENCE_TABLES).items(),
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
        if options.get("template") == "complete":
            write_sectioned_sheet(
                writer,
                "07_完整证据链",
                [
                    *select_evidence_table_items(evidence_tables, BEAM_COMPLETE_EVIDENCE_TABLES).items(),
                ],
            )

        apply_standard_worksheet_style(writer.book)

    output.seek(0)
    return ExportArtifact(
        buffer=output,
        filename=export_filename(request["project_name"], "beam", "xlsx"),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
