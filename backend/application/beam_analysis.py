from __future__ import annotations

from copy import deepcopy
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
        source = {"source": "case", "id": case["id"], "title": case.get("title", case["id"])}
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
                "beam": case_solution.get("beam", {}),
                "diagram": case_solution.get("diagram", {}),
                "inputSnapshot": {
                    "source": source,
                    "request": deepcopy(case_solution["request"]),
                    "components": [
                        {
                            "id": case["id"],
                            "title": case.get("title", case["id"]),
                            "factor": 1.0,
                            "request": deepcopy(case_solution["request"]),
                        }
                    ],
                },
            }
        )
    return results


def _solve_load_combinations(request_data: Dict[str, Any], case_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    case_by_id = {case["id"]: case for case in case_results}
    results: List[Dict[str, Any]] = []
    for combination in request_data.get("loadCombinations", []):
        combined = _combine_case_results(request_data, case_by_id, combination)
        results.append(combined)
    return results


def _combine_case_results(
    base_request: Dict[str, Any],
    case_by_id: Dict[str, Dict[str, Any]],
    combination: Dict[str, Any],
) -> Dict[str, Any]:
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
    max_deflection_index = max(range(len(v_data)), key=lambda index: abs(float(v_data[index]))) if v_data else 0
    max_deflection_position = float(x_grid[max_deflection_index]) if x_grid and v_data else 0.0
    allowable_mm = float(base_request["total_length"]) * 1000.0 / 250.0
    status = "合格" if max_deflection <= allowable_mm else "需校核"
    max_moment = max((abs(value) / 1000.0 for value in moments), default=0.0)
    max_positive_moment = max((value / 1000.0 for value in moments), default=0.0)
    max_negative_moment = min((value / 1000.0 for value in moments), default=0.0)
    max_shear = max((abs(value) / 1000.0 for value in shears), default=0.0)
    combined_reactions = _combine_reactions(case_by_id, factors)
    combination_request = _combination_request(base_request, combination, case_by_id)
    combination_beam = _combination_beam(cases, factors, x_grid, v_data, combined_reactions)
    combination_diagram = _combination_diagram(cases, factors, x_grid, v_data, combined_reactions)
    result = {
        "id": combination["id"],
        "title": combination.get("title", combination["id"]),
        "factors": factors,
        "summary": {
            "maxDeflectionMm": round(max_deflection, 4),
            "maxDeflectionPositionM": round(max_deflection_position, 6),
            "maxMomentKnM": round(max_moment, 4),
            "maxPositiveMomentKnM": round(max_positive_moment, 4),
            "maxNegativeMomentKnM": round(max_negative_moment, 4),
            "maxShearKn": round(max_shear, 4),
            "status": status,
            "statusCode": "PASS" if status == "合格" else "REVIEW",
            "allowableMm": round(allowable_mm, 4),
        },
        "x_data": [round(float(x), 6) for x in x_grid],
        "v_data": v_data,
        "element_end_moments": moments,
        "element_end_shears": shears,
        "reactions": combined_reactions,
        "queryResults": [],
        "beam": combination_beam,
        "diagram": combination_diagram,
        "inputSnapshot": {
            "source": {
                "source": "combination",
                "id": combination["id"],
                "title": combination.get("title", combination["id"]),
            },
            "request": combination_request,
            "factors": deepcopy(factors),
            "components": [
                {
                    "id": case_id,
                    "title": case_by_id[case_id].get("title", case_id),
                    "factor": float(factor),
                    "request": deepcopy(case_by_id[case_id]["inputSnapshot"]["request"]),
                }
                for case_id, factor in factors.items()
            ],
        },
    }
    if combination.get("tags"):
        result["tags"] = combination["tags"]
    return result


def _combination_request(
    base_request: Dict[str, Any],
    combination: Dict[str, Any],
    case_by_id: Dict[str, Dict[str, Any]],
) -> Dict[str, Any]:
    factors = combination.get("factors", {})
    request = deepcopy(base_request)
    request["load_type"] = "combination"
    request["load_type_label"] = "荷载组合"
    request["selected_load_combination"] = {
        "id": combination["id"],
        "title": combination.get("title", combination["id"]),
        "factors": deepcopy(factors),
    }
    request["resultant_load_kn"] = round(
        sum(
            float(factor) * _request_total_vertical_load_kn(case_by_id[case_id]["inputSnapshot"]["request"])
            for case_id, factor in factors.items()
        ),
        9,
    )
    return request


def _request_total_vertical_load_kn(request: Dict[str, Any]) -> float:
    if request.get("load_type") == "point":
        return float(request.get("point_load_kn", 0.0))
    if request.get("load_type") in {"linear", "distributed"}:
        length = float(request.get("distributed_end", 0.0)) - float(request.get("distributed_start", 0.0))
        return 0.5 * (
            float(request.get("distributed_start_kn", 0.0))
            + float(request.get("distributed_end_kn", 0.0))
        ) * max(length, 0.0)
    length = float(request.get("uniform_end", request.get("total_length", 0.0))) - float(request.get("uniform_start", 0.0))
    return float(request.get("q_kn", 0.0)) * max(length, 0.0)


def _scale_numeric_fields(item: Dict[str, Any], factor: float, keys: tuple[str, ...]) -> Dict[str, Any]:
    scaled = deepcopy(item)
    for key in keys:
        if key in scaled:
            scaled[key] = float(scaled[key]) * factor
    return scaled


def _combination_beam(
    cases: List[Dict[str, Any]],
    factors: Dict[str, Any],
    x_grid: List[float],
    v_data: List[float],
    reactions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    beam = deepcopy(cases[0].get("beam", {})) if cases else {}
    beam["loadType"] = "combination"
    beam["loadTypeLabel"] = "荷载组合"
    beam["loads"] = [
        _scale_numeric_fields(
            load,
            float(factors[case["id"]]),
            ("intensityKnPerM", "intensityKn"),
        )
        for case in cases
        for load in case.get("beam", {}).get("loads", [])
    ]
    beam["curve"] = [
        {"x": float(x), "v": float(v), "vMm": float(v) * 1000.0}
        for x, v in zip(x_grid, v_data)
    ]
    if v_data:
        index = max(range(len(v_data)), key=lambda idx: abs(float(v_data[idx])))
        beam["maxDeflection"] = {
            "valueM": abs(float(v_data[index])),
            "valueMm": abs(float(v_data[index])) * 1000.0,
            "xM": float(x_grid[index]),
            "spanIndex": _span_index(beam.get("spans", []), float(x_grid[index])),
        }
    beam["reactions"] = [
        {
            "dof": index,
            "supportId": str(item.get("supportId") or f"S{index + 1}"),
            "valueN": float(item.get("vertical", 0.0)) * 1000.0,
            "valueKn": float(item.get("vertical", 0.0)),
        }
        for index, item in enumerate(reactions)
    ]
    return beam


def _combination_diagram(
    cases: List[Dict[str, Any]],
    factors: Dict[str, Any],
    x_grid: List[float],
    v_data: List[float],
    reactions: List[Dict[str, Any]],
) -> Dict[str, Any]:
    diagram = deepcopy(cases[0].get("diagram", {})) if cases else {}
    diagram["loadType"] = "combination"
    diagram["loadTypeLabel"] = "荷载组合"
    diagram["loadItems"] = [
        _scale_numeric_fields(
            load,
            float(factors[case["id"]]),
            ("magnitudeKnPerM", "magnitudeKn", "startMagnitudeKnPerM", "endMagnitudeKnPerM"),
        )
        for case in cases
        for load in case.get("diagram", {}).get("loadItems", [])
    ]
    diagram["samplePoints"] = [round(float(value), 6) for value in x_grid]
    diagram["deflection"] = v_data
    diagram["reactions"] = reactions
    return diagram


def _span_index(spans: List[float], position: float) -> int:
    boundary = 0.0
    for index, span in enumerate(spans):
        boundary += float(span)
        if position <= boundary + 1e-9:
            return index
    return max(0, len(spans) - 1)


def _combine_reactions(case_by_id: Dict[str, Dict[str, Any]], factors: Dict[str, Any]) -> List[Dict[str, Any]]:
    count = max((len(case_by_id[case_id].get("reactions", [])) for case_id in factors), default=0)
    combined: List[Dict[str, Any]] = []
    for index in range(count):
        item: Dict[str, Any] = {}
        numeric: Dict[str, float] = {}
        for case_id, factor in factors.items():
            source_items = case_by_id[case_id].get("reactions", [])
            if index >= len(source_items):
                continue
            source = source_items[index]
            for key, value in source.items():
                if isinstance(value, (int, float)):
                    numeric[key] = numeric.get(key, 0.0) + float(factor) * float(value)
                elif key not in item:
                    item[key] = deepcopy(value)
        combined.append({**item, **{key: round(value, 9) for key, value in numeric.items()}})
    return combined


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
