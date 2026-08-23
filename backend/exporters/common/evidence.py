from __future__ import annotations

import json
import math
from typing import Any, Dict, Iterable, List, Mapping, Optional

import pandas as pd

from backend.benchmarks.catalog import find_benchmark_case, load_benchmark_catalog
from backend.exporters.common.analysis_assumptions import analysis_assumption_table_rows
from backend.common.support_catalog import support_constraint_dofs, support_label, support_released_dofs, support_system_note
from backend.contracts.json_schemas import API_SCHEMA_VERSION
from backend.exporters.common.member_materials import member_elasticity_summary
from backend.exporters.common.result_source import result_source_text

REVIEW_STATUS_LABELS = {
    "draft": "草稿",
    "ready_for_review": "可审阅",
}

FRAME_STABILITY_FULL_TABLES = (
    "稳定审查摘要",
    "P-Delta 收敛记录",
    "屈曲模态摘要",
    "屈曲节点模态向量",
    "屈曲构件模态形状",
)

FRAME_STABILITY_STANDARD_TABLES = (
    "稳定审查摘要",
    "屈曲模态摘要",
)

DOF_LABELS = {
    "ux": "ux 水平位移",
    "uy": "uy 竖向位移",
    "rz": "rz 平面转角",
    "v": "v 竖向挠度",
}


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _solution(result: Mapping[str, Any]) -> Mapping[str, Any]:
    solution = result.get("solution")
    return solution if isinstance(solution, Mapping) else result


def _evidence_payload(result: Mapping[str, Any]) -> Mapping[str, Any]:
    payload = _solution(result)
    return payload if isinstance(payload, Mapping) else {}


def _evidence_value(result: Mapping[str, Any], key: str, default: Any = None) -> Any:
    if isinstance(result, Mapping):
        value = result.get(key, default)
        if value is not None:
            return value
    payload = _evidence_payload(result)
    if key in payload:
        value = payload.get(key)
        if value is not None:
            return value
    return default


def _format_scalar(value: Any, default: str = "—") -> str:
    if value is None:
        return default
    if isinstance(value, float):
        if math.isnan(value) or math.isinf(value):
            return default
        return f"{round(value, 6)}"
    return str(value)


def build_evidence_tables(
    solution: Mapping[str, Any],
    analysis_type: str,
    material_name: str,
    report_options: Mapping[str, Any] | None = None,
) -> Dict[str, pd.DataFrame]:
    if analysis_type == "frame":
        tables = _frame_evidence(solution, material_name, report_options)
    if analysis_type == "truss":
        tables = _truss_evidence(solution, material_name)
    if analysis_type not in {"frame", "truss"}:
        tables = _beam_evidence(solution, material_name)

    tables["关键点表"] = _critical_point_table(solution, analysis_type)
    if _report_template(report_options) == "complete":
        tables["CalculationTrace"] = _calculation_trace_table(solution, analysis_type)
        tables["复核点表"] = _review_point_table(solution, analysis_type)
        tables["包络来源"] = _governing_envelope_table(solution, analysis_type)
        tables["计算快照"] = _calculation_snapshot_table(solution, analysis_type)
    return tables


def build_report_review_table(solution: Mapping[str, Any], analysis_type: str, report_options: Mapping[str, Any] | None = None) -> pd.DataFrame:
    options = report_options or {}
    review_status = str(options.get("reviewStatus") or "draft")
    benchmark = solution.get("benchmark") if isinstance(solution.get("benchmark"), Mapping) else {}
    diagnostics = solution.get("diagnostics") if isinstance(solution.get("diagnostics"), Mapping) else {}
    issue_text = _diagnostic_issue_text(diagnostics)
    benchmark_text = "未绑定当前算例 benchmark"
    if isinstance(benchmark, Mapping) and benchmark.get("caseId"):
        benchmark_text = f"{benchmark.get('caseId')} / {benchmark.get('verificationLevelLabel') or benchmark.get('sourceLabel') or '验证来源'}"
    return pd.DataFrame(
        [
            ["审阅状态", REVIEW_STATUS_LABELS.get(review_status, "草稿"), "草稿表示尚未进入工程复核；可审阅表示模型、结果来源和导出证据已准备提交复核。"],
            ["ASMS-JSON 契约版本", API_SCHEMA_VERSION, "字段语义以 JSON Schema Registry、OpenAPI 和 ASMS-JSON 文档为准。"],
            ["分析对象", {"beam": "梁系", "frame": "二维平面框架", "truss": "二维平面桁架"}.get(analysis_type, analysis_type), "不代表规范设计、承载力验算或工程签审。"],
            *_result_provenance_rows(solution),
            ["结果来源", result_source_text(solution), "主结果、指定荷载工况或指定荷载组合必须与图表和数据一致。"],
            ["公开验证参考", benchmark_text, "benchmark 仅证明其覆盖边界内的回归一致性。"],
            ["诊断警告", issue_text, "导出计算书保留诊断摘要；最终结论仍需具备资质的专业人员复核。"],
        ],
        columns=["项目", "状态/证据", "说明"],
    )


def select_evidence_table_items(tables: Mapping[str, pd.DataFrame], names: Iterable[str]) -> Dict[str, pd.DataFrame]:
    return {name: tables[name] for name in names if name in tables}


def _result_provenance_rows(solution: Mapping[str, Any]) -> List[List[str]]:
    provenance = solution.get("resultProvenance")
    if not isinstance(provenance, Mapping):
        return [["结果追溯", "未记录", "旧结果缺少对象、工程修订和模型签名，重新计算后方可形成完整追溯证据。"]]
    project_revision = provenance.get("projectRevision", "—")
    current_revision = provenance.get("currentProjectRevision", "—")
    model_signature = str(provenance.get("modelSignature") or "—")
    model_hash = str(provenance.get("modelHash") or "—")
    request_hash = str(provenance.get("requestHash") or "—")
    return [
        ["分析对象 ID", str(provenance.get("analysisObjectId") or "—"), "计算结果必须归属于当前分析对象。"],
        ["工程修订", f"计算时 {project_revision}；导出时 {current_revision}", f"计算时间 {provenance.get('solvedAt') or '—'}；模型签名一致时允许非计算性工程修订后导出。"],
        ["模型签名", f"前端 {model_signature}；后端 {model_hash}", "前端签名用于判断当前工作台模型是否仍与计算输入一致。"],
        ["请求签名", request_hash, "后端 requestHash 用于关联求解请求与结果包络。"],
    ]


def _diagnostic_issue_text(diagnostics: Mapping[str, Any]) -> str:
    issues = diagnostics.get("issues")
    if isinstance(issues, list) and issues:
        titles = [str(item.get("title") or item.get("code") or "诊断项") for item in issues if isinstance(item, Mapping)]
        return "；".join(titles[:6]) + (f"；另 {len(titles) - 6} 项" if len(titles) > 6 else "")
    warnings = diagnostics.get("warnings")
    if isinstance(warnings, list) and warnings:
        return "；".join(str(item) for item in warnings[:6])
    equilibrium = diagnostics.get("equilibrium")
    if isinstance(equilibrium, Mapping):
        rms = equilibrium.get("rmsRelativeError")
        residual = equilibrium.get("maxResidualN")
        return f"平衡残差 RMS={rms}；最大残差={residual} N"
    return "未收到阻断诊断；仍需按模型假定和适用边界复核。"


