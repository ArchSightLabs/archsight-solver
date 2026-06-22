from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Mapping


PROJECT_FILE_SCHEMA = "archsight-solver.project"
PRODUCT_ID = "archsight-solver"
PROJECT_FILE_SCHEMA_VERSION = "2.0.0"
ASMS_JSON_SCHEMA_VERSION = "2026-05-30"
SUPPORTED_PROJECT_FILE_VERSIONS = {"1.0.0", PROJECT_FILE_SCHEMA_VERSION}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _diagnostic(code: str, severity: str, title: str, detail: str, suggestion: str) -> dict[str, str]:
    return {
        "code": code,
        "severity": severity,
        "title": title,
        "detail": detail,
        "suggestion": suggestion,
    }


def _compare_semver(left: str, right: str) -> int:
    left_parts = [int(part) if part.isdigit() else 0 for part in left.split(".")]
    right_parts = [int(part) if part.isdigit() else 0 for part in right.split(".")]
    length = max(len(left_parts), len(right_parts))
    for index in range(length):
        diff = (left_parts[index] if index < len(left_parts) else 0) - (right_parts[index] if index < len(right_parts) else 0)
        if diff:
            return diff
    return 0


def _as_record(value: Any) -> dict[str, Any] | None:
    if isinstance(value, Mapping):
        return dict(value)
    return None


def _normalize_project_info(value: Any, fallback_name: str) -> tuple[dict[str, Any], bool]:
    changed = False
    raw = _as_record(value) or {}
    if not isinstance(value, Mapping):
        changed = True
    name = str(raw.get("name") or fallback_name).strip() or fallback_name
    normalized = {
        "name": name,
        "address": str(raw.get("address") or ""),
        "projectType": str(raw.get("projectType") or ""),
        "scale": str(raw.get("scale") or ""),
        "projectManager": str(raw.get("projectManager") or ""),
        "constructionUnit": str(raw.get("constructionUnit") or ""),
        "developerUnit": str(raw.get("developerUnit") or ""),
        "supervisionUnit": str(raw.get("supervisionUnit") or ""),
    }
    if raw != normalized:
        changed = True
    return normalized, changed


def normalize_solver_project(raw_project: Any, now: str | None = None) -> tuple[dict[str, Any], bool]:
    timestamp = now or _utc_now()
    raw = _as_record(raw_project) or {}
    changed = not isinstance(raw_project, Mapping)
    project = dict(raw)
    fallback_name = str(project.get("name") or "新建结构分析项目").strip() or "新建结构分析项目"
    settings = _as_record(project.get("settings")) or {}
    project_info, project_info_changed = _normalize_project_info(settings.get("projectInfo"), fallback_name)
    settings = dict(settings)
    settings["projectInfo"] = project_info
    settings.setdefault("activeModuleSection", "")
    settings.setdefault("modelPreviewStyle", "color")
    settings.setdefault("customMaterials", [])
    settings.setdefault("reportExportOptions", {})

    if not isinstance(project.get("objects"), list):
        project["objects"] = []
        changed = True
    if not isinstance(project.get("activeObjectId"), str):
        project["activeObjectId"] = ""
        changed = True

    defaults = {
        "id": f"project-{timestamp}",
        "name": project_info["name"],
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }
    for key, value in defaults.items():
        if not str(project.get(key) or "").strip():
            project[key] = value
            changed = True
    if project.get("name") != project_info["name"]:
        project["name"] = project_info["name"]
        changed = True
    if project.get("settings") != settings:
        project["settings"] = settings
        changed = True
    return project, changed or project_info_changed


def create_default_project_document(name: str = "新建结构分析项目", now: str | None = None) -> dict[str, Any]:
    timestamp = now or _utc_now()
    project, _ = normalize_solver_project(
        {
            "id": f"project-{timestamp}",
            "name": name,
            "activeObjectId": "",
            "objects": [],
            "settings": {
                "projectInfo": {"name": name},
            },
            "createdAt": timestamp,
            "updatedAt": timestamp,
        },
        now=timestamp,
    )
    return {
        "schema": PROJECT_FILE_SCHEMA,
        "schemaVersion": PROJECT_FILE_SCHEMA_VERSION,
        "product": PRODUCT_ID,
        "appVersion": "",
        "contract": {
            "asmsJsonSchemaVersion": ASMS_JSON_SCHEMA_VERSION,
            "projectFileSchemaVersion": PROJECT_FILE_SCHEMA_VERSION,
            "modelRoundTrip": "normalized",
        },
        "createdAt": timestamp,
        "updatedAt": timestamp,
        "project": project,
        "units": {
            "length": "m",
            "force": "kN",
            "stress": "MPa",
            "modulus": "GPa",
            "inertia": "cm4",
        },
    }


def parse_project_document(raw_document: str | Mapping[str, Any]) -> dict[str, Any]:
    if isinstance(raw_document, str):
        parsed = json.loads(raw_document)
    else:
        parsed = raw_document
    if not isinstance(parsed, Mapping):
        raise ValueError("项目文档顶层必须是 JSON object")
    return dict(parsed)


