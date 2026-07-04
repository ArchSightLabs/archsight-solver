from __future__ import annotations

import copy
import base64
import uuid
from datetime import datetime, timezone
from typing import Any, Mapping

from backend.api.calculation_response import build_calculation_response
from backend.api.analysis_types import get_material_name
from backend.project_documents import validate_project_document
from backend.services.export_service import build_report_model, export_report


PROJECT_HOST_PROTOCOL_VERSION = "1.0.0"
SUPPORTED_EXPORT_FORMATS = {"docx", "xlsx"}
DEFAULT_RESULT_SOURCE = {
    "source": "primary",
    "id": "__primary__",
    "label": "主结果",
    "description": "基本荷载",
}

SIMPLE_SPAN_UNIFORM_BEAM_STATE: dict[str, Any] = {
    "projectName": "简支梁均布荷载",
    "materialId": "q345",
    "beamType": "simply_supported",
    "loadType": "uniform",
    "uniformLoadEnabled": True,
    "linearLoadEnabled": False,
    "linearLoads": [],
    "pointLoads": [],
    "q": 12,
    "uniformLoadStartRatio": 0,
    "uniformLoadEndRatio": 1,
    "pointLoad": 40,
    "pointLoadPositionRatio": 0.5,
    "distributedLoadStart": 8,
    "distributedLoadEnd": 14,
    "distributedLoadStartRatio": 0,
    "distributedLoadEndRatio": 1,
    "freq": 1.2,
    "duration": 5,
    "spans": [{"id": "(1)", "length": 6, "E": 210, "I": 8000}],
    "supports": [
        {"id": "S1", "x": 0, "type": "pinned"},
        {"id": "S2", "x": 6, "type": "roller"},
    ],
}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_export_format(format_type: str) -> str:
    normalized = str(format_type or "docx").strip().lower()
    if normalized not in SUPPORTED_EXPORT_FORMATS:
        raise ValueError(f"不支持的导出格式: {format_type}")
    return normalized


def _as_record(value: Any) -> dict[str, Any]:
    return dict(value) if isinstance(value, Mapping) else {}


def _project_from_document(project_document: Mapping[str, Any]) -> dict[str, Any]:
    return _as_record(project_document.get("project"))


def _active_object(project_document: Mapping[str, Any]) -> dict[str, Any]:
    project = _project_from_document(project_document)
    objects = project.get("objects") if isinstance(project.get("objects"), list) else []
    active_object_id = str(project.get("activeObjectId") or "")
    for item in objects:
        if isinstance(item, Mapping) and str(item.get("id") or "") == active_object_id:
            return dict(item)
    for item in objects:
        if isinstance(item, Mapping):
            return dict(item)
    return {}


def _validated_project_document(raw_document: str | Mapping[str, Any]) -> dict[str, Any]:
    result = validate_project_document(raw_document)
    if not result.get("ok"):
        raise ValueError(str(result.get("error") or "项目文档无效"))
    return dict(result["projectDocument"])


def _snapshot(project_document: Mapping[str, Any]) -> dict[str, Any]:
    project = _project_from_document(project_document)
    active = _active_object(project_document)
    objects = project.get("objects") if isinstance(project.get("objects"), list) else []
    return {
        "schemaVersion": str(project_document.get("schemaVersion") or ""),
        "projectId": str(project.get("id") or ""),
        "projectName": str(project.get("name") or ""),
        "activeObjectId": str(active.get("id") or ""),
        "activeObjectName": str(active.get("name") or ""),
        "activeObjectType": str(active.get("type") or ""),
        "objectCount": len(objects),
        "updatedAt": str(project.get("updatedAt") or project_document.get("updatedAt") or ""),
    }


def _event(event_type: str, project_document: Mapping[str, Any], now: str, payload: Mapping[str, Any] | None = None) -> dict[str, Any]:
    return {
        "eventId": f"event-{uuid.uuid4()}",
        "type": event_type,
        "protocolVersion": PROJECT_HOST_PROTOCOL_VERSION,
        "createdAt": now,
        "snapshot": _snapshot(project_document),
        "payload": dict(payload or {}),
    }


