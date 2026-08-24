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

FRAME_STABILITY_STANDARD_TABLES = (
    "稳定审查摘要",
    "P-Delta 路径控制",
    "P-Delta 路径关键点",
    "P-Delta 最后收敛点",
    "P-Delta 失败尝试",
    "初始缺陷说明",
    "方法比较",
    "屈曲模态摘要",
)

FRAME_STABILITY_FULL_TABLES = FRAME_STABILITY_STANDARD_TABLES + (
    "共回转计算原理",
    "共回转代表单元",
    "P-Delta 收敛记录",
    "方法比较技术审计",
    "屈曲节点模态向量",
    "屈曲构件模态形状",
)

DOF_LABELS = {
    "ux": "ux 水平位移",
    "uy": "uy 竖向位移",
    "rz": "rz 平面转角",
    "v": "v 竖向挠度",
}

STATUS_LABELS = {
    "available": "已提供",
    "diagnostic_summary": "已提供诊断摘要",
    "count_summary": "已提供数量摘要",
    "unavailable": "暂未提供",
    "completed": "已完成",
    "done": "已完成",
    "converged": "已收敛",
    "not_converged": "未收敛",
    "failed": "失败",
    "pass": "通过",
    "review": "需复核",
    "pending": "待计算",
    "enabled": "已启用",
    "disabled": "未启用",
    "not_enabled": "未启用",
    "not_evaluated": "未评估",
    "not_applicable": "不适用",
    "stable": "切线稳定",
    "near_critical": "接近临界",
    "unstable": "切线不稳定",
    "no_compression": "无受压控制构件",
    "accepted": "已接受",
    "rejected": "已拒绝",
    "iterating": "迭代中",
    "cutback": "已切步重试",
    "terminated": "已终止",
    "target_reached": "达到目标荷载",
    "minimum_step_exhausted": "最小步长耗尽",
    "maximum_cutbacks_exhausted": "切步次数耗尽",
    "maximum_accepted_steps_exhausted": "最大成功步数耗尽",
    "maximum_iterations_exhausted": "最大迭代次数耗尽",
    "line_search_failed": "线搜索失败",
    "singular_tangent": "切线刚度矩阵奇异",
    "non_finite_increment": "位移增量出现非有限值",
}

PATH_PHASE_LABELS = {
    "fixed_preload": "固定预载阶段",
    "variable": "变量荷载阶段",
}

ALGORITHM_LABELS = {
    "p-delta": "二阶效应分析（P-Delta）",
    "linear_first_order_v1": "首阶线性分析",
    "initial_stress_v1": "初始应力迭代法",
    "corotational_newton_v1": "共回转 Newton 法",
    "linear_buckling_v1": "线性屈曲特征值法",
}

METRIC_LABELS = {
    "max_displacement_mm": "最大位移",
    "maxdisplacementmm": "最大位移",
    "critical_load_factor": "临界荷载因子",
    "criticalloadfactor": "临界荷载因子",
    "deflection": "挠度",
    "moment": "弯矩",
    "shear": "剪力",
    "axial": "轴力",
    "displacement": "位移",
    "ux": "X 向位移",
    "uy": "Y 向位移",
    "resultant": "合位移",
    "reactionfx": "X 向反力",
    "reactionfy": "Y 向反力",
    "reactionmz": "约束弯矩",
    "maxdeflectionmm": "最大挠度",
    "maxmomentknm": "最大弯矩",
    "maxshearkn": "最大剪力",
    "maxaxialkn": "最大轴力",
    "maxaxialforcekn": "最大轴力",
}

IMPERFECTION_LABELS = {
    "none": "无初始缺陷",
    "buckling_mode": "屈曲模态初始缺陷",
    "explicit": "显式节点初始缺陷",
}

KEY_POINT_KIND_LABELS = {
    "start": "起始点",
    "preload_end": "固定预载终点",
    "response_turning": "响应拐点",
    "minimum_stability": "最小稳定指标点",
    "stability_change": "稳定状态变化点",
    "residual_peak": "残差峰值点",
    "cutback": "切步点",
    "failure": "终止点",
    "last_converged": "最后收敛点",
    "endpoint": "端点",
    "support": "支座点",
    "jump": "跳变点",
    "zero": "零点",
    "local_max": "局部最大值",
    "local_min": "局部最小值",
    "local_extreme": "局部极值",
    "global_extreme": "全局极值",
    "absolute": "绝对控制值",
    "control": "控制值",
    "node": "节点值",
    "review": "用户复核点",
}

TRACE_STAGE_LABELS = {
    "input_normalized": "输入规范化",
    "dof_mapping": "自由度映射",
    "element_process": "单元过程",
    "global_assembly": "整体装配",
    "boundary_reduction": "边界约化",
    "solver_diagnostics": "求解诊断",
    "result_recovery": "结果恢复",
    "equilibrium_check": "平衡校核",
    "evidence_projection": "审查证据投影",
}

TRACE_SUMMARY_LABELS = {
    "availability": "可用状态",
    "analysisType": "分析类型",
    "nodeCount": "节点数",
    "globalDofCount": "总自由度数",
    "freeDofCount": "未约束自由度数",
    "fixedDofCount": "约束自由度数",
    "constraintRank": "约束矩阵秩",
    "elementCount": "单元数",
    "memberResultCount": "构件结果数",
    "diagramCount": "工程图数",
    "nodeResultCount": "节点结果数",
    "solverBackend": "求解方法",
    "criticalPointCount": "关键点数",
    "reviewPointCount": "复核点数",
    "envelopeEntryCount": "控制来源数",
    "maxResidualN": "最大平衡残差（N）",
    "rmsRelativeError": "均方根相对误差",
    "status": "状态",
    "statusCode": "状态码",
}


def _contains_chinese(value: str) -> bool:
    return any("\u3400" <= char <= "\u9fff" for char in value)


def _localized_value(value: Any, labels: Mapping[str, str], fallback: str) -> str:
    text = str(value or "").strip()
    if not text:
        return "—"
    localized = labels.get(text.lower())
    if localized:
        return localized
    return text if _contains_chinese(text) else fallback


def _status_text(value: Any) -> str:
    return _localized_value(value, STATUS_LABELS, "状态待确认")


def _enabled_text(value: Any) -> str:
    if isinstance(value, bool):
        return "已启用" if value else "未启用"
    text = str(value or "").strip().lower()
    if text in {"true", "yes", "on", "enabled"}:
        return "已启用"
    if text in {"false", "no", "off", "disabled"}:
        return "未启用"
    return _status_text(value)


