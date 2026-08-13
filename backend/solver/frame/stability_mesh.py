from __future__ import annotations

from copy import deepcopy
import math
from typing import Any, Dict, List, Mapping, Sequence, Tuple

import numpy as np
from scipy.linalg import eig as dense_generalized_eig
from scipy.sparse import csc_matrix, isspmatrix
from scipy.sparse.linalg import eigsh

from backend.common.stability_errors import FrameBucklingResidualError, FrameBucklingSolveError
from backend.solver.frame.assembler import assemble_global_system
from backend.solver.frame.elements import apply_rotational_releases, member_geometric_stiffness_local
from backend.solver.linear_system import add_local_stiffness


DEFAULT_MEMBER_SUBDIVISIONS = 8
MIN_MEMBER_SUBDIVISIONS = 4
MAX_MEMBER_SUBDIVISIONS = 12
DEFAULT_DENSE_DOF_LIMIT = 240
DEFAULT_SPARSE_DOF_LIMIT = 1600


def solve_frame_stability_mesh(
    structure: Mapping[str, Any],
    member_results: Sequence[Mapping[str, Any]],
    mode_count: int,
    *,
    solver_backend: str = "auto",
    target_subdivisions: int = DEFAULT_MEMBER_SUBDIVISIONS,
    dense_dof_limit: int = DEFAULT_DENSE_DOF_LIMIT,
    sparse_dof_limit: int = DEFAULT_SPARSE_DOF_LIMIT,
) -> Dict[str, Any]:
    mesh = _build_mesh(structure, member_results, target_subdivisions)
    assembly = assemble_global_system(mesh["structure"], solver_backend=solver_backend)

    constraint_matrix = _homogeneous_constraint_matrix(mesh["structure"], len(mesh["structure"]["nodes"]) * 3)
    if constraint_matrix.size == 0:
        free_basis = np.eye(len(mesh["structure"]["nodes"]) * 3, dtype=float)
    else:
        free_basis = _null_space(constraint_matrix, len(mesh["structure"]["nodes"]) * 3)
    if free_basis.shape[1] == 0:
        raise FrameBucklingSolveError("屈曲分析不存在自由模态")

    axial_forces = _member_axial_force_map(member_results)
    k_matrix = _dense_matrix(assembly["stiffness"])
    g_matrix = _assemble_geometric_stiffness(assembly, axial_forces)
    k_reduced = free_basis.T @ k_matrix @ free_basis
    g_reduced = free_basis.T @ g_matrix @ free_basis
    reduced_dof = int(k_reduced.shape[0])
    if reduced_dof > sparse_dof_limit:
        raise FrameBucklingSolveError(
            f"屈曲分析自由度 {reduced_dof} 超过稀疏求解上限 {sparse_dof_limit}，请继续分块或降低模型规模"
        )

    diagnostics = {
        "meshNodeCount": len(mesh["structure"]["nodes"]),
        "meshMemberCount": len(mesh["structure"]["members"]),
        "originalNodeCount": len(structure.get("nodes", [])),
        "originalMemberCount": len(structure.get("members", [])),
        "privateNodeCount": sum(1 for node in mesh["structure"]["nodes"] if node.get("isPrivate")),
        "reducedDofCount": reduced_dof,
        "refinedDofCount": reduced_dof,
        "constraintCount": int(constraint_matrix.shape[0]),
        "freeDofCount": int(free_basis.shape[1]),
        "denseDofLimit": int(dense_dof_limit),
        "sparseDofLimit": int(sparse_dof_limit),
        "solverMode": "dense" if reduced_dof <= dense_dof_limit else "sparse",
        "solverBackend": "dense" if reduced_dof <= dense_dof_limit else "sparse",
        "subdivisionCount": int(sum(item.get("subdivisions", 0) for item in mesh["memberSubdivisions"])),
        "memberSubdivisions": mesh["memberSubdivisions"],
    }

    modes = _solve_modes(
        original_structure=structure,
        structure=mesh["structure"],
        assembly=assembly,
        free_basis=free_basis,
        k_matrix=k_matrix,
        g_matrix=g_matrix,
        k_reduced=k_reduced,
        g_reduced=g_reduced,
        mode_count=mode_count,
        dense_dof_limit=dense_dof_limit,
        sparse_dof_limit=sparse_dof_limit,
    )
    diagnostics["modeCountReturned"] = len(modes)
    diagnostics["convergedModes"] = len(modes)
    diagnostics["minCriticalLoadFactor"] = modes[0]["criticalLoadFactor"] if modes else None
    return {
        "modes": modes,
        "criticalLoadFactor": modes[0]["criticalLoadFactor"] if modes else None,
        "meshDiagnostics": diagnostics,
    }


