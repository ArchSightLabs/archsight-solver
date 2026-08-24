from __future__ import annotations

from copy import deepcopy
import math
from typing import Any, Dict, List, Mapping, Sequence, Tuple

import numpy as np

from backend.common.domain_errors import StructureStabilityError
from backend.common.stability_errors import FrameBucklingResidualError, FrameBucklingSolveError, FramePDeltaConvergenceError, FramePDeltaSingularError
from backend.normalizers.frame.request_normalizer import normalize_frame_analysis_options
from backend.presenters.frame.assembler import build_frame_solution_response
from backend.solver.frame.assembler import assemble_global_system
from backend.solver.frame.elements import apply_rotational_releases, member_geometric_stiffness_local
from backend.solver.frame.nonlinear_path import solve_corotational_path
from backend.solver.frame.nonlinear_recover import build_corotational_solution_response
from backend.solver.frame.recover import recover_member_diagrams, recover_member_results, recover_node_results
from backend.solver.frame.solver import solve_frame_system
from backend.solver.frame.stability_mesh import solve_frame_stability_mesh
from backend.solver.linear_system import add_local_stiffness


def build_frame_stability_results(
    request: Mapping[str, Any],
    structure: Mapping[str, Any],
    solution: Mapping[str, Any],
    *,
    analysis_options: Mapping[str, Any] | None = None,
) -> Dict[str, Any]:
    options = normalize_frame_analysis_options(analysis_options or request.get("analysisOptions", {}))
    first_order = _solution_snapshot(solution)
    reference_source = _reference_source(request)
    second_order = _second_order_result(request, structure, solution, options, first_order, reference_source)
    buckling = _buckling_result(request, structure, solution, options, first_order, reference_source)
    _attach_linear_buckling_reference(second_order, buckling, reference_source)
    return {
        "analysisOptions": options,
        "secondOrder": second_order,
        "buckling": buckling,
    }


def _solution_snapshot(solution: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "summary": deepcopy(dict(solution.get("summary", {}))),
        "diagnostics": deepcopy(dict(solution.get("diagnostics", {}))),
        "nodeResults": deepcopy(list(solution.get("nodeResults", []))),
        "memberResults": deepcopy(list(solution.get("memberResults", []))),
        "memberDiagrams": deepcopy(list(solution.get("memberDiagrams", []))),
    }


def _reference_source(request: Mapping[str, Any]) -> Dict[str, str]:
    reference = request.get("stabilityReference")
    if isinstance(reference, Mapping):
        source = str(reference.get("source") or "primary")
        ref_id = str(reference.get("id") or "__primary__")
        title = str(reference.get("title") or ref_id)
        return {"source": source, "id": ref_id, "title": title}
    return {"source": "primary", "id": "__primary__", "title": "主结果"}


def _second_order_result(
    request: Mapping[str, Any],
    structure: Mapping[str, Any],
    solution: Mapping[str, Any],
    options: Mapping[str, Any],
    first_order: Mapping[str, Any],
    reference_source: Mapping[str, str],
) -> Dict[str, Any]:
    enabled = bool(options.get("pDelta"))
    pdelta_options = options.get("pDeltaOptions", {})
    algorithm_id = str(pdelta_options.get("algorithm") or "initial_stress_v1")
    first_horizontal = _max_abs_value(first_order.get("nodeResults", []), ("uxMm",))
    first_resultant = float(first_order.get("summary", {}).get("maxDisplacementMm", 0.0))
    if not enabled:
        return {
            "enabled": False,
            "converged": False,
            "status": "not_enabled",
            "statusLabel": "未启用",
            "method": "二维框架初始应力法 P-Δ 迭代",
            "algorithm": {"id": algorithm_id, "version": "1"},
            "equilibriumStatus": "not_enabled",
            "stabilityStatus": "not_evaluated",
            "referenceSource": dict(reference_source),
            "controlSource": dict(reference_source),
            "loadSteps": 0,
            "maxIterations": 0,
            "tolerance": None,
            "iterationHistory": [],
            "nonlinearPathTrace": None,
            "methodComparison": None,
            "totalIterations": 0,
            "amplificationFactor": 1.0,
            "firstOrderMaxHorizontalDisplacementMm": round(first_horizontal, 6),
            "firstOrderMaxDisplacementMm": round(first_resultant, 6),
            "maxHorizontalDisplacementMm": round(first_horizontal, 6),
            "maxDisplacementMm": round(first_resultant, 6),
            "firstOrder": first_order,
            "final": first_order,
            "solution": first_order,
            "limitations": "未启用二阶分析。",
        }

    if algorithm_id == "corotational_newton_v1":
        return _corotational_second_order_result(
            request=request,
            structure=structure,
            options=pdelta_options,
            first_order=first_order,
            reference_source=reference_source,
        )

    second_solution, history, final_step = _solve_pdelta_path(request, structure, options, solution, reference_source)
    second_summary = second_solution["summary"]
    second_horizontal = _max_abs_value(second_solution.get("nodeResults", []), ("uxMm",))
    second_resultant = float(second_summary.get("maxDisplacementMm", 0.0))
    amplification, amplification_unavailable_reason = _amplification_measure(
        second_horizontal,
        first_horizontal,
        second_resultant,
        first_resultant,
    )
    return {
        "enabled": True,
        "converged": True,
        "status": "converged",
        "statusLabel": "已收敛",
        "method": "二维框架初始应力法 P-Δ 迭代",
        "algorithm": {"id": "initial_stress_v1", "version": "1"},
        "equilibriumStatus": "converged",
        "stabilityStatus": "not_evaluated",
        "referenceSource": dict(reference_source),
        "controlSource": dict(reference_source),
        "loadSteps": int(pdelta_options.get("loadSteps", 4)),
        "maxIterations": int(pdelta_options.get("maxIterations", 12)),
        "tolerance": float(pdelta_options.get("tolerance", 1e-6)),
        "iterationHistory": history,
        "nonlinearPathTrace": None,
        "methodComparison": None,
        "totalIterations": len(history),
        "amplificationFactor": round(float(amplification), 6) if amplification is not None else None,
        "amplificationUnavailableReason": amplification_unavailable_reason,
        "firstOrderMaxHorizontalDisplacementMm": round(first_horizontal, 6),
        "firstOrderMaxDisplacementMm": round(first_resultant, 6),
        "maxHorizontalDisplacementMm": round(second_horizontal, 6),
        "maxDisplacementMm": round(second_resultant, 6),
        "firstOrder": first_order,
        "final": second_solution,
        "solution": second_solution,
        "summary": deepcopy(dict(second_summary)),
        "failureReason": None,
        "limitations": "线弹性小位移二阶分析；未包含材料非线性、后屈曲、初始缺陷和施工阶段效应。",
        "stepCount": final_step,
    }


