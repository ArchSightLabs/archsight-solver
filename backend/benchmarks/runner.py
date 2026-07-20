from __future__ import annotations

from typing import Any, Dict, Mapping

from backend.application.calculation import build_calculation_result
from backend.benchmarks.catalog import find_benchmark_case, iter_benchmark_cases


class BenchmarkCaseError(ValueError):
    """Benchmark case cannot be found or evaluated."""


def _check(name: str, actual: Any, expected: Any, tolerance: float | None = None) -> Dict[str, Any]:
    if tolerance is None:
        passed = actual == expected
        error = None if passed else f"{actual!r} != {expected!r}"
    else:
        delta = abs(float(actual) - float(expected))
        passed = delta <= float(tolerance)
        error = None if passed else f"偏差 {delta:.6g} > 容许 {float(tolerance):.6g}"
    return {
        "metric": name,
        "actual": actual,
        "expected": expected,
        "tolerance": tolerance,
        "passed": passed,
        "error": error,
    }


def _node_results_by_id(data: Mapping[str, Any]) -> Dict[str, Mapping[str, Any]]:
    return {str(item["nodeId"]): item for item in data.get("nodeResults", [])}


def _member_results_by_id(data: Mapping[str, Any]) -> Dict[str, Mapping[str, Any]]:
    return {str(item["memberId"]): item for item in data.get("memberResults", [])}


