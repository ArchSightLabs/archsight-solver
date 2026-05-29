from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Dict, Literal, Tuple


AnalysisType = Literal["beam", "frame", "truss"]


@dataclass(frozen=True)
class ResultMetricSpec:
    value: str
    label: str
    unit: str
    unit_label: str
    description: str


@dataclass(frozen=True)
class ResultMetricGroup:
    default_sensitivity_metric: str
    summary_metrics: Tuple[ResultMetricSpec, ...]
    sensitivity_responses: Tuple[ResultMetricSpec, ...]


_RESULT_METRICS_PATH = Path(__file__).resolve().parents[2] / "shared" / "result-metrics.json"


def _metric_spec(row: dict) -> ResultMetricSpec:
    return ResultMetricSpec(
        value=str(row["value"]),
        label=str(row["label"]),
        unit=str(row.get("unit", "")),
        unit_label=str(row.get("unitLabel", "")),
        description=str(row.get("description", "")),
    )


@lru_cache(maxsize=1)
def result_metric_catalog() -> Dict[str, ResultMetricGroup]:
    payload = json.loads(_RESULT_METRICS_PATH.read_text(encoding="utf-8"))
    return {
        str(analysis_type): ResultMetricGroup(
            default_sensitivity_metric=str(group["defaultSensitivityMetric"]),
            summary_metrics=tuple(_metric_spec(row) for row in group.get("summaryMetrics", [])),
            sensitivity_responses=tuple(_metric_spec(row) for row in group.get("sensitivityResponses", [])),
        )
        for analysis_type, group in payload.items()
    }


def default_sensitivity_metric(analysis_type: AnalysisType) -> str:
    return result_metric_catalog()[analysis_type].default_sensitivity_metric


def sensitivity_response_meta(analysis_type: AnalysisType) -> Dict[str, tuple[str, str]]:
    return {
        metric.value: (metric.label, metric.unit_label)
        for metric in result_metric_catalog()[analysis_type].sensitivity_responses
    }


def result_metric_label(analysis_type: AnalysisType, metric_value: str) -> str:
    group = result_metric_catalog()[analysis_type]
    for metric in (*group.summary_metrics, *group.sensitivity_responses):
        if metric.value == metric_value:
            return metric.label
    return metric_value
