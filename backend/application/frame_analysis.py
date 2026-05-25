from __future__ import annotations

import math
from typing import Any, Dict, List

from backend.normalizers.frame.request_normalizer import normalize_frame_request
from backend.presenters.frame.assembler import build_frame_solution_response
from backend.solver.frame.assembler import assemble_global_system
from backend.solver.frame.recover import recover_member_diagrams, recover_member_results, recover_node_results
from backend.solver.frame.solver import solve_frame_system


def build_frame_solution(data: Dict[str, Any], material_name: str) -> Dict[str, Any]:
    request = normalize_frame_request(data)
    structure = request["structure"]
    primary_structure = _primary_structure(structure)
    primary_request = {**request, "structure": primary_structure}
    solution = _solve_frame_structure(primary_request, primary_structure)
    solution["structure"] = structure
    solution["payload"]["structure"] = structure
    solution["loadCaseResults"] = _solve_load_cases(request, structure)
    solution["loadCombinationResults"] = _solve_load_combinations(request, structure)
    stability = _frame_stability_summary(solution, request.get("analysisOptions", {}))
    solution["secondOrder"] = stability["secondOrder"]
    solution["buckling"] = stability["buckling"]
    solution["summary"]["secondOrderAmplificationFactor"] = stability["secondOrder"]["amplificationFactor"]
    solution["payload"]["analysisOptions"] = request.get("analysisOptions", {})
    return solution


def _solve_frame_structure(request: Dict[str, Any], structure: Dict[str, Any]) -> Dict[str, Any]:
    assembly = assemble_global_system(structure)
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


def _frame_stability_summary(solution: Dict[str, Any], options: Dict[str, Any]) -> Dict[str, Any]:
    members = {member["id"]: member for member in solution["structure"].get("members", [])}
    compression_ratios: List[Dict[str, Any]] = []
    for result in solution.get("memberResults", []):
        axial_kn = min(float(result.get("axialStartKn", 0.0)), float(result.get("axialEndKn", 0.0)))
        if axial_kn >= 0:
            continue
        member = members.get(result["memberId"], {})
        length = max(float(result.get("lengthM", 0.0)), 1e-9)
        e = float(member.get("E_GPa", 210.0)) * 1e9
        i = float(member.get("I_cm4", 8000.0)) * 1e-8
        pcr_kn = math.pi**2 * e * i / (length**2) / 1000.0
        compression_kn = abs(axial_kn)
        if pcr_kn <= 0 or compression_kn <= 0:
            continue
        compression_ratios.append(
            {
                "memberId": result["memberId"],
                "compressionKn": round(compression_kn, 4),
                "eulerCriticalLoadKn": round(pcr_kn, 4),
                "criticalLoadFactor": round(pcr_kn / compression_kn, 4),
                "utilizationRatio": round(compression_kn / pcr_kn, 6),
            }
        )

    max_utilization = max((item["utilizationRatio"] for item in compression_ratios), default=0.0)
    min_factor = min((item["criticalLoadFactor"] for item in compression_ratios), default=None)
    if max_utilization >= 1.0:
        amplification = 10.0
        risk = "高风险"
    elif max_utilization > 0:
        amplification = min(10.0, 1.0 / max(1e-9, 1.0 - max_utilization))
        risk = "需复核" if amplification >= 1.2 else "低风险"
    else:
        amplification = 1.0
        risk = "无轴压控制构件"

    enabled_pdelta = bool(options.get("pDelta", options.get("p_delta", False)))
    enabled_buckling = bool(options.get("buckling", False))
    second_order = {
        "enabled": enabled_pdelta,
        "method": "基于构件 Euler 临界力的 P-Delta 初步放大估算",
        "amplificationFactor": round(amplification if enabled_pdelta else 1.0, 4),
        "maxHorizontalDisplacementMm": round(max((abs(item.get("uxMm", 0.0)) for item in solution.get("nodeResults", [])), default=0.0), 4),
        "riskLevel": risk if enabled_pdelta else "未启用",
        "limitations": "该结果为方案阶段初步估算，不替代规范二阶分析或稳定验算。",
    }
    buckling = {
        "enabled": enabled_buckling,
        "method": "构件 Euler 临界力初步筛查",
        "criticalLoadFactor": round(float(min_factor), 4) if min_factor is not None else None,
        "controllingMembers": sorted(compression_ratios, key=lambda item: item["criticalLoadFactor"])[:3],
        "riskLevel": risk if enabled_buckling else "未启用",
        "limitations": "未考虑构件计算长度系数、节点侧移约束和整体屈曲模态，仅作初筛。",
    }
    return {"secondOrder": second_order, "buckling": buckling}


def _primary_structure(structure: Dict[str, Any]) -> Dict[str, Any]:
    combinations = structure.get("loadCombinations") or []
    load_cases = structure.get("loadCases") or []
    if structure.get("loads") or not combinations or not load_cases:
        return structure
    combined_loads = _loads_for_combination(combinations[0], load_cases)
    return {**structure, "loads": combined_loads}


def _solve_load_cases(request: Dict[str, Any], structure: Dict[str, Any]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    for load_case in structure.get("loadCases", []):
        case_structure = {**structure, "loads": load_case.get("loads", [])}
        case_solution = _solve_frame_structure(request, case_structure)
        results.append(
            {
                "id": load_case["id"],
                "title": load_case.get("title", load_case["id"]),
                "summary": case_solution["summary"],
                "diagnostics": case_solution["diagnostics"],
                "nodeResults": case_solution["nodeResults"],
                "memberResults": case_solution["memberResults"],
                "memberDiagrams": case_solution["memberDiagrams"],
            }
        )
    return results


def _solve_load_combinations(request: Dict[str, Any], structure: Dict[str, Any]) -> List[Dict[str, Any]]:
    load_cases = structure.get("loadCases", [])
    results: List[Dict[str, Any]] = []
    for combination in structure.get("loadCombinations", []):
        combination_structure = {**structure, "loads": _loads_for_combination(combination, load_cases)}
        combination_solution = _solve_frame_structure(request, combination_structure)
        result = {
            "id": combination["id"],
            "title": combination.get("title", combination["id"]),
            "factors": combination.get("factors", {}),
            "summary": combination_solution["summary"],
            "diagnostics": combination_solution["diagnostics"],
            "nodeResults": combination_solution["nodeResults"],
            "memberResults": combination_solution["memberResults"],
            "memberDiagrams": combination_solution["memberDiagrams"],
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
    for key in ("wyKnPerM", "qStartKnPerM", "qEndKnPerM"):
        if key in scaled:
            scaled[key] = float(scaled[key]) * factor
    return scaled