def _beam_evidence(solution: Mapping[str, Any], material_name: str) -> Dict[str, pd.DataFrame]:
    request = solution["request"]
    support_specs = list(solution.get("support_specs", request.get("supports", [])) or [])
    support_positions = list(solution.get("support_positions", []))
    load_total = _beam_vertical_load_kn(request)
    reaction_total = sum(float(item.get("vertical", 0.0)) for item in solution.get("reactions", []))
    residual = reaction_total - load_total
    relative = _relative_error(residual, load_total)
    max_moment_value, max_moment_x = _series_abs_control(solution.get("element_end_moments", []), solution.get("x_data", []), scale=1.0 / 1000.0)
    max_shear_value, max_shear_x = _series_abs_control(solution.get("element_end_shears", []), solution.get("x_data", []), scale=1.0 / 1000.0)

    return {
        "工程输入摘要": pd.DataFrame(
            [
                ["结构类型", request.get("beam_type_label", "梁系")],
                ["荷载类型", request.get("load_type_label", "—")],
                ["材料名称", material_name],
                ["材料适用范围", "材料名称为项目默认材料说明；梁系整体刚度按各跨段 E_GPa / I_cm4 输入装配。"],
                ["跨段布置", " + ".join(str(span) for span in request.get("spans", [])) + " m"],
                ["节点/支座数量", f"{len(solution.get('span_boundaries', []))} 个计算节点，{len(support_positions)} 个支座"],
                ["支座体系说明", support_system_note("beam")],
                ["原始输入单位", "E: GPa；I: cm^4；q: kN/m；P: kN；长度: m"],
            ],
            columns=["项目", "数值/说明"],
        ),
        "模型假定与适用范围": pd.DataFrame(
            list(analysis_assumption_table_rows("beam")),
            columns=["项目", "说明"],
        ),
        "单位换算表": pd.DataFrame(
            [
                ["弹性模量 E", f"{request.get('E_gpa', '—')} GPa", "Pa", "1 GPa = 1e9 Pa"],
                ["截面惯性矩 I", f"{request.get('I_cm4', '—')} cm^4", "m^4", "1 cm^4 = 1e-8 m^4"],
                ["剪切面积 A", f"{request.get('A_cm2', '—')} cm^2", "m^2", "1 cm^2 = 1e-4 m^2"],
                ["均布/线荷载 q", "kN/m", "N/m", "1 kN/m = 1000 N/m"],
                ["集中荷载 P", "kN", "N", "1 kN = 1000 N"],
            ],
            columns=["输入量", "原始输入", "计算单位", "换算关系"],
        ),
        "跨段刚度输入": _beam_span_stiffness_table(request),
        "边界条件表": _beam_boundary_table(support_specs, support_positions),
        "计算方法说明": pd.DataFrame(
            [
                ["1", "按跨段、支座和荷载位置生成梁单元网格"],
                ["2", "采用 Hermite 位移插值形成梁单元刚度矩阵"],
                ["3", "组装整体刚度矩阵 K 与等效节点荷载向量 F"],
                ["4", "施加支座约束、弹性约束刚度与端部释放后求解节点位移"],
                ["5", "由单元位移恢复弯矩、剪力、支座反力和控制挠度"],
            ],
            columns=["步骤", "说明"],
        ),
        "校核证据": pd.DataFrame(
            [
                ["竖向平衡校核", f"外荷载合力 {round(load_total, 6)} kN；支座反力合力 {round(reaction_total, 6)} kN", f"残差 {round(residual, 6)} kN，相对误差 {_format_percent(relative)}"],
                ["公开验证集", _benchmark_summary_text("beam"), "仅证明当前分析类型验证集覆盖范围内的回归一致性"],
                *_active_benchmark_rows(solution),
                *_learning_review_rows(solution),
                ["标准/教学校核", _symbolic_check_text(solution), "有解析或教材公式时列出理论值、求解值和适用限制"],
                ["控制挠度", f"{round(solution.get('max_deflection_mm', 0.0), 6)} mm @ x={round(solution.get('max_deflection_position_m', 0.0), 6)} m", f"允许值 {round(solution.get('allowable_mm', 0.0), 6)} mm"],
                ["控制弯矩", f"{round(max_moment_value, 6)} kN.m @ x={round(max_moment_x, 6)} m", "按弯矩图绝对值最大点提取"],
                ["控制剪力", f"{round(max_shear_value, 6)} kN @ x={round(max_shear_x, 6)} m", "按剪力图绝对值最大点提取"],
            ],
            columns=["校核项", "求解证据", "说明"],
        ),
        "关键控制项": pd.DataFrame(
            [
                ["最大挠度", f"x={round(solution.get('max_deflection_position_m', 0.0), 6)} m", f"{round(solution.get('max_deflection_mm', 0.0), 6)} mm", "挠度绝对值最大"],
                ["最大弯矩", f"x={round(max_moment_x, 6)} m", f"{round(max_moment_value, 6)} kN.m", "弯矩绝对值最大"],
                ["最大剪力", f"x={round(max_shear_x, 6)} m", f"{round(max_shear_value, 6)} kN", "剪力绝对值最大"],
            ],
            columns=["控制项", "位置/对象", "数值", "判定依据"],
        ),
    }


def _beam_span_stiffness_table(request: Mapping[str, Any]) -> pd.DataFrame:
    rows = []
    spans = list(request.get("spans", []))
    span_ids = list(request.get("span_ids", []))
    span_E = list(request.get("span_E_gpa", []))
    span_I = list(request.get("span_I_cm4", []))
    for index, span in enumerate(spans):
        rows.append(
            {
                "跨段": str(span_ids[index]) if index < len(span_ids) else f"({index + 1})",
                "长度": f"{round(float(span), 6)} m",
                "弹性模量 E": f"{round(float(span_E[index]), 6)} GPa" if index < len(span_E) else "—",
                "截面惯性矩 I": f"{round(float(span_I[index]), 6)} cm^4" if index < len(span_I) else "—",
                "说明": "该跨段刚度参与梁单元刚度矩阵装配",
            }
        )
    return pd.DataFrame(rows or [{"跨段": "—", "长度": "—", "弹性模量 E": "—", "截面惯性矩 I": "—", "说明": "—"}])


