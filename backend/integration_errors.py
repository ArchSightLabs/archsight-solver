from __future__ import annotations

from typing import Final


INVALID_INPUT: Final = "invalid_input"
INVALID_PROJECT_DOCUMENT: Final = "invalid_project_document"
UNSUPPORTED_EXPORT_FORMAT: Final = "unsupported_export_format"
UNSUPPORTED_HOST_CHANGE: Final = "unsupported_host_change"
INVALID_HOST_SAVE_RESULT: Final = "invalid_host_save_result"
SOLVE_FAILED: Final = "solve_failed"
EXPORT_FAILED: Final = "export_failed"
UNKNOWN_INTEGRATION_TOOL: Final = "unknown_integration_tool"


class IntegrationContractError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def error_code_from_exception(error: Exception, fallback: str) -> str:
    code = getattr(error, "code", "")
    return str(code or fallback)
