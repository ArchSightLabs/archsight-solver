from __future__ import annotations

import json
from typing import Any, Callable, Dict, Mapping

from backend.capabilities.beam_deflection import _build_solver_payload, _formula_ref, solve_beam_deflection_capability
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
            "method": summary.get("method", "二维框架刚度法 + 平面梁柱单元"),
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


ToolHandler = Callable[[Mapping[str, Any]], Dict[str, Any]]

TOOL_HANDLERS: Dict[str, ToolHandler] = {
    "beam_deflection": solve_beam_deflection_capability,
    "beam_deflection_serviceability_check": solve_beam_deflection_serviceability_check,
    "frame_displacement": solve_frame_displacement,
    "truss_member_force": solve_truss_member_force,
}


def tool_result_text(result: Mapping[str, Any]) -> str:
    return json.dumps(result, ensure_ascii=False, indent=2, sort_keys=True)
