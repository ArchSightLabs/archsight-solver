from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, TypeVar

ReportFigureScope = Literal["control", "all"]
TReportFigure = TypeVar("TReportFigure")


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
    traditional_image_key: str
    metric_key: Literal["momentKnM", "shearKn", "deflectionMm", "axialKn"]
    label: str
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


BEAM_REPORT_OVERLAY_FIGURES: tuple[BeamReportFigure, ...] = (
    BeamReportFigure("beam.overlay.moment", "moment", "控制弯矩叠加图", "弯矩", "kN·m", "control"),
    BeamReportFigure("beam.overlay.shear", "shear", "剪力叠加图", "剪力", "kN", "all"),
    BeamReportFigure("beam.overlay.deflection", "deflection", "挠度叠加图", "挠度", "mm", "all"),
)

BEAM_REPORT_TRADITIONAL_FIGURES: tuple[BeamReportFigure, ...] = (
    BeamReportFigure("beam.deflection", "deflection", "挠度曲线", "挠度", "mm", "all"),
    BeamReportFigure("beam.moment", "moment", "弯矩图", "弯矩", "kN·m", "control"),
    BeamReportFigure("beam.shear", "shear", "剪力图", "剪力", "kN", "all"),
)

FRAME_REPORT_MEMBER_FIGURES: tuple[FrameMemberReportFigure, ...] = (
    FrameMemberReportFigure("frame.overlay.moment", "frame.moment", "momentKnM", "弯矩", "kN·m", "control"),
    FrameMemberReportFigure("frame.overlay.shear", "frame.shear", "shearKn", "剪力", "kN", "all"),
    FrameMemberReportFigure("frame.overlay.memberDeflection", "frame.memberDeflection", "deflectionMm", "局部 y 向挠度", "mm", "all"),
    FrameMemberReportFigure("frame.overlay.axial", "frame.axial", "axialKn", "轴力", "kN", "all"),
)

TRUSS_REPORT_OVERLAY_FIGURES: tuple[TrussReportFigure, ...] = (
    TrussReportFigure("truss.overlay.axial", "axial", "杆件轴力叠加图", "杆件轴力", "kN", "control"),
    TrussReportFigure("truss.overlay.displacement", "displacement", "节点位移叠加图", "节点位移", "mm", "all"),
)

TRUSS_REPORT_TRADITIONAL_FIGURES: tuple[TrussReportFigure, ...] = (
    TrussReportFigure("truss.axial", "axial", "杆件轴力图", "杆件轴力", "kN", "control"),
)


def report_figures_for_scope(figures: tuple[TReportFigure, ...], include_all: bool) -> tuple[TReportFigure, ...]:
    if include_all:
        return figures
    return tuple(figure for figure in figures if getattr(figure, "scope", "all") == "control")
