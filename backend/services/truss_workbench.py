from __future__ import annotations

import math
from typing import Any, Dict, List

from backend.exporters.truss.docx_exporter import export_docx
from backend.exporters.truss.xlsx_exporter import build_summary_tables, export_xlsx
from backend.normalizers.truss.request_normalizer import normalize_truss_request
from backend.presenters.truss.assembler import build_truss_solution_response
from backend.solver.truss.assembler import assemble_system
from backend.solver.truss.recover import recover_member_results, recover_node_results
from backend.solver.truss.solver import solve_truss_system


def _solve_truss_request(request: Dict[str, Any]) -> Dict[str, Any]:
    assembly = assemble_system(request)
    solved = solve_truss_system(assembly)
    recovered_nodes = recover_node_results(assembly["nodes"], solved["displacements"], solved["reactions"])
    recovered_members = recover_member_results(
        assembly["members"],
        assembly["member_geometries"],
        assembly["node_index"],
        solved["displacements"],
    )
    return build_truss_solution_response(
        request=request,
        node_results=recovered_nodes["node_results"],
        member_results=recovered_members["member_results"],
        displacement_magnitudes=recovered_nodes["displacement_magnitudes"],
        axial_forces=recovered_members["axial_forces"],
        displacements=solved["displacements"],
        diagnostics=solved.get("diagnostics", {}),
    )


def build_solution(data: Dict[str, Any], material_name: str) -> Dict[str, Any]:
    request = normalize_truss_request(data)
    request["material_name"] = material_name
    solution = _solve_truss_request(dict(request))
    solution["loadCaseResults"] = _solve_load_cases(request)
    solution["loadCombinationResults"] = _solve_load_combinations(request, solution["loadCaseResults"])
    solution["envelope"] = _build_envelope([solution, *solution["loadCaseResults"], *solution["loadCombinationResults"]])
    solution["solution"]["loadCaseResults"] = solution["loadCaseResults"]
    solution["solution"]["loadCombinationResults"] = solution["loadCombinationResults"]
    solution["solution"]["envelope"] = solution["envelope"]
    return solution


def _solve_load_cases(request: Dict[str, Any]) -> List[Dict[str, Any]]:
    results: List[Dict[str, Any]] = []
    structure = request["structure"]
    for load_case in structure.get("loadCases", []):
        case_request = {**request, "structure": {**structure, "loads": load_case.get("loads", [])}}
        case_solution = _solve_truss_request(case_request)
        results.append(
            {
                "id": load_case["id"],
                "title": load_case.get("title", load_case["id"]),
                "summary": case_solution["summary"],
                "nodeResults": case_solution["nodeResults"],
                "memberResults": case_solution["memberResults"],
            }
        )
    return results


def _solve_load_combinations(request: Dict[str, Any], case_results: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    case_by_id = {case["id"]: case for case in case_results}
    results: List[Dict[str, Any]] = []
    for combination in request["structure"].get("loadCombinations", []):
        factors = combination.get("factors", {})
        node_ids = [node["id"] for node in request["structure"]["nodes"]]
        member_ids = [member["id"] for member in request["structure"]["members"]]
        node_results = []
        for node_id in node_ids:
            ux = uy = rx = ry = 0.0
            x = y = 0.0
            support_type = "free"
            for case_id, factor in factors.items():
                node = next(item for item in case_by_id[case_id]["nodeResults"] if item["nodeId"] == node_id)
                ux += factor * node["uxMm"]
                uy += factor * node["uyMm"]
                rx += factor * node["rxKn"]
                ry += factor * node["ryKn"]
                x = node["x"]
                y = node["y"]
                support_type = node["supportType"]
            node_results.append(
                {
                    "nodeId": node_id,
                    "x": x,
                    "y": y,
                    "uxMm": ux,
                    "uyMm": uy,
                    "displacementMm": math.hypot(ux, uy),
                    "rxKn": rx,
                    "ryKn": ry,
                    "supportType": support_type,
                }
            )
        member_results = []
        for member_id in member_ids:
            axial = 0.0
            template = None
            for case_id, factor in factors.items():
                member = next(item for item in case_by_id[case_id]["memberResults"] if item["memberId"] == member_id)
                axial += factor * member["axialForceKn"]
                template = member
            assert template is not None
            state = "near_zero" if abs(axial) < 1e-9 else ("tension" if axial > 0 else "compression")
            member_results.append({**template, "axialForceKn": axial, "forceState": state})
        max_node = max(node_results, key=lambda item: item["displacementMm"], default={})
        max_member = max(member_results, key=lambda item: abs(item["axialForceKn"]), default={})
        result = {
            "id": combination["id"],
            "title": combination.get("title", combination["id"]),
            "factors": factors,
            "summary": {
                "maxDisplacementMm": round(float(max_node.get("displacementMm", 0.0)), 4),
                "maxDisplacementNodeId": max_node.get("nodeId", ""),
                "maxAxialForceKn": round(abs(float(max_member.get("axialForceKn", 0.0))), 4),
                "maxAxialForceMemberId": max_member.get("memberId", ""),
            },
            "nodeResults": node_results,
            "memberResults": member_results,
        }
        if combination.get("tags"):
            result["tags"] = combination["tags"]
        results.append(result)
    return results


def _build_envelope(results: List[Dict[str, Any]]) -> Dict[str, Any]:
    max_node_disp = 0.0
    max_axial = 0.0
    max_reaction = 0.0
    for result in results:
        for node in result.get("nodeResults", []):
            max_node_disp = max(max_node_disp, abs(float(node.get("displacementMm", 0.0))))
            max_reaction = max(max_reaction, abs(float(node.get("rxKn", 0.0))), abs(float(node.get("ryKn", 0.0))))
        for member in result.get("memberResults", []):
            max_axial = max(max_axial, abs(float(member.get("axialForceKn", 0.0))))
    return {
        "maxNodeDisplacementMm": round(max_node_disp, 4),
        "maxAxialForceKn": round(max_axial, 4),
        "maxReactionKn": round(max_reaction, 4),
        "sourceCount": len(results),
    }
