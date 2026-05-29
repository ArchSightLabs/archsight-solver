from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, Literal, Tuple


ReportOptionGroup = Literal["templates", "figureModes", "figureScopes"]

_REPORT_OPTIONS_PATH = Path(__file__).resolve().parents[2] / "shared" / "report-options.json"


@lru_cache(maxsize=1)
def report_options_catalog() -> dict:
    return json.loads(_REPORT_OPTIONS_PATH.read_text(encoding="utf-8"))


def default_report_options() -> Dict[str, str]:
    return {key: str(value) for key, value in report_options_catalog()["default"].items()}


def legacy_report_options() -> Dict[str, str]:
    return {key: str(value) for key, value in report_options_catalog()["legacyDefault"].items()}


def report_option_values(group: ReportOptionGroup) -> Tuple[str, ...]:
    return tuple(str(item["value"]) for item in report_options_catalog()[group])