def _build_mesh(
    structure: Mapping[str, Any],
    member_results: Sequence[Mapping[str, Any]],
    target_subdivisions: int,
) -> Dict[str, Any]:
    original_nodes = [deepcopy(dict(node)) for node in structure.get("nodes", [])]
    original_members = [deepcopy(dict(member)) for member in structure.get("members", [])]
    mesh_nodes: List[Dict[str, Any]] = original_nodes
    node_index = {node["id"]: index for index, node in enumerate(mesh_nodes)}
    member_subdivisions: List[Dict[str, Any]] = []
    mesh_members: List[Dict[str, Any]] = []
    axial_forces = _member_axial_force_map(member_results)

    for member in original_members:
        member_id = str(member["id"])
        start_node = structure_node_by_id(structure, member["start"])
        end_node = structure_node_by_id(structure, member["end"])
        member_length = float(
            math.hypot(
                float(end_node["x"]) - float(start_node["x"]),
                float(end_node["y"]) - float(start_node["y"]),
            )
        )
        subdivisions = _choose_subdivisions(
            member,
            axial_forces.get(member_id, 0.0),
            target_subdivisions,
            member_length=member_length,
        )
        segment_nodes = [member["start"]]
        for segment_index in range(1, subdivisions):
            ratio = segment_index / subdivisions
            node_id = f"{member_id}__mesh_{segment_index}"
            if node_id not in node_index:
                mesh_nodes.append(
                    {
                        "id": node_id,
                        "x": float(start_node["x"]) + (float(end_node["x"]) - float(start_node["x"])) * ratio,
                        "y": float(start_node["y"]) + (float(end_node["y"]) - float(start_node["y"])) * ratio,
                        "supportType": "free",
                        "isMeshNode": True,
                    }
                )
                node_index[node_id] = len(mesh_nodes) - 1
            segment_nodes.append(node_id)
        segment_nodes.append(member["end"])

        member_subdivisions.append(
            {
                "memberId": member_id,
                "subdivisions": subdivisions,
                "lengthM": member_length,
                "axialForceKn": round(float(axial_forces.get(member_id, 0.0)), 6),
            }
        )

        release_start = bool(member.get("endReleases", {}).get("start"))
        release_end = bool(member.get("endReleases", {}).get("end"))
        for segment_index in range(subdivisions):
            segment_member = deepcopy(member)
            segment_member["id"] = f"{member_id}__mesh_{segment_index + 1}"
            start_id = segment_nodes[segment_index]
            end_id = segment_nodes[segment_index + 1]
            if segment_index == 0 and release_start:
                private_start_id = f"{segment_member['id']}__start_rz"
                if private_start_id not in node_index:
                    mesh_nodes.append(
                        {
                            "id": private_start_id,
                            "x": float(start_node["x"]),
                            "y": float(start_node["y"]),
                            "supportType": "free",
                            "isPrivate": True,
                            "masterNodeId": start_id,
                            "coupledDofs": ["ux", "uy"],
                        }
                    )
                    node_index[private_start_id] = len(mesh_nodes) - 1
                start_id = private_start_id
            if segment_index == subdivisions - 1 and release_end:
                private_end_id = f"{segment_member['id']}__end_rz"
                if private_end_id not in node_index:
                    mesh_nodes.append(
                        {
                            "id": private_end_id,
                            "x": float(end_node["x"]),
                            "y": float(end_node["y"]),
                            "supportType": "free",
                            "isPrivate": True,
                            "masterNodeId": end_id,
                            "coupledDofs": ["ux", "uy"],
                        }
                    )
                    node_index[private_end_id] = len(mesh_nodes) - 1
                end_id = private_end_id
            segment_member["start"] = start_id
            segment_member["end"] = end_id
            segment_member["endReleases"] = {}
            mesh_members.append(segment_member)

    mesh_structure = {**dict(structure), "nodes": mesh_nodes, "members": mesh_members}
    return {
        "structure": mesh_structure,
        "memberSubdivisions": member_subdivisions,
    }