def _frame_evidence(solution: Mapping[str, Any], material_name: str, report_options: Mapping[str, Any] | None = None) -> Dict[str, pd.DataFrame]:
    structure = solution["structure"]
    equilibrium = _frame_equilibrium(solution)
    max_node = _max_by_abs(solution.get("nodeResults", []), "resultantMm")
    max_moment = _max_frame_moment(solution.get("memberResults", []))
    stability_tables = _frame_stability_evidence(solution, report_options)
    return {
        "工程输入摘要": pd.DataFrame(
            [
                ["结构类型", "二维平面框架"],
                ["材料名称", material_name],
                ["材料适用范围", "材料名称为项目默认材料说明；框架整体刚度按各构件 E_GPa / A_cm2 / I_cm4 输入装配。"],
                ["构件弹性模量分布", member_elasticity_summary(structure.get("members", []), "构件")],
                ["节点数量", len(structure.get("nodes", []))],
                ["构件数量", len(structure.get("members", []))],
                ["荷载数量", len(structure.get("loads", []))],
                ["支座体系说明", support_system_note("frame")],
                ["原始输入单位", "E: GPa；A: cm^2；I: cm^4；节点荷载: kN/kN.m；分布荷载: kN/m"],
            ],
            columns=["项目", "数值/说明"],
        ),
        "模型假定与适用范围": pd.DataFrame(
            list(analysis_assumption_table_rows("frame")),
            columns=["项目", "说明"],
        ),
        "单位换算表": _member_unit_table(include_inertia=True),
        "边界条件表": _node_boundary_table(structure.get("nodes", []), "frame"),
        "计算方法说明": pd.DataFrame(
            [
                ["1", "按节点与构件生成二维平面框架单元"],
                ["2", "计算构件局部刚度矩阵并转换至全局坐标"],
                ["3", "装配整体刚度矩阵 K 与荷载向量 F"],
                ["4", "施加支座约束、弹性约束刚度、端部释放和内部铰"],
                ["5", "求解节点位移，并恢复构件轴力、剪力、弯矩与支座反力"],
                ["6", "若启用稳定分析，则先做几何刚度 P-Delta 迭代，再做广义特征值屈曲求解"],
            ],
            columns=["步骤", "说明"],
        ),
        "校核证据": pd.DataFrame(
            [
                ["X 向平衡校核", f"外荷载 {round(equilibrium['loadFxKn'], 6)} kN；支座反力 {round(equilibrium['reactionFxKn'], 6)} kN", f"残差 {round(equilibrium['residualFxKn'], 6)} kN，相对误差 {_format_percent(equilibrium['relativeFx'])}"],
                ["Y 向平衡校核", f"外荷载 {round(equilibrium['loadFyKn'], 6)} kN；支座反力 {round(equilibrium['reactionFyKn'], 6)} kN", f"残差 {round(equilibrium['residualFyKn'], 6)} kN，相对误差 {_format_percent(equilibrium['relativeFy'])}"],
                ["公开验证集", _benchmark_summary_text("frame"), "仅证明当前分析类型验证集覆盖范围内的回归一致性"],
                *_active_benchmark_rows(solution),
                *_learning_review_rows(solution),
                ["控制位移", _node_control_text(max_node), f"允许值 {round(solution.get('summary', {}).get('allowableMm', 0.0), 6)} mm"],
                ["控制弯矩", _frame_moment_text(max_moment), "按所有杆端弯矩绝对值最大提取"],
                ["稳定审查", f"P-Delta: {solution.get('secondOrder', {}).get('status', 'disabled')}；屈曲: {solution.get('buckling', {}).get('status', 'disabled')}", "该项为正式稳定审查证据"],
            ],
            columns=["校核项", "求解证据", "说明"],
        ),
        "关键控制项": pd.DataFrame(
            [
                ["最大节点位移", max_node.get("nodeId", "—"), f"{round(float(max_node.get('resultantMm', max_node.get('displacementMm', 0.0))), 6)} mm", "节点合位移最大"],
                ["最大杆端弯矩", max_moment.get("location", "—"), f"{round(float(max_moment.get('value', 0.0)), 6)} kN.m", "杆端弯矩绝对值最大"],
                ["最大二阶放大系数", "结构整体", str(solution.get("secondOrder", {}).get("amplificationFactor", "—")), "P-Delta 迭代结果"],
            ],
            columns=["控制项", "位置/对象", "数值", "判定依据"],
        ),
        **stability_tables,
    }


def _frame_stability_evidence(solution: Mapping[str, Any], report_options: Mapping[str, Any] | None = None) -> Dict[str, pd.DataFrame]:
    second_order = solution.get("secondOrder") if isinstance(solution.get("secondOrder"), Mapping) else {}
    buckling = solution.get("buckling") if isinstance(solution.get("buckling"), Mapping) else {}
    template = _report_template(report_options)
    tables: Dict[str, pd.DataFrame] = {}

    tables["稳定审查摘要"] = pd.DataFrame(
        [
            ["P-Delta 状态", second_order.get("status", "disabled"), "enabled" if second_order.get("enabled") else "disabled"],
            ["P-Delta 方法", second_order.get("method", "—"), f"loadSteps={second_order.get('loadSteps', '—')}，maxIterations={second_order.get('maxIterations', '—')}，tolerance={second_order.get('tolerance', '—')}"],
            ["P-Delta 放大系数", second_order.get("amplificationFactor", "—"), f"first={second_order.get('firstOrderMaxDisplacementMm', '—')} mm，second={second_order.get('maxDisplacementMm', '—')} mm"],
            ["P-Delta 失败原因", second_order.get("failureReason", "—") or "—", second_order.get("limitations", "—")],
            ["P-Delta 参考来源", _source_summary_text(second_order.get("referenceSource")), _source_note_text(second_order.get("referenceSource"))],
            ["P-Delta 控制来源", _source_summary_text(second_order.get("controlSource")), _source_note_text(second_order.get("controlSource"))],
            ["屈曲状态", buckling.get("status", "disabled"), "enabled" if buckling.get("enabled") else "disabled"],
            ["屈曲方法", buckling.get("method", "—"), f"modeCount={buckling.get('modeCount', '—')}"],
            [
                "整体首阶临界系数",
                buckling.get("criticalLoadFactor", "—"),
                "来自约束空间广义特征值；构件 Euler K=1 初筛仅用于定位复核对象，不替代整体屈曲结论："
                f"{json.dumps(buckling.get('memberEulerScreen', buckling.get('controllingMembers', [])), ensure_ascii=False)}",
            ],
            ["屈曲失败原因", buckling.get("failureReason", "—") or "—", buckling.get("limitations", "—")],
            ["屈曲参考来源", _source_summary_text(buckling.get("referenceSource")), _source_note_text(buckling.get("referenceSource"))],
            ["屈曲控制来源", _source_summary_text(buckling.get("controlSource")), _source_note_text(buckling.get("controlSource"))],
        ],
        columns=["项目", "结果", "说明"],
    )

    history_rows: List[Dict[str, Any]] = []
    for record in second_order.get("iterationHistory", []) if isinstance(second_order.get("iterationHistory"), list) else []:
        if not isinstance(record, Mapping):
            continue
        history_rows.append(
            {
                "step": record.get("step", "—"),
                "loadFactor": record.get("loadFactor", "—"),
                "iteration": record.get("iteration", "—"),
                "deltaRatio": record.get("deltaRatio", "—"),
                "maxDelta": record.get("maxDelta", "—"),
                "displacementIncrementNorm": record.get("displacementIncrementNorm", "—"),
                "relativeDisplacementIncrement": record.get("relativeDisplacementIncrement", "—"),
                "equilibriumResidual": record.get("equilibriumResidual", record.get("equilibriumRmsRelativeError", "—")),
                "maxDisplacementMm": record.get("maxDisplacementMm", "—"),
                "equilibriumRmsRelativeError": record.get("equilibriumRmsRelativeError", "—"),
            }
        )
    if template != "standard":
        tables["P-Delta 收敛记录"] = pd.DataFrame(
            history_rows
            or [{
                "step": "—",
                "loadFactor": "—",
                "iteration": "—",
                "deltaRatio": "—",
                "maxDelta": "—",
                "displacementIncrementNorm": "—",
                "relativeDisplacementIncrement": "—",
                "equilibriumResidual": "—",
                "maxDisplacementMm": "—",
                "equilibriumRmsRelativeError": "—",
            }]
        )

    mode_summary_rows: List[Dict[str, Any]] = []
    node_mode_rows: List[Dict[str, Any]] = []
    member_shape_rows: List[Dict[str, Any]] = []
    for mode in buckling.get("modes", []) if isinstance(buckling.get("modes"), list) else []:
        if not isinstance(mode, Mapping):
            continue
        mode_number = mode.get("modeNumber", "—")
        mode_summary_rows.append(
            {
                "modeNumber": mode_number,
                "criticalLoadFactor": mode.get("criticalLoadFactor", "—"),
                "eigenResidualNorm": mode.get("eigenResidualNorm", mode.get("residualNorm", "—")),
                "constraintResidualNorm": mode.get("constraintResidualNorm", mode.get("constraintResidual", "—")),
                "nodeCount": len(mode.get("nodeDisplacements", []) or []),
                "memberShapeCount": len(mode.get("memberModeShapes", []) or []),
            }
        )
        if template == "complete":
            for node in mode.get("nodeDisplacements", []) if isinstance(mode.get("nodeDisplacements"), list) else []:
                if not isinstance(node, Mapping):
                    continue
                node_mode_rows.append(
                    {
                        "modeNumber": mode_number,
                        "nodeId": node.get("nodeId", "—"),
                        "ux": node.get("ux", node.get("uxMm", "—")),
                        "uy": node.get("uy", node.get("uyMm", "—")),
                        "rz": node.get("rz", node.get("rotationDeg", "—")),
                    }
                )
            for shape in mode.get("memberModeShapes", []) if isinstance(mode.get("memberModeShapes"), list) else []:
                if not isinstance(shape, Mapping):
                    continue
                stations_m = list(shape.get("stationsM", [])) if isinstance(shape.get("stationsM"), list) else []
                ratios = list(shape.get("ratios", [])) if isinstance(shape.get("ratios"), list) else []
                ux_values = list(shape.get("ux", [])) if isinstance(shape.get("ux"), list) else []
                uy_values = list(shape.get("uy", [])) if isinstance(shape.get("uy"), list) else []
                rz_values = list(shape.get("rz", [])) if isinstance(shape.get("rz"), list) else []
                station_count = max(len(stations_m), len(ratios), len(ux_values), len(uy_values), len(rz_values), 1)
                for index in range(station_count):
                    member_shape_rows.append(
                        {
                            "modeNumber": mode_number,
                            "memberId": shape.get("memberId", "—"),
                            "stationIndex": index + 1,
                            "stationM": _list_value_at(stations_m, index, "—"),
                            "ratio": _list_value_at(ratios, index, "—"),
                            "ux": _list_value_at(ux_values, index, "—"),
                            "uy": _list_value_at(uy_values, index, "—"),
                            "rz": _list_value_at(rz_values, index, "—"),
                        }
                    )
    mode_summary_frame = pd.DataFrame(mode_summary_rows or [{"modeNumber": "—", "criticalLoadFactor": "—", "eigenResidualNorm": "—", "constraintResidualNorm": "—", "nodeCount": "—", "memberShapeCount": "—"}])
    if template == "standard":
        mode_summary_frame = mode_summary_frame.head(1).reset_index(drop=True)
    tables["屈曲模态摘要"] = mode_summary_frame
    if template == "complete":
        tables["屈曲节点模态向量"] = pd.DataFrame(node_mode_rows or [{"modeNumber": "—", "nodeId": "—", "ux": "—", "uy": "—", "rz": "—"}])
        tables["屈曲构件模态形状"] = pd.DataFrame(member_shape_rows or [{"modeNumber": "—", "memberId": "—", "stationIndex": "—", "stationM": "—", "ratio": "—", "ux": "—", "uy": "—", "rz": "—"}])
    return tables


