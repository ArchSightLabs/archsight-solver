import json
from pathlib import Path

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


def _shared_catalog():
    root = Path(__file__).resolve().parents[2]
    return json.loads((root / "shared" / "report-figures.json").read_text(encoding="utf-8"))


def _beam_backend_items(figures):
    return [
        {
            "key": figure.image_key,
            "metric": figure.metric,
            "title": figure.title,
            "unit": figure.unit,
            "scope": figure.scope,
        }
        for figure in figures
    ]


def _truss_backend_items(figures):
    return [
        {
            "key": figure.image_key,
            "metric": figure.metric,
            "title": figure.title,
            "unit": figure.unit,
            "scope": figure.scope,
        }
        for figure in figures
    ]


def _frame_backend_items(figures):
    return [
        {
            "overlayImageKey": figure.overlay_image_key,
            "metric": figure.metric_key,
            "label": figure.label,
            "title": figure.title,
            "unit": figure.unit,
            "scope": figure.scope,
        }
        for figure in figures
    ]


def _shared_beam_items(rows):
    return [
        {
            "key": row["imageKey"],
            "metric": row["metric"],
            "title": row["title"],
            "unit": row["unit"],
            "scope": row["scope"],
        }
        for row in rows
    ]


def _shared_truss_items(rows):
    return _shared_beam_items(rows)


def _shared_frame_items(rows):
    return [
        {
            "overlayImageKey": row["overlayImageKey"],
            "metric": row["metric"],
            "label": row["label"],
            "title": row["title"],
            "unit": row["unit"],
            "scope": row["scope"],
        }
        for row in rows
    ]


def test_report_figure_catalog_matches_shared_contract():
    shared = _shared_catalog()
    assert _beam_backend_items(BEAM_REPORT_OVERLAY_FIGURES) == _shared_beam_items(shared["beam"]["overlay"])
    assert _beam_backend_items(BEAM_REPORT_TRADITIONAL_FIGURES) == _shared_beam_items(shared["beam"]["traditional"])
    assert _frame_backend_items(FRAME_REPORT_MEMBER_FIGURES) == _shared_frame_items(shared["frame"]["member"])
    assert _truss_backend_items(TRUSS_REPORT_OVERLAY_FIGURES) == _shared_truss_items(shared["truss"]["overlay"])


def test_frame_and_truss_catalog_does_not_expose_unimplemented_traditional_figures():
    shared = _shared_catalog()
    assert all("traditionalImageKey" not in row for row in shared["frame"]["member"])
    assert "traditional" not in shared["truss"]