def structure_node_by_id(structure: Mapping[str, Any], node_id: str) -> Mapping[str, Any]:
    for node in structure.get("nodes", []):
        if node.get("id") == node_id:
            return node
    raise KeyError(f"未找到节点 {node_id}")


def _choose_subdivisions(
    member: Mapping[str, Any],
    axial_force_kn: float,
    target_subdivisions: int,
    *,
    member_length: float,
) -> int:
    length = max(float(member_length), 1e-9)
    stiffness_hint = max(abs(axial_force_kn), 1.0)
    shape_hint = 1.0 + min(0.5, stiffness_hint / (1e4 * length))
    if member.get("endReleases", {}).get("start") or member.get("endReleases", {}).get("end"):
        shape_hint += 0.25
    subdivisions = int(round(float(target_subdivisions) * shape_hint))
    return max(MIN_MEMBER_SUBDIVISIONS, min(MAX_MEMBER_SUBDIVISIONS, subdivisions))


def _member_axial_force_map(member_results: Sequence[Mapping[str, Any]]) -> Dict[str, float]:
    forces: Dict[str, float] = {}
    for result in member_results:
        member_id = str(result.get("memberId"))
        start = float(result.get("axialStartKn", 0.0))
        end = float(result.get("axialEndKn", start))
        forces[member_id] = 0.5 * (start + end)
    return forces


def _assemble_geometric_stiffness(assembly: Mapping[str, Any], axial_forces: Mapping[str, float]) -> np.ndarray:
    tangent = np.zeros_like(_dense_matrix(assembly["stiffness"]), dtype=float)
    for record in assembly["member_records"]:
        original_member_id = _original_member_id(str(record["id"]))
        axial_force_kn = float(axial_forces.get(original_member_id, 0.0))
        geo_local = member_geometric_stiffness_local(axial_force_kn * 1000.0, float(record["length"]))
        if not np.any(geo_local):
            continue
        geo_condensed, _ = apply_rotational_releases(geo_local, np.zeros(6, dtype=float), list(record.get("release_dofs", [])))
        geo_global = record["transform"].T @ geo_condensed @ record["transform"]
        add_local_stiffness(tangent, record["dofs"], geo_global)
    return tangent