def _report_template(report_options: Mapping[str, Any] | None) -> str:
    template = str((report_options or {}).get("template") or "complete").strip().lower()
    return template if template in {"standard", "complete"} else "complete"


def _control_entry_source_text(entry: Mapping[str, Any]) -> str:
    source_type = str(entry.get("sourceType") or "legacy")
    source_id = str(entry.get("sourceId") or entry.get("id") or "—")
    labels = {
        "main": "主结果",
        "system": "系统点",
        "request": "复核点",
        "legacy": "旧结果",
    }
    return f"{labels.get(source_type, source_type)} [{source_id}]"


def _control_entry_station_text(entry: Mapping[str, Any]) -> str:
    if entry.get("station") is not None:
        return f"x={round(_float(entry.get('station'), 0.0), 6)} m"
    if entry.get("stationRatio") is not None:
        return f"{round(_float(entry.get('stationRatio'), 0.0) * 100.0, 2)}%"
    return "—"


def _control_entry_object_text(entry: Mapping[str, Any]) -> str:
    object_type = str(entry.get("object") or entry.get("objectType") or "—")
    object_id = str(entry.get("objectId") or entry.get("id") or "—")
    if object_type == "node":
        return f"节点 {object_id}"
    if object_type == "member":
        return f"构件 {object_id}"
    if object_type == "beam":
        return f"梁系 {object_id}"
    if object_type == "truss":
        return f"桁架 {object_id}"
    return f"{object_type} {object_id}".strip()


def _control_entry_metric_text(entry: Mapping[str, Any]) -> str:
    metric = str(entry.get("metric") or "—")
    kind = str(entry.get("kind") or "—")
    if kind == "legacy":
        return metric
    if metric == "—":
        return kind
    return f"{metric} / {kind}"


def _control_entry_rows(
    result: Mapping[str, Any],
    analysis_type: str,
    *,
    source_key: str,
    fallback_source: str,
) -> List[Dict[str, Any]]:
    source = _mapping(_evidence_value(result, source_key, {}))
    if source_key == "reviewPoints":
        points = _list(source.get("requestedPoints")) or _list(source.get("points"))
    else:
        points = _list(source.get("points"))
    if points:
        rows: List[Dict[str, Any]] = []
        for point in points:
            if not isinstance(point, Mapping):
                continue
            rows.append(
                {
                    "key": str(point.get("id") or point.get("sourceId") or point.get("objectId") or "—"),
                    "sourceType": point.get("sourceType", fallback_source),
                    "sourceId": point.get("sourceId", point.get("id", "—")),
                    "object": point.get("object", "—"),
                    "objectId": point.get("objectId", "—"),
                    "metric": point.get("metric", "—"),
                    "kind": point.get("kind", "—"),
                    "station": point.get("station"),
                    "stationRatio": point.get("stationRatio"),
                    "value": point.get("value", "—"),
                    "unit": point.get("unit", "—"),
                    "note": "readOnly=" + str(bool(point.get("readOnly"))),
                    "selector": json.dumps(point.get("selector", {}), ensure_ascii=False) if point.get("selector") else "—",
                }
            )
        return rows
    return []