def _path_phase_text(value: Any) -> str:
    return _localized_value(value, PATH_PHASE_LABELS, "其他加载阶段")


def _algorithm_label(value: Any) -> str:
    return _localized_value(value, ALGORITHM_LABELS, "其他求解方法")


def _metric_label(value: Any) -> str:
    return _localized_value(value, METRIC_LABELS, "其他工程指标")


def _human_explanation(value: Any, fallback: str) -> str:
    text = str(value or "").strip()
    if not text or text == "—":
        return fallback
    return text if _contains_chinese(text) else fallback


def _member_euler_screen_text(value: Any) -> str:
    items = _list(value)
    rows: List[str] = []
    for item in items:
        if not isinstance(item, Mapping):
            continue
        member_id = item.get("memberId", "—")
        critical_factor = item.get("criticalLoadFactor", "—")
        rows.append(f"构件 {member_id}：临界荷载因子 {critical_factor}")
    return "；".join(rows) if rows else "未形成构件 Euler 初筛控制项"


def _imperfection_label(value: Any) -> str:
    return _localized_value(value, IMPERFECTION_LABELS, "其他初始缺陷")


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
        tables["计算过程技术审计（CalculationTrace）"] = _calculation_trace_table(solution, analysis_type)
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
            *_result_provenance_rows(solution, include_technical=_report_template(options) == "complete"),
            ["结果来源", result_source_text(solution), "主结果、指定荷载工况或指定荷载组合必须与图表和数据一致。"],
            ["公开验证参考", benchmark_text, "benchmark 仅证明其覆盖边界内的回归一致性。"],
            ["诊断警告", issue_text, "导出计算书保留诊断摘要；最终结论仍需具备资质的专业人员复核。"],
        ],
        columns=["项目", "状态/证据", "说明"],
    )


def select_evidence_table_items(tables: Mapping[str, pd.DataFrame], names: Iterable[str]) -> Dict[str, pd.DataFrame]:
    return {name: tables[name] for name in names if name in tables}


def _result_provenance_rows(solution: Mapping[str, Any], *, include_technical: bool = False) -> List[List[str]]:
    provenance = solution.get("resultProvenance")
    if not isinstance(provenance, Mapping):
        return [["结果追溯", "未记录", "旧结果缺少对象、工程修订和模型签名，重新计算后方可形成完整追溯证据。"]]
    project_revision = provenance.get("projectRevision", "—")
    current_revision = provenance.get("currentProjectRevision", "—")
    model_signature = str(provenance.get("modelSignature") or "—")
    model_hash = str(provenance.get("modelHash") or "—")
    request_hash = str(provenance.get("requestHash") or "—")
    rows = [
        ["分析对象编号", str(provenance.get("analysisObjectId") or "—"), "计算结果必须归属于当前分析对象。"],
        ["工程修订", f"计算时 {project_revision}；导出时 {current_revision}", f"计算时间 {provenance.get('solvedAt') or '—'}；模型签名一致时允许非计算性工程修订后导出。"],
        ["结果追溯", "模型签名与请求签名均已记录" if model_signature != "—" and request_hash != "—" else "追溯信息不完整", "签名原值仅在完整计算书的技术审计内容中展示。"],
    ]
    if include_technical:
        rows.extend([
            ["模型签名（技术审计）", f"前端 {model_signature}；后端 {model_hash}", "用于判断当前工作台模型是否仍与计算输入一致。"],
            ["请求签名（技术审计）", request_hash, "用于关联求解请求与结果包络。"],
        ])
    return rows


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
    # Beam load magnitudes are reported as positive downward scalars while
    # recovered support reactions use the solver sign (upward is negative).
    # Equilibrium is therefore their signed sum, not their difference.
    residual = reaction_total + load_total
    if abs(residual) < 1e-12:
        residual = 0.0
    relative = _relative_error(residual, load_total)
    max_moment_value, max_moment_x = _series_abs_control(solution.get("element_end_moments", []), solution.get("x_data", []), scale=1.0 / 1000.0)
    max_shear_value, max_shear_x = _series_abs_control(solution.get("element_end_shears", []), solution.get("x_data", []), scale=1.0 / 1000.0)

    return {
        "工程输入摘要": pd.DataFrame(
            [
                ["结构类型", request.get("beam_type_label", "梁系")],
                ["荷载类型", request.get("load_type_label", "—")],
                ["材料名称", material_name],
                ["材料适用范围", "材料名称为项目默认材料说明；梁系整体刚度按各跨段弹性模量 E 和截面惯性矩 I 输入装配。"],
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
                ["材料适用范围", "材料名称为项目默认材料说明；框架整体刚度按各构件弹性模量 E、截面面积 A 和截面惯性矩 I 输入装配。"],
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
                ["6", "若启用稳定分析，则按所选算法执行初始应力兼容 P-Delta 或共回转全 Newton GNA，并独立执行广义特征值屈曲求解"],
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
                ["稳定审查", f"二阶效应：{_status_text(solution.get('secondOrder', {}).get('status', 'disabled'))}；屈曲：{_status_text(solution.get('buckling', {}).get('status', 'disabled'))}", "该项为正式稳定审查证据"],
            ],
            columns=["校核项", "求解证据", "说明"],
        ),
        "关键控制项": pd.DataFrame(
            [
                ["最大节点位移", max_node.get("nodeId", "—"), f"{round(float(max_node.get('resultantMm', max_node.get('displacementMm', 0.0))), 6)} mm", "节点合位移最大"],
                ["最大杆端弯矩", max_moment.get("location", "—"), f"{round(float(max_moment.get('value', 0.0)), 6)} kN.m", "杆端弯矩绝对值最大"],
                ["最大二阶放大系数", "结构整体", _format_scalar(solution.get("secondOrder", {}).get("amplificationFactor")), _format_scalar(solution.get("secondOrder", {}).get("amplificationUnavailableReason"), "P-Delta 迭代结果")],
            ],
            columns=["控制项", "位置/对象", "数值", "判定依据"],
        ),
        **stability_tables,
    }


