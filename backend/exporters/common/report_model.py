from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Iterator, Mapping, Optional


@dataclass(frozen=True)
class ReportModel(Mapping[str, Any]):
    analysis_type: str
    material_name: str
    fields: Mapping[str, Any]
    sensitivity_results: Optional[Dict[str, Any]] = None
    report_images: Optional[Dict[str, str]] = None
    report_options: Optional[Dict[str, Any]] = None

    @classmethod
    def from_solution(
        cls,
        *,
        analysis_type: str,
        material_name: str,
        solution: Mapping[str, Any],
        sensitivity_results: Optional[Dict[str, Any]] = None,
        report_images: Optional[Dict[str, str]] = None,
        report_options: Optional[Dict[str, Any]] = None,
    ) -> "ReportModel":
        return cls(
            analysis_type=analysis_type,
            material_name=material_name,
            fields=dict(solution),
            sensitivity_results=sensitivity_results,
            report_images=report_images,
            report_options=report_options,
        )

    def __getitem__(self, key: str) -> Any:
        return self.fields[key]

    def __iter__(self) -> Iterator[str]:
        return iter(self.fields)

    def __len__(self) -> int:
        return len(self.fields)