def _critical_point_table(result: Mapping[str, Any], analysis_type: str) -> pd.DataFrame:
    rows = _control_entry_rows(result, analysis_type, source_key="criticalPoints", fallback_source="canonical")
    if not rows:
        return pd.DataFrame(
            [[
                "关键点摘要",
                "unavailable",
                "—",
                "—",
                "—",
                "—",
                "—",
                "当前结果未提供 criticalPoints；仅展示摘要，不重算。",
            ]],
            columns=["关键点", "来源", "对象", "指标", "测站", "数值", "单位", "说明"],
        )
    return pd.DataFrame(
        [
            [
                row["key"],
                _control_entry_source_text(row),
                _control_entry_object_text(row),
                _control_entry_metric_text(row),
                _control_entry_station_text(row),
                _format_scalar(row["value"]),
                _format_scalar(row["unit"]),
                row["note"],
            ]
            for row in rows
        ],
        columns=["关键点", "来源", "对象", "指标", "测站", "数值", "单位", "说明"],
    )


def _review_point_table(result: Mapping[str, Any], analysis_type: str) -> pd.DataFrame:
    rows = _control_entry_rows(result, analysis_type, source_key="reviewPoints", fallback_source="canonical")
    if not rows:
        return pd.DataFrame(
            [[
                "复核点摘要",
                "unavailable",
                "—",
                "—",
                "—",
                "—",
                "—",
                "当前结果未提供 reviewPoints；仅展示摘要，不重算。",
            ]],
            columns=["复核点", "来源", "对象", "指标", "测站", "数值", "单位", "选择器"],
        )
    return pd.DataFrame(
        [
            [
                row["key"],
                _control_entry_source_text(row),
                _control_entry_object_text(row),
                _control_entry_metric_text(row),
                _control_entry_station_text(row),
                _format_scalar(row["value"]),
                _format_scalar(row["unit"]),
                row["selector"],
            ]
            for row in rows
        ],
        columns=["复核点", "来源", "对象", "指标", "测站", "数值", "单位", "选择器"],
    )


def _governing_envelope_table(result: Mapping[str, Any], analysis_type: str) -> pd.DataFrame:
    envelope = _mapping(_evidence_value(result, "governingEnvelope", {}))
    entries = _list(envelope.get("entries"))
    if entries:
        rows = []
        for entry in entries:
            if not isinstance(entry, Mapping):
                continue
            rows.append(
                [
                    str(entry.get("id") or entry.get("sourcePointId") or "—"),
                    _control_entry_source_text(entry),
                    _control_entry_object_text(entry),
                    _control_entry_metric_text(entry),
                    str(entry.get("kind") or "—"),
                    _control_entry_station_text(entry),
                    _format_scalar(entry.get("value")),
                    _format_scalar(entry.get("unit")),
                    str(entry.get("sourcePointId") or "—"),
                ]
            )
        if rows:
            return pd.DataFrame(rows, columns=["包络项", "来源", "对象", "指标", "类型", "测站", "数值", "单位", "来源点"])

    return pd.DataFrame(
        [[
            "包络摘要",
            "unavailable",
            "—",
            "—",
            "—",
            "—",
            "—",
            "当前结果未提供 governingEnvelope；仅展示摘要，不重算。",
            "—",
        ]],
        columns=["包络项", "来源", "对象", "指标", "类型", "测站", "数值", "单位", "来源点"],
    )


def _calculation_trace_table(result: Mapping[str, Any], analysis_type: str) -> pd.DataFrame:
    trace = _mapping(_evidence_value(result, "calculationTrace", {}))
    rows: List[List[str]] = [
        ["分析类型", analysis_type, "—"],
        ["请求签名", _format_scalar(trace.get("requestHash", result.get("requestHash", "—"))), "—"],
        ["模型签名", _format_scalar(trace.get("modelHash", result.get("modelHash", "—"))), "—"],
        ["结果签名", _format_scalar(trace.get("resultHash", result.get("resultHash", "—"))), "—"],
    ]
    stages = _list(trace.get("stages"))
    if stages:
        rows.append(["阶段数", _format_scalar(trace.get("stageCount", len(stages))), "—"])
        for stage in stages:
            if not isinstance(stage, Mapping):
                continue
            rows.append(
                [
                    str(stage.get("stage") or "—"),
                    _format_mapping_summary(stage.get("summary")),
                    f"bounded={stage.get('bounded', '—')}；truncated={stage.get('truncated', '—')}",
                ]
            )
    else:
        rows.append(["证据状态", "unavailable", "当前结果未提供 calculationTrace；仅展示摘要，不重算。"])
    return pd.DataFrame(rows, columns=["阶段", "摘要", "边界/计数"])


def _calculation_snapshot_table(result: Mapping[str, Any], analysis_type: str) -> pd.DataFrame:
    snapshot = _mapping(_evidence_value(result, "calculationSnapshot", {}))
    summary = _mapping(snapshot.get("summary"))
    diagnostics = _mapping(snapshot.get("diagnostics"))
    evidence_hashes = _mapping(snapshot.get("evidenceHashes"))
    counts = _mapping(snapshot.get("counts"))
    rows = [
        ["分析类型", _format_scalar(snapshot.get("analysisType", analysis_type)), "—"],
        ["阶段", _format_scalar(snapshot.get("stage", "completed")), "—"],
        ["操作", _format_scalar(snapshot.get("operation", result.get("operation", "calculate"))), "—"],
        ["结果状态", _format_scalar(summary.get("status", "—")), _format_scalar(summary.get("method", "—"))],
        ["结果码", _format_scalar(summary.get("statusCode", "—")), "—"],
        ["诊断状态", _format_scalar(diagnostics.get("status", "—")), _format_scalar(diagnostics.get("statusCode", "—"))],
        ["requestHash", _format_scalar(snapshot.get("requestHash", result.get("requestHash", "—"))), "—"],
        ["modelHash", _format_scalar(snapshot.get("modelHash", result.get("modelHash", "—"))), "—"],
        ["resultHash", _format_scalar(snapshot.get("resultHash", result.get("resultHash", "—"))), "—"],
        ["criticalPoints", _format_scalar(counts.get("criticalPoints", "—")), "—"],
        ["reviewPoints", _format_scalar(counts.get("reviewPoints", "—")), "—"],
        ["governingEnvelope", _format_scalar(counts.get("governingEnvelope", "—")), "—"],
        ["calculationTrace", _format_scalar(evidence_hashes.get("calculationTrace", "—")), "—"],
        ["criticalPointsHash", _format_scalar(evidence_hashes.get("criticalPoints", "—")), "—"],
        ["reviewPointsHash", _format_scalar(evidence_hashes.get("reviewPoints", "—")), "—"],
        ["governingEnvelopeHash", _format_scalar(evidence_hashes.get("governingEnvelope", "—")), "—"],
    ]
    if analysis_type == "frame":
        rows.append(["secondOrderAmplificationFactor", _format_scalar(summary.get("secondOrderAmplificationFactor", "—")), "—"])
    if isinstance(diagnostics.get("equilibrium"), Mapping):
        eq = diagnostics.get("equilibrium")
        rows.append(["equilibrium.rmsRelativeError", _format_scalar(eq.get("rmsRelativeError", "—")), "—"])
    if not snapshot:
        rows.insert(0, ["证据状态", "unavailable", "当前结果未提供 calculationSnapshot；仅展示摘要，不重算。"])
    return pd.DataFrame(rows, columns=["项目", "值", "说明"])


def _list_value_at(values: List[Any], index: int, default: Any = "—") -> Any:
    if 0 <= index < len(values):
        value = values[index]
        return value if value is not None else default
    return default


