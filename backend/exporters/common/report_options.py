from __future__ import annotations

from typing import Any, Dict, Optional

from backend.common.report_options_catalog import default_report_options, legacy_report_options, report_option_values

DEFAULT_REPORT_OPTIONS = default_report_options()
LEGACY_REPORT_OPTIONS = legacy_report_options()
VALID_REPORT_TEMPLATES = set(report_option_values("templates"))
VALID_REPORT_FIGURE_MODES = set(report_option_values("figureModes"))


def normalize_report_options(options: Optional[Dict[str, Any]]) -> Dict[str, str]:
    if options is None:
        return dict(DEFAULT_REPORT_OPTIONS)
    template = str(options.get("template", DEFAULT_REPORT_OPTIONS["template"]))
    figure_mode = str(options.get("figureMode", DEFAULT_REPORT_OPTIONS["figureMode"]))
    # figureScope is kept as a compatibility field, but the product now has one
    # fixed scope: structure preview plus all core engineering diagrams.
    figure_scope = DEFAULT_REPORT_OPTIONS["figureScope"]
    if template not in VALID_REPORT_TEMPLATES:
        template = DEFAULT_REPORT_OPTIONS["template"]
    if figure_mode == "traditional":
        figure_mode = "overlay"
    if figure_mode not in VALID_REPORT_FIGURE_MODES:
        figure_mode = DEFAULT_REPORT_OPTIONS["figureMode"]
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