def _solve_modes(
    *,
    original_structure: Mapping[str, Any],
    structure: Mapping[str, Any],
    assembly: Mapping[str, Any],
    free_basis: np.ndarray,
    k_matrix: np.ndarray,
    g_matrix: np.ndarray,
    k_reduced: np.ndarray,
    g_reduced: np.ndarray,
    mode_count: int,
    dense_dof_limit: int,
    sparse_dof_limit: int,
) -> List[Dict[str, Any]]:
    reduced_dof = int(k_reduced.shape[0])
    if reduced_dof <= dense_dof_limit:
        eigenvalues, eigenvectors = dense_generalized_eig(k_reduced, g_reduced)
        candidates: List[Tuple[float, np.ndarray]] = []
        for value, vector in zip(eigenvalues, eigenvectors.T):
            if abs(value.imag) > 1e-8:
                continue
            real_value = float(value.real)
            if not math.isfinite(real_value) or real_value <= 0:
                continue
            candidates.append((real_value, np.asarray(vector.real, dtype=float)))
        candidates.sort(key=lambda item: item[0])
    else:
        sparse_limit = min(int(mode_count) + 4, max(1, reduced_dof - 2))
        g_sparse = csc_matrix(g_reduced)
        k_sparse = csc_matrix(k_reduced)
        if sparse_limit >= reduced_dof:
            sparse_limit = max(1, reduced_dof - 2)
        if sparse_limit <= 0:
            raise FrameBucklingSolveError("屈曲分析模型自由度过少，无法执行稀疏特征求解")
        mu_values, mu_vectors = eigsh(g_sparse, k=sparse_limit, M=k_sparse, which="LA")
        candidates = []
        for value, vector in zip(mu_values, mu_vectors.T):
            if not math.isfinite(float(value)) or float(value) <= 0:
                continue
            candidates.append((1.0 / float(value), np.asarray(vector, dtype=float)))
        candidates.sort(key=lambda item: item[0])

    modes: List[Dict[str, Any]] = []
    for mode_index, (critical_load_factor, reduced_vector) in enumerate(candidates[:mode_count], start=1):
        full_mode = np.asarray(free_basis @ reduced_vector, dtype=float)
        full_mode = _normalize_mode(full_mode, structure, assembly)
        output_scale = _mode_output_translation_scale(original_structure, structure, assembly["member_records"], full_mode)
        if output_scale > 1e-12:
            full_mode = full_mode / output_scale
        reduced_residual = _buckling_residual(k_reduced, g_reduced, reduced_vector, critical_load_factor)
        constraint_residual = float(np.linalg.norm(_homogeneous_constraint_matrix(structure, len(structure.get("nodes", [])) * 3) @ full_mode))
        if reduced_residual > 1e-8:
            raise FrameBucklingResidualError(f"模态 {mode_index} 特征方程残差超限")
        if constraint_residual > 1e-10:
            raise FrameBucklingResidualError(f"模态 {mode_index} 约束残差超限")
        member_shapes = _member_mode_shapes(original_structure, structure, assembly["member_records"], full_mode)
        full_mode, member_shapes, translation_scale = _normalize_output_mode(full_mode, member_shapes)
        modes.append(
            {
                "modeNumber": mode_index,
                "criticalLoadFactor": round(float(critical_load_factor), 8),
                "normalizedResidual": round(float(reduced_residual), 12),
                "residualNorm": round(float(reduced_residual), 12),
                "eigenResidualNorm": round(float(reduced_residual), 12),
                "constraintResidual": round(float(constraint_residual), 12),
                "constraintResidualNorm": round(float(constraint_residual), 12),
                "normalization": {
                    "reference": "max_translation",
                    "translationScale": round(float(translation_scale), 12),
                },
                "nodeDisplacements": _node_displacements(structure, full_mode),
                "memberModeShapes": member_shapes,
            }
        )
    return modes


def _normalize_mode(mode_vector: np.ndarray, structure: Mapping[str, Any], assembly: Mapping[str, Any]) -> np.ndarray:
    sampled = []
    for index in range(len(structure.get("nodes", []))):
        sampled.append(math.hypot(float(mode_vector[index * 3]), float(mode_vector[index * 3 + 1])))
    for record in assembly["member_records"]:
        dofs = record["dofs"]
        d_local = record["transform"] @ mode_vector[dofs]
        length = float(record["length"])
        for ratio in np.linspace(0.0, 1.0, 9):
            axial, transverse, _ = _mode_shape_at_ratio(d_local, length, ratio)
            sampled.append(math.hypot(float(axial), float(transverse)))
    scale = max(sampled, default=0.0)
    if scale <= 0:
        scale = float(np.max(np.abs(mode_vector))) if mode_vector.size else 1.0
    scale = max(scale, 1e-12)
    normalized = np.asarray(mode_vector, dtype=float) / scale
    if np.max(np.abs(normalized)) > 0:
        dominant = int(np.argmax(np.abs(normalized)))
        if normalized[dominant] < 0:
            normalized = -normalized
    return normalized


