from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict, List

from backend.application.frame_stability import build_frame_stability_results
from backend.normalizers.frame.request_normalizer import normalize_frame_request
from backend.presenters.frame.assembler import build_frame_solution_response
from backend.solver.frame.assembler import assemble_global_system
from backend.solver.frame.recover import recover_member_diagrams, recover_member_results, recover_node_results
from backend.solver.frame.solver import solve_frame_system


def build_frame_solution(data: Dict[str, Any], material_name: str) -> Dict[str, Any]:
    request = normalize_frame_request(data)
    structure = request["structure"]
    primary_structure = _primary_structure(structure)
    primary_reference = _primary_reference(structure)
    primary_request = {**request, "structure": primary_structure, "stabilityReference": primary_reference}

    solution = _solve_frame_structure(primary_request, primary_structure)
    solution["structure"] = structure
    solution["payload"]["structure"] = structure
    solution["payload"]["analysisOptions"] = request.get("analysisOptions", {})

    solution["loadCaseResults"] = _solve_load_cases(request, structure)
    solution["loadCombinationResults"] = _solve_load_combinations(request, structure)
    solution = _apply_stability_layers(primary_request, primary_structure, structure, solution)
    if isinstance(solution.get("secondOrder"), dict):
        solution["secondOrder"]["referenceSource"] = primary_reference
        solution["secondOrder"]["controlSource"] = primary_reference
    if isinstance(solution.get("buckling"), dict):
        solution["buckling"]["referenceSource"] = primary_reference
        solution["buckling"]["controlSource"] = primary_reference
    solution["structure"] = structure
    solution["payload"]["analysisOptions"] = request.get("analysisOptions", {})
    solution["payload"]["structure"] = structure
    return solution


def _solve_frame_structure(request: Dict[str, Any], structure: Dict[str, Any]) -> Dict[str, Any]:
    assembly = assemble_global_system(structure, solver_backend=request.get("solver_backend", "auto"))
    solved = solve_frame_system(structure, assembly)
    node_results = recover_node_results(
        structure["nodes"],
        solved["displacements"],
        solved["reactions"],
        assembly.get("spring_records", []),
    )
    member_results = recover_member_results(assembly["member_records"], solved["displacements"])
    member_diagrams = recover_member_diagrams(assembly["member_records"], solved["displacements"])
    return build_frame_solution_response(
        request=request,
        structure=structure,
        node_results=node_results,
        member_results=member_results,
        member_diagrams=member_diagrams,
        member_records=assembly["member_records"],
        diagnostics=solved["diagnostics"],
    )


def _apply_stability_layers(
    request: Dict[str, Any],
    stability_structure: Dict[str, Any],
    full_structure: Dict[str, Any],
    solution: Dict[str, Any],
) -> Dict[str, Any]:
    stability = build_frame_stability_results(
        request,
        stability_structure,
        solution,
        analysis_options=request.get("analysisOptions", {}),
    )
    second_order = stability["secondOrder"]
    buckling = stability["buckling"]

    attached = deepcopy(solution)
    attached["secondOrder"] = second_order
    attached["buckling"] = buckling
    attached["summary"]["secondOrderAmplificationFactor"] = second_order.get("amplificationFactor", 1.0)

    if "payload" in attached and isinstance(attached["payload"], dict):
        attached["payload"]["analysisOptions"] = stability.get("analysisOptions", request.get("analysisOptions", {}))
        attached["payload"]["structure"] = full_structure

    if second_order.get("enabled") and second_order.get("converged") and isinstance(second_order.get("final"), dict):
        final_solution = deepcopy(second_order["final"])
        final_solution["secondOrder"] = second_order
        final_solution["buckling"] = buckling
        final_solution["loadCaseResults"] = attached.get("loadCaseResults", [])
        final_solution["loadCombinationResults"] = attached.get("loadCombinationResults", [])
        final_solution["structure"] = full_structure
        if "payload" in final_solution and isinstance(final_solution["payload"], dict):
            final_solution["payload"]["analysisOptions"] = stability.get("analysisOptions", request.get("analysisOptions", {}))
            final_solution["payload"]["structure"] = full_structure
        if "summary" in final_solution and isinstance(final_solution["summary"], dict):
            final_solution["summary"]["secondOrderAmplificationFactor"] = second_order.get("amplificationFactor", 1.0)
        return final_solution

    return attached


def _primary_structure(structure: Dict[str, Any]) -> Dict[str, Any]:
    combinations = structure.get("loadCombinations") or []
    load_cases = structure.get("loadCases") or []
    if structure.get("loads"):
        return structure
    if combinations and load_cases:
        return {**structure, "loads": _loads_for_combination(combinations[0], load_cases)}
    if load_cases:
        return {**structure, "loads": deepcopy(load_cases[0].get("loads", []))}
    return structure


def _primary_reference(structure: Dict[str, Any]) -> Dict[str, str]:
    combinations = structure.get("loadCombinations") or []
    load_cases = structure.get("loadCases") or []
    if structure.get("loads"):
        return {"source": "primary", "id": "__primary__", "title": "主结果"}
    if combinations and load_cases:
        combination = combinations[0]
        return {
            "source": "combination",
            "id": str(combination.get("id", "__primary__")),
            "title": str(combination.get("title") or combination.get("id") or "主结果"),
        }
    if load_cases:
        load_case = load_cases[0]
        return {
            "source": "case",
            "id": str(load_case.get("id", "__primary__")),
            "title": str(load_case.get("title") or load_case.get("id") or "主结果"),
        }
    return {"source": "primary", "id": "__primary__", "title": "主结果"}


