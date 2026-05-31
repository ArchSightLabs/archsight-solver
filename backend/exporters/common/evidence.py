from __future__ import annotations

import math
from typing import Any, Dict, Iterable, List, Mapping, Optional

import pandas as pd

from backend.benchmarks.catalog import load_benchmark_catalog
from backend.exporters.common.analysis_assumptions import analysis_assumption_table_rows
from backend.common.support_catalog import support_constraint_dofs, support_label, support_system_note
from backend.exporters.common.member_materials import member_elasticity_summary

DOF_LABELS = {
    "ux": "ux 水平位移",
    "uy": "uy 竖向位移",
    "rz": "rz 平面转角",
    "v": "v 竖向挠度",
}


def build_evidence_tables(solution: Mapping[str, Any], analysis_type: str, material_name: str) -> Dict[str, pd.DataFrame]:
    if analysis_type == "frame":
        return _frame_evidence(solution, material_name)
    if analysis_type == "truss":
        return _truss_evidence(solution, material_name)
    return _beam_evidence(solution, material_name)


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


def _frame_evidence(solution: Mapping[str, Any], material_name: str) -> Dict[str, pd.DataFrame]:
    structure = solution["structure"]
    equilibrium = _frame_equilibrium(solution)
    max_node = _max_by_abs(solution.get("nodeResults", []), "resultantMm")
    max_moment = _max_frame_moment(solution.get("memberResults", []))
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
            ],
            columns=["步骤", "说明"],
        ),
        "校核证据": pd.DataFrame(
            [
                ["X 向平衡校核", f"外荷载 {round(equilibrium['loadFxKn'], 6)} kN；支座反力 {round(equilibrium['reactionFxKn'], 6)} kN", f"残差 {round(equilibrium['residualFxKn'], 6)} kN，相对误差 {_format_percent(equilibrium['relativeFx'])}"],
                ["Y 向平衡校核", f"外荷载 {round(equilibrium['loadFyKn'], 6)} kN；支座反力 {round(equilibrium['reactionFyKn'], 6)} kN", f"残差 {round(equilibrium['residualFyKn'], 6)} kN，相对误差 {_format_percent(equilibrium['relativeFy'])}"],
                ["公开验证集", _benchmark_summary_text("frame"), "仅证明当前分析类型验证集覆盖范围内的回归一致性"],
                *_active_benchmark_rows(solution),
                ["控制位移", _node_control_text(max_node), f"允许值 {round(solution.get('summary', {}).get('allowableMm', 0.0), 6)} mm"],
                ["控制弯矩", _frame_moment_text(max_moment), "按所有杆端弯矩绝对值最大提取"],
                ["稳定初筛", f"P-Delta: {solution.get('secondOrder', {}).get('riskLevel', '未启用')}；屈曲: {solution.get('buckling', {}).get('riskLevel', '未启用')}", "该项为初筛提示"],
            ],
            columns=["校核项", "求解证据", "说明"],
        ),
        "关键控制项": pd.DataFrame(
            [
                ["最大节点位移", max_node.get("nodeId", "—"), f"{round(float(max_node.get('resultantMm', max_node.get('displacementMm', 0.0))), 6)} mm", "节点合位移最大"],
                ["最大杆端弯矩", max_moment.get("location", "—"), f"{round(float(max_moment.get('value', 0.0)), 6)} kN.m", "杆端弯矩绝对值最大"],
                ["最大二阶放大系数", "结构整体", str(solution.get("secondOrder", {}).get("amplificationFactor", "—")), "P-Delta 初筛"],
            ],
            columns=["控制项", "位置/对象", "数值", "判定依据"],
        ),
    }


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
        constraints = support.get("constraints") or support_constraint_dofs("beam", support_type)
        springs = support.get("springs") or []
        rows.append(
            {
                "支座/节点": support.get("id", f"S{index + 1}"),
                "位置": f"x={round(float(position), 6)} m",
                "支座类型": support_label("beam", support_type),
                "约束自由度": _format_dofs(constraints),
                "弹簧刚度": _format_springs(springs),
                "释放/内铰": "梁单元端部释放见结构模型；未设置则为连续转角",
            }
        )
    return pd.DataFrame(rows or [{"支座/节点": "—", "位置": "—", "支座类型": "—", "约束自由度": "—", "弹簧刚度": "—", "释放/内铰": "—"}])


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
                "约束自由度": _format_dofs(constraints),
                "弹簧刚度": _format_springs(node.get("springs", [])),
                "释放/内铰": _format_node_release(node),
            }
        )
    return pd.DataFrame(rows or [{"节点": "—", "位置": "—", "支座类型": "—", "约束自由度": "—", "弹簧刚度": "—", "释放/内铰": "—"}])


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
    reference = str(benchmark.get("reference") or benchmark.get("method") or "当前计算书导出时随分析对象传入")
    expected = str(benchmark.get("expectedSummary") or _format_mapping_summary(benchmark.get("expected", {})))
    tolerance = str(benchmark.get("toleranceSummary") or _format_mapping_summary(benchmark.get("tolerances", {})))
    rows = [
        ["当前算例来源", f"{case_id} / {source}", reference],
    ]
    if expected:
        rows.append(["当前算例标准值", expected, "来源于 benchmark expected 字段"])
    if tolerance:
        rows.append(["当前算例容许误差", tolerance, "来源于 benchmark tolerances 字段"])
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


def _format_node_release(node: Mapping[str, Any]) -> str:
    condensed = node.get("condensedDofs") or []
    if condensed:
        return "凝聚/释放自由度：" + _format_dofs(condensed)
    return "无"


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