def _frame_stability_evidence(solution: Mapping[str, Any], report_options: Mapping[str, Any] | None = None) -> Dict[str, pd.DataFrame]:
    second_order = solution.get("secondOrder") if isinstance(solution.get("secondOrder"), Mapping) else {}
    buckling = solution.get("buckling") if isinstance(solution.get("buckling"), Mapping) else {}
    trace = second_order.get("nonlinearPathTrace") if isinstance(second_order.get("nonlinearPathTrace"), Mapping) else {}
    template = _report_template(report_options)
    tables: Dict[str, pd.DataFrame] = {}

    tables["稳定审查摘要"] = pd.DataFrame(
        [
            [
                "报告结果状态",
                "最后收敛状态（部分结果）" if solution.get("partialResultSource") else "目标荷载状态",
                "部分结果不表示目标荷载点已收敛" if solution.get("partialResultSource") else "节点与构件表对应当前结果来源",
            ],
            ["P-Delta 状态", _status_text(second_order.get("status", "disabled")), "已启用" if second_order.get("enabled") else "未启用"],
            ["P-Delta 方法", _algorithm_label(second_order.get("method", "—")), f"求解方法：{_control_algorithm_text(trace, second_order)}"],
            [
                "P-Delta 路径控制",
                _control_summary_text(trace),
                f"初始步长={_control_text(trace, 'initialStep')}；最小步长={_control_text(trace, 'minimumStep')}；最大步长={_control_text(trace, 'maximumStep')}；线搜索={_enabled_text(trace.get('lineSearch'))}",
            ],
            [
                "P-Delta 收敛判据",
                _convergence_summary_text(trace),
                "按残差、位移增量与能量增量同时判定是否收敛",
            ],
            ["P-Delta 放大系数", _format_scalar(second_order.get("amplificationFactor")), _human_explanation(second_order.get("amplificationUnavailableReason"), f"首阶={second_order.get('firstOrderMaxDisplacementMm', '—')} mm；二阶={second_order.get('maxDisplacementMm', '—')} mm")],
            ["P-Delta 失败原因", _human_explanation(second_order.get("failureReason"), "—"), _human_explanation(second_order.get("limitations"), "—")],
            ["P-Delta 最后收敛点", _last_converged_summary_text(trace), _last_converged_note_text(trace)],
            ["P-Delta 失败尝试", _failed_attempt_count_text(trace), _failed_attempt_note_text(trace)],
            ["初始缺陷", _initial_imperfection_summary_text(second_order), _initial_imperfection_note_text(second_order)],
            ["方法比较", _method_comparison_summary_text(second_order), _method_comparison_note_text(second_order)],
            ["P-Delta 参考来源", _source_summary_text(second_order.get("referenceSource")), _source_note_text(second_order.get("referenceSource"))],
            ["P-Delta 控制来源", _source_summary_text(second_order.get("controlSource")), _source_note_text(second_order.get("controlSource"))],
            ["屈曲状态", _status_text(buckling.get("status", "disabled")), "已启用" if buckling.get("enabled") else "未启用"],
            ["屈曲方法", _algorithm_label(buckling.get("method", "—")), f"提取模态数={buckling.get('modeCount', '—')}"],
            [
                "整体首阶临界系数",
                buckling.get("criticalLoadFactor", "—"),
                "来自约束空间广义特征值；构件 Euler K=1 初筛仅用于定位复核对象，不替代整体屈曲结论："
                f"{_member_euler_screen_text(buckling.get('memberEulerScreen', buckling.get('controllingMembers', [])))}",
            ],
            ["屈曲失败原因", _human_explanation(buckling.get("failureReason"), "—"), _human_explanation(buckling.get("limitations"), "—")],
            ["屈曲参考来源", _source_summary_text(buckling.get("referenceSource")), _source_note_text(buckling.get("referenceSource"))],
            ["屈曲控制来源", _source_summary_text(buckling.get("controlSource")), _source_note_text(buckling.get("controlSource"))],
        ],
        columns=["项目", "结果", "说明"],
    )

    tables["P-Delta 路径控制"] = _frame_path_control_table(second_order, trace)
    tables["P-Delta 路径关键点"] = _frame_path_keypoints_table(trace)
    tables["P-Delta 最后收敛点"] = _frame_last_converged_table(trace)
    tables["P-Delta 失败尝试"] = _frame_failed_attempts_table(trace)
    tables["初始缺陷说明"] = _frame_initial_imperfection_table(second_order)
    tables["方法比较"] = _frame_method_comparison_table(second_order)
    if template == "complete":
        tables["方法比较技术审计"] = _frame_method_comparison_audit_table(second_order)
        tables["共回转计算原理"] = _frame_corotational_equations_table(second_order, trace)
        tables["共回转代表单元"] = _frame_representative_element_table(trace)

    history_rows: List[Dict[str, Any]] = []
    for record in second_order.get("iterationHistory", []) if isinstance(second_order.get("iterationHistory"), list) else []:
        if not isinstance(record, Mapping):
            continue
        history_rows.append(
            {
                "荷载步": record.get("step", "—"),
                "荷载因子": record.get("loadFactor", "—"),
                "固定荷载因子": record.get("fixedLoadFactor", "—"),
                "路径阶段": _path_phase_text(record.get("pathPhase", "—")),
                "步长": record.get("stepSize", "—"),
                "迭代次数": record.get("iteration", "—"),
                "增量比": record.get("deltaRatio", "—"),
                "最大增量": record.get("maxDelta", "—"),
                "位移增量范数": record.get("displacementIncrementNorm", "—"),
                "相对位移增量": record.get("relativeDisplacementIncrement", "—"),
                "平衡残差": record.get("equilibriumResidual", record.get("equilibriumRmsRelativeError", "—")),
                "能量增量（J）": record.get("energyIncrementJ", "—"),
                "相对能量增量": record.get("energyIncrementRelative", "—"),
                "线搜索尺度": record.get("lineSearchScale", "—"),
                "线搜索次数": record.get("lineSearchTrials", "—"),
                "最大位移（mm）": record.get("maxDisplacementMm", "—"),
                "最小切线特征值": record.get("minimumTangentEigenvalue", "—"),
                "稳定状态": _status_text(record.get("stabilityStatus", "—")),
                "收敛状态": _status_text(record.get("status", "—")),
                "平衡均方根相对误差": record.get("equilibriumRmsRelativeError", "—"),
            }
        )
    if template != "standard":
        tables["P-Delta 收敛记录"] = pd.DataFrame(
            history_rows
            or [{
                "荷载步": "—",
                "荷载因子": "—",
                "固定荷载因子": "—",
                "路径阶段": "—",
                "步长": "—",
                "迭代次数": "—",
                "增量比": "—",
                "最大增量": "—",
                "位移增量范数": "—",
                "相对位移增量": "—",
                "平衡残差": "—",
                "能量增量（J）": "—",
                "相对能量增量": "—",
                "线搜索尺度": "—",
                "线搜索次数": "—",
                "最大位移（mm）": "—",
                "最小切线特征值": "—",
                "稳定状态": "—",
                "收敛状态": "—",
                "平衡均方根相对误差": "—",
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
                "模态阶次": mode_number,
                "临界荷载因子": mode.get("criticalLoadFactor", "—"),
                "特征方程残差范数": mode.get("eigenResidualNorm", mode.get("residualNorm", "—")),
                "约束残差范数": mode.get("constraintResidualNorm", mode.get("constraintResidual", "—")),
                "节点数": len(mode.get("nodeDisplacements", []) or []),
                "构件形状数": len(mode.get("memberModeShapes", []) or []),
            }
        )
        if template == "complete":
            for node in mode.get("nodeDisplacements", []) if isinstance(mode.get("nodeDisplacements"), list) else []:
                if not isinstance(node, Mapping):
                    continue
                node_mode_rows.append(
                    {
                        "模态阶次": mode_number,
                        "节点编号": node.get("nodeId", "—"),
                        "X 向分量": node.get("ux", node.get("uxMm", "—")),
                        "Y 向分量": node.get("uy", node.get("uyMm", "—")),
                        "转角分量": node.get("rz", node.get("rotationDeg", "—")),
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
                            "模态阶次": mode_number,
                            "构件编号": shape.get("memberId", "—"),
                            "截面序号": index + 1,
                            "截面位置（m）": _list_value_at(stations_m, index, "—"),
                            "相对位置": _list_value_at(ratios, index, "—"),
                            "X 向分量": _list_value_at(ux_values, index, "—"),
                            "Y 向分量": _list_value_at(uy_values, index, "—"),
                            "转角分量": _list_value_at(rz_values, index, "—"),
                        }
                    )
    mode_summary_frame = pd.DataFrame(mode_summary_rows or [{"模态阶次": "—", "临界荷载因子": "—", "特征方程残差范数": "—", "约束残差范数": "—", "节点数": "—", "构件形状数": "—"}])
    if template == "standard":
        mode_summary_frame = mode_summary_frame.head(1).reset_index(drop=True)
    tables["屈曲模态摘要"] = mode_summary_frame
    if template == "complete":
        tables["屈曲节点模态向量"] = pd.DataFrame(node_mode_rows or [{"模态阶次": "—", "节点编号": "—", "X 向分量": "—", "Y 向分量": "—", "转角分量": "—"}])
        tables["屈曲构件模态形状"] = pd.DataFrame(member_shape_rows or [{"模态阶次": "—", "构件编号": "—", "截面序号": "—", "截面位置（m）": "—", "相对位置": "—", "X 向分量": "—", "Y 向分量": "—", "转角分量": "—"}])
    return tables


def _frame_corotational_equations_table(
    second_order: Mapping[str, Any],
    trace: Mapping[str, Any],
) -> pd.DataFrame:
    algorithm = _mapping(second_order.get("algorithm", {}))
    if algorithm.get("id") != "corotational_newton_v1":
        return pd.DataFrame(
            [["适用算法", algorithm.get("id", "—"), "本节仅对共回转全 Newton 路径给出展开证据"]],
            columns=["项目", "公式/口径", "说明"],
        )
    return pd.DataFrame(
        [
            ["当前几何", "x_i = X_i + u_i；L = ||x_j - x_i||；β = atan2(Δy, Δx)", "每次 Newton 迭代均由当前弦重新建立局部随动坐标系"],
            ["基本变形", "q = [L-L0-ε_th, θ_i-(β-β0), θ_j-(β-β0)]", "分离刚体平移/转动与轴向、端转角弹性变形"],
            ["单元恢复", "q_f = k_b q；f_int,e = B(q)^T q_f", "端释放在基本刚度中静力凝聚后再恢复内力"],
            ["平衡残差", "g(u, λ) = f_ext(λ) - f_int(u) = 0", "平衡状态与切线稳定状态分别判定"],
            ["切线增量", "K_T(u_k) Δu_k = g(u_k, λ)；u_(k+1)=u_k+αΔu_k", "K_T 为解析一致切线；α 由残差缩减线搜索确定"],
            ["路径恢复", "失败步 → 缩小步长；成功步 → 自适应增长", "始终保留最后收敛点、最终尝试、规范化关键点和失败码"],
            ["收敛判据", _convergence_summary_text(trace), "残差、位移增量与能量增量必须同时满足"],
        ],
        columns=["项目", "公式/口径", "说明"],
    )


def _frame_representative_element_table(trace: Mapping[str, Any]) -> pd.DataFrame:
    state = _mapping(trace.get("representativeElementState", {}))
    basic_deformations = _mapping(state.get("basicDeformations", {}))
    basic_forces = _mapping(state.get("basicForces", {}))
    if not state:
        return pd.DataFrame([["—", "—", "—"]], columns=["项目", "数值", "单位/说明"])
    return pd.DataFrame(
        [
            ["代表细分单元", state.get("memberId", "—"), "按稳定编号排序的首个单元；用于过程审查，不代表控制构件"],
            ["参考弦长 L0", state.get("referenceLengthM", "—"), "m"],
            ["当前弦长 L", state.get("currentLengthM", "—"), "m"],
            ["参考弦角 β0", state.get("referenceAngleRad", "—"), "rad"],
            ["当前弦角 β", state.get("currentAngleRad", "—"), "rad"],
            ["弦转角 β-β0", state.get("chordRotationRad", "—"), "rad"],
            ["基本轴向伸长", basic_deformations.get("axialExtensionM", "—"), "m"],
            ["基本起端转角", basic_deformations.get("startRotationRad", "—"), "rad"],
            ["基本末端转角", basic_deformations.get("endRotationRad", "—"), "rad"],
            ["基本轴力", basic_forces.get("axialN", "—"), "N；低层单元约定拉力为正"],
            ["基本起端弯矩", basic_forces.get("startMomentNm", "—"), "N·m"],
            ["基本末端弯矩", basic_forces.get("endMomentNm", "—"), "N·m"],
            ["切线对称残差", state.get("tangentSymmetryResidual", "—"), "||K_T-K_T^T||；应接近 0"],
        ],
        columns=["项目", "数值", "单位/说明"],
    )


def _control_text(trace: Mapping[str, Any], key: str) -> str:
    value = trace.get(key)
    if value is None:
        return "—"
    return _format_scalar(value)


def _control_algorithm_text(trace: Mapping[str, Any], second_order: Mapping[str, Any]) -> str:
    algorithm = _mapping(trace.get("algorithm", {}))
    algorithm_id = str(algorithm.get("id") or second_order.get("algorithm", {}).get("id") or "—")
    if algorithm_id == "—":
        return "—"
    return _algorithm_label(algorithm_id)


def _control_summary_text(trace: Mapping[str, Any]) -> str:
    control = _mapping(trace.get("control", {}))
    if not control:
        return "—"
    return f"{_path_mode_text(control.get('type'))}；线搜索{_enabled_text(control.get('lineSearch'))}"


def _convergence_summary_text(trace: Mapping[str, Any]) -> str:
    convergence = _mapping(trace.get("convergence", {}))
    if not convergence:
        return "—"
    return (
        f"残差={_format_threshold(convergence.get('relativeResidualTolerance'))} / {_format_threshold(convergence.get('absoluteResidualToleranceN'))} N；"
        f"位移增量={_format_threshold(convergence.get('relativeDisplacementTolerance'))} / {_format_threshold(convergence.get('absoluteDisplacementToleranceM'))} m；"
        f"能量增量={_format_threshold(convergence.get('relativeEnergyTolerance'))} / {_format_threshold(convergence.get('absoluteEnergyToleranceJ'))} J"
    )


def _frame_path_control_table(second_order: Mapping[str, Any], trace: Mapping[str, Any]) -> pd.DataFrame:
    convergence = _mapping(trace.get("convergence", {}))
    control = _mapping(trace.get("control", {}))
    summary = _mapping(trace.get("summary", {}))
    return pd.DataFrame(
        [
            ["算法", _control_algorithm_text(trace, second_order), second_order.get("method", "—")],
            ["路径控制类型", _path_mode_text(control.get("type")), "固定预载 + 变量荷载或单一自适应荷载路径"],
            ["步长设置", f"初始={control.get('initialStep', '—')}；最小={control.get('minimumStep', '—')}；最大={control.get('maximumStep', '—')}", "路径步长在失败切步与成功增长之间自适应调整"],
            ["线搜索", _enabled_text(control.get("lineSearch")), "采用残差缩减准则选择增量尺度"],
            ["收敛判据", _convergence_summary_text(trace), "残差、位移与能量必须同时满足容差"],
            ["平衡状态", _status_text(second_order.get("equilibriumStatus", "—")), f"稳定状态={_status_text(second_order.get('stabilityStatus', '—'))}"],
            ["失败码", second_order.get("failureCode", "—") or "—", second_order.get("failureReason", "—") or "—"],
            ["路径统计", f"成功步={summary.get('acceptedSteps', '—')}；失败尝试={summary.get('failedAttempts', '—')}；总迭代={summary.get('totalIterations', '—')}", f"终止原因={_status_text(summary.get('terminationReason', '—'))}"],
            ["加载路径", _path_mode_text(control.get("type")), "单步或分段路径控制决定固定荷载与变量荷载的推进方式"],
            ["初始缺陷", _initial_imperfection_summary_text(second_order), _initial_imperfection_note_text(second_order)],
            ["方法比较", _method_comparison_summary_text(second_order), _method_comparison_note_text(second_order)],
        ],
        columns=["项目", "结果", "说明"],
    )


def _frame_last_converged_table(trace: Mapping[str, Any]) -> pd.DataFrame:
    last_converged = _mapping(trace.get("lastConverged", {}))
    if not last_converged:
        return pd.DataFrame([["—", "—", "—", "—"]], columns=["项目", "结果", "说明", "备注"])
    return pd.DataFrame(
        [
            ["步号", last_converged.get("step", "—"), "最后一个成功收敛的荷载步", "—"],
            ["路径阶段", _path_phase_text(last_converged.get("pathPhase", "—")), "固定预载或变量荷载阶段", "—"],
            ["荷载系数", last_converged.get("loadFactor", "—"), "当前变量荷载系数", "—"],
            ["固定荷载系数", last_converged.get("fixedLoadFactor", "—"), "当前固定预载系数", "—"],
            ["最大位移", f"{last_converged.get('maxDisplacementMm', '—')} mm", "最后收敛状态的结构整体最大位移", "—"],
        ],
        columns=["项目", "结果", "说明", "备注"],
    )


def _frame_failed_attempts_table(trace: Mapping[str, Any]) -> pd.DataFrame:
    attempts = _list(trace.get("attempts", []))
    rows: List[Dict[str, Any]] = []
    for index, attempt in enumerate(attempts, start=1):
        if not isinstance(attempt, Mapping):
            continue
        rows.append(
            {
                "尝试序号": index,
                "荷载步": attempt.get("step", "—"),
                "路径阶段": _path_phase_text(attempt.get("pathPhase", "—")),
                "荷载因子": attempt.get("loadFactor", "—"),
                "步长": attempt.get("stepSize", "—"),
                "迭代次数": attempt.get("iterations", "—"),
                "状态": _status_text(attempt.get("status", "—")),
                "原因": _status_text(attempt.get("reason", "—")),
                "末次相对残差": attempt.get("lastResidualRelative", "—"),
            }
        )
    if not rows:
        final_attempt = _mapping(trace.get("finalAttempt", {}))
        if final_attempt:
            rows.append(
                {
                    "尝试序号": 1,
                    "荷载步": final_attempt.get("step", "—"),
                    "路径阶段": _path_phase_text(final_attempt.get("pathPhase", "—")),
                    "荷载因子": final_attempt.get("loadFactor", "—"),
                    "步长": final_attempt.get("stepSize", "—"),
                    "迭代次数": final_attempt.get("iterations", "—"),
                    "状态": _status_text(final_attempt.get("status", "—")),
                    "原因": _status_text(final_attempt.get("reason", "—")),
                    "末次相对残差": final_attempt.get("lastResidualRelative", "—"),
                }
            )
    return pd.DataFrame(
        rows
        or [{
            "尝试序号": "—",
            "荷载步": "—",
            "路径阶段": "—",
            "荷载因子": "—",
            "步长": "—",
            "迭代次数": "—",
            "状态": "—",
            "原因": "—",
            "末次相对残差": "—",
        }]
    )


def _frame_path_keypoints_table(trace: Mapping[str, Any]) -> pd.DataFrame:
    key_points = _list(trace.get("keyPoints", []))
    rows: List[Dict[str, Any]] = []
    for point in key_points:
        if not isinstance(point, Mapping):
            continue
        rows.append(
            {
                "关键点编号": point.get("id", "—"),
                "类型": _localized_value(point.get("kind", "—"), KEY_POINT_KIND_LABELS, "其他关键点"),
                "来源": "计算路径" if point.get("source") else "—",
                "来源序号": point.get("sourceIndex", "—"),
                "荷载步": point.get("step", "—"),
                "路径阶段": _path_phase_text(point.get("pathPhase", "—")),
                "路径进度": point.get("pathProgress", "—"),
                "荷载因子": point.get("loadFactor", "—"),
                "固定荷载因子": point.get("fixedLoadFactor", "—"),
                "最大位移（mm）": point.get("maxDisplacementMm", "—"),
                "最小切线特征值": point.get("minimumTangentEigenvalue", "—"),
                "相对平衡残差": point.get("equilibriumResidualRelative", "—"),
                "收敛状态": _status_text(point.get("status", "—")),
                "稳定状态": _status_text(point.get("stabilityStatus", "—")),
            }
        )
    return pd.DataFrame(
        rows
        or [{
            "关键点编号": "—",
            "类型": "—",
            "来源": "—",
            "来源序号": "—",
            "荷载步": "—",
            "路径阶段": "—",
            "路径进度": "—",
            "荷载因子": "—",
            "固定荷载因子": "—",
            "最大位移（mm）": "—",
            "最小切线特征值": "—",
            "相对平衡残差": "—",
            "收敛状态": "—",
            "稳定状态": "—",
        }]
    )


def _frame_initial_imperfection_table(second_order: Mapping[str, Any]) -> pd.DataFrame:
    imperfection = _mapping(second_order.get("initialImperfection", {}))
    return pd.DataFrame(
        [
            ["类型", _imperfection_label(imperfection.get("type", "—"))],
            ["来源", _initial_imperfection_source_text(imperfection)],
            ["最大幅值", f"{imperfection.get('maximumAmplitudeMm', '—')} mm"],
            ["节点偏移数", len(_list(imperfection.get("nodeOffsets", [])))],
        ],
        columns=["项目", "结果/说明"],
    )


def _frame_method_comparison_table(second_order: Mapping[str, Any]) -> pd.DataFrame:
    comparison = _mapping(second_order.get("methodComparison", {}))
    methods = _list(comparison.get("methods", []))
    metrics = _list(comparison.get("metrics", []))
    rows: List[Dict[str, Any]] = []
    metric_items = [item for item in metrics if isinstance(item, Mapping)] or [{}]
    for metric in metric_items:
        metric_values = _mapping(metric.get("values", {}))
        metric_label = str(metric.get("id") or "max_displacement_mm")
        metric_unit = str(metric.get("unit") or "mm")
        for method in methods:
            if not isinstance(method, Mapping):
                continue
            method_id = str(method.get("id") or "—")
            belongs_to_metric = method_id in metric_values or (
                metric_label == "max_displacement_mm" and method_id != "linear_buckling_v1"
            ) or (
                metric_label == "critical_load_factor" and method_id == "linear_buckling_v1"
            )
            if not belongs_to_metric:
                continue
            method_label = str(method.get("label") or _algorithm_label(method_id))
            if not _contains_chinese(method_label):
                method_label = _algorithm_label(method_id)
            rows.append(
                {
                    "方法": method_label,
                    "平衡状态": _status_text(method.get("equilibriumStatus", "—")),
                    "稳定状态": _status_text(method.get("stabilityStatus", "—")),
                    "指标": _metric_label(metric_label),
                    "数值": metric_values.get(method_id, "—"),
                    "单位": metric_unit,
                    "可比性": "可直接比较" if metric.get("comparable", False) else "仅作参考",
                    "说明": metric.get("unavailableReason") or method.get("failureReason") or "—",
                    "参考来源": _source_summary_text(method.get("referenceSource")),
                }
            )
    return pd.DataFrame(
        rows
        or [{
            "方法": "—",
            "平衡状态": "—",
            "稳定状态": "—",
            "指标": "—",
            "数值": "—",
            "单位": "—",
            "可比性": "—",
            "说明": "—",
            "参考来源": "—",
        }]
    )


def _frame_method_comparison_audit_table(second_order: Mapping[str, Any]) -> pd.DataFrame:
    comparison = _mapping(second_order.get("methodComparison", {}))
    rows = []
    for method in _list(comparison.get("methods", [])):
        if not isinstance(method, Mapping):
            continue
        rows.append(
            {
                "算法技术标识": method.get("id", "—"),
                "结果签名": method.get("sourceHash", "—") or "—",
                "请求签名": method.get("requestHash", "—") or "—",
                "模型签名": method.get("modelHash", "—") or "—",
                "失败原因原值": method.get("failureReason", "—") or "—",
            }
        )
    return pd.DataFrame(rows or [{
        "算法技术标识": "—",
        "结果签名": "—",
        "请求签名": "—",
        "模型签名": "—",
        "失败原因原值": "—",
    }])


def _path_mode_text(control_type: Any) -> str:
    value = str(control_type or "—")
    mapping = {
        "fixed_preload_then_adaptive_variable_load": "固定预载后进入自适应变量荷载路径",
        "adaptive_fixed_load_control": "仅固定预载路径",
        "adaptive_load_control": "仅变量荷载路径",
    }
    return mapping.get(value, value if _contains_chinese(value) else "其他加载路径")


def _initial_imperfection_summary_text(second_order: Mapping[str, Any]) -> str:
    imperfection = _mapping(second_order.get("initialImperfection", {}))
    if not imperfection:
        return "—"
    source = _initial_imperfection_source_text(imperfection)
    return f"{_imperfection_label(imperfection.get('type', '—'))}；{source}"


def _initial_imperfection_note_text(second_order: Mapping[str, Any]) -> str:
    imperfection = _mapping(second_order.get("initialImperfection", {}))
    if not imperfection:
        return "—"
    maximum = imperfection.get("maximumAmplitudeMm", "—")
    count = len(_list(imperfection.get("nodeOffsets", [])))
    return f"最大幅值={maximum} mm；偏移节点数={count} 个"


def _initial_imperfection_source_text(imperfection: Mapping[str, Any]) -> str:
    source = _mapping(imperfection.get("source", {}))
    if not source:
        return "—"
    source_type = str(source.get("type") or "—")
    if source_type == "linear_buckling_mode":
        return f"线性屈曲模态 {source.get('modeNumber', '—')}；幅值 {source.get('amplitudeMm', '—')} mm"
    if source_type == "explicit":
        return "显式节点偏移"
    return _localized_value(source_type, {"none": "无来源"}, "其他缺陷来源")


def _method_comparison_summary_text(second_order: Mapping[str, Any]) -> str:
    comparison = _mapping(second_order.get("methodComparison", {}))
    if not comparison:
        return "—"
    metrics = _list(comparison.get("metrics", []))
    if not metrics:
        return "未提供可比指标"
    metric = _mapping(metrics[0])
    return f"{len(_list(comparison.get('methods', [])))} 种方法；比较指标：{_metric_label(metric.get('id', '—'))}"


def _method_comparison_note_text(second_order: Mapping[str, Any]) -> str:
    comparison = _mapping(second_order.get("methodComparison", {}))
    if not comparison:
        return "—"
    limitations = _list(comparison.get("limitations", []))
    if limitations:
        return limitations[0]
    return "方法比较仅用于数值响应差异，不用于规范结论"


def _last_converged_summary_text(trace: Mapping[str, Any]) -> str:
    last_converged = _mapping(trace.get("lastConverged", {}))
    if not last_converged:
        return "—"
    return (
        f"荷载步={last_converged.get('step', '—')}；"
        f"荷载因子={last_converged.get('loadFactor', '—')}；"
        f"最大位移={last_converged.get('maxDisplacementMm', '—')} mm"
    )


def _last_converged_note_text(trace: Mapping[str, Any]) -> str:
    last_converged = _mapping(trace.get("lastConverged", {}))
    if not last_converged:
        return "—"
    return f"固定荷载因子={last_converged.get('fixedLoadFactor', '—')}；路径阶段={_path_phase_text(last_converged.get('pathPhase', '—'))}"


def _failed_attempt_count_text(trace: Mapping[str, Any]) -> str:
    summary = _mapping(trace.get("summary", {}))
    return str(summary.get("failedAttempts", "—")) if summary else "—"


def _failed_attempt_note_text(trace: Mapping[str, Any]) -> str:
    summary = _mapping(trace.get("summary", {}))
    if not summary:
        return "—"
    return f"总迭代={summary.get('totalIterations', '—')}；终止原因={_status_text(summary.get('terminationReason', '—'))}"


def _format_threshold(value: Any) -> str:
    if value is None:
        return "—"
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return str(value)
    if numeric == 0.0:
        return "0"
    if abs(numeric) < 0.001 or abs(numeric) >= 1000.0:
        return f"{numeric:.3e}"
    text = f"{numeric:.6f}".rstrip("0").rstrip(".")
    return text or "0"


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
    if source_type == "main" and source_id == "__primary__":
        return "主结果"
    return f"{labels.get(source_type, '其他来源')} [{source_id}]"


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
        return _metric_label(metric)
    if metric == "—":
        return _localized_value(kind, KEY_POINT_KIND_LABELS, "其他关键点")
    return f"{_metric_label(metric)} / {_localized_value(kind, KEY_POINT_KIND_LABELS, '其他关键点')}"


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
                    "note": "只读" if bool(point.get("readOnly")) else "可复核",
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
                "暂未提供",
                "—",
                "—",
                "—",
                "—",
                "—",
                "当前结果未提供关键点集合；仅展示摘要，不重新计算。",
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
                "暂未提供",
                "—",
                "—",
                "—",
                "—",
                "—",
                "当前结果未提供复核点集合；仅展示摘要，不重新计算。",
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
                    _localized_value(entry.get("kind", "—"), KEY_POINT_KIND_LABELS, "其他控制类型"),
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
            "暂未提供",
            "—",
            "—",
            "—",
            "—",
            "—",
            "当前结果未提供控制包络；仅展示摘要，不重新计算。",
            "—",
        ]],
        columns=["包络项", "来源", "对象", "指标", "类型", "测站", "数值", "单位", "来源点"],
    )


