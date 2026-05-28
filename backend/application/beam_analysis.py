from __future__ import annotations

from typing import Any, Dict, List

import numpy as np

from backend.common.units import to_si
from backend.normalizers.beam.request_normalizer import normalize_beam_request
from backend.presenters.beam.assembler import build_beam_solution_response
from backend.solver.beam.solver import build_time_history, finite_element_solution


def _solve_beam_request(request_data: Dict[str, Any], material_name: str) -> Dict[str, Any]:
    solution = finite_element_solution(
        spans=request_data["spans"],
        span_E_gpa=request_data["span_E_gpa"],
        span_I_cm4=request_data["span_I_cm4"],
        beam_type=request_data["beam_type"],
        load_type=request_data["load_type"],
        load_spec=request_data,
        E=request_data["E"],
        I=request_data["I"],
        support_specs=request_data.get("supports"),
        query_points_m=request_data.get("query_points_m", []),
        beam_theory=request_data.get("beam_theory", "euler_bernoulli"),
        G=to_si(request_data.get("G_gpa", 1.0), "elastic_modulus", "GPa"),
        A=to_si(request_data.get("A_cm2", 120.0), "area", "cm2"),
        shear_correction_factor=request_data.get("shear_correction_factor", 5.0 / 6.0),
        solver_backend=request_data.get("solver_backend", "auto"),
        output_precision=request_data.get("output_precision"),
    )
    t_data, q_t_data = build_time_history(
        request_data["reference_load_kn_per_m"],
        request_data["freq"],
        request_data["duration"],
    )
    solution.update(
        {
            "t_data": [round(float(v), 3) for v in t_data],
            "q_t_data": [round(float(v), 3) for v in q_t_data],
            "request": request_data,
            "material_name": material_name,
        }
    )
    return build_beam_solution_response(solution)


def build_beam_solution(data: Dict[str, Any], material_name: str) -> Dict[str, Any]:
    request_data = normalize_beam_request(data)
    solution = _solve_beam_request(request_data, material_name)
    solution["controlValues"] = _summary(solution)
    solution["loadCaseResults"] = _solve_load_cases(request_data, material_name)
    solution["loadCombinationResults"] = _solve_load_combinations(request_data, solution["loadCaseResults"])
    solution["envelope"] = _build_envelope([solution, *solution["loadCaseResults"], *solution["loadCombinationResults"]])
    solution.setdefault("solution", {})
    solution["solution"]["loadCaseResults"] = solution["loadCaseResults"]
    solution["solution"]["loadCombinationResults"] = solution["loadCombinationResults"]
    solution["solution"]["envelope"] = solution["envelope"]
    return solution


def _request_for_case(base: Dict[str, Any], case: Dict[str, Any]) -> Dict[str, Any]:
    keys = [
        "load_type",
        "load_type_label",
        "q_kn",
        "uniform_q_npm",
        "uniform_start_ratio",
        "uniform_end_ratio",
        "uniform_start",
        "uniform_end",
        "point_load_kn",
        "point_load_n",
        "point_position_ratio",
        "point_position",
        "distributed_start_ratio",
        "distributed_end_ratio",
        "distributed_start",
        "distributed_end",
        "distributed_start_kn",
        "distributed_end_kn",
        "distributed_start_npm",
        "distributed_end_npm",
    ]
    request = dict(base)
    for key in keys:
        if key in case:
            request[key] = case[key]
    if "load_type" in case:
        request["loads"] = [
            {
                "type": case["load_type"],
                "q_kn": case.get("q_kn", request["q_kn"]),
                "uniform_q_npm": case.get("uniform_q_npm", request["uniform_q_npm"]),
                "uniform_start_ratio": case.get("uniform_start_ratio", request["uniform_start_ratio"]),
                "uniform_end_ratio": case.get("uniform_end_ratio", request["uniform_end_ratio"]),
                "uniform_start": case.get("uniform_start", request["uniform_start"]),
                "uniform_end": case.get("uniform_end", request["uniform_end"]),
                "point_load_kn": case.get("point_load_kn", request["point_load_kn"]),
                "point_load_n": case.get("point_load_n", request["point_load_n"]),
                "point_position_ratio": case.get("point_position_ratio", request["point_position_ratio"]),
                "point_position": case.get("point_position", request["point_position"]),
                "distributed_start_ratio": case.get("distributed_start_ratio", request["distributed_start_ratio"]),
                "distributed_end_ratio": case.get("distributed_end_ratio", request["distributed_end_ratio"]),
                "distributed_start": case.get("distributed_start", request["distributed_start"]),
                "distributed_end": case.get("distributed_end", request["distributed_end"]),
                "distributed_start_kn": case.get("distributed_start_kn", request["distributed_start_kn"]),
                "distributed_end_kn": case.get("distributed_end_kn", request["distributed_end_kn"]),
                "distributed_start_npm": case.get("distributed_start_npm", request["distributed_start_npm"]),
                "distributed_end_npm": case.get("distributed_end_npm", request["distributed_end_npm"]),
            }
        ]
    request["reference_load_kn_per_m"] = _reference_load(request)
    return request


