from __future__ import annotations

import math
from typing import Any, Mapping, Sequence

import numpy as np

from backend.benchmarks.catalog import load_benchmark_catalog


class IndependentBaselineError(ValueError):
    """The repository-contained reference solver cannot evaluate a benchmark."""


def _float(value: Any) -> float:
    return float(value)


def _frame_local_stiffness(member: Mapping[str, Any], length: float) -> np.ndarray:
    elastic_modulus = _float(member["E_GPa"]) * 1_000_000.0
    area = _float(member["A_cm2"]) * 1e-4
    inertia = _float(member["I_cm4"]) * 1e-8
    axial = elastic_modulus * area / length
    is_axial_brace = (
        member.get("kind") == "brace"
        or member.get("elementType") == "truss"
    )
    flexural = 0.0 if is_axial_brace else elastic_modulus * inertia
    return np.array(
        [
            [axial, 0.0, 0.0, -axial, 0.0, 0.0],
            [
                0.0,
                12 * flexural / length**3,
                6 * flexural / length**2,
                0.0,
                -12 * flexural / length**3,
                6 * flexural / length**2,
            ],
            [
                0.0,
                6 * flexural / length**2,
                4 * flexural / length,
                0.0,
                -6 * flexural / length**2,
                2 * flexural / length,
            ],
            [-axial, 0.0, 0.0, axial, 0.0, 0.0],
            [
                0.0,
                -12 * flexural / length**3,
                -6 * flexural / length**2,
                0.0,
                12 * flexural / length**3,
                -6 * flexural / length**2,
            ],
            [
                0.0,
                6 * flexural / length**2,
                2 * flexural / length,
                0.0,
                -6 * flexural / length**2,
                4 * flexural / length,
            ],
        ],
        dtype=float,
    )


def _frame_transform(cosine: float, sine: float) -> np.ndarray:
    return np.array(
        [
            [cosine, sine, 0.0, 0.0, 0.0, 0.0],
            [-sine, cosine, 0.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 0.0, cosine, sine, 0.0],
            [0.0, 0.0, 0.0, -sine, cosine, 0.0],
            [0.0, 0.0, 0.0, 0.0, 0.0, 1.0],
        ],
        dtype=float,
    )


def _consistent_transverse_load(length: float, start: float, end: float) -> np.ndarray:
    return np.array(
        [
            0.0,
            length * (7 * start + 3 * end) / 20,
            length**2 * (3 * start + 2 * end) / 60,
            0.0,
            length * (3 * start + 7 * end) / 20,
            -length**2 * (2 * start + 3 * end) / 60,
        ],
        dtype=float,
    )


def _consistent_axial_load(length: float, start: float, end: float) -> np.ndarray:
    return np.array(
        [
            length * (2 * start + end) / 6,
            0.0,
            0.0,
            length * (start + 2 * end) / 6,
            0.0,
            0.0,
        ],
        dtype=float,
    )


def _frame_fixed_dofs(nodes: Sequence[Mapping[str, Any]], node_index: Mapping[str, int]) -> list[int]:
    fixed: list[int] = []
    for node in nodes:
        base = 3 * node_index[str(node["id"])]
        support_type = str(node.get("supportType", "free"))
        if support_type == "fixed":
            fixed.extend((base, base + 1, base + 2))
        elif support_type == "pinned":
            fixed.extend((base, base + 1))
        elif support_type == "roller":
            fixed.append(base + 1)
        elif support_type != "free":
            raise IndependentBaselineError(f"独立框架基线不支持支座类型: {support_type}")
    return fixed


def _moment_stationary_points(
    length: float,
    left_shear: float,
    distributed_start: float,
    distributed_end: float,
) -> list[float]:
    linear = (distributed_end - distributed_start) / (2 * length)
    if abs(linear) <= 1e-14:
        if abs(distributed_start) <= 1e-14:
            return []
        point = -left_shear / distributed_start
        return [point] if 0.0 < point < length else []
    discriminant = distributed_start**2 - 4 * linear * left_shear
    if discriminant < 0:
        return []
    root = math.sqrt(discriminant)
    points = [
        (-distributed_start - root) / (2 * linear),
        (-distributed_start + root) / (2 * linear),
    ]
    return [point for point in points if 0.0 < point < length]


