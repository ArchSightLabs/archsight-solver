from __future__ import annotations

import math
from typing import Any, Dict, List

import numpy as np


def recover_node_results(nodes: List[Dict[str, Any]], displacements, reactions, spring_records=None) -> List[Dict[str, Any]]:
    spring_reactions = {}
    for spring in spring_records or []:
        matrix_index = spring["matrix_index"]
        spring_reactions[matrix_index] = spring_reactions.get(matrix_index, 0.0) - spring["stiffness"] * displacements[matrix_index]
    node_results: List[Dict[str, Any]] = []
    for idx, node in enumerate(nodes):
        ux = float(displacements[idx * 3])
        uy = float(displacements[idx * 3 + 1])
        rz = float(displacements[idx * 3 + 2])
        node_results.append(
            {
                "nodeId": node["id"],
                "x": float(node["x"]),
                "y": float(node["y"]),
                "supportType": node["supportType"],
                "uxMm": ux * 1000.0,
                "uyMm": uy * 1000.0,
                "rotationDeg": math.degrees(rz),
                "resultantMm": math.hypot(ux, uy) * 1000.0,
                "reactionFxKn": (reactions[idx * 3] + spring_reactions.get(idx * 3, 0.0)) / 1000.0,
                "reactionFyKn": (reactions[idx * 3 + 1] + spring_reactions.get(idx * 3 + 1, 0.0)) / 1000.0,
                "reactionMzKnM": (reactions[idx * 3 + 2] + spring_reactions.get(idx * 3 + 2, 0.0)) / 1000.0,
            }
        )
    return node_results


def recover_member_results(member_records: List[Dict[str, Any]], displacements) -> List[Dict[str, Any]]:
    member_results: List[Dict[str, Any]] = []
    for record in member_records:
        dofs = record["dofs"]
        d_global = displacements[dofs]
        d_local = record["transform"] @ d_global
        end_forces_local = record["k_local"] @ d_local - record["f_local"]
        member_results.append(
            {
                "memberId": record["id"],
                "kind": record["kind"],
                "startNode": record["start"],
                "endNode": record["end"],
                "axialStartKn": end_forces_local[0] / 1000.0,
                "shearStartKn": end_forces_local[1] / 1000.0,
                "momentStartKnM": end_forces_local[2] / 1000.0,
                "axialEndKn": -end_forces_local[3] / 1000.0,
                "shearEndKn": -end_forces_local[4] / 1000.0,
                "momentEndKnM": -end_forces_local[5] / 1000.0,
                "lengthM": record["length"],
            }
        )
    return member_results


def recover_member_diagrams(member_records: List[Dict[str, Any]], displacements, station_count: int = 9) -> List[Dict[str, Any]]:
    diagrams: List[Dict[str, Any]] = []
    for record in member_records:
        dofs = record["dofs"]
        d_global = displacements[dofs]
        d_local = record["transform"] @ d_global
        end_forces_local = record["k_local"] @ d_local - record["f_local"]
        stations_m = np.linspace(0.0, record["length"], station_count)
        qx_start, qx_end, qy_start, qy_end = _combined_member_load_components(record)
        axial = []
        shear = []
        moment = []
        displacement = []
        n_start = float(end_forces_local[0])
        v_start = float(end_forces_local[1])
        m_start = float(end_forces_local[2])
        length = float(record["length"])
        for x in stations_m:
            axial_n = n_start + qx_start * x + (qx_end - qx_start) * x**2 / (2.0 * length)
            shear_n = v_start + qy_start * x + (qy_end - qy_start) * x**2 / (2.0 * length)
            moment_nm = m_start - v_start * x - qy_start * x**2 / 2.0 - (qy_end - qy_start) * x**3 / (6.0 * length)
            xi = x / length if length else 0.0
            local_v = (
                (1 - 3 * xi**2 + 2 * xi**3) * d_local[1]
                + length * (xi - 2 * xi**2 + xi**3) * d_local[2]
                + (3 * xi**2 - 2 * xi**3) * d_local[4]
                + length * (-xi**2 + xi**3) * d_local[5]
            )
            axial.append(round(axial_n / 1000.0, 6))
            shear.append(round(shear_n / 1000.0, 6))
            moment.append(round(moment_nm / 1000.0, 6))
            displacement.append(round(local_v * 1000.0, 6))
        diagrams.append(
            {
                "memberId": record["id"],
                "stationsM": [round(float(value), 6) for value in stations_m],
                "stations": [round(float(value / record["length"]), 6) for value in stations_m],
                "axialKn": axial,
                "shearKn": shear,
                "momentKnM": moment,
                "deflectionMm": displacement,
            }
        )
    return diagrams


def _combined_member_load_components(record: Dict[str, Any]) -> tuple[float, float, float, float]:
    qx_start = qx_end = qy_start = qy_end = 0.0
    for load in record.get("loads", []):
        qx_start += float(load.get("qxStartNPerM", 0.0))
        qx_end += float(load.get("qxEndNPerM", 0.0))
        qy_start += float(load.get("qyStartNPerM", 0.0))
        qy_end += float(load.get("qyEndNPerM", 0.0))
    return qx_start, qx_end, qy_start, qy_end
