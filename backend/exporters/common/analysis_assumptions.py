from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, Iterable, Literal, Tuple


AnalysisType = Literal["beam", "truss", "frame"]


@dataclass(frozen=True)
class AnalysisAssumptionRow:
    label: str
    value: str


_ASSUMPTIONS_PATH = Path(__file__).resolve().parents[3] / "shared" / "analysis-assumptions.json"


@lru_cache(maxsize=1)
def _load_assumptions() -> Dict[str, Tuple[AnalysisAssumptionRow, ...]]:
    payload = json.loads(_ASSUMPTIONS_PATH.read_text(encoding="utf-8"))
    assumptions: Dict[str, Tuple[AnalysisAssumptionRow, ...]] = {}
    for analysis_type, rows in payload.items():
        assumptions[str(analysis_type)] = tuple(
            AnalysisAssumptionRow(label=str(row["label"]), value=str(row["value"]))
            for row in rows
        )
    return assumptions


def analysis_assumption_rows(analysis_type: AnalysisType) -> Tuple[AnalysisAssumptionRow, ...]:
    return _load_assumptions()[analysis_type]


def analysis_assumption_table_rows(analysis_type: AnalysisType) -> Iterable[Tuple[str, str]]:
    for row in analysis_assumption_rows(analysis_type):
        yield row.label, row.value