def _calculation_trace_table(result: Mapping[str, Any], analysis_type: str) -> pd.DataFrame:
    trace = _mapping(_evidence_value(result, "calculationTrace", {}))
    rows: List[List[str]] = [
        ["分析类型", _analysis_type_text(analysis_type), "—"],
        ["请求签名（技术审计）", _format_scalar(trace.get("requestHash", result.get("requestHash", "—"))), "—"],
        ["模型签名（技术审计）", _format_scalar(trace.get("modelHash", result.get("modelHash", "—"))), "—"],
        ["结果签名（技术审计）", _format_scalar(trace.get("resultHash", result.get("resultHash", "—"))), "—"],
    ]
    stages = _list(trace.get("stages"))
    if stages:
        rows.append(["阶段数", _format_scalar(trace.get("stageCount", len(stages))), "—"])
        for stage in stages:
            if not isinstance(stage, Mapping):
                continue
            rows.append(
                [
                    _localized_value(stage.get("stage", "—"), TRACE_STAGE_LABELS, "其他计算阶段"),
                    _format_mapping_summary(stage.get("summary"), localize_keys=True),
                    f"有界记录={_yes_no_text(stage.get('bounded'))}；已截断={_yes_no_text(stage.get('truncated'))}",
                ]
            )
    else:
        rows.append(["证据状态", "暂未提供", "当前结果未提供计算过程记录；仅展示摘要，不重新计算。"])
    return pd.DataFrame(rows, columns=["阶段", "摘要", "边界/计数"])