def _host_mode(value: Any) -> str:
    mode = str(value or "editable")
    return mode if mode in {"editable", "readonly"} else "editable"


def build_host_launch_contract(
    raw_document: str | Mapping[str, Any],
    launch: Mapping[str, Any] | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    timestamp = now or _utc_now()
    project_document = _validated_project_document(raw_document)
    launch_options = _as_record(launch)
    mode = _host_mode(launch_options.get("mode"))
    session_id = str(launch_options.get("sessionId") or "") or f"host-session-{uuid.uuid4()}"
    capabilities = {
        "loadProjectDocument": True,
        "emitProjectChanged": mode == "editable",
        "emitSaveRequest": mode == "editable",
        "acceptSaveResult": True,
        "localFileFallback": bool(launch_options.get("localFileFallback", True)),
    }
    return {
        "ok": True,
        "protocolVersion": PROJECT_HOST_PROTOCOL_VERSION,
        "launchId": f"launch-{uuid.uuid4()}",
        "sessionId": session_id,
        "mode": mode,
        "createdAt": timestamp,
        "projectDocument": project_document,
        "snapshot": _snapshot(project_document),
        "capabilities": capabilities,
        "events": [_event("solver.host_launch_created", project_document, timestamp, {"mode": mode})],
    }


def load_host_project(raw_document: str | Mapping[str, Any], session_id: str | None = None, now: str | None = None) -> dict[str, Any]:
    timestamp = now or _utc_now()
    project_document = _validated_project_document(raw_document)
    return {
        "ok": True,
        "sessionId": session_id or f"host-session-{uuid.uuid4()}",
        "protocolVersion": PROJECT_HOST_PROTOCOL_VERSION,
        "loadedAt": timestamp,
        "projectDocument": project_document,
        "snapshot": _snapshot(project_document),
        "events": [_event("solver.project_loaded", project_document, timestamp)],
    }


def _apply_builtin_template(project_document: Mapping[str, Any], template_id: str, now: str) -> dict[str, Any]:
    if template_id != "beam.simple_span_uniform":
        raise ValueError(f"不支持的内置模板: {template_id}")
    next_document = copy.deepcopy(dict(project_document))
    project = _project_from_document(next_document)
    objects = [dict(item) for item in project.get("objects", []) if isinstance(item, Mapping)]
    if not objects:
        objects = [{
            "id": f"beam-{uuid.uuid4()}",
            "name": "简支梁均布荷载",
            "type": "beam",
            "state": {},
            "results": None,
            "sensitivityResults": None,
            "workbenchView": "model",
            "createdAt": now,
            "updatedAt": now,
        }]
    object_ids = {str(item.get("id") or "") for item in objects}
    active_id = str(project.get("activeObjectId") or objects[0].get("id") or "")
    if active_id not in object_ids:
        active_id = str(objects[0].get("id") or "")
    next_objects = []
    for item in objects:
        if str(item.get("id") or "") == active_id:
            updated = {
                **item,
                "name": "简支梁均布荷载",
                "type": "beam",
                "state": copy.deepcopy(SIMPLE_SPAN_UNIFORM_BEAM_STATE),
                "results": None,
                "sensitivityResults": None,
                "workbenchView": "model",
                "updatedAt": now,
            }
            next_objects.append(updated)
        else:
            next_objects.append(item)
    project["objects"] = next_objects
    project["activeObjectId"] = active_id
    project["name"] = "结构力学试跑项目"
    settings = _as_record(project.get("settings"))
    project_info = _as_record(settings.get("projectInfo"))
    project_info["name"] = project["name"]
    settings["projectInfo"] = project_info
    project["settings"] = settings
    project["updatedAt"] = now
    next_document["project"] = project
    next_document["updatedAt"] = now
    return _validated_project_document(next_document)


def apply_host_project_change(raw_document: str | Mapping[str, Any], change: Mapping[str, Any], now: str | None = None) -> dict[str, Any]:
    timestamp = now or _utc_now()
    project_document = _validated_project_document(raw_document)
    change_type = str(change.get("type") or "")
    if change_type == "apply_builtin_template":
        next_document = _apply_builtin_template(project_document, str(change.get("templateId") or ""), timestamp)
    else:
        raise ValueError(f"不支持的 host 项目变更类型: {change_type or '未声明'}")
    return {
        "ok": True,
        "projectDocument": next_document,
        "snapshot": _snapshot(next_document),
        "events": [_event("solver.project_changed", next_document, timestamp, {"changeType": change_type})],
    }


def create_host_save_request(raw_document: str | Mapping[str, Any], now: str | None = None) -> dict[str, Any]:
    timestamp = now or _utc_now()
    project_document = _validated_project_document(raw_document)
    return {
        "ok": True,
        "projectDocument": project_document,
        "snapshot": _snapshot(project_document),
        "events": [_event("solver.project_save_requested", project_document, timestamp, {"reason": "host-managed-persistence"})],
    }


def build_host_save_result_event(
    raw_document: str | Mapping[str, Any],
    result: Mapping[str, Any],
    now: str | None = None,
) -> dict[str, Any]:
    timestamp = now or _utc_now()
    project_document = _validated_project_document(raw_document)
    status = str(result.get("status") or "saved")
    if status not in {"saved", "failed", "conflict"}:
        raise ValueError(f"不支持的 host 保存结果状态: {status}")
    payload = {
        "status": status,
        "revision": str(result.get("revision") or ""),
        "message": str(result.get("message") or ""),
    }
    return {
        "ok": status == "saved",
        "status": status,
        "projectDocument": project_document,
        "snapshot": _snapshot(project_document),
        "events": [_event("solver.project_save_result", project_document, timestamp, payload)],
    }


def _beam_payload_from_state(state: Mapping[str, Any], project_name: str) -> dict[str, Any]:
    spans = state.get("spans") if isinstance(state.get("spans"), list) else []
    first_span = _as_record(spans[0]) if spans else {}
    supports = state.get("supports") if isinstance(state.get("supports"), list) else []
    point_loads = state.get("pointLoads") if isinstance(state.get("pointLoads"), list) else []
    primary_point = _as_record(point_loads[0]) if point_loads else {}
    return {
        "analysisType": "beam",
        "schemaVersion": "2026-05-30",
        "projectName": project_name,
        "materialId": str(state.get("materialId") or "q345"),
        "beamType": str(state.get("beamType") or "simply_supported"),
        "loadType": str(state.get("loadType") or "uniform"),
        "spans": [float(_as_record(span).get("length") or 6.0) for span in spans] or [6.0],
        "spanProperties": [
            {
                "id": str(_as_record(span).get("id") or f"({index + 1})"),
                "E": float(_as_record(span).get("E") or first_span.get("E") or 210.0),
                "I": float(_as_record(span).get("I") or first_span.get("I") or 8000.0),
                "materialId": _as_record(span).get("materialId"),
            }
            for index, span in enumerate(spans)
        ],
        "supports": [dict(support) for support in supports if isinstance(support, Mapping)],
        "q": float(state.get("q") or 0.0),
        "loadValue": float(state.get("q") or 0.0),
        "loadPosition": float(primary_point.get("positionRatio") or state.get("pointLoadPositionRatio") or 0.5),
        "loadEnd": float(state.get("uniformLoadEndRatio") or 1.0),
        "pointLoad": float(primary_point.get("magnitudeKn") or state.get("pointLoad") or 0.0),
        "pointLoadPositionRatio": float(primary_point.get("positionRatio") or state.get("pointLoadPositionRatio") or 0.5),
        "uniformLoadStartRatio": float(state.get("uniformLoadStartRatio") or 0.0),
        "uniformLoadEndRatio": float(state.get("uniformLoadEndRatio") or 1.0),
        "distributedLoadStart": float(state.get("distributedLoadStart") or 0.0),
        "distributedLoadEnd": float(state.get("distributedLoadEnd") or 0.0),
        "distributedLoadStartRatio": float(state.get("distributedLoadStartRatio") or 0.0),
        "distributedLoadEndRatio": float(state.get("distributedLoadEndRatio") or 1.0),
        "E": float(first_span.get("E") or 210.0),
        "I": float(first_span.get("I") or 8000.0),
        "freq": float(state.get("freq") or 1.2),
        "duration": float(state.get("duration") or 5.0),
    }


def active_project_payload(raw_document: str | Mapping[str, Any]) -> dict[str, Any]:
    project_document = _validated_project_document(raw_document)
    project = _project_from_document(project_document)
    active = _active_object(project_document)
    state = _as_record(active.get("state"))
    explicit_payload = _as_record(state.get("solverPayload"))
    if explicit_payload:
        return {"analysisType": str(active.get("type") or explicit_payload.get("analysisType") or "beam"), **explicit_payload}
    analysis_type = str(active.get("type") or "beam")
    if analysis_type != "beam":
        raise ValueError(f"当前项目文档求解入口暂只支持 beam active object，收到 {analysis_type}。")
    return _beam_payload_from_state(state, str(project.get("name") or active.get("name") or "结构分析项目"))


def solve_project_document(raw_document: str | Mapping[str, Any], now: str | None = None) -> dict[str, Any]:
    timestamp = now or _utc_now()
    project_document = _validated_project_document(raw_document)
    payload = active_project_payload(project_document)
    result = build_calculation_response(payload, operation="project_document_solve")
    summary = _as_record(result.get("summary"))
    status_code = str(summary.get("statusCode") or "PASS")
    active = _active_object(project_document)
    return {
        "ok": True,
        "status": "pass" if status_code == "PASS" else "review",
        "solvedAt": timestamp,
        "resultSource": {**DEFAULT_RESULT_SOURCE, "activeObjectId": str(active.get("id") or "")},
        "payload": payload,
        "summary": summary,
        "diagnostics": result.get("diagnostics", {}),
        "analysisType": result.get("analysisType"),
        "snapshot": _snapshot(project_document),
    }


def build_export_artifact_metadata(
    raw_document: str | Mapping[str, Any],
    format_type: str = "docx",
    result_summary: Mapping[str, Any] | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    timestamp = now or _utc_now()
    project_document = _validated_project_document(raw_document)
    snapshot = _snapshot(project_document)
    normalized_format = _normalize_export_format(format_type)
    return {
        "artifactId": f"artifact-{uuid.uuid4()}",
        "createdAt": timestamp,
        "format": normalized_format,
        "fileName": f"{snapshot['projectName'] or '结构分析项目'}-计算书.{normalized_format}",
        "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" if normalized_format == "xlsx" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "projectFileSchemaVersion": str(project_document.get("schemaVersion") or ""),
        "asmsJsonSchemaVersion": str(_as_record(project_document.get("contract")).get("asmsJsonSchemaVersion") or ""),
        "resultSource": {**DEFAULT_RESULT_SOURCE, "activeObjectId": snapshot["activeObjectId"]},
        "diagnosticsSummary": {
            "warningCount": int(_as_record(result_summary).get("warningCount") or 0),
            "diagnosticCount": int(_as_record(result_summary).get("diagnosticCount") or 0),
        },
        "snapshot": snapshot,
    }


def build_export_artifact(
    raw_document: str | Mapping[str, Any],
    format_type: str = "docx",
    result_summary: Mapping[str, Any] | None = None,
    now: str | None = None,
) -> dict[str, Any]:
    project_document = _validated_project_document(raw_document)
    normalized_format = _normalize_export_format(format_type)
    payload = active_project_payload(project_document)
    analysis_type = str(payload.get("analysisType") or "beam")
    report = build_report_model(
        payload,
        analysis_type=analysis_type,
        material_name=get_material_name(payload.get("materialId")),
        sensitivity_results=None,
        report_images=None,
        report_options=None,
    )
    artifact = export_report(report, normalized_format)
    artifact.buffer.seek(0)
    content = artifact.buffer.read()
    metadata = build_export_artifact_metadata(project_document, normalized_format, result_summary, now)
    metadata = {
        **metadata,
        "fileName": artifact.filename,
        "mimeType": artifact.mimetype,
        "byteSize": len(content),
    }
    return {
        "ok": True,
        "artifactMetadata": metadata,
        "contentBase64": base64.b64encode(content).decode("ascii"),
    }