def _corotational_second_order_result(
    *,
    request: Mapping[str, Any],
    structure: Mapping[str, Any],
    options: Mapping[str, Any],
    first_order: Mapping[str, Any],
    reference_source: Mapping[str, str],
) -> Dict[str, Any]:
    resolved_options = _resolve_initial_imperfection(
        structure=structure,
        first_order=first_order,
        options=options,
        solver_backend=str(request.get("solver_backend", "auto")),
    )
    path_result = solve_corotational_path(
        structure,
        solver_backend=str(request.get("solver_backend", "auto")),
        options=resolved_options,
    )
    recovered = build_corotational_solution_response(
        request=request,
        structure=structure,
        result=path_result,
    )
    first_horizontal = _max_abs_value(first_order.get("nodeResults", []), ("uxMm",))
    first_resultant = float(first_order.get("summary", {}).get("maxDisplacementMm", 0.0))
    nonlinear_horizontal = _max_abs_value(recovered.get("nodeResults", []), ("uxMm",))
    nonlinear_resultant = float(recovered.get("summary", {}).get("maxDisplacementMm", 0.0))
    amplification, amplification_unavailable_reason = _amplification_measure(
        nonlinear_horizontal,
        first_horizontal,
        nonlinear_resultant,
        first_resultant,
    )
    trace = deepcopy(path_result.path_trace)
    status = "converged" if path_result.success else "not_converged"
    failure_reason = _nonlinear_failure_message(path_result.termination_reason) if not path_result.success else None
    method_comparison = _corotational_method_comparison(
        request=request,
        structure=structure,
        options=options,
        first_order=first_order,
        nonlinear_solution=recovered,
        path_result=path_result,
        reference_source=reference_source,
    ) if bool(options.get("includeMethodComparison")) else None
    return {
        "enabled": True,
        "converged": path_result.success,
        "status": status,
        "statusLabel": "已收敛" if path_result.success else "未收敛，已保留最后收敛点",
        "method": "二维框架共回转全量牛顿弹性几何非线性分析",
        "algorithm": {"id": "corotational_newton_v1", "version": "1"},
        "equilibriumStatus": path_result.equilibrium_status,
        "stabilityStatus": path_result.stability_status,
        "referenceSource": dict(reference_source),
        "controlSource": dict(reference_source),
        "loadSteps": len(trace.get("steps", [])),
        "maxIterations": int(options.get("maxIterations", 30)),
        "tolerance": float(options.get("relativeResidualTolerance", 1e-8)),
        "iterationHistory": deepcopy(list(trace.get("iterations", []))),
        "nonlinearPathTrace": trace,
        "methodComparison": method_comparison,
        "totalIterations": len(trace.get("iterations", [])),
        "amplificationFactor": round(float(amplification), 6) if amplification is not None else None,
        "amplificationUnavailableReason": amplification_unavailable_reason,
        "firstOrderMaxHorizontalDisplacementMm": round(first_horizontal, 6),
        "firstOrderMaxDisplacementMm": round(first_resultant, 6),
        "maxHorizontalDisplacementMm": round(nonlinear_horizontal, 6),
        "maxDisplacementMm": round(nonlinear_resultant, 6),
        "firstOrder": first_order,
        "final": recovered if path_result.success else None,
        "solution": recovered if path_result.success else None,
        "lastConvergedSolution": recovered,
        "lastConverged": deepcopy(trace.get("lastConverged")),
        "initialImperfection": deepcopy(trace.get("mesh", {}).get("initialImperfection", {"type": "none"})),
        "summary": deepcopy(dict(recovered.get("summary", {}))),
        "failureReason": failure_reason,
        "failureCode": _nonlinear_failure_code(path_result.termination_reason) if not path_result.success else None,
        "terminationReason": path_result.termination_reason,
        "limitations": (
            "二维欧拉–伯努利梁柱、材料线弹性、保守静力荷载的几何非线性分析（GNA）；"
            "未包含材料非线性、塑性铰、局部或侧扭屈曲、施工阶段、弧长后屈曲或几何与材料非线性分析（GMNIA）。"
        ),
        "stepCount": len(trace.get("steps", [])),
    }


