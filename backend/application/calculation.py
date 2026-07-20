from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Mapping

from backend.common.analysis_types import get_analysis_type, get_material_name
from backend.contracts.calculation_response import CALCULATION_RESULT_SCHEMA
from backend.contracts.response_envelope import _stable_hash
from backend.services.beam_workbench import build_solution as build_beam_solution
from backend.services.frame_workbench import build_solution as build_frame_solution
from backend.services.truss_workbench import build_solution as build_truss_solution


def _beam_load_echo(request_data: Mapping[str, Any]) -> tuple[float, float]:
    if request_data["load_type"] == "point":
        return float(request_data["point_load_kn"]), float(request_data["point_load_kn"])
    if request_data["load_type"] == "linear":
        return float(request_data["distributed_start_kn"]), float(request_data["distributed_end_kn"])
    return float(request_data["q_kn"]), float(request_data["q_kn"])


def _beam_request_echo(solution: Mapping[str, Any]) -> Dict[str, Any]:
    request_data = solution["request"]
    load_value, load_end = _beam_load_echo(request_data)
    return {
        "analysisType": "beam",
        "projectName": request_data["project_name"],
        "materialId": request_data["material_id"],
        "beamType": request_data["beam_type"],
        "loadType": request_data["load_type"],
        "spans": request_data["spans"],
        "spanProperties": [
            {"E": float(span_e), "I": float(span_i)}
            for span_e, span_i in zip(request_data["span_E_gpa"], request_data["span_I_cm4"])
        ],
        "q": request_data["q_kn"],
        "loadValue": load_value,
        "loadPosition": request_data["point_position"],
        "loadEnd": load_end,
        "uniformLoadStartRatio": request_data["uniform_start_ratio"],
        "uniformLoadEndRatio": request_data["uniform_end_ratio"],
        "freq": request_data["freq"],
        "duration": request_data["duration"],
        "E": request_data["E_gpa"],
        "I": request_data["I_cm4"],
        "beamTheory": request_data.get("beam_theory", "euler_bernoulli"),
        "supports": request_data.get("supports", []),
        "solverBackend": request_data.get("solver_backend", "auto"),
        "outputPrecision": request_data.get("output_precision", {}),
    }


def _beam_summary(solution: Mapping[str, Any]) -> Dict[str, Any]:
    return {
        "allowableMm": float(solution["allowable_mm"]),
        "allowableRatio": 250,
        "maxDeflectionMm": float(solution["max_deflection_mm"]),
        "maxDeflectionPositionM": float(solution["max_deflection_position_m"]),
        "status": solution["status"],
        "statusCode": "PASS" if solution["status"] == "合格" else "REVIEW",
        "method": f"{solution.get('beamTheoryLabel', 'Euler-Bernoulli 梁理论')} + 梁单元法",
        **solution.get("controlValues", {}),
    }


def build_calculation_result(data: Mapping[str, Any], operation: str = "calculate") -> Dict[str, Any]:
    analysis_type = get_analysis_type(data)
    material_name = get_material_name(data.get("materialId"))

    if analysis_type == "frame":
        solution = build_frame_solution(dict(data), material_name)
        request_echo = solution["payload"]
        structure = solution["structure"]
        normalized_request = None
        summary = solution["summary"]
    elif analysis_type == "truss":
        solution = build_truss_solution(dict(data), material_name)
        request_echo = solution["payload"]
        structure = solution["structure"]
        normalized_request = solution.get("request")
        summary = solution["summary"]
    else:
        solution = build_beam_solution(dict(data), material_name)
        request_echo = _beam_request_echo(solution)
        structure = solution["beam"]
        normalized_request = solution["request"]
        summary = _beam_summary(solution)

    generated_at = datetime.now(timezone.utc).isoformat()
    result: Dict[str, Any] = {
        "storageSchema": CALCULATION_RESULT_SCHEMA,
        "operation": operation,
        "analysisType": analysis_type,
        "request": request_echo,
        "structure": structure,
        "summary": summary,
        "diagnostics": solution.get("diagnostics", {}),
        "solution": solution,
        "generatedAt": generated_at,
        "requestHash": _stable_hash(request_echo),
        "modelHash": _stable_hash(structure),
    }
    if normalized_request is not None:
        result["normalizedRequest"] = normalized_request
    return result
