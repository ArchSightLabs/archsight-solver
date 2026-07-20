"""HTTP compatibility imports for the shared diagnostic contract."""

from backend.contracts.diagnostics import (
    ApiError,
    analysis_type_for_error,
    diagnostic_issues_for_message,
    error_code_for_exception,
    error_payload,
)

__all__ = [
    "ApiError",
    "analysis_type_for_error",
    "diagnostic_issues_for_message",
    "error_code_for_exception",
    "error_payload",
]
