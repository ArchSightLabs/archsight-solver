from __future__ import annotations

from typing import Any, Dict, List, Sequence


def _round_list(values: Sequence[float], ndigits: int = 4) -> List[float]:
    return [round(float(v), ndigits) for v in values]


def build_frame_solution_response(
    request: Dict[str, Any],
    structure: Dict[str, Any],
    node_results: List[Dict[str, Any]],
    member_results: List[Dict[str, Any]],
    member_diagrams: List[Dict[str, Any]],
    member_records: List[Dict[str, Any]],
    diagnostics: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    max_displacement_mm = max((item["resultantMm"] for item in node_results), default=0.0)
    max_vertical_mm = max((abs(item["uyMm"]) for item in node_results), default=0.0)
    max_rotation_deg = max((abs(item["rotationDeg"]) for item in node_results), default=0.0)
    member_peak_results = _member_peak_results(member_results, member_diagrams)
    peak_internal_forces = _global_peak_internal_forces(member_peak_results)
    max_moment_knm = peak_internal_forces["maxAbsMomentKnM"]
    diagnostics = diagnostics or {}

    nodes = structure["nodes"]
    span = max((node["x"] for node in nodes), default=0.0) - min((node["x"] for node in nodes), default=0.0)
    height = max((node["y"] for node in nodes), default=0.0) - min((node["y"] for node in nodes), default=0.0)
    allowable_mm = max(span, height) * 1000.0 / 250.0
    status = "合格" if max_displacement_mm <= allowable_mm else "需校核"

    max_disp_node = max(node_results, key=lambda item: item["resultantMm"], default=None)
    deformation_scale = 0.0
    if max_displacement_mm > 1e-9:
        deformation_scale = 0.15 * max(span, height) / (max_displacement_mm / 1000.0)

    deformed_nodes: List[Dict[str, Any]] = []
    for item in node_results:
        deformed_nodes.append(
            {
                "nodeId": item["nodeId"],
                "x": item["x"] + (item["uxMm"] / 1000.0) * deformation_scale,
                "y": item["y"] + (item["uyMm"] / 1000.0) * deformation_scale,
            }
        )

    preview_members = []
    for record in member_records:
        preview_members.append(
            {
                "id": record["id"],
                "kind": record["kind"],
                "start": record["start"],
                "end": record["end"],
                "endReleases": record.get("endReleases", {}),
                "section": record.get("section", {}),
            }
        )

    preview_loads = []
    for load in structure.get("loads", []):
        if load["type"] == "distributed":
            q_start = float(load.get("qStartKnPerM", load.get("wyKnPerM", 0.0)))
            q_end = float(load.get("qEndKnPerM", load.get("wyKnPerM", q_start)))
            preview_loads.append(
                {
                    "type": "distributed",
                    "member": load["member"],
                    "wyKnPerM": q_start,
                    "qStartKnPerM": q_start,
                    "qEndKnPerM": q_end,
                    "direction": load.get("direction", "local_y"),
                    "startRatio": float(load.get("startRatio", 0.0)),
                    "endRatio": float(load.get("endRatio", 1.0)),
                }
            )
        elif load["type"] == "nodal":
            preview_loads.append(
                {
                    "type": "nodal",
                    "node": load["node"],
                    "fxKn": float(load.get("fxKn", 0.0)),
                    "fyKn": float(load.get("fyKn", 0.0)),
                    "mzKnM": float(load.get("mzKnM", 0.0)),
                }
            )
        elif load["type"] == "member_point":
            preview_loads.append(
                {
                    "type": "member_point",
                    "member": load["member"],
                    "direction": load.get("direction", "local_y"),
                    "forceKn": float(load.get("forceKn", 0.0)),
                    "positionRatio": float(load.get("positionRatio", 0.5)),
                }
            )

    node_ids = [node["id"] for node in nodes]
    member_ids = [member["id"] for member in structure["members"]]

    return {
        "analysisType": "frame",
        "projectName": request["project_name"],
        "materialId": request["material_id"],
        "structure": structure,
        "nodeResults": node_results,
        "memberResults": member_peak_results,
        "memberDiagrams": member_diagrams,
        "nodeIds": node_ids,
        "memberIds": member_ids,
        "ux_data": _round_list([item["uxMm"] for item in node_results], 6),
        "uy_data": _round_list([item["uyMm"] for item in node_results], 6),
        "rz_data": _round_list([item["rotationDeg"] for item in node_results], 6),
        "member_axial_data": _round_list([item["axialStartKn"] for item in member_results], 6),
        "member_shear_data": _round_list([item["shearStartKn"] for item in member_results], 6),
        "member_moment_data": _round_list([item["momentStartKnM"] for item in member_results], 6),
        "summary": {
            "allowableMm": round(allowable_mm, 4),
            "maxDisplacementMm": round(max_displacement_mm, 4),
            "maxVerticalMm": round(max_vertical_mm, 4),
            "maxRotationDeg": round(max_rotation_deg, 6),
            "maxMomentKnM": round(max_moment_knm, 4),
            "peakInternalForces": peak_internal_forces,
            "equilibriumRmsRelativeError": round(float(diagnostics.get("equilibriumRmsRelativeError", 0.0)), 12),
            "equilibriumMaxResidualN": round(float(diagnostics.get("equilibriumMaxResidualN", 0.0)), 6),
            "maxDisplacementNodeId": max_disp_node["nodeId"] if max_disp_node else None,
            "status": status,
            "statusCode": "PASS" if status == "合格" else "REVIEW",
            "method": "二维框架刚度法 + 平面梁柱单元",
        },
        "diagnostics": {
            "equilibrium": {
                "rmsRelativeError": float(diagnostics.get("equilibriumRmsRelativeError", 0.0)),
                "maxResidualN": float(diagnostics.get("equilibriumMaxResidualN", 0.0)),
            },
            "constraintRank": diagnostics.get("constraintRank"),
            "freeDofCount": diagnostics.get("freeDofCount"),
        },
        "payload": {
            "analysisType": "frame",
            "projectName": request["project_name"],
            "materialId": request["material_id"],
            "structure": structure,
        },
        "preview": {
            "analysisType": "frame",
            "structureType": "portal_frame" if structure.get("template") == "portal_frame" else "explicit",
            "structureTypeLabel": "二维框架",
            "nodes": nodes,
            "members": preview_members,
            "loads": preview_loads,
            "nodeResults": node_results,
            "memberResults": member_peak_results,
            "memberDiagrams": member_diagrams,
            "deformedNodes": deformed_nodes,
            "deformationScale": deformation_scale,
            "summary": {
                "maxDisplacementMm": round(max_displacement_mm, 4),
                "maxVerticalMm": round(max_vertical_mm, 4),
                "maxRotationDeg": round(max_rotation_deg, 6),
                "peakInternalForces": peak_internal_forces,
                "maxDisplacementNodeId": max_disp_node["nodeId"] if max_disp_node else None,
                "status": status,
            },
            "warnings": [],
        },
        "diagram": {
            "analysisType": "frame",
            "structureTypeLabel": "二维框架",
            "nodes": nodes,
            "members": preview_members,
            "loads": preview_loads,
            "deformedNodes": deformed_nodes,
            "memberDiagrams": member_diagrams,
            "summary": {
                "maxDisplacementMm": round(max_displacement_mm, 4),
                "peakInternalForces": peak_internal_forces,
                "status": status,
            },
        },
    }


def _member_peak_results(member_results: List[Dict[str, Any]], member_diagrams: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    diagrams = {item["memberId"]: item for item in member_diagrams}
    enriched: List[Dict[str, Any]] = []
    for result in member_results:
        diagram = diagrams.get(result["memberId"], {})
        axial_values = [abs(float(value)) for value in diagram.get("axialKn", [])]
        shear_values = [abs(float(value)) for value in diagram.get("shearKn", [])]
        moment_values = [abs(float(value)) for value in diagram.get("momentKnM", [])]
        enriched.append(
            {
                **result,
                "maxAbsAxialKn": round(max(axial_values, default=max(abs(float(result.get("axialStartKn", 0.0))), abs(float(result.get("axialEndKn", 0.0))))), 6),
                "maxAbsShearKn": round(max(shear_values, default=max(abs(float(result.get("shearStartKn", 0.0))), abs(float(result.get("shearEndKn", 0.0))))), 6),
                "maxAbsMomentKnM": round(max(moment_values, default=max(abs(float(result.get("momentStartKnM", 0.0))), abs(float(result.get("momentEndKnM", 0.0))))), 6),
            }
        )
    return enriched


def _global_peak_internal_forces(member_results: List[Dict[str, Any]]) -> Dict[str, Any]:
    if not member_results:
        return {
            "maxAbsAxialKn": 0.0,
            "maxAbsShearKn": 0.0,
            "maxAbsMomentKnM": 0.0,
            "axialControlMemberId": None,
            "shearControlMemberId": None,
            "momentControlMemberId": None,
        }
    axial = max(member_results, key=lambda item: item["maxAbsAxialKn"])
    shear = max(member_results, key=lambda item: item["maxAbsShearKn"])
    moment = max(member_results, key=lambda item: item["maxAbsMomentKnM"])
    return {
        "maxAbsAxialKn": axial["maxAbsAxialKn"],
        "maxAbsShearKn": shear["maxAbsShearKn"],
        "maxAbsMomentKnM": moment["maxAbsMomentKnM"],
        "axialControlMemberId": axial["memberId"],
        "shearControlMemberId": shear["memberId"],
        "momentControlMemberId": moment["memberId"],
    }
