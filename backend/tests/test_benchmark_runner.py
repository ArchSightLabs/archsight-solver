import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.benchmarks.runner import evaluate_benchmark_case_by_id, evaluate_benchmark_suite


def test_benchmark_runner_executes_single_case_with_metric_checks():
    result = evaluate_benchmark_case_by_id("BM-001")

    assert result["status"] == "pass"
    assert result["caseId"] == "BM-001"
    assert {check["metric"] for check in result["checks"]} >= {"最大构件弯矩(kN·m)", "跨中挠度(mm)"}


def test_benchmark_runner_executes_suite():
    result = evaluate_benchmark_suite()

    assert result["status"] == "pass"
    assert result["total"] >= 10
    assert result["failed"] == 0

