import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.benchmarks.report import build_report
from backend.benchmarks.runner import evaluate_benchmark_case_by_id, evaluate_benchmark_suite


def test_benchmark_runner_executes_single_case_with_metric_checks():
    result = evaluate_benchmark_case_by_id("BM-001")

    assert result["status"] == "pass"
    assert result["caseId"] == "BM-001"
    assert result["verification"]["verificationLevel"] in {"A", "B", "C", "D"}
    assert {check["metric"] for check in result["checks"]} >= {"最大构件弯矩(kN·m)", "跨中挠度(mm)"}


def test_benchmark_runner_checks_detailed_frame_and_truss_analytical_metrics():
    frame = evaluate_benchmark_case_by_id("BM-008")
    truss = evaluate_benchmark_case_by_id("BM-009")

    assert frame["status"] == "pass"
    assert {check["metric"] for check in frame["checks"]} >= {
        "状态码",
        "N1 支座反力矩(kN·m)",
        "N2 竖向位移(mm)",
        "N2 转角(°)",
    }
    assert truss["status"] == "pass"
    assert {check["metric"] for check in truss["checks"]} >= {
        "N2 竖向位移(mm)",
        "M1 杆件轴力(kN)",
        "N3 Y 向支座反力(kN)",
    }


def test_benchmark_runner_executes_suite():
    result = evaluate_benchmark_suite()

    assert result["status"] == "pass"
    assert result["total"] >= 10
    assert result["failed"] == 0


def test_benchmark_report_keeps_public_examples_entrypoint():
    report = build_report()

    assert "## 界面入口" in report
    assert "## 验证等级" in report
    assert "A 级验证" in report
    assert "GET /api/examples/projects" in report
    assert "公开案例" in report
    assert "N1 支座反力矩(kN·m)=-50.0（标准 -50）" in report
    assert "N2 竖向位移(mm)=-0.315（标准 -0.315）" in report