def _corotational_method_comparison(
    *,
    request: Mapping[str, Any],
    structure: Mapping[str, Any],
    options: Mapping[str, Any],
    first_order: Mapping[str, Any],
    nonlinear_solution: Mapping[str, Any],
    path_result: Any,
    reference_source: Mapping[str, str],
) -> Dict[str, Any]:
    first_displacement = float(first_order.get("summary", {}).get("maxDisplacementMm", 0.0))
    nonlinear_displacement = float(nonlinear_solution.get("summary", {}).get("maxDisplacementMm", 0.0))
    legacy_method: Dict[str, Any] = {
        "id": "initial_stress_v1",
        "label": "初始应力迭代（兼容）",
        "equilibriumStatus": "not_evaluated",
        "stabilityStatus": "not_evaluated",
    }
    legacy_displacement: float | None = None
    legacy_options = {
        "pDeltaOptions": {
            "loadSteps": int(options.get("loadSteps", 4)),
            "maxIterations": int(options.get("maxIterations", 30)),
            "tolerance": float(options.get("tolerance", 1e-6)),
        }
    }
    try:
        legacy_solution, legacy_history, _ = _solve_pdelta_path(
            request,
            structure,
            legacy_options,
            first_order,
            reference_source,
        )
        legacy_displacement = float(legacy_solution.get("summary", {}).get("maxDisplacementMm", 0.0))
        legacy_method.update(
            {
                "equilibriumStatus": "converged",
                "iterationCount": len(legacy_history),
            }
        )
    except (FramePDeltaConvergenceError, FramePDeltaSingularError, StructureStabilityError, ValueError) as exc:
        legacy_method.update(
            {
                "equilibriumStatus": "not_converged",
                "failureReason": str(exc),
            }
        )
    values = {
        "linear_first_order_v1": round(first_displacement, 8),
        "corotational_newton_v1": round(nonlinear_displacement, 8),
    }
    if legacy_displacement is not None:
        values["initial_stress_v1"] = round(legacy_displacement, 8)
    imperfection = options.get("initialImperfection")
    imperfection_type = str(imperfection.get("type") or "none") if isinstance(imperfection, Mapping) else "none"
    unavailable_reasons: List[str] = []
    if legacy_displacement is None:
        unavailable_reasons.append("兼容初始应力迭代未收敛。")
    if not path_result.success:
        unavailable_reasons.append("共回转目标荷载路径未完成；其数值仅代表最后收敛点。")
    if imperfection_type != "none":
        unavailable_reasons.append("共回转分析含初始缺陷，而首阶与兼容算法使用未扰动参考几何。")
    displacement_comparable = not unavailable_reasons
    return {
        "schema": "MethodComparison@1",
        "methods": [
            {
                "id": "linear_first_order_v1",
                "label": "首阶线弹性",
                "equilibriumStatus": "converged",
                "stabilityStatus": "not_evaluated",
                "targetLoadFactor": 1.0,
            },
            legacy_method,
            {
                "id": "corotational_newton_v1",
                "label": "共回转全量牛顿法",
                "equilibriumStatus": path_result.equilibrium_status,
                "stabilityStatus": path_result.stability_status,
                "targetLoadFactor": float(path_result.load_factor),
                "failureReason": _nonlinear_failure_message(path_result.termination_reason) if not path_result.success else None,
            },
        ],
        "metrics": [
            {
                "id": "max_displacement_mm",
                "unit": "mm",
                "comparable": displacement_comparable,
                "unavailableReason": " ".join(unavailable_reasons) if unavailable_reasons else None,
                "values": values,
            }
        ],
        "limitations": [
            "方法比较只描述当前模型的数值响应差异，不给出规范安全结论。",
            "初始应力兼容算法使用固定初始几何；共回转牛顿法使用更新几何、完整残差和一致切线。",
        ],
    }