def _member_max_moment(record: Mapping[str, Any], displacements: np.ndarray) -> float:
    dofs = list(record["dofs"])
    transform = record["transform"]
    local_stiffness = record["localStiffness"]
    equivalent_load = record["equivalentLoad"]
    local_end_forces = local_stiffness @ (transform @ displacements[dofs]) - equivalent_load
    length = _float(record["length"])
    distributed_start = _float(record["distributedStart"])
    distributed_end = _float(record["distributedEnd"])
    points = [
        0.0,
        length,
        *_moment_stationary_points(
            length,
            _float(local_end_forces[1]),
            distributed_start,
            distributed_end,
        ),
    ]

    def moment_at(position: float) -> float:
        return (
            -_float(local_end_forces[2])
            + _float(local_end_forces[1]) * position
            + distributed_start * position**2 / 2
            + (distributed_end - distributed_start) * position**3 / (6 * length)
        )

    return max(abs(moment_at(position)) for position in points)


def solve_frame_reference(payload: Mapping[str, Any]) -> dict[str, Any]:
    structure = payload.get("structure")
    if not isinstance(structure, Mapping):
        raise IndependentBaselineError("独立框架基线需要显式 structure")
    nodes = structure.get("nodes")
    members = structure.get("members")
    if not isinstance(nodes, list) or not isinstance(members, list) or not nodes or not members:
        raise IndependentBaselineError("独立框架基线需要非空 nodes 和 members")

    node_index = {str(node["id"]): index for index, node in enumerate(nodes)}
    dof_count = 3 * len(nodes)
    stiffness = np.zeros((dof_count, dof_count), dtype=float)
    loads = np.zeros(dof_count, dtype=float)
    member_records: dict[str, dict[str, Any]] = {}

    for member in members:
        member_id = str(member["id"])
        start_index = node_index[str(member["start"])]
        end_index = node_index[str(member["end"])]
        start_node = nodes[start_index]
        end_node = nodes[end_index]
        dx = _float(end_node["x"]) - _float(start_node["x"])
        dy = _float(end_node["y"]) - _float(start_node["y"])
        length = math.hypot(dx, dy)
        if length <= 0:
            raise IndependentBaselineError(f"框架构件 {member_id} 长度必须大于 0")
        transform = _frame_transform(dx / length, dy / length)
        local_stiffness = _frame_local_stiffness(member, length)
        dofs = [
            3 * start_index,
            3 * start_index + 1,
            3 * start_index + 2,
            3 * end_index,
            3 * end_index + 1,
            3 * end_index + 2,
        ]
        stiffness[np.ix_(dofs, dofs)] += transform.T @ local_stiffness @ transform
        member_records[member_id] = {
            "length": length,
            "transform": transform,
            "localStiffness": local_stiffness,
            "dofs": dofs,
            "equivalentLoad": np.zeros(6, dtype=float),
            "distributedStart": 0.0,
            "distributedEnd": 0.0,
        }

    for node in nodes:
        base = 3 * node_index[str(node["id"])]
        for spring in node.get("springs", []):
            if spring.get("dof") != "rz":
                raise IndependentBaselineError("独立框架基线当前只支持 rz 转动弹簧")
            stiffness[base + 2, base + 2] += _float(spring["stiffnessKnMPerRad"])

    for load in structure.get("loads", []):
        load_type = str(load.get("type", ""))
        if load_type == "nodal":
            base = 3 * node_index[str(load["node"])]
            loads[base] += _float(load.get("fxKn", 0.0))
            loads[base + 1] += _float(load.get("fyKn", 0.0))
            loads[base + 2] += _float(load.get("mzKnM", 0.0))
            continue
        if load_type != "distributed":
            raise IndependentBaselineError(f"独立框架基线不支持荷载类型: {load_type}")
        record = member_records[str(load["member"])]
        fallback = _float(load.get("wyKnPerM", 0.0))
        distributed_start = _float(load.get("qStartKnPerM", fallback))
        distributed_end = _float(load.get("qEndKnPerM", fallback))
        direction = str(load.get("direction", "local_y"))
        if direction == "local_y":
            axial_start = axial_end = 0.0
            transverse_start = distributed_start
            transverse_end = distributed_end
        elif direction == "global_y":
            transform = record["transform"]
            sine = _float(transform[0, 1])
            cosine = _float(transform[0, 0])
            axial_start = sine * distributed_start
            axial_end = sine * distributed_end
            transverse_start = cosine * distributed_start
            transverse_end = cosine * distributed_end
        else:
            raise IndependentBaselineError(
                f"独立框架基线不支持分布荷载方向: {direction}"
            )
        equivalent = _consistent_axial_load(
            _float(record["length"]),
            axial_start,
            axial_end,
        ) + _consistent_transverse_load(
            _float(record["length"]),
            transverse_start,
            transverse_end,
        )
        dofs = list(record["dofs"])
        loads[dofs] += record["transform"].T @ equivalent
        record["equivalentLoad"] += equivalent
        record["distributedStart"] += transverse_start
        record["distributedEnd"] += transverse_end

    fixed = set(_frame_fixed_dofs(nodes, node_index))
    free = [dof for dof in range(dof_count) if dof not in fixed]
    displacements = np.zeros(dof_count, dtype=float)
    try:
        displacements[free] = np.linalg.solve(
            stiffness[np.ix_(free, free)],
            loads[free],
        )
    except np.linalg.LinAlgError as exc:
        raise IndependentBaselineError("独立框架基线整体刚度矩阵奇异") from exc

    node_displacements = {
        str(node["id"]): math.hypot(
            _float(displacements[3 * index]),
            _float(displacements[3 * index + 1]),
        )
        * 1000
        for index, node in enumerate(nodes)
    }
    maximum_displacement = max(node_displacements.values())
    controlling_nodes = sorted(
        node_id
        for node_id, value in node_displacements.items()
        if math.isclose(value, maximum_displacement, abs_tol=1e-9)
    )
    maximum_moment = max(
        _member_max_moment(record, displacements)
        for record in member_records.values()
    )
    return {
        "nodeCount": len(nodes),
        "memberCount": len(members),
        "maxDisplacementMm": maximum_displacement,
        "maxDisplacementNodeIds": controlling_nodes,
        "maxMomentKnM": maximum_moment,
    }