def _normalize_output_mode(
    mode_vector: np.ndarray,
    member_shapes: Sequence[Mapping[str, Any]],
) -> Tuple[np.ndarray, List[Dict[str, Any]], float]:
    max_translation = 0.0
    max_shape_index = -1
    max_key = ""
    max_item_index = -1
    for shape_index, shape in enumerate(member_shapes):
        for key in ("ux", "uy"):
            values = list(shape.get(key, []))
            for item_index, value in enumerate(values):
                abs_value = abs(float(value))
                if abs_value > max_translation:
                    max_translation = abs_value
                    max_shape_index = shape_index
                    max_key = key
                    max_item_index = item_index
    if max_translation <= 0:
        return mode_vector, [deepcopy(dict(shape)) for shape in member_shapes], 1.0

    scale = max_translation
    normalized_mode = np.asarray(mode_vector, dtype=float) / scale
    normalized_shapes: List[Dict[str, Any]] = []
    for shape in member_shapes:
        copied = deepcopy(dict(shape))
        for key in ("ux", "uy", "rz"):
            copied[key] = [round(float(value) / scale, 8) for value in copied.get(key, [])]
        copied["stations"] = [
            {
                **dict(station),
                "ux": round(float(station.get("ux", 0.0)) / scale, 8),
                "uy": round(float(station.get("uy", 0.0)) / scale, 8),
                "rz": round(float(station.get("rz", 0.0)) / scale, 8),
            }
            for station in copied.get("stations", [])
        ]
        normalized_shapes.append(copied)

    if 0 <= max_shape_index < len(normalized_shapes):
        target_shape = normalized_shapes[max_shape_index]
        if max_key in {"ux", "uy"}:
            values = list(target_shape.get(max_key, []))
            if 0 <= max_item_index < len(values):
                values[max_item_index] = 1.0 if float(member_shapes[max_shape_index].get(max_key, [])[max_item_index]) >= 0 else -1.0
                target_shape[max_key] = values
            stations = list(target_shape.get("stations", []))
            if 0 <= max_item_index < len(stations):
                stations[max_item_index][max_key] = values[max_item_index]
                target_shape["stations"] = stations

    return normalized_mode, normalized_shapes, scale


def _mode_output_translation_scale(
    original_structure: Mapping[str, Any],
    mesh_structure: Mapping[str, Any],
    member_records: Sequence[Mapping[str, Any]],
    mode_vector: np.ndarray,
    station_count: int = 9,
) -> float:
    scale = 0.0
    original_member_ids = dict.fromkeys(
        _original_member_id(str(record["id"])) for record in member_records
    )
    for original_member_id in original_member_ids:
        member_length = float(_original_member_length(original_structure, original_member_id))
        if member_length <= 0:
            continue
        for ratio in _member_sample_ratios(member_records, original_member_id, station_count):
            segment_record, segment_ratio = _segment_for_ratio(member_records, original_member_id, float(ratio))
            if segment_record is None:
                continue
            d_local = segment_record["transform"] @ mode_vector[segment_record["dofs"]]
            axial, transverse, _ = _mode_shape_at_ratio(d_local, float(segment_record["length"]), segment_ratio)
            cosine = float(segment_record.get("cosine", 1.0))
            sine = float(segment_record.get("sine", 0.0))
            ux = cosine * axial - sine * transverse
            uy = sine * axial + cosine * transverse
            scale = max(scale, math.hypot(float(ux), float(uy)))
    if scale <= 0:
        for index, node in enumerate(mesh_structure.get("nodes", [])):
            if node.get("isPrivate") or node.get("isMeshNode"):
                continue
            scale = max(scale, math.hypot(float(mode_vector[index * 3]), float(mode_vector[index * 3 + 1])))
    if scale <= 0:
        scale = float(np.max(np.abs(mode_vector))) if mode_vector.size else 1.0
    return max(scale, 1e-12)


def _node_displacements(structure: Mapping[str, Any], mode_vector: np.ndarray) -> List[Dict[str, Any]]:
    displacements: List[Dict[str, Any]] = []
    for index, node in enumerate(structure.get("nodes", [])):
        if node.get("isPrivate") or node.get("isMeshNode"):
            continue
        displacements.append(
            {
                "nodeId": node["id"],
                "ux": round(float(mode_vector[index * 3]), 8),
                "uy": round(float(mode_vector[index * 3 + 1]), 8),
                "rz": round(float(mode_vector[index * 3 + 2]), 8),
            }
        )
    return displacements