def _attach_linear_buckling_reference(
    second_order: Dict[str, Any],
    buckling: Mapping[str, Any],
    reference_source: Mapping[str, str],
) -> None:
    """Complete MethodComparison only after both analysis branches exist."""

    comparison = second_order.get("methodComparison")
    if not isinstance(comparison, dict):
        return
    methods = comparison.setdefault("methods", [])
    if not any(isinstance(item, Mapping) and item.get("id") == "linear_buckling_v1" for item in methods):
        methods.append(
            {
                "id": "linear_buckling_v1",
                "label": "线性屈曲特征值",
                "equilibriumStatus": "not_applicable",
                "stabilityStatus": str(buckling.get("status") or "not_evaluated"),
                "referenceSource": deepcopy(dict(reference_source)),
                "targetLoadFactor": None,
                "failureReason": None if buckling.get("criticalLoadFactor") is not None else buckling.get("limitations"),
            }
        )
    comparison.setdefault("metrics", []).append(
        {
            "id": "critical_load_factor",
            "unit": "",
            "comparable": False,
            "unavailableReason": "临界荷载因子是稳定特征值参考，不与位移响应作同量纲比较。",
            "referenceOnly": True,
            "values": (
                {"linear_buckling_v1": float(buckling["criticalLoadFactor"])}
                if buckling.get("criticalLoadFactor") is not None
                else {}
            ),
        }
    )


def _resolve_initial_imperfection(
    *,
    structure: Mapping[str, Any],
    first_order: Mapping[str, Any],
    options: Mapping[str, Any],
    solver_backend: str,
) -> Dict[str, Any]:
    resolved = deepcopy(dict(options))
    imperfection = resolved.get("initialImperfection")
    if not isinstance(imperfection, Mapping) or str(imperfection.get("type") or "none") != "buckling_mode":
        return resolved
    mode_number = int(imperfection.get("modeNumber", 1))
    amplitude_mm = float(imperfection.get("amplitudeMm", 0.0))
    direction = -1.0 if float(imperfection.get("direction", 1.0)) < 0.0 else 1.0
    if amplitude_mm <= 0.0:
        raise ValueError("屈曲模态初始缺陷 amplitudeMm 必须大于 0")
    member_results = list(first_order.get("memberResults", []))
    if not any(
        float(item.get("axialStartKn", 0.0)) > 0.0 or float(item.get("axialEndKn", 0.0)) > 0.0
        for item in member_results
    ):
        raise ValueError("屈曲模态初始缺陷需要存在受压预应力状态，当前模型没有可用压缩模态")
    mesh_result = solve_frame_stability_mesh(
        structure,
        member_results,
        mode_number,
        solver_backend=solver_backend,
    )
    modes = list(mesh_result.get("modes", []))
    if len(modes) < mode_number:
        raise ValueError(f"屈曲模态初始缺陷请求模态 {mode_number}，求解器只返回 {len(modes)} 个有效模态")
    mode = modes[mode_number - 1]
    magnitudes: List[float] = []
    for shape in mode.get("memberModeShapes", []):
        magnitudes.extend(
            math.hypot(float(ux), float(uy))
            for ux, uy in zip(shape.get("ux", []), shape.get("uy", []))
        )
    scale = max(magnitudes, default=0.0)
    if scale <= 1e-12:
        raise ValueError(f"屈曲模态 {mode_number} 没有可用于初始缺陷的平动分量")
    multiplier = direction * amplitude_mm / scale
    node_offsets = [
        {
            "nodeId": str(node["nodeId"]),
            "uxMm": round(float(node.get("ux", 0.0)) * multiplier, 9),
            "uyMm": round(float(node.get("uy", 0.0)) * multiplier, 9),
        }
        for node in mode.get("nodeDisplacements", [])
        if str(node.get("nodeId") or "")
    ]
    member_shapes = [
        {
            "memberId": str(shape["memberId"]),
            "ratios": deepcopy(list(shape.get("ratios", shape.get("stations", [])))),
            "uxMm": [round(float(value) * multiplier, 9) for value in shape.get("ux", [])],
            "uyMm": [round(float(value) * multiplier, 9) for value in shape.get("uy", [])],
        }
        for shape in mode.get("memberModeShapes", [])
    ]
    resolved["initialImperfection"] = {
        "type": "explicit",
        "nodeOffsets": node_offsets,
        "memberShapeOffsets": member_shapes,
        "source": {
            "type": "linear_buckling_mode",
            "modeNumber": mode_number,
            "criticalLoadFactor": mode.get("criticalLoadFactor"),
            "amplitudeMm": amplitude_mm,
            "direction": int(direction),
            "normalization": deepcopy(mode.get("normalization", {})),
        },
    }
    return resolved