def _truss_fixed_dofs(nodes: Sequence[Mapping[str, Any]], node_index: Mapping[str, int]) -> list[int]:
    fixed: list[int] = []
    for node in nodes:
        base = 2 * node_index[str(node["id"])]
        support_type = str(node.get("supportType", "free"))
        if support_type == "pinned":
            fixed.extend((base, base + 1))
        elif support_type == "roller":
            fixed.append(base + 1)
        elif support_type != "free":
            raise IndependentBaselineError(f"独立桁架基线不支持支座类型: {support_type}")
    return fixed


def solve_truss_reference(payload: Mapping[str, Any]) -> dict[str, Any]:
    structure = payload.get("structure")
    if not isinstance(structure, Mapping):
        raise IndependentBaselineError("独立桁架基线需要显式 structure")
    nodes = structure.get("nodes")
    members = structure.get("members")
    if not isinstance(nodes, list) or not isinstance(members, list) or not nodes or not members:
        raise IndependentBaselineError("独立桁架基线需要非空 nodes 和 members")

    node_index = {str(node["id"]): index for index, node in enumerate(nodes)}
    dof_count = 2 * len(nodes)
    stiffness = np.zeros((dof_count, dof_count), dtype=float)
    loads = np.zeros(dof_count, dtype=float)
    member_records: dict[str, tuple[float, float, float, float, list[int]]] = {}

    for member in members:
        member_id = str(member["id"])
        start_index = node_index[str(member["start"])]
        end_index = node_index[str(member["end"])]
        start_node = nodes[start_index]
        end_node = nodes[end_index]
        dx = _float(end_node["x"]) - _float(start_node["x"])
        dy = _float(end_node["y"]) - _float(start_node["y"])
        length = math.hypot(dx, dy)
        if length <= 0:
            raise IndependentBaselineError(f"桁架杆件 {member_id} 长度必须大于 0")
        cosine = dx / length
        sine = dy / length
        axial_rigidity = (
            _float(member["E_GPa"])
            * 1_000_000.0
            * _float(member["A_cm2"])
            * 1e-4
        )
        direction = np.array(
            [-cosine, -sine, cosine, sine],
            dtype=float,
        )
        element_stiffness = axial_rigidity / length * np.outer(direction, direction)
        dofs = [
            2 * start_index,
            2 * start_index + 1,
            2 * end_index,
            2 * end_index + 1,
        ]
        stiffness[np.ix_(dofs, dofs)] += element_stiffness
        member_records[member_id] = (axial_rigidity, length, cosine, sine, dofs)

    for load in structure.get("loads", []):
        if load.get("type") != "nodal":
            raise IndependentBaselineError("独立桁架基线当前只支持节点荷载")
        base = 2 * node_index[str(load["node"])]
        loads[base] += _float(load.get("fxKn", 0.0))
        loads[base + 1] += _float(load.get("fyKn", 0.0))

    fixed = set(_truss_fixed_dofs(nodes, node_index))
    free = [dof for dof in range(dof_count) if dof not in fixed]
    displacements = np.zeros(dof_count, dtype=float)
    try:
        displacements[free] = np.linalg.solve(
            stiffness[np.ix_(free, free)],
            loads[free],
        )
    except np.linalg.LinAlgError as exc:
        raise IndependentBaselineError("独立桁架基线整体刚度矩阵奇异") from exc

    node_displacements = {
        str(node["id"]): math.hypot(
            _float(displacements[2 * index]),
            _float(displacements[2 * index + 1]),
        )
        * 1000
        for index, node in enumerate(nodes)
    }
    member_forces: dict[str, float] = {}
    for member_id, (axial_rigidity, length, cosine, sine, dofs) in member_records.items():
        direction = np.array([-cosine, -sine, cosine, sine], dtype=float)
        member_forces[member_id] = _float(
            axial_rigidity
            / length
            * _float(direction @ displacements[dofs])
        )

    maximum_displacement = max(node_displacements.values())
    maximum_force = max(abs(value) for value in member_forces.values())
    controlling_nodes = sorted(
        node_id
        for node_id, value in node_displacements.items()
        if math.isclose(value, maximum_displacement, abs_tol=1e-9)
    )
    controlling_members = sorted(
        member_id
        for member_id, value in member_forces.items()
        if math.isclose(abs(value), maximum_force, abs_tol=1e-9)
    )
    return {
        "nodeCount": len(nodes),
        "memberCount": len(members),
        "maxDisplacementMm": maximum_displacement,
        "maxDisplacementNodeIds": controlling_nodes,
        "maxAxialForceKn": maximum_force,
        "maxAxialForceMemberIds": controlling_members,
    }


