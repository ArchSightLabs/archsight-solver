from datetime import date
from typing import Any, Iterable, Mapping
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
README_PATH = ROOT / "README.md"
ROADMAP_PATH = ROOT / "docs" / "roadmap.md"

from backend.api.utils import build_calculation_response
from backend.tests.benchmark_catalog import load_benchmark_catalog


BENCHMARK_CATALOG = load_benchmark_catalog()
TRUSS_CASES = [case for case in BENCHMARK_CATALOG["cases"] if case["category"] == "truss"]
ALL_TRUSS_CASES = [case for case in BENCHMARK_CATALOG["cases"] if str(case["category"]).startswith("truss")]
TRUSS_FORBIDDEN_PRIMARY_TOKENS = ("moment", "shear", "弯矩", "剪力")


def test_truss_benchmark_catalog_shape_is_stable():
    assert BENCHMARK_CATALOG["schemaVersion"] == 1
    assert isinstance(BENCHMARK_CATALOG["updatedAt"], str)
    date.fromisoformat(BENCHMARK_CATALOG["updatedAt"])
    assert len(TRUSS_CASES) >= 1

    case_ids = [case["id"] for case in TRUSS_CASES]
    assert len(case_ids) == len(set(case_ids))
    assert "truss-simple-roof" in case_ids

    for case in TRUSS_CASES:
        assert {"id", "category", "title", "purpose", "payload", "expected", "tolerances"} <= set(case)
        assert case["category"] == "truss"
        assert case["id"].strip()
        assert case["title"].strip()
        assert case["purpose"].strip()
        assert isinstance(case["payload"], dict)
        assert isinstance(case["expected"], dict)
        assert isinstance(case["tolerances"], dict)
        assert case["payload"]["analysisType"] == "truss"
        assert case["payload"]["structure"]["nodes"]
        assert case["payload"]["structure"]["members"]
        assert case["payload"]["structure"]["loads"] is not None


def test_truss_contract_document_matches_project_terms():
    readme_text = README_PATH.read_text(encoding="utf-8")
    roadmap_text = ROADMAP_PATH.read_text(encoding="utf-8")
    source_text = "\n".join(
        [
            (ROOT / "backend" / "normalizers" / "truss" / "request_normalizer.py").read_text(encoding="utf-8"),
            (ROOT / "backend" / "normalizers" / "structural_model_nodes.py").read_text(encoding="utf-8"),
            (ROOT / "backend" / "normalizers" / "structural_model_members.py").read_text(encoding="utf-8"),
            (ROOT / "backend" / "normalizers" / "structural_model_loads.py").read_text(encoding="utf-8"),
            (ROOT / "backend" / "solver" / "truss" / "solver.py").read_text(encoding="utf-8"),
        ]
    )

    assert "二维平面桁架" in readme_text
    assert "二维平面桁架" in roadmap_text
    assert "桁架计算书不得引入弯矩作为主指标" in roadmap_text

    expected_signatures = [
        "桁架至少需要 2 个节点",
        "桁架至少需要 1 个杆件",
        "节点 ID 重复",
        "构件 ID 重复",
        "的起止节点无效",
        "节点荷载引用了不存在的节点",
        "桁架当前仅支持节点荷载",
        "长度必须大于 0",
        "桁架约束条件不足，系统无稳定自由度可求解",
        "桁架刚度矩阵奇异，请检查支座与杆件连接",
    ]

    for signature in expected_signatures:
        assert signature in source_text


def test_truss_benchmark_primary_metrics_exclude_bending_and_shear():
    assert ALL_TRUSS_CASES
    for case in ALL_TRUSS_CASES:
        primary_metric_tokens = [
            *[str(key) for key in _mapping_keys(case.get("expected", {}))],
            *[str(key) for key in _mapping_keys(case.get("tolerances", {}))],
            *[str(metric) for metric in case.get("verification", {}).get("checkedMetrics", [])],
        ]
        bad_tokens = [
            token
            for token in primary_metric_tokens
            if any(forbidden in token.lower() for forbidden in TRUSS_FORBIDDEN_PRIMARY_TOKENS)
        ]
        assert bad_tokens == [], f"{case['id']} 不应把弯矩/剪力作为桁架主校核指标: {bad_tokens}"


def test_truss_api_response_excludes_bending_and_shear_primary_series():
    case = next(case for case in ALL_TRUSS_CASES if case["id"] == "truss-simple-roof")

    response = build_calculation_response(dict(case["payload"]), operation="contract")
    summary = response["summary"]
    series = response["results"]["series"]
    member_result = response["memberResults"][0]

    assert "maxMomentKnM" not in summary
    assert "maxShearKn" not in summary
    assert "member_moment_data" not in series
    assert "member_shear_data" not in series
    assert "momentStartKnM" not in member_result
    assert "shearStartKn" not in member_result
    assert set(series) == {"ux_data", "uy_data", "member_axial_data"}


def test_truss_frontend_display_sections_exclude_bending_and_shear_primary_text():
    source = (ROOT / "frontend" / "src" / "components" / "workbench-result-metrics.ts").read_text(encoding="utf-8")
    truss_options = _extract_between(source, "function trussDataCurveOptions", "function frameDataCurveOptions")
    truss_summary = _extract_between(source, "function trussSummaryRows", "function frameSummaryRows")

    for section in (truss_options, truss_summary):
        lowered = section.lower()
        assert "moment" not in lowered
        assert "shear" not in lowered
        assert "弯矩" not in section
        assert "剪力" not in section


def _mapping_keys(value: Any) -> Iterable[str]:
    if isinstance(value, Mapping):
        return value.keys()
    return []


def _extract_between(source: str, start: str, end: str) -> str:
    start_index = source.index(start)
    end_index = source.index(end, start_index + len(start))
    return source[start_index:end_index]