def _nonlinear_failure_message(reason: str | None) -> str:
    labels = {
        "minimum_step_exhausted": "自适应荷载步已缩小到最小步长，仍未建立收敛平衡",
        "maximum_cutbacks_exhausted": "自适应荷载步回退次数已用尽，仍未建立收敛平衡",
        "maximum_accepted_steps_exhausted": "已达到允许的最大收敛荷载步数，路径尚未完成",
    }
    return labels.get(reason, "共回转牛顿路径未完成，已保留最后收敛状态和失败尝试")


def _nonlinear_failure_code(reason: str | None) -> str:
    codes = {
        "minimum_step_exhausted": "GNA_MINIMUM_STEP_EXHAUSTED",
        "maximum_cutbacks_exhausted": "GNA_MAXIMUM_CUTBACKS_EXHAUSTED",
        "maximum_accepted_steps_exhausted": "GNA_MAXIMUM_ACCEPTED_STEPS_EXHAUSTED",
    }
    return codes.get(reason, "GNA_PATH_NOT_COMPLETED")


def _solve_pdelta_path(
    request: Mapping[str, Any],
    structure: Mapping[str, Any],
    options: Mapping[str, Any],
    first_order_solution: Mapping[str, Any],
    reference_source: Mapping[str, str],
) -> Tuple[Dict[str, Any], List[Dict[str, Any]], int]:
    assembly = assemble_global_system(structure, solver_backend=request.get("solver_backend", "auto"))
    first_order_forces = _member_axial_forces(first_order_solution.get("memberResults", []))
    pdelta_options = options.get("pDeltaOptions", {})
    load_steps = int(pdelta_options.get("loadSteps", 4))
    max_iterations = int(pdelta_options.get("maxIterations", 12))
    tolerance = float(pdelta_options.get("tolerance", 1e-6))
    history: List[Dict[str, Any]] = []
    converged_solution: Dict[str, Any] | None = None
    converged_forces: Dict[str, float] = dict(first_order_forces)
    last_step = 0

    for step_index in range(1, load_steps + 1):
        load_factor = step_index / max(1, load_steps)
        step_structure = _scale_structure_for_load_factor(structure, load_factor)
        scaled_member_forces = _scale_forces(first_order_forces, load_factor) if step_index == 1 else dict(converged_forces)
        previous_displacements: np.ndarray | None = None
        step_solution: Dict[str, Any] | None = None
        step_member_results: List[Dict[str, Any]] | None = None

        for iteration in range(1, max_iterations + 1):
            tangent_stiffness, tangent_load_vector = _assemble_tangent_system(
                assembly=assembly,
                member_forces=scaled_member_forces,
                load_factor=load_factor,
            )
            try:
                solved = solve_frame_system(
                    step_structure,
                    assembly,
                    stiffness_override=tangent_stiffness,
                    load_vector_override=tangent_load_vector,
                )
            except StructureStabilityError as exc:
                raise FramePDeltaSingularError(
                    f"P-Δ 荷载步 {step_index}/{load_steps} 的切线刚度无法求解：{exc}"
                ) from exc
            step_member_records = _scale_member_records(assembly["member_records"], load_factor)
            step_node_results = recover_node_results(
                step_structure["nodes"],
                solved["displacements"],
                solved["reactions"],
                assembly.get("spring_records", []),
            )
            step_member_results = recover_member_results(step_member_records, solved["displacements"])
            step_member_diagrams = recover_member_diagrams(step_member_records, solved["displacements"])
            step_solution = build_frame_solution_response(
                request={**request, "stabilityReference": dict(reference_source)},
                structure=step_structure,
                node_results=step_node_results,
                member_results=step_member_results,
                member_diagrams=step_member_diagrams,
                member_records=step_member_records,
                diagnostics=solved["diagnostics"],
            )
            displacement_vector = np.asarray(solved["displacements"], dtype=float)
            if previous_displacements is None:
                delta_abs = float(np.max(np.abs(displacement_vector))) if displacement_vector.size else 0.0
                delta_norm = float(np.linalg.norm(displacement_vector))
                delta_rel = 1.0 if delta_abs > 0 else 0.0
            else:
                delta = displacement_vector - previous_displacements
                delta_abs = float(np.max(np.abs(delta))) if delta.size else 0.0
                delta_norm = float(np.linalg.norm(delta))
                displacement_norm = max(float(np.linalg.norm(displacement_vector)), float(np.linalg.norm(previous_displacements)), 1e-12)
                delta_rel = float(np.linalg.norm(delta) / displacement_norm)
            updated_member_forces = _member_axial_forces(step_member_results)
            updated_tangent_stiffness, updated_tangent_load = _assemble_tangent_system(
                assembly=assembly,
                member_forces=updated_member_forces,
                load_factor=load_factor,
            )
            free_equilibrium, max_equilibrium_residual = _projected_equilibrium_error(
                updated_tangent_stiffness,
                updated_tangent_load,
                displacement_vector,
                np.asarray(solved["free_basis"], dtype=float),
            )
            iteration_converged = delta_rel <= tolerance and free_equilibrium <= tolerance
            history.append(
                {
                    "step": step_index,
                    "loadFactor": round(float(load_factor), 6),
                    "iteration": iteration,
                    "displacementIncrementMm": round(delta_abs * 1000.0, 8),
                    "displacementIncrementRelative": round(delta_rel, 10),
                    "displacementIncrementNorm": round(delta_norm, 12),
                    "relativeDisplacementIncrement": round(delta_rel, 10),
                    "equilibriumRmsRelativeError": round(free_equilibrium, 12),
                    "equilibriumResidual": round(free_equilibrium, 12),
                    "equilibriumMaxResidualN": round(max_equilibrium_residual, 8),
                    "maxDisplacementMm": round(float(step_solution["summary"]["maxDisplacementMm"]), 6),
                    "status": "converged" if iteration_converged else "iterating",
                }
            )
            previous_displacements = displacement_vector
            scaled_member_forces = updated_member_forces
            if iteration_converged:
                converged_solution = step_solution
                converged_forces = dict(scaled_member_forces)
                last_step = step_index
                break
        else:
            raise FramePDeltaConvergenceError(
                f"P-Δ 迭代未在荷载步 {step_index}/{load_steps} 的 {max_iterations} 次迭代内收敛，稳定分析失败"
            )

        if converged_solution is None or step_member_results is None:
            raise FramePDeltaSingularError(f"P-Δ 荷载步 {step_index}/{load_steps} 未生成有效二阶解")

    if converged_solution is None:
        raise FramePDeltaSingularError("P-Δ 求解未生成最终结果")
    converged_solution["secondOrderAmplificationFactor"] = converged_solution["summary"].get("secondOrderAmplificationFactor", None)
    return converged_solution, history, last_step or load_steps


