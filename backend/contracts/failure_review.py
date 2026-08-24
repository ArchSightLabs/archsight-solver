from __future__ import annotations

from collections.abc import Mapping, Sequence
from copy import deepcopy
from typing import Any, Dict, List


FAILURE_REVIEW_MATERIAL_TYPE = "failure-review"
FAILURE_REVIEW_ALLOWED_KEYS = {
    "format",
    "materialType",
    "inputId",
    "completedStages",
    "stableErrorCode",
    "objectRefs",
    "diagnostics",
    "hashes",
    "suggestedActions",
}
_SERVER_EVIDENCE_KEY = "nonlinearPartialEvidence"
FAILURE_REVIEW_FORBIDDEN_KEYS = {
    "analysisType",
    "payload",
    "request",
    "model",
    "solution",
    "summary",
    "results",
    "preview",
    "diagram",
    "envelope",
    "governingEnvelope",
    "criticalPoints",
    "reviewPoints",
    "calculationSnapshot",
    "calculationTrace",
    "nodeResults",
    "memberResults",
    "memberDiagrams",
    "loadCaseResults",
    "loadCombinationResults",
    "secondOrder",
    "buckling",
    "x_data",
    "v_data",
    "ux_data",
    "uy_data",
    "rz_data",
    "member_axial_data",
    "member_shear_data",
    "member_moment_data",
}


def normalize_failure_review_payload(
    data: Mapping[str, Any],
    *,
    material_type: str = FAILURE_REVIEW_MATERIAL_TYPE,
    allow_server_evidence: bool = False,
) -> Dict[str, Any]:
    if not isinstance(data, Mapping):
        raise ValueError("失败审查材料必须是对象")

    allowed_keys = set(FAILURE_REVIEW_ALLOWED_KEYS)
    if allow_server_evidence:
        allowed_keys.add(_SERVER_EVIDENCE_KEY)
    unknown_keys = sorted(set(data.keys()) - allowed_keys)
    if unknown_keys:
        raise ValueError(f"失败审查材料不允许这些字段: {', '.join(unknown_keys)}")

    provided_type = str(data.get("materialType") or material_type).strip()
    if provided_type != material_type:
        raise ValueError(f"不支持的 materialType: {provided_type}")

    forbidden_keys = sorted(key for key in FAILURE_REVIEW_FORBIDDEN_KEYS if key in data)
    if forbidden_keys:
        raise ValueError(f"失败审查材料不允许这些结果字段: {', '.join(forbidden_keys)}")

    input_id = _require_text(data.get("inputId"), "inputId")
    completed_stages = _normalize_text_list(data.get("completedStages"), "completedStages", require_nonempty=True)
    stable_error_code = _require_text(data.get("stableErrorCode"), "stableErrorCode")

    normalized = {
        "materialType": material_type,
        "format": _normalize_format(data.get("format")),
        "inputId": input_id,
        "completedStages": completed_stages,
        "stableErrorCode": stable_error_code,
        "objectRefs": _normalize_object_refs(data.get("objectRefs")),
        "diagnostics": _normalize_diagnostics(data.get("diagnostics")),
        "hashes": _normalize_hashes(data.get("hashes")),
        "suggestedActions": _normalize_text_list(data.get("suggestedActions"), "suggestedActions"),
    }
    if allow_server_evidence and data.get(_SERVER_EVIDENCE_KEY) is not None:
        evidence = data.get(_SERVER_EVIDENCE_KEY)
        if not isinstance(evidence, Mapping):
            raise ValueError(f"{_SERVER_EVIDENCE_KEY} 必须是服务端证据对象")
        normalized[_SERVER_EVIDENCE_KEY] = deepcopy(dict(evidence))
    return normalized


def _normalize_format(value: Any) -> str:
    format_type = str(value or "docx").strip().lower()
    if format_type not in {"docx", "xlsx"}:
        raise ValueError(f"不支持的导出格式: {format_type}")
    return format_type


def _require_text(value: Any, field_name: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{field_name} 不能为空")
    return text


def _normalize_text_list(value: Any, field_name: str, *, require_nonempty: bool = False) -> List[str]:
    if value is None:
        items: List[str] = []
    elif isinstance(value, str):
        items = [value.strip()] if value.strip() else []
    elif isinstance(value, Sequence):
        items = [str(item).strip() for item in value if str(item).strip()]
    else:
        raise ValueError(f"{field_name} 必须是字符串或字符串数组")
    if require_nonempty and not items:
        raise ValueError(f"{field_name} 不能为空")
    return items


def _normalize_object_refs(value: Any) -> List[Dict[str, str]]:
    if value is None:
        return []
    if isinstance(value, Mapping):
        value = [value]
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise ValueError("objectRefs 必须是对象数组")
    refs: List[Dict[str, str]] = []
    for item in value:
        if not isinstance(item, Mapping):
            raise ValueError("objectRefs 中的每一项都必须是对象")
        kind = _require_text(item.get("kind"), "objectRefs.kind")
        object_id = _require_text(item.get("id"), "objectRefs.id")
        refs.append({"kind": kind, "id": object_id})
    return refs


def _normalize_diagnostics(value: Any) -> List[Dict[str, str]]:
    if value is None:
        return []
    if isinstance(value, Mapping):
        value = [value]
    if not isinstance(value, Sequence) or isinstance(value, (str, bytes)):
        raise ValueError("diagnostics 必须是对象数组")
    diagnostics: List[Dict[str, str]] = []
    for item in value:
        if not isinstance(item, Mapping):
            raise ValueError("diagnostics 中的每一项都必须是对象")
        diagnostics.append(
            {
                "code": _require_text(item.get("code"), "diagnostics.code"),
                "title": _require_text(item.get("title"), "diagnostics.title"),
                "detail": _require_text(item.get("detail"), "diagnostics.detail"),
                "severity": str(item.get("severity") or "error").strip().lower(),
            }
        )
    return diagnostics


def _normalize_hashes(value: Any) -> List[Dict[str, str]]:
    if value is None:
        return []
    if not isinstance(value, Mapping):
        raise ValueError("hashes 必须是对象")
    rows = []
    for key, hash_value in value.items():
        if str(hash_value or "").strip():
            rows.append({"name": str(key), "value": str(hash_value).strip()})
    return rows
