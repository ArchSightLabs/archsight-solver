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
                "momentStartKnM": -end_forces_local[2] / 1000.0,
                "axialEndKn": -end_forces_local[3] / 1000.0,
                "shearEndKn": -end_forces_local[4] / 1000.0,
                "momentEndKnM": end_forces_local[5] / 1000.0,
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
        point_loads = _member_point_load_components(record)
        distributed_loads = _distributed_load_components(record)
        extra_stations = [load["xM"] for load in point_loads]
        extra_stations.extend(load["xStartM"] for load in distributed_loads)
        extra_stations.extend(load["xEndM"] for load in distributed_loads)
        stations_m = _diagram_stations(float(record["length"]), station_count, extra_stations)
        axial = []
        shear = []
        moment = []
        displacement = []
        n_start = float(end_forces_local[0])
        v_start = float(end_forces_local[1])
        m_start = float(end_forces_local[2])
        length = float(record["length"])
        for x in stations_m:
            axial_n = n_start
            shear_n = v_start
            moment_nm = m_start - v_start * x
            for load in distributed_loads:
                axial_n += _integrated_linear_load(load, x, "qx")[0]
                shear_force, load_moment = _integrated_linear_load(load, x, "qy")
                shear_n += shear_force
                moment_nm -= load_moment
            for point_load in point_loads:
                if x + 1e-9 < point_load["xM"]:
                    continue
                axial_n += point_load["pxN"]
                shear_n += point_load["pyN"]
                moment_nm -= point_load["pyN"] * (x - point_load["xM"])
            xi = x / length if length else 0.0
            local_v = (
                (1 - 3 * xi**2 + 2 * xi**3) * d_local[1]
                + length * (xi - 2 * xi**2 + xi**3) * d_local[2]
                + (3 * xi**2 - 2 * xi**3) * d_local[4]
                + length * (-xi**2 + xi**3) * d_local[5]
            )
            axial.append(round(axial_n / 1000.0, 6))
            shear.append(round(shear_n / 1000.0, 6))
            moment.append(round(-moment_nm / 1000.0, 6))
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


def _distributed_load_components(record: Dict[str, Any]) -> List[Dict[str, float]]:
    loads: List[Dict[str, float]] = []
    for load in record.get("loads", []):
        if load.get("type") != "distributed":
            continue
        loads.append(
            {
                "xStartM": float(load.get("xStartM", 0.0)),
                "xEndM": float(load.get("xEndM", record.get("length", 0.0))),
                "qxStartNPerM": float(load.get("qxStartNPerM", 0.0)),
                "qxEndNPerM": float(load.get("qxEndNPerM", 0.0)),
                "qyStartNPerM": float(load.get("qyStartNPerM", 0.0)),
                "qyEndNPerM": float(load.get("qyEndNPerM", 0.0)),
            }
        )
    return loads


def _integrated_linear_load(load: Dict[str, float], x: float, axis: str) -> tuple[float, float]:
    x_start = load["xStartM"]
    x_end = load["xEndM"]
    if x <= x_start + 1e-12 or x_end <= x_start + 1e-12:
        return 0.0, 0.0
    upper = min(x, x_end)
    span = x_end - x_start
    distance = upper - x_start
    q_start = load[f"{axis}StartNPerM"]
    q_end = load[f"{axis}EndNPerM"]
    slope = (q_end - q_start) / span
    force = q_start * distance + 0.5 * slope * distance**2
    moment_about_x = (
        (x - x_start) * q_start * distance
        - q_start * distance**2 / 2.0
        + slope * ((x - x_start) * distance**2 / 2.0 - distance**3 / 3.0)
    )
    return force, moment_about_x


def _member_point_load_components(record: Dict[str, Any]) -> List[Dict[str, float]]:
    loads: List[Dict[str, float]] = []
    for load in record.get("loads", []):
        if load.get("type") != "member_point":
            continue
        loads.append(
            {
                "xM": float(load.get("xM", 0.0)),
                "pxN": float(load.get("pxN", 0.0)),
                "pyN": float(load.get("pyN", 0.0)),
            }
        )
    return loads


def _diagram_stations(length: float, station_count: int, extra_stations: List[float]) -> np.ndarray:
    stations = [float(value) for value in np.linspace(0.0, length, station_count)]
    stations.extend(min(length, max(0.0, value)) for value in extra_stations)
    rounded = sorted({round(value, 9) for value in stations})
    return np.array(rounded, dtype=float)