def _assemble_tangent_system(
    *,
    assembly: Mapping[str, Any],
    member_forces: Mapping[str, float],
    load_factor: float,
) -> Tuple[Any, np.ndarray]:
    tangent_stiffness = assembly["stiffness"].copy()
    tangent_load_vector = np.asarray(assembly["load_vector"], dtype=float).copy() * float(load_factor)
    for record in assembly["member_records"]:
        member_id = str(record["id"])
        axial_force_kn = float(member_forces.get(member_id, 0.0))
        geometric_local = member_geometric_stiffness_local(axial_force_kn * 1000.0, float(record["length"]))
        total_local = np.asarray(record["k_base_local"], dtype=float) - geometric_local
        total_local_condensed, total_load_condensed = apply_rotational_releases(
            total_local,
            np.asarray(record["f_base_local"], dtype=float) * float(load_factor),
            list(record.get("release_dofs", [])),
        )
        material_global = record["transform"].T @ np.asarray(record["k_local"], dtype=float) @ record["transform"]
        total_global = record["transform"].T @ total_local_condensed @ record["transform"]
        add_local_stiffness(tangent_stiffness, record["dofs"], total_global - material_global)
        tangent_load_vector[np.asarray(record["dofs"], dtype=int)] += record["transform"].T @ (
            total_load_condensed - np.asarray(record["f_local"], dtype=float) * float(load_factor)
        )
    return tangent_stiffness, tangent_load_vector


def _projected_equilibrium_error(
    tangent_stiffness: Any,
    tangent_load_vector: np.ndarray,
    displacements: np.ndarray,
    free_basis: np.ndarray,
) -> Tuple[float, float]:
    """Measure nonlinear equilibrium in the admissible displacement space.

    ``displacements`` solves the tangent system assembled from the previous
    axial-force iterate.  Reassembling with the recovered axial forces and
    projecting the residual through the constraint null space therefore tests
    the updated equilibrium state instead of merely re-reporting the linear
    solver residual of the already solved tangent equation.
    """

    if free_basis.shape[1] == 0:
        return 0.0, 0.0
    internal_force = np.asarray(tangent_stiffness @ displacements, dtype=float).reshape(-1)
    external_force = np.asarray(tangent_load_vector, dtype=float).reshape(-1)
    projected_internal = free_basis.T @ internal_force
    projected_external = free_basis.T @ external_force
    projected_residual = projected_internal - projected_external
    reference_norm = max(
        float(np.linalg.norm(projected_internal)),
        float(np.linalg.norm(projected_external)),
        1.0,
    )
    relative_error = float(np.linalg.norm(projected_residual) / reference_norm)
    max_residual = float(np.max(np.abs(projected_residual))) if projected_residual.size else 0.0
    return relative_error, max_residual


