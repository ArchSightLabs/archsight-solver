from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal, TypeVar

ReportFigureScope = Literal["control", "all"]
TReportFigure = TypeVar("TReportFigure")
_REPORT_FIGURES_PATH = Path(__file__).resolve().parents[3] / "shared" / "report-figures.json"


@dataclass(frozen=True)
class BeamReportFigure:
    image_key: str
    metric: Literal["moment", "shear", "deflection"]
    title: str
    series_label: str
    unit: str
    scope: ReportFigureScope


@dataclass(frozen=True)
class FrameMemberReportFigure:
    overlay_image_key: str
    metric_key: Literal["momentKnM", "shearKn", "deflectionMm", "axialKn"]
    label: str
    title: str
    unit: str
    scope: ReportFigureScope


@dataclass(frozen=True)
class TrussReportFigure:
    image_key: str
    metric: Literal["axial", "displacement"]
    title: str
    series_label: str
    unit: str
    scope: ReportFigureScope


@lru_cache(maxsize=1)
def _report_figure_catalog() -> dict:
    return json.loads(_REPORT_FIGURES_PATH.read_text(encoding="utf-8"))


def _beam_figure(row: dict) -> BeamReportFigure:
    return BeamReportFigure(
        image_key=str(row["imageKey"]),
        metric=str(row["metric"]),  # type: ignore[arg-type]
        title=str(row["title"]),
        series_label=str(row["seriesLabel"]),
        unit=str(row["unit"]),
        scope=str(row["scope"]),  # type: ignore[arg-type]
    )


def _frame_member_figure(row: dict) -> FrameMemberReportFigure:
    return FrameMemberReportFigure(
        overlay_image_key=str(row["overlayImageKey"]),
        metric_key=str(row["metric"]),  # type: ignore[arg-type]
        label=str(row["label"]),
        title=str(row["title"]),
        unit=str(row["unit"]),
        scope=str(row["scope"]),  # type: ignore[arg-type]
    )


def _truss_figure(row: dict) -> TrussReportFigure:
    return TrussReportFigure(
        image_key=str(row["imageKey"]),
        metric=str(row["metric"]),  # type: ignore[arg-type]
        title=str(row["title"]),
        series_label=str(row["seriesLabel"]),
        unit=str(row["unit"]),
        scope=str(row["scope"]),  # type: ignore[arg-type]
    )


BEAM_REPORT_OVERLAY_FIGURES: tuple[BeamReportFigure, ...] = tuple(_beam_figure(row) for row in _report_figure_catalog()["beam"]["overlay"])
BEAM_REPORT_TRADITIONAL_FIGURES: tuple[BeamReportFigure, ...] = tuple(_beam_figure(row) for row in _report_figure_catalog()["beam"]["traditional"])
FRAME_REPORT_MEMBER_FIGURES: tuple[FrameMemberReportFigure, ...] = tuple(_frame_member_figure(row) for row in _report_figure_catalog()["frame"]["member"])
TRUSS_REPORT_OVERLAY_FIGURES: tuple[TrussReportFigure, ...] = tuple(_truss_figure(row) for row in _report_figure_catalog()["truss"]["overlay"])


def report_figures_for_scope(figures: tuple[TReportFigure, ...], include_all: bool) -> tuple[TReportFigure, ...]:
    if include_all:
        return figures
    return tuple(figure for figure in figures if getattr(figure, "scope", "all") == "control")
