from __future__ import annotations

import json
from typing import Any, Callable, Dict, Mapping

from backend.capabilities.beam_deflection import _build_solver_payload, _formula_ref, solve_beam_deflection_capability
from backend.api.sensitivity import build_sensitivity_response
from backend.api.utils import build_calculation_response
from backend.benchmarks.catalog import iter_benchmark_cases
from backend.benchmarks.runner import BenchmarkCaseError, evaluate_benchmark_case_by_id
from backend.project_documents import validate_project_document
from backend.project_workflow import (
    apply_host_project_change,
    build_export_artifact_metadata,
    create_host_save_request,
    load_host_project,
    solve_project_document,
)
from backend.services.beam_workbench import build_solution as build_beam_solution
from backend.services.frame_workbench import build_solution as build_frame_solution
from backend.services.truss_workbench import build_solution as build_truss_solution

CAPABILITY_VERSION = "2026-05-25"


class ToolInputError(ValueError):
    """输入 JSON 可解析，但不满足工具契约。"""


def _invalid_result(capability_id: str, message: str) -> Dict[str, Any]:
    return {
        "capabilityId": capability_id,
        "capabilityVersion": CAPABILITY_VERSION,
        "status": "invalid_input",
        "inputValidated": False,
        "warnings": [message],
    }


def _error_result(capability_id: str, message: str) -> Dict[str, Any]:
    return {
        "capabilityId": capability_id,
        "capabilityVersion": CAPABILITY_VERSION,
        "status": "error",
        "inputValidated": False,
        "warnings": [message],
    }


def _payload_from_arguments(arguments: Mapping[str, Any], *, analysis_type: str) -> Dict[str, Any]:
    payload = arguments.get("payload")
    if isinstance(payload, Mapping):
        return dict(payload)
    structure = arguments.get("structure")
    if isinstance(structure, Mapping):
        return {
            "analysisType": analysis_type,
            "projectName": str(arguments.get("projectName") or f"Solver {analysis_type} capability"),
            "materialId": str(arguments.get("materialId") or "custom"),
            "structure": dict(structure),
        }
    raise ToolInputError("必须提供 payload 或 structure 对象")


def _find_by_id(items: list[Mapping[str, Any]], key: str, value: str | None) -> Mapping[str, Any] | None:
    if not value:
        return None
    return next((item for item in items if str(item.get(key)) == value), None)


def _solve_beam_deflection_serviceability_check(arguments: Mapping[str, Any], capability_id: str) -> Dict[str, Any]:
    try:
        solver_payload = _build_solver_payload(arguments)
        solution = build_beam_solution(solver_payload, "自定义材料")
        summary = solution.get("summary", {})
        span_m = float(solver_payload["spans"][0])
        ratio = float(arguments.get("deflectionLimitRatio") or 250.0)
        if ratio <= 0:
            raise ToolInputError("deflectionLimitRatio 必须大于 0")
        max_deflection_mm = abs(float(summary.get("maxDeflectionMm", solution.get("max_deflection_mm", 0.0))))
        allowable_mm = span_m * 1000.0 / ratio
        utilization = max_deflection_mm / allowable_mm if allowable_mm > 0 else float("inf")
        passed = utilization <= 1.0
        return {
            "capabilityId": capability_id,
            "capabilityVersion": CAPABILITY_VERSION,
            "status": "pass" if passed else "fail",
            "inputValidated": True,
            "checkType": "serviceability_deflection_check",
            "checkStatus": "合格" if passed else "需校核",
            "utilization": round(utilization, 6),
            "deflection": {
                "value": round(max_deflection_mm, 6),
                "unit": "mm",
                "kind": "max_abs_deflection",
            },
            "allowable": {
                "value": round(allowable_mm, 6),
                "unit": "mm",
                "ratio": ratio,
            },
            "formulaRef": _formula_ref(solution),
            "normalizedInput": {
                "span": {"value": span_m, "unit": "m"},
                "elasticModulus": {"value": solver_payload["E"], "unit": "GPa"},
                "secondMomentOfArea": {"value": solver_payload["I"], "unit": "cm4"},
                "load": {"value": solver_payload["q"], "unit": "kN/m", "case": "uniform"},
                "boundaryCondition": solver_payload["beamType"],
            },
            "warnings": [
                "本工具当前执行挠度正常使用极限校核，不执行材料强度、稳定或规范承载力设计。"
            ],
        }
    except ToolInputError as exc:
        return _invalid_result(capability_id, str(exc))
    except Exception as exc:
        if exc.__class__.__name__ == "CapabilityInputError":
            return _invalid_result(capability_id, str(exc))
        return _error_result(capability_id, f"梁校核调用失败: {exc}")