def _scale_structure_for_load_factor(structure: Mapping[str, Any], load_factor: float) -> Dict[str, Any]:
    scaled = deepcopy(dict(structure))
    scaled["loads"] = [_scale_load(load, load_factor) for load in structure.get("loads", [])]
    scaled["nodes"] = [_scale_node(node, load_factor) for node in structure.get("nodes", [])]
    return scaled


def _scale_node(node: Mapping[str, Any], load_factor: float) -> Dict[str, Any]:
    node_copy = deepcopy(dict(node))
    if node_copy.get("supportDisplacements"):
        node_copy["supportDisplacements"] = [_scale_support_displacement(item, load_factor) for item in node_copy["supportDisplacements"]]
    return node_copy


def _scale_support_displacement(item: Mapping[str, Any], load_factor: float) -> Dict[str, Any]:
    scaled = deepcopy(dict(item))
    if "displacementMm" in scaled:
        scaled["displacementMm"] = float(scaled["displacementMm"]) * float(load_factor)
    if "rotationDeg" in scaled:
        scaled["rotationDeg"] = float(scaled["rotationDeg"]) * float(load_factor)
    return scaled


def _scale_load(load: Mapping[str, Any], factor: float) -> Dict[str, Any]:
    scaled = deepcopy(dict(load))
    if scaled.get("type") == "nodal":
        for key in ("fxKn", "fyKn", "mzKnM"):
            if key in scaled:
                scaled[key] = float(scaled[key]) * float(factor)
    elif scaled.get("type") == "member_point":
        if "forceKn" in scaled:
            scaled["forceKn"] = float(scaled["forceKn"]) * float(factor)
    elif scaled.get("type") == "temperature":
        if "deltaTempC" in scaled:
            scaled["deltaTempC"] = float(scaled["deltaTempC"]) * float(factor)
    else:
        for key in ("wyKnPerM", "qStartKnPerM", "qEndKnPerM"):
            if key in scaled:
                scaled[key] = float(scaled[key]) * float(factor)
    return scaled


def _scale_member_records(member_records: Sequence[Mapping[str, Any]], load_factor: float) -> List[Dict[str, Any]]:
    scaled: List[Dict[str, Any]] = []
    for record in member_records:
        copy_record = deepcopy(dict(record))
        copy_record["f_base_local"] = np.asarray(record["f_base_local"], dtype=float) * float(load_factor)
        copy_record["f_local"] = np.asarray(record["f_local"], dtype=float) * float(load_factor)
        scaled.append(copy_record)
    return scaled


def _scale_forces(member_forces: Mapping[str, float], factor: float) -> Dict[str, float]:
    return {str(member_id): float(force) * float(factor) for member_id, force in member_forces.items()}


def _member_axial_forces(member_results: Sequence[Mapping[str, Any]]) -> Dict[str, float]:
    forces: Dict[str, float] = {}
    for result in member_results:
        start = float(result.get("axialStartKn", 0.0))
        end = float(result.get("axialEndKn", start))
        forces[str(result.get("memberId"))] = 0.5 * (start + end)
    return forces