def _source_summary_text(source: Any) -> str:
    if not isinstance(source, Mapping):
        return "—"
    source_type = str(source.get("source") or "primary")
    source_id = str(source.get("id") or "__primary__")
    title = str(source.get("title") or source.get("label") or source_id)
    if source_type == "primary":
        return f"主结果 / {title}"
    source_label = {"case": "工况", "combination": "组合"}.get(source_type, source_type)
    return f"{source_label} {title} [{source_id}]"


def _source_note_text(source: Any) -> str:
    if not isinstance(source, Mapping):
        return "—"
    source_type = str(source.get("source") or "primary")
    if source_type == "primary":
        return "主结果来源"
    return "引用工况/组合"


def _truss_evidence(solution: Mapping[str, Any], material_name: str) -> Dict[str, pd.DataFrame]:
    structure = solution["structure"]
    equilibrium = _truss_equilibrium(solution)
    max_node = _max_by_abs(solution.get("nodeResults", []), "displacementMm")
    max_member = _max_by_abs(solution.get("memberResults", []), "axialForceKn")
    return {
        "工程输入摘要": pd.DataFrame(
            [
                ["结构类型", "二维平面桁架"],
                ["材料名称", material_name],
                ["材料适用范围", "材料名称为项目默认材料说明；桁架整体刚度按各杆件 E_GPa / A_cm2 输入装配。"],
                ["杆件弹性模量分布", member_elasticity_summary(structure.get("members", []), "杆件")],
                ["节点数量", len(structure.get("nodes", []))],
                ["杆件数量", len(structure.get("members", []))],
                ["荷载数量", len(structure.get("loads", []))],
                ["支座体系说明", support_system_note("truss")],
                ["原始输入单位", "E: GPa；A: cm^2；节点荷载: kN；杆件轴力: kN"],
            ],
            columns=["项目", "数值/说明"],
        ),
        "模型假定与适用范围": pd.DataFrame(
            list(analysis_assumption_table_rows("truss")),
            columns=["项目", "说明"],
        ),
        "单位换算表": _member_unit_table(include_inertia=False),
        "边界条件表": _node_boundary_table(structure.get("nodes", []), "truss"),
        "计算方法说明": pd.DataFrame(
            [
                ["1", "按节点与杆件生成二维桁架杆单元"],
                ["2", "由杆件方向余弦形成轴向刚度矩阵"],
                ["3", "装配整体平衡方程 K·u=F"],
                ["4", "施加 ux / uy 平动支座约束后求解节点位移"],
                ["5", "由杆件两端位移恢复轴力与轴应力"],
            ],
            columns=["步骤", "说明"],
        ),
        "校核证据": pd.DataFrame(
            [
                ["X 向平衡校核", f"外荷载 {round(equilibrium['loadFxKn'], 6)} kN；支座反力 {round(equilibrium['reactionFxKn'], 6)} kN", f"残差 {round(equilibrium['residualFxKn'], 6)} kN，相对误差 {_format_percent(equilibrium['relativeFx'])}"],
                ["Y 向平衡校核", f"外荷载 {round(equilibrium['loadFyKn'], 6)} kN；支座反力 {round(equilibrium['reactionFyKn'], 6)} kN", f"残差 {round(equilibrium['residualFyKn'], 6)} kN，相对误差 {_format_percent(equilibrium['relativeFy'])}"],
                ["公开验证集", _benchmark_summary_text("truss"), "仅证明当前分析类型验证集覆盖范围内的回归一致性"],
                *_active_benchmark_rows(solution),
                *_learning_review_rows(solution),
                ["求解残差", f"RMS 相对误差 {solution.get('summary', {}).get('equilibriumRmsRelativeError', '—')}", f"最大残差 {solution.get('summary', {}).get('equilibriumMaxResidualN', '—')} N"],
                ["控制位移", _node_control_text(max_node), f"允许值 {round(solution.get('summary', {}).get('allowableMm', 0.0), 6)} mm"],
                ["控制轴力", f"{max_member.get('memberId', '—')}：{round(abs(float(max_member.get('axialForceKn', 0.0))), 6)} kN", "按杆件轴力绝对值最大提取"],
            ],
            columns=["校核项", "求解证据", "说明"],
        ),
        "关键控制项": pd.DataFrame(
            [
                ["最大节点位移", max_node.get("nodeId", "—"), f"{round(float(max_node.get('displacementMm', 0.0)), 6)} mm", "节点合位移最大"],
                ["最大杆件轴力", max_member.get("memberId", "—"), f"{round(abs(float(max_member.get('axialForceKn', 0.0))), 6)} kN", "杆件轴力绝对值最大"],
                ["最大杆件轴应力", _max_stress_member(solution.get("memberResults", [])), _max_stress_value(solution.get("memberResults", [])), "杆件轴应力绝对值最大"],
            ],
            columns=["控制项", "位置/对象", "数值", "判定依据"],
        ),
    }


def _beam_boundary_table(support_specs: List[Mapping[str, Any]], support_positions: List[Any]) -> pd.DataFrame:
    rows = []
    for index, position in enumerate(support_positions):
        support = support_specs[index] if index < len(support_specs) else {}
        support_type = str(support.get("type", "pinned"))
        constraints = support.get("constraints") if "constraints" in support and support.get("constraints") is not None else support_constraint_dofs("beam", support_type)
        springs = support.get("springs") or []
        rows.append(
            {
                "支座/节点": support.get("id", f"S{index + 1}"),
                "位置": f"x={round(float(position), 6)} m",
                "支座类型": support_label("beam", support_type),
                "约束自由度": _format_dofs(constraints),
                "弹性约束刚度": _format_springs(springs),
                "释放/内铰": "梁单元端部释放见结构模型；未设置则为连续转角",
            }
        )
    return pd.DataFrame(rows or [{"支座/节点": "—", "位置": "—", "支座类型": "—", "约束自由度": "—", "弹性约束刚度": "—", "释放/内铰": "—"}])


def _node_boundary_table(nodes: Iterable[Mapping[str, Any]], analysis_type: str) -> pd.DataFrame:
    if analysis_type == "truss":
        return _truss_boundary_table(nodes)

    rows = []
    for node in nodes:
        support_type = str(node.get("supportType", "free"))
        constraints = support_constraint_dofs(analysis_type, support_type)  # type: ignore[arg-type]
        if node.get("condensedDofs"):
            constraints = [*constraints, *node.get("condensedDofs", [])]
        rows.append(
            {
                "节点": node.get("id", "—"),
                "位置": f"({round(float(node.get('x', 0.0)), 6)}, {round(float(node.get('y', 0.0)), 6)}) m",
                "支座类型": support_label(analysis_type, support_type),  # type: ignore[arg-type]
                "约束自由度": _format_frame_constraint_text(node, constraints),
                "弹性约束刚度": _format_springs(node.get("springs", [])),
                "释放/内铰": _format_frame_release_text(node, support_type),
            }
        )
    return pd.DataFrame(rows or [{"节点": "—", "位置": "—", "支座类型": "—", "约束自由度": "—", "弹性约束刚度": "—", "释放/内铰": "—"}])


