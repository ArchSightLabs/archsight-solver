from __future__ import annotations

import hashlib
import json
from datetime import datetime, timezone
from typing import Any, Dict

from backend.persistence.policy import enforce_supported_persistence_policy


FROZEN_LEGACY_TOP_LEVEL_FIELDS = ("beam", "frame", "truss", "solution", "payload")


def _stable_hash(data: Any) -> str:
    serialized = json.dumps(data, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _collect_series(response: Dict[str, Any]) -> Dict[str, Any]:
    series = {}
    for key in (
        "x_data",
        "v_data",
        "moment_data",
        "shear_data",
        "t_data",
        "q_t_data",
        "ux_data",
        "uy_data",
        "rz_data",
        "member_axial_data",
        "member_shear_data",
        "member_moment_data",
    ):
        if key in response:
            series[key] = response[key]
    return series


def attach_unified_envelope(
    response: Dict[str, Any],
    analysis_type: str,
    request_echo: Dict[str, Any],
    structure_model: Dict[str, Any],
    normalized_request: Dict[str, Any] | None = None,
    operation: str = "calculate",
) -> Dict[str, Any]:
    persistence_policy = enforce_supported_persistence_policy()
    response["success"] = True
    response["operation"] = operation
    response["version"] = "v1"
    response["request"] = request_echo
    if normalized_request is not None:
        response["normalizedRequest"] = normalized_request
    response["model"] = {
        "analysisType": analysis_type,
        "structure": structure_model,
    }
    response["results"] = {
        "summary": response.get("summary"),
        "preview": response.get("preview"),
        "diagram": response.get("diagram"),
        "nodeResults": response.get("nodeResults", []),
        "memberResults": response.get("memberResults", []),
        "memberDiagrams": response.get("memberDiagrams", []),
        "loadCaseResults": response.get("loadCaseResults", []),
        "loadCombinationResults": response.get("loadCombinationResults", []),
        "envelope": response.get("envelope", {}),
        "queryResults": response.get("queryResults", []),
        "teachingNotes": response.get("teachingNotes", {}),
        "symbolicCheck": response.get("symbolicCheck", {}),
        "secondOrder": response.get("secondOrder", {}),
        "buckling": response.get("buckling", {}),
        "nodeIds": response.get("nodeIds", []),
        "memberIds": response.get("memberIds", []),
        "series": _collect_series(response),
    }
    response["diagnostics"] = {
        "status": response.get("summary", {}).get("status"),
        "statusCode": response.get("summary", {}).get("statusCode"),
        "method": response.get("summary", {}).get("method"),
        **response.get("diagnostics", {}),
        "warnings": response.get("preview", {}).get("warnings", []),
        "infos": response.get("diagnostics", {}).get("infos", []),
        "persistence": persistence_policy,
    }
    response["errors"] = []
    legacy_fields = [key for key in FROZEN_LEGACY_TOP_LEVEL_FIELDS if key in response]
    response["meta"] = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "requestHash": _stable_hash(request_echo),
        "modelHash": _stable_hash(structure_model),
        "compat": {
            "legacyFields": legacy_fields,
        },
    }
    return response
