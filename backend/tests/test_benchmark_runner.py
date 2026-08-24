import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.benchmarks.report import _format_check_summary, build_report
from backend.benchmarks.runner import evaluate_benchmark_case_by_id, evaluate_benchmark_suite


ROOT = Path(__file__).resolve().parents[2]
REPORT_PATH = ROOT / "docs" / "verification" / "benchmark-validation-report.md"


def test_benchmark_runner_executes_single_case_with_metric_checks():
    result = evaluate_benchmark_case_by_id("BM-001")

    assert result["status"] == "pass"
    assert result["caseId"] == "BM-001"
    assert result["verification"]["verificationLevel"] in {"A", "B", "C", "D"}
    assert {check["metric"] for check in result["checks"]} >= {"最大构件弯矩(kN·m)", "跨中挠度(mm)"}


def test_beam_analytical_runner_checks_force_and_displacement_metrics():
    result = evaluate_benchmark_case_by_id("beam-simply-supported-uniform")

    assert result["status"] == "pass"
    assert {check["metric"] for check in result["checks"]} >= {
        "最大挠度(mm)",
        "最大弯矩(kN·m)",
        "最大剪力(kN)",
        "支座 1 竖向反力绝对值(kN)",
        "支座 2 竖向反力绝对值(kN)",
    }


def test_benchmark_runner_checks_detailed_frame_and_truss_analytical_metrics():
    frame = evaluate_benchmark_case_by_id("BM-008")
    truss_horizontal = evaluate_benchmark_case_by_id("BM-002")
    truss = evaluate_benchmark_case_by_id("BM-009")

    assert frame["status"] == "pass"
    assert {check["metric"] for check in frame["checks"]} >= {
        "状态码",
        "N1 支座反力矩(kN·m)",
        "N2 竖向位移(mm)",
        "N2 转角(°)",
    }
    assert truss_horizontal["status"] == "pass"
    assert {check["metric"] for check in truss_horizontal["checks"]} >= {
        "N2 水平位移(mm)",
        "N2 竖向位移(mm)",
        "N3 水平位移(mm)",
        "M1 杆件轴力(kN)",
        "N1 X 向支座反力(kN)",
    }
    assert truss["status"] == "pass"
    assert {check["metric"] for check in truss["checks"]} >= {
        "N2 竖向位移(mm)",
        "M1 杆件轴力(kN)",
        "N3 Y 向支座反力(kN)",
    }


def test_benchmark_runner_checks_coordinate_transform_and_asymmetric_truss_metrics():
    lateral_column = evaluate_benchmark_case_by_id("BM-010")
    inclined_member = evaluate_benchmark_case_by_id("BM-011")
    asymmetric_truss = evaluate_benchmark_case_by_id("BM-012")

    assert lateral_column["status"] == "pass"
    assert {check["metric"] for check in lateral_column["checks"]} >= {
        "N1 支座水平反力(kN)",
        "N1 支座反力矩(kN·m)",
        "N2 水平位移(mm)",
        "N2 转角(°)",
    }
    assert inclined_member["status"] == "pass"
    assert {check["metric"] for check in inclined_member["checks"]} >= {
        "最大构件轴力(kN)",
        "N1 支座水平反力(kN)",
        "N1 支座竖向反力(kN)",
        "N2 水平位移(mm)",
        "N2 竖向位移(mm)",
    }
    assert asymmetric_truss["status"] == "pass"
    assert {check["metric"] for check in asymmetric_truss["checks"]} >= {
        "控制节点",
        "控制杆件",
        "N2 水平位移(mm)",
        "N2 竖向位移(mm)",
        "M1 杆件轴力(kN)",
        "M2 杆件轴力(kN)",
        "M3 拉压状态",
        "N1 X 向支座反力(kN)",
        "N3 Y 向支座反力(kN)",
    }