def _truss_boundary_table(nodes: Iterable[Mapping[str, Any]]) -> pd.DataFrame:
    rows = []
    for node in nodes:
        support_type = str(node.get("supportType", "free"))
        constraints = support_constraint_dofs("truss", support_type)
        rows.append(
            {
                "节点": node.get("id", "—"),
                "位置": f"({round(float(node.get('x', 0.0)), 6)}, {round(float(node.get('y', 0.0)), 6)}) m",
                "支座类型": support_label("truss", support_type),
                "约束自由度": _format_dofs(constraints),
                "边界口径": "仅 ux/uy 平动支座约束；不含节点转角与弹性约束",
            }
        )
    return pd.DataFrame(rows or [{"节点": "—", "位置": "—", "支座类型": "—", "约束自由度": "—", "边界口径": "—"}])


def _member_unit_table(*, include_inertia: bool) -> pd.DataFrame:
    rows = [
        ["弹性模量 E", "GPa", "Pa", "1 GPa = 1e9 Pa"],
        ["截面面积 A", "cm^2", "m^2", "1 cm^2 = 1e-4 m^2"],
        ["节点荷载 P", "kN", "N", "1 kN = 1000 N"],
        ["长度 L", "m", "m", "输入单位与计算单位一致"],
    ]
    if include_inertia:
        rows.insert(2, ["截面惯性矩 I", "cm^4", "m^4", "1 cm^4 = 1e-8 m^4"])
        rows.append(["构件分布荷载 q", "kN/m", "N/m", "1 kN/m = 1000 N/m"])
        rows.append(["节点力矩 M", "kN.m", "N.m", "1 kN.m = 1000 N.m"])
    return pd.DataFrame(rows, columns=["输入量", "原始单位", "计算单位", "换算关系"])


def _benchmark_summary_text(analysis_type: str) -> str:
    catalog = load_benchmark_catalog()
    cases = catalog.get("cases", [])
    categories_by_type = {
        "beam": {"beam"},
        "frame": {"frame", "frame-beam-verify"},
        "truss": {"truss", "truss-verify"},
    }
    categories = categories_by_type.get(analysis_type, {analysis_type})
    relevant_cases = [case for case in cases if str(case.get("category", "")) in categories]
    source_types = sorted(
        {
            str(case.get("verification", {}).get("sourceType", ""))
            for case in relevant_cases
            if case.get("verification", {}).get("sourceType")
        }
    )
    category_text = "/".join(sorted(categories))
    return f"当前分析类型 {category_text} 覆盖 {len(relevant_cases)} 个算例；全量公开验证集 {len(cases)} 个；来源类型：{', '.join(source_types)}"


def _active_benchmark_rows(solution: Mapping[str, Any]) -> List[List[str]]:
    benchmark = solution.get("benchmark")
    if not isinstance(benchmark, Mapping):
        return []
    case_id = str(benchmark.get("caseId", "")).strip()
    if not case_id:
        return []
    source = str(benchmark.get("sourceLabel") or benchmark.get("sourceType") or "验证来源")
    level = str(benchmark.get("verificationLevelLabel") or benchmark.get("verificationLevel") or "未标注")
    reference = str(benchmark.get("reference") or benchmark.get("method") or "当前计算书导出时随分析对象传入")
    expected = str(benchmark.get("expectedSummary") or _format_mapping_summary(benchmark.get("expected", {})))
    tolerance = str(benchmark.get("toleranceSummary") or _format_mapping_summary(benchmark.get("tolerances", {})))
    rows = [
        ["当前算例验证等级", level, "A=教材解析解；B=独立刚度法；C=工程软件对标；D=内部回归"],
        ["当前算例来源", f"{case_id} / {source}", reference],
    ]
    if expected:
        rows.append(["当前算例标准值", expected, "来源于 benchmark expected 字段"])
    if tolerance:
        rows.append(["当前算例容许误差", tolerance, "来源于 benchmark tolerances 字段"])
    return rows


def _learning_review_rows(solution: Mapping[str, Any]) -> List[List[str]]:
    review = solution.get("learningReview")
    if not isinstance(review, Mapping):
        return []
    case_id = str(review.get("caseId", "")).strip()
    path_id = str(review.get("pathId", "")).strip()
    case = find_benchmark_case(case_id)
    learning = case.get("learning") if isinstance(case, Mapping) else None
    if not isinstance(learning, Mapping) or str(learning.get("pathId", "")) != path_id:
        return []

    answer_items = review.get("answers")
    answers = {
        str(item.get("predictionId", "")): str(item.get("selectedOptionId", ""))
        for item in answer_items
        if isinstance(item, Mapping)
    } if isinstance(answer_items, list) else {}
    rows = [[
        "学习复核路径",
        str(learning.get("title") or path_id),
        f"{case_id} / {'已查看证据' if review.get('reviewed') is True else '已提交预判'}",
    ]]
    predictions = learning.get("predictions")
    if not isinstance(predictions, list):
        return rows
    for prediction in predictions:
        if not isinstance(prediction, Mapping):
            continue
        prediction_id = str(prediction.get("id", ""))
        options = prediction.get("options")
        option_by_id = {
            str(option.get("id", "")): str(option.get("label", ""))
            for option in options
            if isinstance(option, Mapping)
        } if isinstance(options, list) else {}
        selected_id = answers.get(prediction_id, "")
        expected_id = str(prediction.get("expectedOptionId", ""))
        selected_label = option_by_id.get(selected_id, "未作答")
        expected_label = option_by_id.get(expected_id, "标准答案缺失")
        status = "判断一致" if selected_id and selected_id == expected_id else "需要复核"
        explanation = str(prediction.get("explanation", ""))
        rows.append([
            f"预判：{prediction.get('prompt', prediction_id)}",
            f"选择：{selected_label}；标准：{expected_label}",
            f"{status}。{explanation}",
        ])
    return rows


def _format_mapping_summary(values: Any) -> str:
    if not isinstance(values, Mapping) or not values:
        return ""
    parts = []
    for key, value in values.items():
        if isinstance(value, list):
            parts.append(f"{key}={len(value)} 项")
        elif isinstance(value, Mapping):
            parts.append(f"{key}={len(value)} 项")
        else:
            parts.append(f"{key}={value}")
    if len(parts) > 6:
        parts = [*parts[:6], f"另 {len(parts) - 6} 项"]
    return "；".join(parts)


def _beam_vertical_load_kn(request: Mapping[str, Any]) -> float:
    load_type = request.get("load_type")
    if load_type == "point":
        return float(request.get("point_load_kn", 0.0))
    if load_type in {"linear", "distributed"}:
        length = float(request.get("distributed_end", 0.0)) - float(request.get("distributed_start", 0.0))
        return 0.5 * (float(request.get("distributed_start_kn", 0.0)) + float(request.get("distributed_end_kn", 0.0))) * max(length, 0.0)
    return float(request.get("q_kn", 0.0)) * float(request.get("total_length", 0.0))


def _frame_equilibrium(solution: Mapping[str, Any]) -> Dict[str, float]:
    loads = _structure_load_resultant(solution.get("structure", {}))
    reactions = {
        "fx": sum(float(node.get("reactionFxKn", 0.0)) for node in solution.get("nodeResults", [])),
        "fy": sum(float(node.get("reactionFyKn", 0.0)) for node in solution.get("nodeResults", [])),
    }
    return _equilibrium_summary(loads["fx"], loads["fy"], reactions["fx"], reactions["fy"])


