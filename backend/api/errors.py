from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, Mapping, Optional


class ApiError(ValueError):
    def __init__(self, message: str, *, code: str = "COMMON_INVALID_REQUEST", status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def analysis_type_for_error(data: Mapping[str, Any] | None) -> Optional[str]:
    if not data:
        return None
    value = str(data.get("analysisType", "") or "").strip().lower()
    if value in {"beam", ""}:
        return "beam" if value == "beam" else None
    if value in {"frame", "frame2d", "portal_frame"}:
        return "frame"
    if value in {"truss", "truss2d"}:
        return "truss"
    return None


def error_code_for_exception(exc: Exception, data: Mapping[str, Any] | None = None) -> str:
    if isinstance(exc, ApiError):
        return exc.code
    analysis_type = analysis_type_for_error(data)
    if analysis_type == "beam":
        return "BEAM_INVALID_REQUEST"
    if analysis_type == "frame":
        return "FRAME_INVALID_REQUEST"
    if analysis_type == "truss":
        return "TRUSS_INVALID_REQUEST"
    return "COMMON_INVALID_REQUEST"


def error_payload(
    exc: Exception | str,
    *,
    operation: str,
    data: Mapping[str, Any] | None = None,
    code: str | None = None,
) -> Dict[str, Any]:
    message = str(exc)
    resolved_code = code or (error_code_for_exception(exc, data) if isinstance(exc, Exception) else "COMMON_INVALID_REQUEST")
    payload: Dict[str, Any] = {
        "success": False,
        "operation": operation,
        "version": "v1",
        "error": {
            "code": resolved_code,
            "message": message,
        },
        "legacyError": message,
        "diagnostics": {
            "warnings": [],
            "infos": [],
        },
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
    }
    analysis_type = analysis_type_for_error(data)
    if analysis_type is not None:
        payload["analysisType"] = analysis_type
    return payload