def _buckling_result(
    request: Mapping[str, Any],
    structure: Mapping[str, Any],
    solution: Mapping[str, Any],
    options: Mapping[str, Any],
    first_order: Mapping[str, Any],
    reference_source: Mapping[str, str],
) -> Dict[str, Any]:
    enabled = bool(options.get("buckling"))
    buckling_options = options.get("bucklingOptions", {})
    member_euler_screen = _member_euler_screen(solution)
    if not enabled:
        return {
            "enabled": False,
            "converged": False,
            "status": "not_enabled",
            "statusLabel": "未启用",
            "method": "约束空间广义特征值屈曲分析",
            "referenceSource": dict(reference_source),
            "controlSource": dict(reference_source),
            "criticalLoadFactor": None,
            "memberEulerScreen": member_euler_screen,
            "controllingMembers": member_euler_screen,
            "modes": [],
            "modeCount": 0,
            "firstOrder": first_order,
            "limitations": "未启用线性屈曲分析。",
        }

    member_results = list(solution.get("memberResults", []))
    if not any(float(result.get("axialStartKn", 0.0)) > 0.0 or float(result.get("axialEndKn", 0.0)) > 0.0 for result in member_results):
        return {
            "enabled": True,
            "converged": False,
            "status": "no_compression",
            "statusLabel": "无轴压",
            "method": "约束空间广义特征值屈曲分析",
            "referenceSource": dict(reference_source),
            "controlSource": dict(reference_source),
            "criticalLoadFactor": None,
            "memberEulerScreen": member_euler_screen,
            "controllingMembers": member_euler_screen,
            "modes": [],
            "modeCount": 0,
            "firstOrder": first_order,
            "limitations": "当前参考工况未形成受压控制构件，未提取屈曲模态。",
            "meshDiagnostics": {
                "solverBackend": "mesh",
                "refinedDofCount": 0,
                "subdivisionCount": 0,
                "memberSubdivisions": [],
            },
        }

    mesh_result = solve_frame_stability_mesh(
        structure,
        member_results,
        int(buckling_options.get("modeCount", 3)),
        solver_backend=request.get("solver_backend", "auto"),
    )
    modes = list(mesh_result.get("modes", []))
    if not modes:
        raise FrameBucklingSolveError("屈曲特征值求解未得到有效正模态，稳定分析失败")
    mesh_diagnostics = dict(mesh_result.get("meshDiagnostics", {}))
    mesh_diagnostics.setdefault("solverBackend", mesh_diagnostics.get("solverMode", "mesh"))
    mesh_diagnostics.setdefault("refinedDofCount", mesh_diagnostics.get("reducedDofCount", 0))
    mesh_diagnostics.setdefault(
        "subdivisionCount",
        int(sum(int(item.get("subdivisions", 0)) for item in mesh_diagnostics.get("memberSubdivisions", []))),
    )
    critical_load_factor = mesh_result.get("criticalLoadFactor")
    return {
        "enabled": True,
        "converged": True,
        "status": "converged",
        "statusLabel": "已收敛",
        "method": "约束空间广义特征值屈曲分析",
        "referenceSource": dict(reference_source),
        "controlSource": dict(reference_source),
        "criticalLoadFactor": round(float(critical_load_factor), 6) if critical_load_factor is not None else None,
        "memberEulerScreen": member_euler_screen,
        "controllingMembers": member_euler_screen,
        "modes": modes,
        "modeCount": len(modes),
        "firstOrder": first_order,
        "limitations": "线性屈曲特征值分析；未包含后屈曲路径、材料非线性、几何缺陷和构件局部屈曲。",
        "meshDiagnostics": mesh_diagnostics,
        "solverBackend": mesh_diagnostics.get("solverBackend"),
        "refinedDofCount": mesh_diagnostics.get("refinedDofCount"),
        "subdivisionCount": mesh_diagnostics.get("subdivisionCount"),
    }


def _member_euler_screen(solution: Mapping[str, Any]) -> List[Dict[str, Any]]:
    members = {member["id"]: member for member in solution.get("structure", {}).get("members", [])}
    controlling: List[Dict[str, Any]] = []
    for result in solution.get("memberResults", []):
        axial = max(float(result.get("axialStartKn", 0.0)), float(result.get("axialEndKn", 0.0)))
        if axial <= 0:
            continue
        member = members.get(result.get("memberId"), {})
        length = max(float(result.get("lengthM", 0.0)), 1e-9)
        e = float(member.get("E_GPa", 210.0)) * 1e9
        i = float(member.get("I_cm4", 8000.0)) * 1e-8
        pcr_kn = math.pi**2 * e * i / (length**2) / 1000.0
        if pcr_kn <= 0:
            continue
        controlling.append(
            {
                "memberId": result.get("memberId"),
                "compressionKn": round(axial, 6),
                "eulerCriticalLoadKn": round(pcr_kn, 6),
                "criticalLoadFactor": round(pcr_kn / axial, 6),
                "utilizationRatio": round(axial / pcr_kn, 8),
                "screeningMethod": "构件欧拉系数 K=1 初筛",
                "screeningOnly": True,
            }
        )
    controlling.sort(key=lambda item: item["criticalLoadFactor"])
    return controlling[:3]


def _safe_ratio(numerator: float, denominator: float) -> float | None:
    if abs(denominator) <= 1e-12:
        return 1.0 if abs(numerator) <= 1e-12 else None
    ratio = abs(float(numerator) / float(denominator))
    return ratio if math.isfinite(ratio) else None


def _amplification_measure(
    nonlinear_horizontal: float,
    first_horizontal: float,
    nonlinear_resultant: float,
    first_resultant: float,
) -> tuple[float | None, str | None]:
    """Return a finite amplification or an explicit non-comparability fact."""

    horizontal_ratio = _safe_ratio(nonlinear_horizontal, first_horizontal)
    if horizontal_ratio is None and abs(nonlinear_horizontal) > 1e-12:
        return None, "首阶水平位移为零而几何非线性水平位移非零，放大系数不可比。"
    resultant_ratio = _safe_ratio(nonlinear_resultant, first_resultant)
    finite_ratios = [value for value in (horizontal_ratio, resultant_ratio) if value is not None]
    if not finite_ratios:
        return None, "首阶响应为零，无法定义有限的二阶放大系数。"
    return max(finite_ratios), None


def _max_abs_value(items: Sequence[Mapping[str, Any]], keys: Sequence[str]) -> float:
    best = 0.0
    for item in items:
        for key in keys:
            best = max(best, abs(float(item.get(key, 0.0))))
    return best
