from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
README_PATH = ROOT / "README.md"
ROADMAP_PATH = ROOT / "docs" / "roadmap.md"

from backend.tests.benchmark_catalog import load_benchmark_catalog


BENCHMARK_CATALOG = load_benchmark_catalog()
TRUSS_CASES = [case for case in BENCHMARK_CATALOG["cases"] if case["category"] == "truss"]


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
            (ROOT / "backend" / "normalizers" / "structural_model.py").read_text(encoding="utf-8"),
            (ROOT / "backend" / "solver" / "truss" / "solver.py").read_text(encoding="utf-8"),
        ]
    )

    assert "二维平面桁架" in readme_text
    assert "二维桁架 v3" in roadmap_text
    assert "二维平面桁架" in roadmap_text

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
