from __future__ import annotations

from typing import Any, Dict, List

import numpy as np

from backend.normalizers.truss.request_normalizer import ALLOWABLE_RATIO


def build_truss_solution_response(
    request: Dict[str, Any],
    node_results: List[Dict[str, Any]],
    member_results: List[Dict[str, Any]],
    displacement_magnitudes: List[float],
    axial_forces: List[float],
    displacements,
    diagnostics: Dict[str, Any] | None = None,
) -> Dict[str, Any]:
    nodes = request["structure"]["nodes"]
    members = request["structure"]["members"]
    loads = request["structure"]["loads"]

    x_values = [float(node["x"]) for node in nodes]
    allowable_mm = max((max(x_values) - min(x_values)) * 1000.0 / ALLOWABLE_RATIO, 1.0)
    max_disp_index = int(np.argmax(displacement_magnitudes)) if displacement_magnitudes else 0
    max_force_index = int(np.argmax(axial_forces)) if axial_forces else 0
    max_disp_mm = float(displacement_magnitudes[max_disp_index]) if displacement_magnitudes else 0.0
    max_force_kn = float(axial_forces[max_force_index]) if axial_forces else 0.0
    diagnostics = diagnostics or {}
    peak_internal_forces = {
        "maxAbsAxialForceKn": round(max_force_kn, 6),
        "axialControlMemberId": member_results[max_force_index]["memberId"] if member_results else "",
    }
    member_peak_results = [
        {
            **item,
            "maxAbsAxialForceKn": round(abs(float(item.get("axialForceKn", 0.0))), 6),
        }
        for item in member_results
    ]

    summary = {
        "status": "合格" if max_disp_mm <= allowable_mm else "需校核",
        "statusCode": "PASS" if max_disp_mm <= allowable_mm else "REVIEW",
        "method": "二维平面桁架杆单元法",
        "allowableMm": float(allowable_mm),
        "allowableRatio": ALLOWABLE_RATIO,
        "maxDisplacementMm": max_disp_mm,
        "maxDisplacementNodeId": node_results[max_disp_index]["nodeId"] if node_results else "",
        "maxAxialForceKn": max_force_kn,
        "maxAxialForceMemberId": member_results[max_force_index]["memberId"] if member_results else "",
        "peakInternalForces": peak_internal_forces,
        "equilibriumRmsRelativeError": round(float(diagnostics.get("equilibriumRmsRelativeError", 0.0)), 12),
        "equilibriumMaxResidualN": round(float(diagnostics.get("equilibriumMaxResidualN", 0.0)), 6),
    }

    scale = max(1.0, (max(x_values) - min(x_values)) * 4.0 / max(max_disp_mm, 1e-6))
    deformed_nodes = [
        {
            "id": node["id"],
            "x": float(node["x"] + (displacements[idx * 2] * scale)),
            "y": float(node["y"] + (displacements[idx * 2 + 1] * scale)),
            "uxMm": node_results[idx]["uxMm"],
            "uyMm": node_results[idx]["uyMm"],
        }
        for idx, node in enumerate(nodes)
    ]

    preview = {
        "analysisType": "truss",
        "structureType": request["structure"].get("template", "explicit"),
        "structureTypeLabel": "二维平面桁架",
        "nodes": [
            {
                "id": node["id"],
                "x": float(node["x"]),
                "y": float(node["y"]),
                "role": "support" if node["supportType"] != "free" else "free",
            }
            for node in nodes
        ],
        "members": [
            {
                "id": member["id"],
                "start": member["start"],
                "end": member["end"],
            }
            for member in members
        ],
        "loads": loads,
        "nodeResults": node_results,
        "memberResults": member_peak_results,
        "deformedNodes": deformed_nodes,
        "deformationScale": float(scale),
        "controlNodeId": summary["maxDisplacementNodeId"],
        "summary": {
            "allowableMm": float(allowable_mm),
            "allowableRatio": ALLOWABLE_RATIO,
            "maxDisplacementMm": max_disp_mm,
            "maxAxialForceKn": max_force_kn,
            "peakInternalForces": peak_internal_forces,
            "maxDisplacementNodeId": summary["maxDisplacementNodeId"],
            "maxAxialForceMemberId": summary["maxAxialForceMemberId"],
            "statusCode": summary["statusCode"],
            "status": summary["status"],
            "method": summary["method"],
        },
        "warnings": [],
    }

    diagram = {
        "analysisType": "truss",
        "structureTypeLabel": "二维平面桁架",
        "loadVisible": bool(loads),
        "deformationScale": float(scale),
        "nodes": preview["nodes"],
        "members": preview["members"],
        "loads": loads,
        "deformedNodes": deformed_nodes,
    }

    return {
        "analysisType": "truss",
        "projectName": request["project_name"],
        "materialId": request["material_id"],
        "material_name": request.get("material_name"),
        "request": request,
        "payload": {
            "analysisType": "truss",
            "projectName": request["project_name"],
            "materialId": request["material_id"],
            "structure": request["structure"],
        },
        "structure": request["structure"],
        "nodeIds": [node["id"] for node in nodes],
        "memberIds": [member["id"] for member in members],
        "nodeResults": node_results,
        "memberResults": member_peak_results,
        "ux_data": [item["uxMm"] for item in node_results],
        "uy_data": [item["uyMm"] for item in node_results],
        "member_axial_data": [{"memberId": item["memberId"], "axialForceKn": item["axialForceKn"]} for item in member_results],
        "summary": summary,
        "diagnostics": {
            "equilibrium": {
                "rmsRelativeError": float(diagnostics.get("equilibriumRmsRelativeError", 0.0)),
                "maxResidualN": float(diagnostics.get("equilibriumMaxResidualN", 0.0)),
            },
            "fixedDofCount": diagnostics.get("fixedDofCount"),
            "freeDofCount": diagnostics.get("freeDofCount"),
        },
        "truss": preview,
        "preview": preview,
        "diagram": diagram,
        "solution": {
            "structure": request["structure"],
            "summary": summary,
            "nodeResults": node_results,
            "memberResults": member_peak_results,
        },
    }
