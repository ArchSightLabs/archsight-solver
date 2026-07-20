"""API v1 adapter for the shared calculation application service."""

from typing import Any, Dict, Mapping

from backend.application.calculation import build_calculation_result
from backend.contracts.calculation_response import build_api_v1_response


def build_calculation_response(data: Mapping[str, Any], operation: str = "calculate") -> Dict[str, Any]:
    return build_api_v1_response(build_calculation_result(data, operation=operation))


__all__ = ["build_calculation_response"]
