from __future__ import annotations

from pathlib import Path

from backend.benchmarks.catalog import load_benchmark_catalog
from backend.benchmarks.catalog_summary import build_catalog_summary


ROOT = Path(__file__).resolve().parents[2]
SUMMARY_PATH = ROOT / "docs" / "verification" / "benchmark-catalog-summary.md"


def test_benchmark_catalog_summary_contains_every_case_and_template_mapping():
    catalog = load_benchmark_catalog()
    summary = build_catalog_summary()

    assert "# Benchmark 算例目录摘要" in summary
    assert "验证等级" in summary
    assert "A 级验证" in summary
    assert "## 模板验证映射" in summary
    for case in catalog["cases"]:
        assert f"`{case['id']}`" in summary
    assert "`simple-span-uniform`" in summary
    assert "`truss-simple-roof`" in summary


def test_benchmark_catalog_summary_file_is_generated_from_source():
    assert SUMMARY_PATH.exists()
    assert SUMMARY_PATH.read_text(encoding="utf-8") == build_catalog_summary()
