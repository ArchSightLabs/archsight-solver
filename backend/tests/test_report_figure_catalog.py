from backend.exporters.common.report_figure_catalog import (
    BEAM_REPORT_OVERLAY_FIGURES,
    BEAM_REPORT_TRADITIONAL_FIGURES,
    FRAME_REPORT_MEMBER_FIGURES,
    TRUSS_REPORT_OVERLAY_FIGURES,
    report_figures_for_scope,
)


def test_report_figure_catalog_keeps_engineering_order():
    assert [figure.metric for figure in BEAM_REPORT_OVERLAY_FIGURES] == ["moment", "shear", "deflection"]
    assert [figure.metric for figure in BEAM_REPORT_TRADITIONAL_FIGURES] == ["deflection", "moment", "shear"]
    assert [figure.metric_key for figure in FRAME_REPORT_MEMBER_FIGURES] == ["momentKnM", "shearKn", "deflectionMm", "axialKn"]
    assert [figure.metric for figure in TRUSS_REPORT_OVERLAY_FIGURES] == ["axial", "displacement"]


def test_report_figure_catalog_control_scope_only_keeps_control_figures():
    assert [figure.metric_key for figure in report_figures_for_scope(FRAME_REPORT_MEMBER_FIGURES, include_all=False)] == ["momentKnM"]
    assert [figure.metric for figure in report_figures_for_scope(BEAM_REPORT_OVERLAY_FIGURES, include_all=False)] == ["moment"]