def _reference_load(request: Dict[str, Any]) -> float:
    if request["load_type"] == "uniform":
        region_ratio = max(1e-9, (float(request["uniform_end"]) - float(request["uniform_start"])) / max(float(request["total_length"]), 1e-9))
        return float(request["q_kn"]) * region_ratio
    if request["load_type"] == "point":
        return float(request["point_load_kn"]) / max(float(request["total_length"]), 1e-9)
    region_ratio = max(1e-9, (float(request["distributed_end"]) - float(request["distributed_start"])) / max(float(request["total_length"]), 1e-9))
    return ((float(request["distributed_start_kn"]) + float(request["distributed_end_kn"])) / 2.0) * region_ratio


def _solve_load_cases(request_data: Dict[str, Any], material_name: str) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for case in request_data.get("loadCases", []):
        case_solution = _solve_beam_request(_request_for_case(request_data, case), material_name)
        results.append(
            {
                "id": case["id"],
                "title": case.get("title", case["id"]),
                "summary": _summary(case_solution),
                "x_data": case_solution["x_data"],
                "v_data": case_solution["v_data"],
                "element_end_moments": case_solution["element_end_moments"],
                "element_end_shears": case_solution["element_end_shears"],
                "reactions": case_solution["reactions"],
                "queryResults": case_solution.get("queryResults", []),
            }
        )
    return results


def _solve_load_combinations(request_data: Dict[str, Any], case_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    case_by_id = {case["id"]: case for case in case_results}
    results: List[Dict[str, Any]] = []
    for combination in request_data.get("loadCombinations", []):
        combined = _combine_case_results(case_by_id, combination)
        results.append(combined)
    return results


def _combine_case_results(case_by_id: Dict[str, Dict[str, Any]], combination: Dict[str, Any]) -> Dict[str, Any]:
    factors = combination.get("factors", {})
    cases = [case_by_id[case_id] for case_id in factors]
    x_grid = sorted({float(x) for case in cases for x in case.get("x_data", [])})
    def combine_series(key: str) -> List[float]:
        values = np.zeros(len(x_grid), dtype=float)
        for case_id, factor in factors.items():
            case = case_by_id[case_id]
            values += float(factor) * np.interp(x_grid, case.get("x_data", x_grid), case.get(key, [0.0] * len(x_grid)))
        return [round(float(value), 6) for value in values]

    v_data = combine_series("v_data")
    moments = combine_series("element_end_moments")
    shears = combine_series("element_end_shears")
    max_deflection = max((abs(value) * 1000.0 for value in v_data), default=0.0)
    max_moment = max((abs(value) / 1000.0 for value in moments), default=0.0)
    max_positive_moment = max((value / 1000.0 for value in moments), default=0.0)
    max_negative_moment = min((value / 1000.0 for value in moments), default=0.0)
    max_shear = max((abs(value) / 1000.0 for value in shears), default=0.0)
    result = {
        "id": combination["id"],
        "title": combination.get("title", combination["id"]),
        "factors": factors,
        "summary": {
            "maxDeflectionMm": round(max_deflection, 4),
            "maxMomentKnM": round(max_moment, 4),
            "maxPositiveMomentKnM": round(max_positive_moment, 4),
            "maxNegativeMomentKnM": round(max_negative_moment, 4),
            "maxShearKn": round(max_shear, 4),
        },
        "x_data": [round(float(x), 6) for x in x_grid],
        "v_data": v_data,
        "element_end_moments": moments,
        "element_end_shears": shears,
        "reactions": [],
        "queryResults": [],
    }
    if combination.get("tags"):
        result["tags"] = combination["tags"]
    return result


def _summary(solution: Dict[str, Any]) -> Dict[str, Any]:
    moments = solution.get("element_end_moments", [])
    shears = solution.get("element_end_shears", [])
    return {
        "maxDeflectionMm": solution.get("max_deflection_mm", 0.0),
        "maxDeflectionPositionM": solution.get("max_deflection_position_m", 0.0),
        "maxMomentKnM": round(max((abs(value) / 1000.0 for value in moments), default=0.0), 4),
        "maxPositiveMomentKnM": round(max((value / 1000.0 for value in moments), default=0.0), 4),
        "maxNegativeMomentKnM": round(min((value / 1000.0 for value in moments), default=0.0), 4),
        "maxShearKn": round(max((abs(value) / 1000.0 for value in shears), default=0.0), 4),
        "status": solution.get("status", "需校核"),
    }


def _build_envelope(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    summaries = [result.get("summary", _summary(result)) for result in results]
    return {
        "maxDeflectionMm": max((summary.get("maxDeflectionMm", summary.get("max_deflection_mm", 0.0)) for summary in summaries), default=0.0),
        "maxMomentKnM": max((summary.get("maxMomentKnM", 0.0) for summary in summaries), default=0.0),
        "maxPositiveMomentKnM": max((summary.get("maxPositiveMomentKnM", 0.0) for summary in summaries), default=0.0),
        "maxNegativeMomentKnM": min((summary.get("maxNegativeMomentKnM", 0.0) for summary in summaries), default=0.0),
        "maxShearKn": max((summary.get("maxShearKn", 0.0) for summary in summaries), default=0.0),
        "sourceCount": len(results),
    }
