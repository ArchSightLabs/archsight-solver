from __future__ import annotations

from typing import Any, Dict, Mapping

from backend.api.analysis_types import get_analysis_type, get_material_name
from backend.api.response_envelope import attach_unified_envelope
from backend.services.beam_workbench import build_solution as build_beam_solution
from backend.services.frame_workbench import build_solution as build_frame_solution
from backend.services.truss_workbench import build_solution as build_truss_solution


def _build_frame_response(solution: Dict[str, Any], operation: str) -> Dict[str, Any]:
    response = {
        "analysisType": "frame",
        "frame": solution["preview"],
        "preview": solution["preview"],
        "diagram": solution["diagram"],
        "summary": solution["summary"],
        "payload": solution["payload"],
        "structure": solution["structure"],
        "nodeResults": solution["nodeResults"],
        "memberResults": solution["memberResults"],
        "memberDiagrams": solution["memberDiagrams"],
        "loadCaseResults": solution.get("loadCaseResults", []),
        "loadCombinationResults": solution.get("loadCombinationResults", []),
        "secondOrder": solution.get("secondOrder", {}),
        "buckling": solution.get("buckling", {}),
        "diagnostics": solution.get("diagnostics", {}),
        "nodeIds": solution["nodeIds"],
        "memberIds": solution["memberIds"],
        "ux_data": solution["ux_data"],
        "uy_data": solution["uy_data"],
        "rz_data": solution["rz_data"],
        "member_axial_data": solution["member_axial_data"],
        "member_shear_data": solution["member_shear_data"],
        "member_moment_data": solution["member_moment_data"],
        "solution": solution,
    }
    return attach_unified_envelope(
        response=response,
        analysis_type="frame",
        request_echo=solution["payload"],
        structure_model=solution["structure"],
        operation=operation,
    )


def _build_truss_response(solution: Dict[str, Any], operation: str) -> Dict[str, Any]:
    response = {
        "analysisType": "truss",
        "truss": solution["truss"],
        "preview": solution["preview"],
        "diagram": solution["diagram"],
        "summary": solution["summary"],
        "payload": solution["payload"],
        "structure": solution["structure"],
        "nodeResults": solution["nodeResults"],
        "memberResults": solution["memberResults"],
        "loadCaseResults": solution.get("loadCaseResults", []),
        "loadCombinationResults": solution.get("loadCombinationResults", []),
        "envelope": solution.get("envelope", {}),
        "diagnostics": solution.get("diagnostics", {}),
        "nodeIds": solution["nodeIds"],
        "memberIds": solution["memberIds"],
        "ux_data": solution["ux_data"],
        "uy_data": solution["uy_data"],
        "member_axial_data": solution["member_axial_data"],
        "solution": solution,
    }
    return attach_unified_envelope(
        response=response,
        analysis_type="truss",
        request_echo=solution["payload"],
        structure_model=solution["structure"],
        normalized_request=solution.get("request"),
        operation=operation,
    )


def _beam_load_echo(request_data: Dict[str, Any]) -> tuple[float, float]:
    if request_data["load_type"] == "point":
        return request_data["point_load_kn"], request_data["point_load_kn"]
    if request_data["load_type"] == "linear":
        return request_data["distributed_start_kn"], request_data["distributed_end_kn"]
    return request_data["q_kn"], request_data["q_kn"]


def _build_beam_response(solution: Dict[str, Any], operation: str) -> Dict[str, Any]:
    request_data = solution["request"]
    load_value, load_end = _beam_load_echo(request_data)
    response = {
        "analysisType": "beam",
        "x_data": list(solution["x_data"]),
        "v_data": list(solution["v_data"]),
        "moment_data": [round(float(value) / 1000.0, 6) for value in solution.get("element_end_moments", [])],
        "shear_data": [round(float(value) / 1000.0, 6) for value in solution.get("element_end_shears", [])],
        "t_data": list(solution["t_data"]),
        "q_t_data": list(solution["q_t_data"]),
        "beam": solution["beam"],
        "preview": solution["beam"],
        "diagram": solution["diagram"],
        "loadCaseResults": solution.get("loadCaseResults", []),
        "loadCombinationResults": solution.get("loadCombinationResults", []),
        "envelope": solution.get("envelope", {}),
        "queryResults": solution.get("queryResults", []),
        "controlValues": solution.get("controlValues", {}),
        "teachingNotes": solution.get("teachingNotes", {}),
        "symbolicCheck": solution.get("symbolicCheck", {}),
        "diagnostics": solution.get("diagnostics", {}),
        "summary": {
            "allowableMm": float(solution["allowable_mm"]),
            "allowableRatio": 250,
            "maxDeflectionMm": float(solution["max_deflection_mm"]),
            "maxDeflectionPositionM": float(solution["max_deflection_position_m"]),
            "status": solution["status"],
            "statusCode": "PASS" if solution["status"] == "合格" else "REVIEW",
            "method": f"{solution.get('beamTheoryLabel', 'Euler-Bernoulli 梁理论')} + 梁单元法",
            **solution.get("controlValues", {}),
        },
        "payload": {
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
        },
        "request": request_data,
        "solution": solution,
    }
    return attach_unified_envelope(
        response=response,
        analysis_type="beam",
        request_echo=response["payload"],
        structure_model=response["beam"],
        normalized_request=request_data,
        operation=operation,
    )


def build_calculation_response(data: Mapping[str, Any], operation: str = "calculate") -> Dict[str, Any]:
    analysis_type = get_analysis_type(data)
    material_name = get_material_name(data.get("materialId"))

    if analysis_type == "frame":
        return _build_frame_response(build_frame_solution(dict(data), material_name), operation)
    if analysis_type == "truss":
        return _build_truss_response(build_truss_solution(dict(data), material_name), operation)
    return _build_beam_response(build_beam_solution(dict(data), material_name), operation)