def _member_mode_shapes(
    original_structure: Mapping[str, Any],
    mesh_structure: Mapping[str, Any],
    member_records: Sequence[Mapping[str, Any]],
    mode_vector: np.ndarray,
    station_count: int = 9,
) -> List[Dict[str, Any]]:
    original_member_by_id = {str(member["id"]): member for member in original_structure.get("members", [])}
    shapes: Dict[str, Dict[str, Any]] = {}
    for record in member_records:
        original_member_id = _original_member_id(str(record["id"]))
        if original_member_id not in shapes:
            original_member = original_member_by_id.get(original_member_id, {})
            ratios = _member_sample_ratios(member_records, original_member_id, station_count)
            shapes[original_member_id] = {
                "memberId": original_member_id,
                "startNode": str(original_member.get("start", "")),
                "endNode": str(original_member.get("end", "")),
                "stations": [],
                "stationsM": [],
                "ratios": ratios,
                "ux": [],
                "uy": [],
                "rz": [],
            }
    for original_member_id, shape in shapes.items():
        first_record = _first_record_for_member(member_records, original_member_id)
        if first_record is None:
            continue
        member_length = float(_original_member_length(original_structure, original_member_id))
        shape["stationsM"] = [round(ratio * member_length, 6) for ratio in shape["ratios"]]
        ratios = shape["ratios"]
        for station_index, ratio in enumerate(ratios):
            segment_record, segment_ratio = _segment_for_ratio(member_records, original_member_id, ratio)
            if segment_record is None:
                continue
            d_local = segment_record["transform"] @ mode_vector[segment_record["dofs"]]
            axial, transverse, rotation = _mode_shape_at_ratio(d_local, float(segment_record["length"]), segment_ratio)
            cosine = float(segment_record.get("cosine", 1.0))
            sine = float(segment_record.get("sine", 0.0))
            ux = round(float(cosine * axial - sine * transverse), 8)
            uy = round(float(sine * axial + cosine * transverse), 8)
            rz = round(float(rotation), 8)
            shape["ux"].append(ux)
            shape["uy"].append(uy)
            shape["rz"].append(rz)
            shape["stations"].append(
                {
                    "ratio": round(float(ratio), 6),
                    "stationM": round(float(ratio) * member_length, 6),
                    "ux": ux,
                    "uy": uy,
                    "rz": rz,
                }
            )
    return list(shapes.values())


def _member_sample_ratios(
    member_records: Sequence[Mapping[str, Any]],
    original_member_id: str,
    station_count: int,
) -> List[float]:
    matching = [record for record in member_records if _original_member_id(str(record["id"])) == original_member_id]
    if not matching:
        return [round(i / max(1, station_count - 1), 6) for i in range(station_count)]
    matching.sort(key=lambda record: _segment_index(str(record["id"])))
    ratios: List[float] = []
    segment_count = len(matching)
    for segment_index in range(segment_count):
        for local_ratio in np.linspace(0.0, 1.0, station_count):
            global_ratio = (segment_index + float(local_ratio)) / max(1, segment_count)
            ratios.append(round(min(1.0, max(0.0, global_ratio)), 6))
    ratios = sorted(dict.fromkeys(ratios))
    if not ratios:
        ratios = [0.0, 1.0]
    return ratios


def _segment_for_ratio(
    member_records: Sequence[Mapping[str, Any]],
    original_member_id: str,
    ratio: float,
) -> Tuple[Mapping[str, Any] | None, float]:
    matching = [record for record in member_records if _original_member_id(str(record["id"])) == original_member_id]
    if not matching:
        return None, 0.0
    matching.sort(key=lambda record: _segment_index(str(record["id"])))
    index = min(len(matching) - 1, max(0, int(math.floor(float(ratio) * len(matching)))))
    segment_record = matching[index]
    start_ratio = index / len(matching)
    local_ratio = (float(ratio) - start_ratio) * len(matching)
    return segment_record, min(1.0, max(0.0, local_ratio))


def _original_member_length(structure: Mapping[str, Any], original_member_id: str) -> float:
    for member in structure.get("members", []):
        if str(member.get("id")) == original_member_id:
            start = structure_node_by_id(structure, member["start"])
            end = structure_node_by_id(structure, member["end"])
            return float(math.hypot(float(end["x"]) - float(start["x"]), float(end["y"]) - float(start["y"])))
    return 0.0


def _first_record_for_member(member_records: Sequence[Mapping[str, Any]], original_member_id: str) -> Mapping[str, Any] | None:
    for record in member_records:
        if _original_member_id(str(record["id"])) == original_member_id:
            return record
    return None


def _segment_index(member_id: str) -> int:
    if "__mesh_" not in member_id and "::mesh_" not in member_id:
        return 0
    try:
        return int(member_id.rsplit("_", 1)[-1])
    except ValueError:
        return 0


def _original_member_id(member_id: str) -> str:
    return member_id.split("::mesh_", 1)[0].split("__mesh_", 1)[0]


