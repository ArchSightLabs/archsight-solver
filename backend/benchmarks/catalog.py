from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping

ROOT = Path(__file__).resolve().parents[2]
BENCHMARK_CATALOG_PATH = Path(__file__).resolve().with_name("benchmark_cases.json")
LEGACY_LOCAL_SPEC_CATALOG_PATH = ROOT / "specs" / "004-open-source-structure-solver" / "contracts" / "benchmark-cases.json"


def load_benchmark_catalog() -> Dict[str, Any]:
    catalog_path = BENCHMARK_CATALOG_PATH if BENCHMARK_CATALOG_PATH.exists() else LEGACY_LOCAL_SPEC_CATALOG_PATH
    with catalog_path.open("r", encoding="utf-8") as f:
        return json.load(f)


def iter_benchmark_cases(category: str | None = None) -> Iterable[Mapping[str, Any]]:
    for case in load_benchmark_catalog()["cases"]:
        if category is None or case.get("category") == category:
            yield case


def find_benchmark_case(case_id: str) -> Mapping[str, Any] | None:
    for case in iter_benchmark_cases():
        if case.get("id") == case_id:
            return case
    return None