def _truss_equilibrium(solution: Mapping[str, Any]) -> Dict[str, float]:
    loads = _structure_load_resultant(solution.get("structure", {}))
    reactions = {
        "fx": sum(float(node.get("rxKn", 0.0)) for node in solution.get("nodeResults", [])),
        "fy": sum(float(node.get("ryKn", 0.0)) for node in solution.get("nodeResults", [])),
    }
    return _equilibrium_summary(loads["fx"], loads["fy"], reactions["fx"], reactions["fy"])


def _equilibrium_summary(load_fx: float, load_fy: float, reaction_fx: float, reaction_fy: float) -> Dict[str, float]:
    residual_fx = load_fx + reaction_fx
    residual_fy = load_fy + reaction_fy
    return {
        "loadFxKn": load_fx,
        "loadFyKn": load_fy,
        "reactionFxKn": reaction_fx,
        "reactionFyKn": reaction_fy,
        "residualFxKn": residual_fx,
        "residualFyKn": residual_fy,
        "relativeFx": _relative_error(residual_fx, load_fx),
        "relativeFy": _relative_error(residual_fy, load_fy),
    }


def _structure_load_resultant(structure: Mapping[str, Any]) -> Dict[str, float]:
    nodes = {str(node.get("id")): node for node in structure.get("nodes", [])}
    members = {str(member.get("id")): member for member in structure.get("members", [])}
    fx = 0.0
    fy = 0.0
    for load in structure.get("loads", []):
        if load.get("type") == "nodal":
            fx += float(load.get("fxKn", 0.0))
            fy += float(load.get("fyKn", 0.0))
            continue
        if load.get("type") != "distributed":
            continue
        member = members.get(str(load.get("member")))
        if not member:
            continue
        start = nodes.get(str(member.get("start")))
        end = nodes.get(str(member.get("end")))
        if not start or not end:
            continue
        dx = float(end.get("x", 0.0)) - float(start.get("x", 0.0))
        dy = float(end.get("y", 0.0)) - float(start.get("y", 0.0))
        length = math.hypot(dx, dy)
        if length <= 0:
            continue
        q_start = float(load.get("qStartKnPerM", load.get("wyKnPerM", 0.0)))
        q_end = float(load.get("qEndKnPerM", load.get("wyKnPerM", q_start)))
        total = 0.5 * (q_start + q_end) * length
        direction = str(load.get("direction", "local_y"))
        if direction == "global_y":
            fy += total
        else:
            fx += total * (-dy / length)
            fy += total * (dx / length)
    return {"fx": fx, "fy": fy}


def _series_abs_control(values: Iterable[Any], x_values: Iterable[Any], *, scale: float = 1.0) -> tuple[float, float]:
    pairs = [(abs(float(value)) * scale, float(x)) for value, x in zip(values, x_values)]
    if not pairs:
        return 0.0, 0.0
    return max(pairs, key=lambda item: item[0])


def _max_by_abs(items: Iterable[Mapping[str, Any]], key: str) -> Dict[str, Any]:
    rows = list(items)
    if not rows:
        return {}
    return dict(max(rows, key=lambda item: abs(float(item.get(key, 0.0)))))


def _max_frame_moment(items: Iterable[Mapping[str, Any]]) -> Dict[str, Any]:
    best = {"location": "—", "value": 0.0}
    for item in items:
        start = abs(float(item.get("momentStartKnM", 0.0)))
        end = abs(float(item.get("momentEndKnM", 0.0)))
        if start >= abs(float(best["value"])):
            best = {"location": f"{item.get('memberId', '—')} 起端", "value": start}
        if end >= abs(float(best["value"])):
            best = {"location": f"{item.get('memberId', '—')} 终端", "value": end}
    return best


def _max_stress_member(items: Iterable[Mapping[str, Any]]) -> str:
    item = _max_by_abs(items, "axialStressMpa")
    return str(item.get("memberId", "—"))


def _max_stress_value(items: Iterable[Mapping[str, Any]]) -> str:
    item = _max_by_abs(items, "axialStressMpa")
    return f"{round(abs(float(item.get('axialStressMpa', 0.0))), 6)} MPa"


def _relative_error(residual: float, reference: float) -> Optional[float]:
    denominator = abs(float(reference))
    if denominator < 1e-9:
        return None
    return abs(float(residual)) / denominator


def _format_percent(value: Optional[float]) -> str:
    if value is None:
        return "—"
    return f"{round(value * 100.0, 6)}%"


def _format_dofs(dofs: Iterable[Any]) -> str:
    labels = [DOF_LABELS.get(str(dof), str(dof)) for dof in dofs]
    return "、".join(labels) if labels else "无固定约束"


def _format_angle(value: Any) -> str:
    try:
        angle = round(float(value), 4)
    except (TypeError, ValueError):
        return str(value)
    return str(int(angle)) if angle.is_integer() else str(angle)


def _format_frame_constraint_text(node: Mapping[str, Any], constraints: Iterable[Any]) -> str:
    if str(node.get("supportType", "free")).strip().lower() == "roller" and node.get("supportAngleDeg") is not None:
        return f"法向位移 n（{_format_angle(node.get('supportAngleDeg'))}°）"
    return _format_dofs(constraints)


def _format_frame_release_text(node: Mapping[str, Any], support_type: str) -> str:
    condensed = node.get("condensedDofs") or []
    parts = []
    if str(support_type).strip().lower() == "roller" and node.get("supportAngleDeg") is not None:
        parts.append("释放切向位移 t")
        parts.append("释放 rz 平面转角")
    else:
        released = support_released_dofs("frame", support_type)
        if released:
            parts.append("释放 " + _format_dofs(released))
    if condensed:
        parts.append("凝聚/释放自由度：" + _format_dofs(condensed))
    return "；".join(parts) if parts else "无"


def _format_springs(springs: Any) -> str:
    if not springs:
        return "无"
    parts = []
    for spring in springs:
        dof = DOF_LABELS.get(str(spring.get("dof")), str(spring.get("dof", "—")))
        value = spring.get("stiffnessKnMPerRad", spring.get("stiffnessKnPerM", spring.get("stiffness", "—")))
        unit = "kN.m/rad" if "stiffnessKnMPerRad" in spring else "kN/m"
        parts.append(f"{dof}: {value} {unit}")
    return "；".join(parts)


def _symbolic_check_text(solution: Mapping[str, Any]) -> str:
    symbolic = solution.get("symbolicCheck") or {}
    if not symbolic:
        return "当前工况未匹配解析公式校核"
    if not symbolic.get("available"):
        return str(symbolic.get("scope", "解析公式校核不可用"))
    return (
        f"{symbolic.get('scope', '教学校核')}："
        f"反力 {symbolic.get('reactionKn', '—')} kN，"
        f"最大弯矩 {symbolic.get('maxMomentKnM', '—')} kN.m，"
        f"最大挠度 {symbolic.get('maxDeflectionMm', '—')} mm"
    )


def _node_control_text(node: Mapping[str, Any]) -> str:
    if not node:
        return "—"
    value = node.get("displacementMm", node.get("resultantMm", math.hypot(float(node.get("uxMm", 0.0)), float(node.get("uyMm", 0.0)))))
    return f"{node.get('nodeId', '—')}：{round(float(value), 6)} mm"


def _frame_moment_text(moment: Mapping[str, Any]) -> str:
    return f"{moment.get('location', '—')}：{round(float(moment.get('value', 0.0)), 6)} kN.m"