def _numeric_check(
    metric: str,
    actual: float,
    expected: float,
    tolerance: float,
) -> dict[str, Any]:
    delta = abs(actual - expected)
    return {
        "metric": metric,
        "actual": actual,
        "expected": expected,
        "tolerance": tolerance,
        "passed": delta <= tolerance,
        "delta": delta,
    }


def _exact_check(metric: str, actual: Any, expected: Any) -> dict[str, Any]:
    return {
        "metric": metric,
        "actual": actual,
        "expected": expected,
        "tolerance": None,
        "passed": actual == expected,
        "delta": None,
    }


def evaluate_independent_case(case: Mapping[str, Any]) -> dict[str, Any]:
    category = str(case["category"])
    if category == "frame":
        actual = solve_frame_reference(case["payload"])
    elif category == "truss":
        actual = solve_truss_reference(case["payload"])
    else:
        raise IndependentBaselineError(f"B 级独立基线不支持算例类型: {category}")

    expected = case["expected"]
    tolerances = case["tolerances"]
    checks = [
        _exact_check("节点数量", actual["nodeCount"], expected["nodeCount"]),
        _exact_check("构件数量", actual["memberCount"], expected["memberCount"]),
        _numeric_check(
            "最大节点位移(mm)",
            actual["maxDisplacementMm"],
            _float(expected["maxDisplacementMm"]),
            _float(tolerances["maxDisplacementMm"]),
        ),
    ]
    if category == "frame":
        checks.append(
            _numeric_check(
                "最大构件弯矩(kN·m)",
                actual["maxMomentKnM"],
                _float(expected["maxMomentKnM"]),
                _float(tolerances["maxMomentKnM"]),
            )
        )
    else:
        checks.extend(
            [
                _numeric_check(
                    "最大杆件轴力(kN)",
                    actual["maxAxialForceKn"],
                    _float(expected["maxAxialForceKn"]),
                    _float(tolerances["maxAxialForceKn"]),
                ),
                _exact_check(
                    "控制节点属于并列控制集合",
                    str(expected["maxDisplacementNodeId"])
                    in actual["maxDisplacementNodeIds"],
                    True,
                ),
                _exact_check(
                    "控制杆件属于并列控制集合",
                    str(expected["maxAxialForceMemberId"])
                    in actual["maxAxialForceMemberIds"],
                    True,
                ),
            ]
        )
    return {
        "caseId": case["id"],
        "category": category,
        "passed": all(check["passed"] for check in checks),
        "checks": checks,
        "actual": actual,
    }


def evaluate_independent_suite() -> dict[str, Any]:
    catalog = load_benchmark_catalog()
    cases = [
        case
        for case in catalog.get("cases", [])
        if case.get("verification", {}).get("verificationLevel") == "B"
    ]
    results = [evaluate_independent_case(case) for case in cases]
    passed = sum(result["passed"] for result in results)
    return {
        "status": "pass" if passed == len(results) else "fail",
        "total": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "results": results,
    }


def main() -> int:
    suite = evaluate_independent_suite()
    for result in suite["results"]:
        status = "PASS" if result["passed"] else "FAIL"
        details = "；".join(
            f"{check['metric']}={check['actual']}"
            for check in result["checks"]
        )
        print(f"[{status}] {result['caseId']}：{details}")
    print(
        f"独立刚度法基线：{suite['passed']}/{suite['total']} 通过，"
        f"{suite['failed']} 未通过"
    )
    return 0 if suite["status"] == "pass" else 1


if __name__ == "__main__":
    raise SystemExit(main())
