from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from backend.capabilities.solver_tools import TOOL_HANDLERS
from backend.integration_errors import UNKNOWN_INTEGRATION_TOOL
from backend.project_documents import (
    ASMS_JSON_SCHEMA_VERSION,
    PROJECT_FILE_SCHEMA_VERSION,
    create_default_project_document,
)


INTEGRATION_API_VERSION = "2026-07-04"
PROJECT_DOCUMENT_CONTRACT = {
    "projectFileSchemaVersion": PROJECT_FILE_SCHEMA_VERSION,
    "asmsJsonSchemaVersion": ASMS_JSON_SCHEMA_VERSION,
}


def create_project_document(title: str) -> dict[str, Any]:
    return create_default_project_document(title)


def available_integration_tools() -> list[str]:
    return sorted(TOOL_HANDLERS)


def run_integration_tool(name: str, arguments: Mapping[str, Any]) -> dict[str, Any]:
    handler = TOOL_HANDLERS.get(name)
    if handler is None:
        return {
            "capabilityId": f"solver.{name}",
            "capabilityVersion": INTEGRATION_API_VERSION,
            "status": "invalid_tool",
            "inputValidated": False,
            "errorCode": UNKNOWN_INTEGRATION_TOOL,
            "warnings": [f"未知集成工具: {name}"],
        }
    return handler(arguments)