def test_benchmark_runner_checks_additional_frame_beam_displacement_metrics():
    frame_003 = evaluate_benchmark_case_by_id("BM-003")
    frame_004 = evaluate_benchmark_case_by_id("BM-004")
    frame_005 = evaluate_benchmark_case_by_id("BM-005")
    frame_006 = evaluate_benchmark_case_by_id("BM-006")
    frame_007 = evaluate_benchmark_case_by_id("BM-007")

    assert frame_003["status"] == "pass"
    assert {check["metric"] for check in frame_003["checks"]} >= {
        "状态码",
        "最大构件弯矩(kN·m)",
        "N1 支座竖向反力(kN)",
        "N2 支座竖向反力(kN)",
        "N2 转角(°)",
    }

    assert frame_004["status"] == "pass"
    assert {check["metric"] for check in frame_004["checks"]} >= {
        "状态码",
        "最大构件弯矩(kN·m)",
        "N1 支座竖向反力(kN)",
        "N2 竖向位移(mm)",
        "N1 转角(°)",
        "N3 支座竖向反力(kN)",
        "N3 转角(°)",
    }

    assert frame_005["status"] == "pass"
    assert {check["metric"] for check in frame_005["checks"]} >= {
        "状态码",
        "最大构件弯矩(kN·m)",
        "N1 支座竖向反力(kN)",
        "N2 竖向位移(mm)",
        "N2 转角(°)",
    }

    assert frame_006["status"] == "pass"
    assert {check["metric"] for check in frame_006["checks"]} >= {
        "状态码",
        "最大构件弯矩(kN·m)",
        "N1 支座竖向反力(kN)",
        "N2 竖向位移(mm)",
        "N2 转角(°)",
    }

    assert frame_007["status"] == "pass"
    assert {check["metric"] for check in frame_007["checks"]} >= {
        "状态码",
        "最大构件弯矩(kN·m)",
        "N1 支座竖向反力(kN)",
        "N2 竖向位移(mm)",
        "N2 转角(°)",
        "N3 支座竖向反力(kN)",
    }


def test_benchmark_runner_checks_public_geometric_nonlinear_reference_cases():
    beam_column = evaluate_benchmark_case_by_id("GNA-001")
    unstable_column = evaluate_benchmark_case_by_id("GNA-002")

    assert beam_column["status"] == "pass"
    assert {check["metric"] for check in beam_column["checks"]} >= {
        "非线性算法",
        "平衡状态",
        "稳定状态",
        "N2 水平位移(mm)",
        "线性屈曲临界系数",
        "路径控制",
    }
    assert unstable_column["status"] == "pass"
    assert {check["metric"] for check in unstable_column["checks"]} >= {
        "平衡状态",
        "稳定状态",
        "线性屈曲临界系数",
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
    assert "python -m backend.benchmarks.independent_stiffness" in report
    assert "N1 支座反力矩(kN·m)=-50.0（标准 -50）" in report
    assert "N2 竖向位移(mm)=-0.315（标准 -0.315）" in report
    assert "支座 2 竖向反力绝对值(kN)=36.0（标准 36）" in report


def test_benchmark_report_normalizes_platform_float_noise():
    baseline = [
        {"passed": True, "metric": "最大杆件轴力(kN)", "actual": 133.333333333405, "expected": 133.3333}
    ]
    perturbed = [
        {"passed": True, "metric": "最大杆件轴力(kN)", "actual": 133.3333333338, "expected": 133.3333}
    ]
    near_zero = [
        {"passed": True, "metric": "支座反力(kN)", "actual": -1.5612511283791264e-15, "expected": 0}
    ]

    assert _format_check_summary(baseline) == _format_check_summary(perturbed)
    assert _format_check_summary(baseline) == "最大杆件轴力(kN)=133.3333333（标准 133.3333）"
    assert _format_check_summary(near_zero) == "支座反力(kN)=0.0（标准 0）"


def test_benchmark_report_file_is_generated_from_source():
    assert REPORT_PATH.exists()
    assert REPORT_PATH.read_text(encoding="utf-8") == build_report()