def _evaluate_response(case: Mapping[str, Any], data: Mapping[str, Any]) -> list[Dict[str, Any]]:
    category = str(case["category"])
    expected = case["expected"]
    tolerances = case["tolerances"]
    checks: list[Dict[str, Any]] = []

    if category == "beam":
        beam = data["beam"]
        checks.append(_check("支座数量", len(beam["supports"]), expected["supportCount"]))
        checks.append(
            _check(
                "最大挠度(mm)",
                beam["maxDeflection"]["valueMm"],
                expected["maxDeflectionMm"],
                tolerances["maxDeflectionMm"],
            )
        )
        checks.append(
            _check(
                "最大挠度位置(m)",
                beam["maxDeflection"]["xM"],
                expected["maxDeflectionXM"],
                tolerances["maxDeflectionXM"],
            )
        )
        return checks

    if category == "frame":
        summary = data["summary"]
        checks.append(_check("状态码", summary["statusCode"], expected["statusCode"]))
        checks.append(_check("节点数量", len(data["nodeIds"]), expected["nodeCount"]))
        checks.append(_check("构件数量", len(data["memberIds"]), expected["memberCount"]))
        checks.append(
            _check(
                "最大节点位移(mm)",
                summary["maxDisplacementMm"],
                expected["maxDisplacementMm"],
                tolerances["maxDisplacementMm"],
            )
        )
        checks.append(
            _check(
                "最大构件弯矩(kN·m)",
                summary["maxMomentKnM"],
                expected["maxMomentKnM"],
                tolerances["maxMomentKnM"],
            )
        )
        return checks

    if category == "truss":
        summary = data["summary"]
        checks.append(_check("状态码", summary["statusCode"], expected["statusCode"]))
        checks.append(_check("节点数量", len(data["nodeIds"]), expected["nodeCount"]))
        checks.append(_check("杆件数量", len(data["memberIds"]), expected["memberCount"]))
        checks.append(
            _check(
                "最大节点位移(mm)",
                summary["maxDisplacementMm"],
                expected["maxDisplacementMm"],
                tolerances["maxDisplacementMm"],
            )
        )
        checks.append(
            _check(
                "最大杆件轴力(kN)",
                summary["maxAxialForceKn"],
                expected["maxAxialForceKn"],
                tolerances["maxAxialForceKn"],
            )
        )
        checks.append(_check("控制节点", summary["maxDisplacementNodeId"], expected["maxDisplacementNodeId"]))
        checks.append(_check("控制杆件", summary["maxAxialForceMemberId"], expected["maxAxialForceMemberId"]))
        return checks

    if category == "frame-beam-verify":
        summary = data["summary"]
        node_by_id = _node_results_by_id(data)
        checks.append(_check("节点数量", len(data["nodeIds"]), expected["nodeCount"]))
        checks.append(_check("构件数量", len(data["memberIds"]), expected["memberCount"]))
        checks.append(
            _check(
                "最大构件弯矩(kN·m)",
                summary["maxMomentKnM"],
                expected["maxMomentKnM"],
                tolerances["maxMomentKnM"],
            )
        )
        for reaction in expected.get("supportReactions", []):
            node_id = reaction["nodeId"]
            checks.append(
                _check(
                    f"{node_id} 支座竖向反力(kN)",
                    node_by_id[node_id]["reactionFyKn"],
                    reaction["reactionFyKn"],
                    tolerances["reactionFyKn"],
                )
            )
        if "midSpanDisplacementMm" in expected:
            node_ids = list(node_by_id)
            mid_node_id = node_ids[1]
            checks.append(
                _check(
                    "跨中挠度(mm)",
                    node_by_id[mid_node_id]["uyMm"],
                    expected["midSpanDisplacementMm"],
                    tolerances["midSpanDisplacementMm"],
                )
            )
        return checks

    if category == "truss-verify":
        summary = data["summary"]
        node_by_id = _node_results_by_id(data)
        member_by_id = _member_results_by_id(data)
        checks.append(_check("状态码", summary["statusCode"], expected["statusCode"]))
        checks.append(_check("节点数量", len(data["nodeIds"]), expected["nodeCount"]))
        checks.append(_check("杆件数量", len(data["memberIds"]), expected["memberCount"]))
        checks.append(
            _check(
                "最大节点位移(mm)",
                summary["maxDisplacementMm"],
                expected["maxDisplacementMm"],
                tolerances["maxDisplacementMm"],
            )
        )
        checks.append(
            _check(
                "最大杆件轴力(kN)",
                summary["maxAxialForceKn"],
                expected["maxAxialForceKn"],
                tolerances["maxAxialForceKn"],
            )
        )
        for expected_member in expected.get("memberAxialForces", []):
            member_id = expected_member["memberId"]
            result = member_by_id[member_id]
            checks.append(
                _check(
                    f"{member_id} 杆件轴力(kN)",
                    result["axialForceKn"],
                    expected_member["axialForceKn"],
                    tolerances["memberAxialForceKn"],
                )
            )
            checks.append(_check(f"{member_id} 拉压状态", result["forceState"], expected_member["forceState"]))
        for reaction in expected.get("supportReactions", []):
            node_id = reaction["nodeId"]
            result = node_by_id[node_id]
            if "rxKn" in reaction:
                checks.append(_check(f"{node_id} X 向支座反力(kN)", result["rxKn"], reaction["rxKn"], tolerances["reactionKn"]))
            if "ryKn" in reaction:
                checks.append(_check(f"{node_id} Y 向支座反力(kN)", result["ryKn"], reaction["ryKn"], tolerances["reactionKn"]))
        return checks

    raise BenchmarkCaseError(f"Unsupported benchmark category: {category}")


def evaluate_benchmark_case(case: Mapping[str, Any]) -> Dict[str, Any]:
    data = build_calculation_result(dict(case["payload"]), operation="benchmark")["solution"]
    checks = _evaluate_response(case, data)
    passed = all(check["passed"] for check in checks)
    return {
        "caseId": case["id"],
        "category": case["category"],
        "title": case["title"],
        "status": "pass" if passed else "fail",
        "passed": passed,
        "checks": checks,
        "verification": case.get("verification", {}),
    }


def evaluate_benchmark_case_by_id(case_id: str) -> Dict[str, Any]:
    case = find_benchmark_case(case_id)
    if case is None:
        raise BenchmarkCaseError(f"未找到基准算例: {case_id}")
    return evaluate_benchmark_case(case)


def evaluate_benchmark_suite(category: str | None = None) -> Dict[str, Any]:
    results = [evaluate_benchmark_case(case) for case in iter_benchmark_cases(category)]
    passed = sum(1 for result in results if result["passed"])
    return {
        "status": "pass" if passed == len(results) else "fail",
        "total": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "results": results,
    }
