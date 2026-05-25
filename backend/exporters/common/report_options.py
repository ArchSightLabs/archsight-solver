from __future__ import annotations

from typing import Any, Dict, Optional


LEGACY_REPORT_OPTIONS = {
    "template": "complete",
    "figureMode": "traditional",
    "figureScope": "all",
}


def normalize_report_options(options: Optional[Dict[str, Any]]) -> Dict[str, str]:
    if not options:
        return dict(LEGACY_REPORT_OPTIONS)
    template = str(options.get("template", "standard"))
    figure_mode = str(options.get("figureMode", "overlay"))
    figure_scope = str(options.get("figureScope", "control"))
    if template not in {"standard", "complete", "brief"}:
        template = "standard"
    if figure_mode not in {"overlay", "traditional", "both"}:
        figure_mode = "overlay"
    if figure_scope not in {"control", "all", "none"}:
        figure_scope = "control"
    return {
        "template": template,
        "figureMode": figure_mode,
        "figureScope": figure_scope,
    }


def include_figures(options: Dict[str, str]) -> bool:
    return options.get("figureScope") != "none"


def include_overlay_figures(options: Dict[str, str]) -> bool:
    return include_figures(options) and options.get("figureMode") in {"overlay", "both"}


def include_traditional_figures(options: Dict[str, str]) -> bool:
    return include_figures(options) and options.get("figureMode") in {"traditional", "both"}


def include_all_result_figures(options: Dict[str, str]) -> bool:
    return include_figures(options) and options.get("figureScope") == "all"
