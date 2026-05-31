from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, Literal, Tuple


AnalysisType = Literal["beam", "truss", "frame"]


@dataclass(frozen=True)
class SupportSpec:
    value: str
    label: str
    constraints: Tuple[str, ...]
    released: Tuple[str, ...]
    detail: str
    note: str


_SUPPORTS_PATH = Path(__file__).resolve().parents[2] / "shared" / "supports.json"


@lru_cache(maxsize=1)
def _support_payload() -> dict:
    return json.loads(_SUPPORTS_PATH.read_text(encoding="utf-8"))


def support_specs(analysis_type: AnalysisType) -> Tuple[SupportSpec, ...]:
    rows = _support_payload()[analysis_type]
    return tuple(
        SupportSpec(
            value=str(row["value"]),
            label=str(row["label"]),
            constraints=tuple(str(item) for item in row.get("constraints", [])),
            released=tuple(str(item) for item in row.get("released", [])),
            detail=str(row.get("detail", "")),
            note=str(row.get("note", "")),
        )
        for row in rows
    )


def support_labels(analysis_type: AnalysisType) -> Dict[str, str]:
    return {spec.value: spec.label for spec in support_specs(analysis_type)}


def support_constraint_dof_map() -> Dict[str, Dict[str, list[str]]]:
    return {
        analysis_type: {spec.value: list(spec.constraints) for spec in support_specs(analysis_type)}  # type: ignore[arg-type]
        for analysis_type in ("beam", "truss", "frame")
    }


def support_released_dof_map() -> Dict[str, Dict[str, list[str]]]:
    return {
        analysis_type: {spec.value: list(spec.released) for spec in support_specs(analysis_type)}  # type: ignore[arg-type]
        for analysis_type in ("beam", "truss", "frame")
    }


def support_constraint_dofs(analysis_type: AnalysisType, support_type: str) -> list[str]:
    normalized = str(support_type or "free").strip().lower()
    return list(support_constraint_dof_map()[analysis_type].get(normalized, []))


def support_released_dofs(analysis_type: AnalysisType, support_type: str) -> list[str]:
    normalized = str(support_type or "free").strip().lower()
    return list(support_released_dof_map()[analysis_type].get(normalized, []))


def support_label(analysis_type: AnalysisType, support_type: str) -> str:
    normalized = str(support_type or "free").strip().lower()
    return support_labels(analysis_type).get(normalized, normalized)


def support_system_note(analysis_type: AnalysisType) -> str:
    return str(_support_payload().get("notes", {}).get(analysis_type, ""))
