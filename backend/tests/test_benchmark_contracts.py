import os
import sys
import re
from collections import Counter
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
    "frame-beam-verify": {"支座反力", "跨中挠度", "构件弯矩", "构件轴力", "最大节点位移", "节点位移", "节点转角", "坐标变换"},
    "truss-verify": {"节点位移", "杆件轴力", "杆件轴应力", "支座反力", "平衡误差"},
}


def test_benchmark_catalog_shape_is_stable():
    assert BENCHMARK_CATALOG["schemaVersion"] == 1
    assert isinstance(BENCHMARK_CATALOG["updatedAt"], str)
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", BENCHMARK_CATALOG["updatedAt"])
    date.fromisoformat(BENCHMARK_CATALOG["updatedAt"])
    assert len(BENCHMARK_CATALOG["cases"]) >= 60

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


def test_benchmark_catalog_keeps_independently_verifiable_evidence_growing():
    levels = Counter(case["verification"]["verificationLevel"] for case in BENCHMARK_CATALOG["cases"])

    assert levels["A"] + levels["B"] + levels["C"] >= 49
    assert levels["A"] >= 22
    assert levels["B"] >= 26


def test_benchmark_catalog_has_detailed_analytical_checks_for_frame_and_truss():
    analytical_by_category = Counter(
        case["category"]
        for case in BENCHMARK_CATALOG["cases"]
        if case["verification"]["verificationLevel"] == "A"
    )

    assert analytical_by_category["frame-beam-verify"] >= 7
    assert analytical_by_category["truss-verify"] >= 2


def test_all_analytical_beam_cases_cover_force_and_displacement_metrics():
    required_expected = {
        "maxDeflectionMm",
        "maxDeflectionXM",
        "maxMomentKnM",
        "maxShearKn",
        "supportReactionMagnitudesKn",
    }
    required_checked_metrics = {"最大挠度", "峰值位置", "构件弯矩", "剪力", "支座反力"}
    analytical_beams = [
        case
        for case in BENCHMARK_CATALOG["cases"]
        if case["category"] == "beam" and case["verification"]["verificationLevel"] == "A"
    ]

    assert len(analytical_beams) >= 10
    for case in analytical_beams:
        assert required_expected <= set(case["expected"]), case["id"]
        assert required_checked_metrics <= set(case["verification"]["checkedMetrics"]), case["id"]


def test_all_analytical_frame_beam_cases_cover_force_and_deformation_metrics():
    analytical_frame_beams = [
        case
        for case in BENCHMARK_CATALOG["cases"]
        if case["category"] == "frame-beam-verify"
        and case["verification"]["verificationLevel"] == "A"
    ]

    assert len(analytical_frame_beams) >= 7
    for case in analytical_frame_beams:
        expected = case["expected"]
        checked_metrics = set(case["verification"]["checkedMetrics"])

        assert {"statusCode", "maxMomentKnM", "supportReactions"} <= set(expected), case["id"]
        assert expected["supportReactions"], case["id"]
        assert "nodeDisplacements" in expected or "midSpanDisplacementMm" in expected, case["id"]
        assert {"支座反力", "构件弯矩"} <= checked_metrics, case["id"]
        assert checked_metrics & {"跨中挠度", "节点位移", "节点转角"}, case["id"]
        if any("reactionFxKn" in r for r in expected["supportReactions"]):
            assert "坐标变换" in checked_metrics, case["id"]
        if "maxAxialForceKn" in expected:
            assert "构件轴力" in checked_metrics, case["id"]


def test_all_analytical_truss_cases_cover_detailed_response_metrics():
    required_expected = {
        "statusCode",
        "maxDisplacementMm",
        "maxAxialForceKn",
        "nodeDisplacements",
        "memberAxialForces",
        "supportReactions",
    }
    required_checked_metrics = {"节点位移", "杆件轴力", "支座反力"}
    analytical_trusses = [
        case
        for case in BENCHMARK_CATALOG["cases"]
        if case["category"] == "truss-verify"
        and case["verification"]["verificationLevel"] == "A"
    ]

    assert len(analytical_trusses) >= 2
    for case in analytical_trusses:
        assert required_expected <= set(case["expected"]), case["id"]
        assert case["expected"]["nodeDisplacements"], case["id"]
        assert case["expected"]["memberAxialForces"], case["id"]
        assert case["expected"]["supportReactions"], case["id"]
        assert required_checked_metrics <= set(case["verification"]["checkedMetrics"]), case["id"]


def _find_case(case_id: str):
    for case in BENCHMARK_CATALOG["cases"]:
        if case["id"] == case_id:
            return case
    raise AssertionError(f"未找到 benchmark case: {case_id}")


def test_bm_010_to_012_remain_focused_on_declared_metrics():
    bm010 = _find_case("BM-010")
    bm011 = _find_case("BM-011")
    bm012 = _find_case("BM-012")

    assert bm010["category"] == "frame-beam-verify"
    assert bm011["category"] == "frame-beam-verify"
    assert bm012["category"] == "truss-verify"

    assert bm010["expected"]["maxMomentKnM"] >= 0
    assert bm011["expected"]["maxAxialForceKn"] >= 0
    assert bm012["expected"]["maxAxialForceKn"] >= 0

    assert len(bm010["expected"]["supportReactions"]) >= 1
    assert len(bm011["expected"]["supportReactions"]) >= 1
    assert bm012["expected"]["maxDisplacementMm"] >= 0
    assert bm012["expected"]["maxAxialForceKn"] >= 0
    assert len(bm012["verification"]["checkedMetrics"]) >= 3
    assert "节点位移" in set(bm012["verification"]["checkedMetrics"])
    assert "杆件轴力" in set(bm012["verification"]["checkedMetrics"])
    assert "支座反力" in set(bm012["verification"]["checkedMetrics"])
    assert len(bm010["expected"]["supportReactions"]) == 1
    assert bm010["expected"]["supportReactions"][0]["reactionFxKn"] != 0
    assert bm011["expected"]["supportReactions"][0]["reactionFxKn"] != 0
    assert bm010["expected"]["supportReactions"][0]["reactionMzKnM"] != 0
    assert bm011["expected"]["supportReactions"][0]["reactionMzKnM"] == 0
    assert "rotationDeg" in bm011["expected"]["nodeDisplacements"][0]
    assert "rotationDeg" in bm010["expected"]["nodeDisplacements"][0]

    assert "坐标变换" in set(bm010["verification"]["checkedMetrics"])
    assert "坐标变换" in set(bm011["verification"]["checkedMetrics"])
    assert "构件轴力" in set(bm011["verification"]["checkedMetrics"])
    assert "节点位移" in set(bm011["verification"]["checkedMetrics"])