def _solve_load_cases(request: Dict[str, Any], structure: Dict[str, Any]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for load_case in structure.get("loadCases", []):
        case_structure = {**structure, "loads": load_case.get("loads", [])}
        case_reference = {"source": "case", "id": load_case["id"], "title": load_case.get("title", load_case["id"])}
        case_request = {**request, "stabilityReference": case_reference}
        case_solution = _solve_frame_structure(case_request, case_structure)
        case_solution = _apply_stability_layers(case_request, case_structure, case_structure, case_solution)
        if isinstance(case_solution.get("secondOrder"), dict):
            case_solution["secondOrder"]["referenceSource"] = case_reference
            case_solution["secondOrder"]["controlSource"] = case_reference
        if isinstance(case_solution.get("buckling"), dict):
            case_solution["buckling"]["referenceSource"] = case_reference
            case_solution["buckling"]["controlSource"] = case_reference
        results.append(
            {
                "id": load_case["id"],
                "title": load_case.get("title", load_case["id"]),
                "summary": case_solution["summary"],
                "diagnostics": case_solution["diagnostics"],
                "nodeResults": case_solution["nodeResults"],
                "memberResults": case_solution["memberResults"],
                "memberDiagrams": case_solution["memberDiagrams"],
                "secondOrder": case_solution.get("secondOrder", {}),
                "buckling": case_solution.get("buckling", {}),
                "preview": case_solution.get("preview", {}),
                "diagram": case_solution.get("diagram", {}),
                "inputSnapshot": {
                    "source": case_reference,
                    "structure": deepcopy(case_structure),
                    "payload": deepcopy(case_solution.get("payload", {})),
                    "components": [
                        {
                            "id": load_case["id"],
                            "title": load_case.get("title", load_case["id"]),
                            "factor": 1.0,
                            "loads": deepcopy(load_case.get("loads", [])),
                        }
                    ],
                },
            }
        )
    return results


def _solve_load_combinations(request: Dict[str, Any], structure: Dict[str, Any]) -> List[Dict[str, Any]]:
    load_cases = structure.get("loadCases", [])
    results: List[Dict[str, Any]] = []
    for combination in structure.get("loadCombinations", []):
        combination_structure = {**structure, "loads": _loads_for_combination(combination, load_cases)}
        combination_reference = {"source": "combination", "id": combination["id"], "title": combination.get("title", combination["id"])}
        combination_request = {**request, "stabilityReference": combination_reference}
        combination_solution = _solve_frame_structure(combination_request, combination_structure)
        combination_solution = _apply_stability_layers(
            combination_request,
            combination_structure,
            combination_structure,
            combination_solution,
        )
        if isinstance(combination_solution.get("secondOrder"), dict):
            combination_solution["secondOrder"]["referenceSource"] = combination_reference
            combination_solution["secondOrder"]["controlSource"] = combination_reference
        if isinstance(combination_solution.get("buckling"), dict):
            combination_solution["buckling"]["referenceSource"] = combination_reference
            combination_solution["buckling"]["controlSource"] = combination_reference
        result = {
            "id": combination["id"],
            "title": combination.get("title", combination["id"]),
            "factors": combination.get("factors", {}),
            "summary": combination_solution["summary"],
            "diagnostics": combination_solution["diagnostics"],
            "nodeResults": combination_solution["nodeResults"],
            "memberResults": combination_solution["memberResults"],
            "memberDiagrams": combination_solution["memberDiagrams"],
            "secondOrder": combination_solution.get("secondOrder", {}),
            "buckling": combination_solution.get("buckling", {}),
            "preview": combination_solution.get("preview", {}),
            "diagram": combination_solution.get("diagram", {}),
            "inputSnapshot": {
                "source": combination_reference,
                "structure": deepcopy(combination_structure),
                "payload": deepcopy(combination_solution.get("payload", {})),
                "factors": deepcopy(combination.get("factors", {})),
                "components": [
                    {
                        "id": load_case["id"],
                        "title": load_case.get("title", load_case["id"]),
                        "factor": float(combination.get("factors", {}).get(load_case["id"], 0.0)),
                        "loads": deepcopy(load_case.get("loads", [])),
                    }
                    for load_case in load_cases
                    if load_case["id"] in combination.get("factors", {})
                ],
            },
        }
        if combination.get("tags"):
            result["tags"] = combination["tags"]
        results.append(result)
    return results


def _loads_for_combination(combination: Dict[str, Any], load_cases: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    cases_by_id = {load_case["id"]: load_case for load_case in load_cases}
    loads: List[Dict[str, Any]] = []
    for case_id, factor in combination.get("factors", {}).items():
        load_case = cases_by_id.get(case_id)
        if not load_case:
            continue
        for load in load_case.get("loads", []):
            loads.append(_scale_load(load, float(factor)))
    return loads


def _scale_load(load: Dict[str, Any], factor: float) -> Dict[str, Any]:
    scaled = dict(load)
    if load["type"] == "nodal":
        for key in ("fxKn", "fyKn", "mzKnM"):
            if key in scaled:
                scaled[key] = float(scaled[key]) * factor
        return scaled
    if load["type"] == "member_point":
        if "forceKn" in scaled:
            scaled["forceKn"] = float(scaled["forceKn"]) * factor
        return scaled
    if load["type"] == "temperature":
        if "deltaTempC" in scaled:
            scaled["deltaTempC"] = float(scaled["deltaTempC"]) * factor
        return scaled
    for key in ("wyKnPerM", "qStartKnPerM", "qEndKnPerM"):
        if key in scaled:
            scaled[key] = float(scaled[key]) * factor
    return scaled