def _mode_shape_at_ratio(d_local: np.ndarray, length: float, ratio: float) -> Tuple[float, float, float]:
    r = min(1.0, max(0.0, float(ratio)))
    L = float(length)
    u1, v1, theta1, u2, v2, theta2 = [float(value) for value in d_local]
    axial = (1.0 - r) * u1 + r * u2
    n1 = 1.0 - 3.0 * r * r + 2.0 * r * r * r
    n2 = L * (r - 2.0 * r * r + r * r * r)
    n3 = 3.0 * r * r - 2.0 * r * r * r
    n4 = L * (-r * r + r * r * r)
    transverse = n1 * v1 + n2 * theta1 + n3 * v2 + n4 * theta2
    d_n1 = (-6.0 * r + 6.0 * r * r) / max(L, 1e-12)
    d_n2 = 1.0 - 4.0 * r + 3.0 * r * r
    d_n3 = (6.0 * r - 6.0 * r * r) / max(L, 1e-12)
    d_n4 = -2.0 * r + 3.0 * r * r
    rotation = d_n1 * v1 + d_n2 * theta1 + d_n3 * v2 + d_n4 * theta2
    return axial, transverse, rotation


def _buckling_residual(k_matrix: np.ndarray, g_matrix: np.ndarray, mode_vector: np.ndarray, critical_load_factor: float) -> float:
    residual = k_matrix @ mode_vector - critical_load_factor * (g_matrix @ mode_vector)
    denominator = max(float(np.linalg.norm(k_matrix @ mode_vector)), 1.0)
    return float(np.linalg.norm(residual) / denominator)


def _homogeneous_constraint_matrix(structure: Mapping[str, Any], ndof: int) -> np.ndarray:
    rows: List[np.ndarray] = []
    for index, node in enumerate(structure.get("nodes", [])):
        if node.get("masterNodeId") and node.get("coupledDofs"):
            master_id = str(node["masterNodeId"])
            master_index = next((idx for idx, master in enumerate(structure.get("nodes", [])) if master.get("id") == master_id), None)
            if master_index is not None:
                for dof in node.get("coupledDofs", []):
                    row = np.zeros(ndof, dtype=float)
                    row[index * 3 + {"ux": 0, "uy": 1, "rz": 2}[str(dof).lower()]] = 1.0
                    row[master_index * 3 + {"ux": 0, "uy": 1, "rz": 2}[str(dof).lower()]] = -1.0
                    rows.append(row)
        support_type = str(node.get("supportType") or "free").lower()
        if support_type == "roller" and node.get("supportAngleDeg") is not None:
            angle = math.radians(float(node["supportAngleDeg"]))
            row = np.zeros(ndof, dtype=float)
            row[index * 3] = math.cos(angle)
            row[index * 3 + 1] = math.sin(angle)
            rows.append(row)
            continue
        for dof in _support_dofs(support_type):
            row = np.zeros(ndof, dtype=float)
            row[index * 3 + dof] = 1.0
            rows.append(row)
        for dof in node.get("condensedDofs", []):
            row = np.zeros(ndof, dtype=float)
            row[index * 3 + {"ux": 0, "uy": 1, "rz": 2}[str(dof).lower()]] = 1.0
            rows.append(row)
    if not rows:
        return np.zeros((0, ndof), dtype=float)
    return np.vstack(rows)


def _support_dofs(support_type: str) -> List[int]:
    if support_type == "fixed":
        return [0, 1, 2]
    if support_type == "pinned":
        return [0, 1]
    if support_type == "roller":
        return [1]
    return []


def _null_space(constraint_matrix: np.ndarray, ndof: int) -> np.ndarray:
    if constraint_matrix.size == 0:
        return np.eye(ndof, dtype=float)
    _, singular_values, vh = np.linalg.svd(constraint_matrix)
    tolerance = np.finfo(float).eps * max(constraint_matrix.shape) * (singular_values[0] if singular_values.size else 1.0)
    rank = int((singular_values > tolerance).sum())
    return vh[rank:].T.copy()


def _dense_matrix(matrix: Any) -> np.ndarray:
    return matrix.toarray() if isspmatrix(matrix) else np.asarray(matrix, dtype=float)