def _calculation_snapshot_table(result: Mapping[str, Any], analysis_type: str) -> pd.DataFrame:
    snapshot = _mapping(_evidence_value(result, "calculationSnapshot", {}))
    summary = _mapping(snapshot.get("summary"))
    diagnostics = _mapping(snapshot.get("diagnostics"))
    evidence_hashes = _mapping(snapshot.get("evidenceHashes"))
    counts = _mapping(snapshot.get("counts"))
    rows = [
        ["分析类型", _analysis_type_text(snapshot.get("analysisType", analysis_type)), "—"],
        ["阶段", _status_text(snapshot.get("stage", "completed")), "—"],
        ["操作", "执行计算" if str(snapshot.get("operation", result.get("operation", "calculate"))).lower() == "calculate" else "其他操作", "—"],
        ["结果状态", _status_text(summary.get("status", "—")), _algorithm_label(summary.get("method", "—"))],
        ["结果状态码", _status_text(summary.get("statusCode", "—")), "—"],
        ["诊断状态", _status_text(diagnostics.get("status", "—")), _status_text(diagnostics.get("statusCode", "—"))],
        ["请求签名（技术审计）", _format_scalar(snapshot.get("requestHash", result.get("requestHash", "—"))), "—"],
        ["模型签名（技术审计）", _format_scalar(snapshot.get("modelHash", result.get("modelHash", "—"))), "—"],
        ["结果签名（技术审计）", _format_scalar(snapshot.get("resultHash", result.get("resultHash", "—"))), "—"],
        ["关键点数量", _format_scalar(counts.get("criticalPoints", "—")), "—"],
        ["复核点数量", _format_scalar(counts.get("reviewPoints", "—")), "—"],
        ["控制来源数量", _format_scalar(counts.get("governingEnvelope", "—")), "—"],
        ["计算过程证据签名", _format_scalar(evidence_hashes.get("calculationTrace", "—")), "—"],
        ["关键点证据签名", _format_scalar(evidence_hashes.get("criticalPoints", "—")), "—"],
        ["复核点证据签名", _format_scalar(evidence_hashes.get("reviewPoints", "—")), "—"],
        ["控制来源证据签名", _format_scalar(evidence_hashes.get("governingEnvelope", "—")), "—"],
    ]
    if analysis_type == "frame":
        rows.append(["二阶放大系数", _format_scalar(summary.get("secondOrderAmplificationFactor", "—")), "—"])
    if isinstance(diagnostics.get("equilibrium"), Mapping):
        eq = diagnostics.get("equilibrium")
        rows.append(["平衡均方根相对误差", _format_scalar(eq.get("rmsRelativeError", "—")), "—"])
    if not snapshot:
        rows.insert(0, ["证据状态", "暂未提供", "当前结果未提供计算快照；仅展示摘要，不重新计算。"])
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
        return "主结果 / 基本结果" if title in {"__primary__", "main", "primary"} else f"主结果 / {title}"
    source_label = {"case": "工况", "combination": "组合"}.get(source_type, "其他来源")
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
                ["材料适用范围", "材料名称为项目默认材料说明；桁架整体刚度按各杆件弹性模量 E 和截面面积 A 输入装配。"],
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
        "frame": {"frame", "frame-beam-verify", "frame-nonlinear-verify"},
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
    category_labels = {
        "beam": "梁系",
        "frame": "平面框架",
        "frame-beam-verify": "框架梁基准",
        "frame-nonlinear-verify": "框架非线性基准",
        "truss": "平面桁架",
        "truss-verify": "桁架基准",
    }
    source_labels = {
        "textbook-analytical": "教材解析解",
        "independent-stiffness-baseline": "独立刚度法基线",
        "internal-regression": "内部回归",
        "published-benchmark": "公开发表基准",
        "engineering-software": "工程软件对标",
    }
    category_text = "、".join(category_labels.get(item, "其他验证类别") for item in sorted(categories))
    source_text = "、".join(source_labels.get(item, "其他验证来源") for item in source_types)
    return f"当前分析类型（{category_text}）覆盖 {len(relevant_cases)} 个算例；全量公开验证集 {len(cases)} 个；来源类型：{source_text}"


