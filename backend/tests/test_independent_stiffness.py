import copy
import inspect

import backend.benchmarks.independent_stiffness as independent_stiffness
from backend.benchmarks.catalog import load_benchmark_catalog
from backend.benchmarks.independent_stiffness import (
    evaluate_independent_case,
    evaluate_independent_suite,
    solve_truss_reference,
)


def _independent_cases():
    return [
        case
        for case in load_benchmark_catalog()["cases"]
        if case["verification"]["verificationLevel"] == "B"
    ]


def test_independent_stiffness_does_not_import_production_solver_pipeline():
    source = inspect.getsource(independent_stiffness)

    forbidden_imports = (
        "backend.application",
        "backend.normalizers",
        "backend.presenters",
        "backend.solver",
        "backend.benchmarks.runner",
    )
    assert not any(module_name in source for module_name in forbidden_imports)


def test_independent_stiffness_reproduces_every_level_b_benchmark():
    cases = _independent_cases()
    suite = evaluate_independent_suite()

    assert suite["status"] == "pass"
    assert suite["total"] == len(cases)
    assert suite["total"] >= 5
    assert suite["passed"] == suite["total"]
    assert suite["failed"] == 0
    assert all(result["checks"] for result in suite["results"])
    assert all(
        "backend.benchmarks.independent_stiffness"
        in case["verification"]["reference"]
        for case in cases
    )


def test_independent_stiffness_preserves_symmetric_control_member_ties():
    case = next(
        case
        for case in _independent_cases()
        if case["id"] == "truss-pratt-roof"
    )

    result = solve_truss_reference(case["payload"])

    assert result["maxDisplacementNodeIds"] == ["N6"]
    assert result["maxAxialForceMemberIds"] == ["T1", "T4"]
    assert case["expected"]["maxAxialForceMemberId"] in result["maxAxialForceMemberIds"]


def test_independent_stiffness_fails_when_catalog_standard_value_drifts():
    case = copy.deepcopy(_independent_cases()[0])
    case["expected"]["maxDisplacementMm"] += (
        2 * case["tolerances"]["maxDisplacementMm"]
    )

    result = evaluate_independent_case(case)

    assert result["passed"] is False
    assert any(
        check["metric"] == "最大节点位移(mm)" and not check["passed"]
        for check in result["checks"]
    )