def validate_project_document(raw_document: str | Mapping[str, Any], now: str | None = None) -> dict[str, Any]:
    diagnostics: list[dict[str, str]] = []
    try:
        raw = parse_project_document(raw_document)
    except json.JSONDecodeError as exc:
        return {
            "ok": False,
            "error": f"项目文档不是合法 JSON: {exc.msg}",
            "diagnostics": diagnostics,
        }
    except ValueError as exc:
        return {
            "ok": False,
            "error": str(exc),
            "diagnostics": diagnostics,
        }

    if raw.get("schema") != PROJECT_FILE_SCHEMA:
        return {
            "ok": False,
            "error": "文件 schema 不是 archsight-solver.project。",
            "diagnostics": diagnostics,
        }
    if raw.get("product") != PRODUCT_ID:
        return {
            "ok": False,
            "error": "文件 product 不是 archsight-solver。",
            "diagnostics": diagnostics,
        }

    schema_version = str(raw.get("schemaVersion") or "")
    if not schema_version:
        return {
            "ok": False,
            "error": "项目文件缺少 schemaVersion。",
            "diagnostics": diagnostics,
        }
    if schema_version not in SUPPORTED_PROJECT_FILE_VERSIONS:
        if _compare_semver(schema_version, PROJECT_FILE_SCHEMA_VERSION) > 0:
            return {
                "ok": False,
                "error": f"项目文件 schemaVersion={schema_version} 高于当前支持版本 {PROJECT_FILE_SCHEMA_VERSION}。",
                "diagnostics": diagnostics,
            }
        return {
            "ok": False,
            "error": f"暂不支持 schemaVersion={schema_version} 的项目文件。",
            "diagnostics": diagnostics,
        }
    if schema_version != PROJECT_FILE_SCHEMA_VERSION:
        diagnostics.append(_diagnostic(
            "PROJECT_FILE_SCHEMA_MIGRATED",
            "warning",
            "项目文件已按当前版本迁移",
            f"原始 schemaVersion={schema_version}，已按 {PROJECT_FILE_SCHEMA_VERSION} 归一化导入。",
            "保存项目文件后会写入当前项目文件 schemaVersion。",
        ))

    contract = _as_record(raw.get("contract")) or {}
    if contract.get("asmsJsonSchemaVersion") != ASMS_JSON_SCHEMA_VERSION:
        diagnostics.append(_diagnostic(
            "ASMS_SCHEMA_VERSION_RECORDED",
            "warning" if contract.get("asmsJsonSchemaVersion") else "info",
            "ASMS-JSON 契约版本已校准",
            f"文件声明的 ASMS-JSON 契约版本为 {contract.get('asmsJsonSchemaVersion') or '未声明'}，当前版本为 {ASMS_JSON_SCHEMA_VERSION}。",
            "导入后保存项目文件即可写入当前 ASMS 契约版本。",
        ))

    timestamp = now or _utc_now()
    project, project_changed = normalize_solver_project(raw.get("project"), now=timestamp)
    if project_changed:
        diagnostics.append(_diagnostic(
            "PROJECT_MODEL_NORMALIZED",
            "info",
            "项目模型已执行归一化",
            "导入时已补齐缺省项目设置和工程信息。",
            "建议重新保存项目文件，形成可追踪的当前格式快照。",
        ))

    normalized = {
        "schema": PROJECT_FILE_SCHEMA,
        "schemaVersion": PROJECT_FILE_SCHEMA_VERSION,
        "product": PRODUCT_ID,
        "appVersion": str(raw.get("appVersion") or ""),
        "contract": {
            "asmsJsonSchemaVersion": ASMS_JSON_SCHEMA_VERSION,
            "projectFileSchemaVersion": PROJECT_FILE_SCHEMA_VERSION,
            "modelRoundTrip": "normalized",
        },
        "createdAt": str(raw.get("createdAt") or timestamp),
        "updatedAt": str(raw.get("updatedAt") or timestamp),
        "project": project,
        "units": {
            "length": "m",
            "force": "kN",
            "stress": "MPa",
            "modulus": "GPa",
            "inertia": "cm4",
        },
    }
    return {
        "ok": True,
        "diagnostics": diagnostics,
        "projectDocument": normalized,
        "summary": summarize_project_document(normalized, diagnostics),
    }


def summarize_project_document(project_document: Mapping[str, Any], diagnostics: list[Mapping[str, Any]] | None = None) -> dict[str, Any]:
    project = _as_record(project_document.get("project")) or {}
    contract = _as_record(project_document.get("contract")) or {}
    objects = project.get("objects") if isinstance(project.get("objects"), list) else []
    diagnostics = diagnostics or []
    return {
        "schema": str(project_document.get("schema") or ""),
        "schemaVersion": str(project_document.get("schemaVersion") or ""),
        "product": str(project_document.get("product") or ""),
        "projectId": str(project.get("id") or ""),
        "projectName": str(project.get("name") or ""),
        "objectCount": len(objects),
        "projectFileSchemaVersion": str(contract.get("projectFileSchemaVersion") or ""),
        "asmsJsonSchemaVersion": str(contract.get("asmsJsonSchemaVersion") or ""),
        "diagnosticCount": len(diagnostics),
        "warningCount": sum(1 for item in diagnostics if item.get("severity") == "warning"),
    }