def _active_benchmark_rows(solution: Mapping[str, Any]) -> List[List[str]]:
    benchmark = solution.get("benchmark")
    if not isinstance(benchmark, Mapping):
        return []
    case_id = str(benchmark.get("caseId", "")).strip()
    if not case_id:
        return []
    source = str(benchmark.get("sourceLabel") or "").strip()
    if not source:
        source = {
            "textbook-analytical": "教材解析解",
            "independent-stiffness-baseline": "独立刚度法基线",
            "internal-regression": "内部回归",
            "published-benchmark": "公开发表基准",
            "engineering-software": "工程软件对标",
        }.get(str(benchmark.get("sourceType") or ""), "验证来源")
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


def _format_mapping_summary(values: Any, *, localize_keys: bool = False) -> str:
    if not isinstance(values, Mapping) or not values:
        return ""
    parts = []
    for key, value in values.items():
        label = TRACE_SUMMARY_LABELS.get(str(key), "其他摘要项") if localize_keys else key
        if isinstance(value, list):
            parts.append(f"{label}={len(value)} 项")
        elif isinstance(value, Mapping):
            parts.append(f"{label}={len(value)} 项")
        else:
            display_value = _trace_summary_value(str(key), value)
            parts.append(f"{label}={display_value}")
    if len(parts) > 6:
        parts = [*parts[:6], f"另 {len(parts) - 6} 项"]
    return "；".join(parts)


