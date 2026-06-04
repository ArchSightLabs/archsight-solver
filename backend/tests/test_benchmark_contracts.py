import os
import sys
import re
from datetime import date

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.tests.benchmark_catalog import load_benchmark_catalog


BENCHMARK_CATALOG = load_benchmark_catalog()


ALLOWED_VERIFICATION_SOURCE_TYPES = {
    "textbook-analytical",
    "independent-stiffness-baseline",
    "engineering-software",
    "internal-regression",
}

EXPECTED_VERIFICATION_LEVEL_BY_SOURCE_TYPE = {
    "textbook-analytical": "A",
    "independent-stiffness-baseline": "B",
    "engineering-software": "C",
    "internal-regression": "D",
}

PROFESSIONAL_METRICS_BY_CATEGORY = {
    "beam": {"最大挠度", "峰值位置", "支座反力", "构件弯矩", "剪力", "支座数量"},
    "frame": {"最大节点位移", "节点位移", "构件弯矩", "支座反力", "节点数量", "构件数量"},
    "truss": {"节点位移", "杆件轴力", "杆件轴应力", "支座反力", "节点数量", "杆件数量"},
    "frame-beam-verify": {"支座反力", "跨中挠度", "构件弯矩", "最大节点位移"},
    "truss-verify": {"节点位移", "杆件轴力", "杆件轴应力", "支座反力", "平衡误差"},
}


def test_benchmark_catalog_shape_is_stable():
    assert BENCHMARK_CATALOG["schemaVersion"] == 1
    assert isinstance(BENCHMARK_CATALOG["updatedAt"], str)
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", BENCHMARK_CATALOG["updatedAt"])
    date.fromisoformat(BENCHMARK_CATALOG["updatedAt"])
    assert len(BENCHMARK_CATALOG["cases"]) >= 30

    case_ids = [case["id"] for case in BENCHMARK_CATALOG["cases"]]
    assert len(case_ids) == len(set(case_ids))
    categories = {case["category"] for case in BENCHMARK_CATALOG["cases"]}
    assert {"beam", "frame", "truss"} <= categories

    for case in BENCHMARK_CATALOG["cases"]:
        assert {"id", "category", "title", "purpose", "payload", "expected", "tolerances", "verification"} <= set(case)
        assert case["category"] in {"beam", "frame", "truss", "frame-beam-verify", "truss-verify"}
        assert case["id"].strip()
        assert case["title"].strip()
        assert case["purpose"].strip()
        assert isinstance(case["payload"], dict)
        assert isinstance(case["expected"], dict)
        assert isinstance(case["tolerances"], dict)


@pytest.mark.parametrize("case", BENCHMARK_CATALOG["cases"], ids=lambda case: case["id"])
def test_benchmark_case_payloads_have_required_keys(case):
    assert case["payload"]
    assert case["expected"]
    assert case["tolerances"]


@pytest.mark.parametrize("case", BENCHMARK_CATALOG["cases"], ids=lambda case: case["id"])
def test_benchmark_cases_have_traceable_verification_metadata(case):
    verification = case["verification"]

    assert verification["sourceType"] in ALLOWED_VERIFICATION_SOURCE_TYPES
    assert verification["verificationLevel"] == EXPECTED_VERIFICATION_LEVEL_BY_SOURCE_TYPE[verification["sourceType"]]
    assert verification["verificationLevelLabel"] == f"{verification['verificationLevel']} 级验证"
    assert verification["verificationLevelDescription"].strip()
    assert verification["reference"].strip()
    assert verification["method"].strip()
    assert isinstance(verification["checkedMetrics"], list)
    assert verification["checkedMetrics"]

    expected_metrics = PROFESSIONAL_METRICS_BY_CATEGORY[case["category"]]
    checked_metrics = set(verification["checkedMetrics"])
    assert checked_metrics <= expected_metrics
    assert checked_metrics & expected_metrics

    if verification["sourceType"] == "internal-regression":
        assert "回归" in verification["reference"]
        assert "独立" not in verification["reference"]


def test_benchmark_catalog_contains_external_or_analytical_cross_checks():
    source_types = {case["verification"]["sourceType"] for case in BENCHMARK_CATALOG["cases"]}

    assert "textbook-analytical" in source_types
    assert "independent-stiffness-baseline" in source_types
    assert "internal-regression" in source_types