def solve_beam_deflection_serviceability_check(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    return _solve_beam_deflection_serviceability_check(arguments, "solver.beam_deflection_serviceability_check")


def solve_frame_displacement(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    capability_id = "solver.frame_displacement"
    try:
        payload = _payload_from_arguments(arguments, analysis_type="frame")
        solution = build_frame_solution(payload, str(arguments.get("materialName") or "自定义材料"))
        summary = solution.get("summary", {})
        node_results = list(solution.get("nodeResults", []))
        target_node = _find_by_id(node_results, "nodeId", str(arguments.get("targetNodeId") or "") or None)
        status_code = str(summary.get("statusCode") or "")
        return {
            "capabilityId": capability_id,
            "capabilityVersion": CAPABILITY_VERSION,
            "status": "pass" if status_code == "PASS" else "fail",
            "inputValidated": True,
            "method": summary.get("method", "二维平面框架刚度法 + 平面梁柱单元"),
            "maxDisplacement": {
                "value": float(summary.get("maxDisplacementMm", 0.0)),
                "unit": "mm",
                "nodeId": summary.get("maxDisplacementNodeId", ""),
            },
            "maxVerticalDisplacement": {
                "value": float(summary.get("maxVerticalMm", 0.0)),
                "unit": "mm",
            },
            "allowable": {
                "value": float(summary.get("allowableMm", 0.0)),
                "unit": "mm",
            },
            "targetNode": target_node,
            "peakInternalForces": summary.get("peakInternalForces", {}),
            "equilibrium": {
                "rmsRelativeError": summary.get("equilibriumRmsRelativeError", 0.0),
                "maxResidualN": summary.get("equilibriumMaxResidualN", 0.0),
            },
            "warnings": [
                "本工具返回二维线弹性平面框架位移结果，不替代结构设计复核或签审。"
            ],
        }
    except ToolInputError as exc:
        return _invalid_result(capability_id, str(exc))
    except Exception as exc:
        return _error_result(capability_id, f"框架位移求解失败: {exc}")


def solve_truss_member_force(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    capability_id = "solver.truss_member_force"
    try:
        payload = _payload_from_arguments(arguments, analysis_type="truss")
        solution = build_truss_solution(payload, str(arguments.get("materialName") or "自定义材料"))
        summary = solution.get("summary", {})
        member_results = list(solution.get("memberResults", []))
        target_member = _find_by_id(member_results, "memberId", str(arguments.get("targetMemberId") or "") or None)
        control_member = _find_by_id(member_results, "memberId", str(summary.get("maxAxialForceMemberId") or "") or None)
        status_code = str(summary.get("statusCode") or "")
        return {
            "capabilityId": capability_id,
            "capabilityVersion": CAPABILITY_VERSION,
            "status": "pass" if status_code == "PASS" else "fail",
            "inputValidated": True,
            "method": summary.get("method", "二维平面桁架杆单元法"),
            "maxAxialForce": {
                "value": float(summary.get("maxAxialForceKn", 0.0)),
                "unit": "kN",
                "memberId": summary.get("maxAxialForceMemberId", ""),
            },
            "maxDisplacement": {
                "value": float(summary.get("maxDisplacementMm", 0.0)),
                "unit": "mm",
                "nodeId": summary.get("maxDisplacementNodeId", ""),
            },
            "controlMember": control_member,
            "targetMember": target_member,
            "equilibrium": {
                "rmsRelativeError": summary.get("equilibriumRmsRelativeError", 0.0),
                "maxResidualN": summary.get("equilibriumMaxResidualN", 0.0),
            },
            "warnings": [
                "本工具返回二维线弹性桁架轴力结果，默认不考虑杆件稳定、连接设计或规范承载力折减。"
            ],
        }
    except ToolInputError as exc:
        return _invalid_result(capability_id, str(exc))
    except Exception as exc:
        return _error_result(capability_id, f"桁架杆力求解失败: {exc}")


def solve_calculate(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    capability_id = "solver.calculate"
    try:
        payload = arguments.get("payload")
        if not isinstance(payload, Mapping):
            raise ToolInputError("payload 必须是结构求解输入对象")
        result = build_calculation_response(dict(payload), operation="calculate")
        summary = result.get("summary", {})
        return {
            "capabilityId": capability_id,
            "capabilityVersion": CAPABILITY_VERSION,
            "status": "pass" if summary.get("statusCode") in {None, "PASS"} else "fail",
            "inputValidated": True,
            "analysisType": result.get("analysisType"),
            "summary": summary,
            "diagnostics": result.get("diagnostics", {}),
            "results": result.get("results", {}),
            "warnings": [
                "通用求解工具返回完整结构分析结果摘要；工程签审仍需人工复核。"
            ],
        }
    except ToolInputError as exc:
        return _invalid_result(capability_id, str(exc))
    except Exception as exc:
        return _error_result(capability_id, f"通用求解失败: {exc}")


def solve_sensitivity_analysis(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    capability_id = "solver.sensitivity_analysis"
    try:
        payload = arguments.get("payload")
        if not isinstance(payload, Mapping):
            raise ToolInputError("payload 必须是结构求解输入对象")
        result = build_sensitivity_response(dict(payload))
        return {
            "capabilityId": capability_id,
            "capabilityVersion": CAPABILITY_VERSION,
            "status": "pass",
            "inputValidated": True,
            "responseMetric": result.get("responseMetric"),
            "responseLabel": result.get("responseLabel"),
            "responseUnit": result.get("responseUnit"),
            "variations": result.get("variations", []),
            "series": result.get("series", []),
            "warnings": [
                "敏感性分析仅说明扰动参数对所选响应指标的数值影响，不构成规范设计结论。"
            ],
        }
    except ToolInputError as exc:
        return _invalid_result(capability_id, str(exc))
    except Exception as exc:
        return _error_result(capability_id, f"敏感性分析失败: {exc}")


def list_benchmark_cases(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    capability_id = "solver.benchmark_case_list"
    category = str(arguments.get("category") or "").strip() or None
    cases = [
        {
            "id": case["id"],
            "category": case["category"],
            "title": case["title"],
            "purpose": case["purpose"],
            "sourceType": case.get("verification", {}).get("sourceType"),
            "verificationLevel": case.get("verification", {}).get("verificationLevel"),
            "verificationLevelLabel": case.get("verification", {}).get("verificationLevelLabel"),
            "checkedMetrics": case.get("verification", {}).get("checkedMetrics", []),
        }
        for case in iter_benchmark_cases(category)
    ]
    return {
        "capabilityId": capability_id,
        "capabilityVersion": CAPABILITY_VERSION,
        "status": "pass",
        "inputValidated": True,
        "caseCount": len(cases),
        "cases": cases,
        "warnings": [],
    }


def run_benchmark_case(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    capability_id = "solver.benchmark_case_run"
    case_id = str(arguments.get("caseId") or "").strip()
    if not case_id:
        return _invalid_result(capability_id, "caseId 不能为空")
    try:
        result = evaluate_benchmark_case_by_id(case_id)
        return {
            "capabilityId": capability_id,
            "capabilityVersion": CAPABILITY_VERSION,
            "status": result["status"],
            "inputValidated": True,
            "caseId": result["caseId"],
            "category": result["category"],
            "title": result["title"],
            "checks": result["checks"],
            "verification": result["verification"],
            "warnings": [],
        }
    except BenchmarkCaseError as exc:
        return _invalid_result(capability_id, str(exc))
    except Exception as exc:
        return _error_result(capability_id, f"基准算例执行失败: {exc}")


def validate_solver_project_document(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    capability_id = "solver.project_document_validate"
    if "projectDocument" in arguments:
        raw_document = arguments["projectDocument"]
    elif "projectDocumentText" in arguments:
        raw_document = str(arguments["projectDocumentText"])
    else:
        raw_document = arguments
    result = validate_project_document(raw_document)
    if not result.get("ok"):
        return _invalid_result(capability_id, str(result.get("error") or "项目文档无效"))
    return {
        "capabilityId": capability_id,
        "capabilityVersion": CAPABILITY_VERSION,
        "status": "pass",
        "inputValidated": True,
        "summary": result["summary"],
        "diagnostics": result["diagnostics"],
        "projectDocument": result["projectDocument"],
        "warnings": [item["detail"] for item in result["diagnostics"] if item.get("severity") == "warning"],
    }


def load_solver_host_project(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    capability_id = "solver.project_host_load"
    try:
        raw_document = arguments.get("projectDocument", arguments)
        result = load_host_project(raw_document, session_id=str(arguments.get("sessionId") or "") or None)
        return {"capabilityId": capability_id, "capabilityVersion": CAPABILITY_VERSION, "status": "pass", "inputValidated": True, **result}
    except Exception as exc:
        return _invalid_result(capability_id, str(exc))


def apply_solver_host_project_change(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    capability_id = "solver.project_host_apply_change"
    try:
        raw_document = arguments.get("projectDocument", arguments)
        change = arguments.get("change")
        if not isinstance(change, Mapping):
            raise ToolInputError("change 必须是 host 项目变更对象")
        result = apply_host_project_change(raw_document, change)
        return {"capabilityId": capability_id, "capabilityVersion": CAPABILITY_VERSION, "status": "pass", "inputValidated": True, **result}
    except Exception as exc:
        return _invalid_result(capability_id, str(exc))


def create_solver_host_save_request(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    capability_id = "solver.project_host_save_request"
    try:
        raw_document = arguments.get("projectDocument", arguments)
        result = create_host_save_request(raw_document)
        return {"capabilityId": capability_id, "capabilityVersion": CAPABILITY_VERSION, "status": "pass", "inputValidated": True, **result}
    except Exception as exc:
        return _invalid_result(capability_id, str(exc))


def solve_solver_project_document(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    capability_id = "solver.project_document_solve"
    try:
        raw_document = arguments.get("projectDocument", arguments)
        result = solve_project_document(raw_document)
        return {"capabilityId": capability_id, "capabilityVersion": CAPABILITY_VERSION, "status": result["status"], "inputValidated": True, **result}
    except Exception as exc:
        return _invalid_result(capability_id, str(exc))


def build_solver_export_metadata(arguments: Mapping[str, Any]) -> Dict[str, Any]:
    capability_id = "solver.project_export_metadata"
    try:
        raw_document = arguments.get("projectDocument", arguments)
        result_summary = arguments.get("resultSummary") if isinstance(arguments.get("resultSummary"), Mapping) else None
        metadata = build_export_artifact_metadata(raw_document, str(arguments.get("format") or "docx"), result_summary)
        return {
            "capabilityId": capability_id,
            "capabilityVersion": CAPABILITY_VERSION,
            "status": "pass",
            "inputValidated": True,
            "artifactMetadata": metadata,
            "warnings": [],
        }
    except Exception as exc:
        return _invalid_result(capability_id, str(exc))

ToolHandler = Callable[[Mapping[str, Any]], Dict[str, Any]]

TOOL_HANDLERS: Dict[str, ToolHandler] = {
    "beam_deflection": solve_beam_deflection_capability,
    "beam_deflection_serviceability_check": solve_beam_deflection_serviceability_check,
    "frame_displacement": solve_frame_displacement,
    "truss_member_force": solve_truss_member_force,
    "calculate": solve_calculate,
    "sensitivity_analysis": solve_sensitivity_analysis,
    "benchmark_case_list": list_benchmark_cases,
    "benchmark_case_run": run_benchmark_case,
    "project_document_validate": validate_solver_project_document,
    "project_host_load": load_solver_host_project,
    "project_host_apply_change": apply_solver_host_project_change,
    "project_host_save_request": create_solver_host_save_request,
    "project_document_solve": solve_solver_project_document,
    "project_export_metadata": build_solver_export_metadata,
}


def tool_result_text(result: Mapping[str, Any]) -> str:
    return json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True)