def _analysis_type_text(value: Any) -> str:
    return {"beam": "梁系", "frame": "平面框架", "truss": "平面桁架"}.get(str(value).lower(), "其他分析类型")


def _yes_no_text(value: Any) -> str:
    if isinstance(value, bool):
        return "是" if value else "否"
    return "未记录"


def _trace_summary_value(key: str, value: Any) -> Any:
    if key in {"availability", "status", "statusCode"}:
        return _status_text(value)
    if key == "analysisType":
        return _analysis_type_text(value)
    if key == "solverBackend":
        labels = {
            "dense-corotational-newton": "稠密矩阵共回转 Newton 法",
            "dense": "稠密矩阵求解",
            "sparse": "稀疏矩阵求解",
        }
        text = str(value or "")
        return labels.get(text.lower(), text if _contains_chinese(text) else "其他求解方法")
    if isinstance(value, bool):
        return _yes_no_text(value)
    return value


def _beam_vertical_load_kn(request: Mapping[str, Any]) -> float:
    load_type = request.get("load_type")
    if load_type == "combination":
        return float(request.get("resultant_load_kn", 0.0))
    if load_type == "point":
        return float(request.get("point_load_kn", 0.0))
    if load_type in {"linear", "distributed"}:
        length = float(request.get("distributed_end", 0.0)) - float(request.get("distributed_start", 0.0))
        return 0.5 * (float(request.get("distributed_start_kn", 0.0)) + float(request.get("distributed_end_kn", 0.0))) * max(length, 0.0)
    length = float(request.get("uniform_end", request.get("total_length", 0.0))) - float(request.get("uniform_start", 0.0))
    return float(request.get("q_kn", 0.0)) * max(length, 0.0)


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
    if abs(residual_fx) < 1e-12:
        residual_fx = 0.0
    if abs(residual_fy) < 1e-12:
        residual_fy = 0.0
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
        if load.get("type") not in {"distributed", "member_point"}:
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
        direction = str(load.get("direction", "local_y"))
        if load.get("type") == "member_point":
            total = float(load.get("forceKn", load.get("magnitudeKn", load.get("pKn", 0.0))))
        else:
            q_start = float(load.get("qStartKnPerM", load.get("wyKnPerM", 0.0)))
            q_end = float(load.get("qEndKnPerM", load.get("wyKnPerM", q_start)))
            start_ratio = min(1.0, max(0.0, float(load.get("startRatio", load.get("loadStartRatio", 0.0)))))
            end_ratio = min(1.0, max(0.0, float(load.get("endRatio", load.get("loadEndRatio", 1.0)))))
            if end_ratio < start_ratio:
                start_ratio, end_ratio = end_ratio, start_ratio
                q_start, q_end = q_end, q_start
            total = 0.5 * (q_start + q_end) * (end_ratio - start_ratio) * length
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
