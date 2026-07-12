from __future__ import annotations

from typing import Any, Mapping


PROJECT_FILE_MANIFEST_VERSION = "1.0.0"
PROJECT_FILE_CONTAINER_VERSION = "1.0.0"
PROJECT_FILE_KIND_SINGLE_JSON = "single-json"
PROJECT_FILE_KIND_ZIP_CONTAINER = "zip-container"
PROJECT_FILE_KIND_PROJECT_FOLDER = "project-folder"


def build_project_file_manifest(
    *,
    project_file_schema_version: str,
    asms_json_schema_version: str,
    project_file_kind: str = PROJECT_FILE_KIND_SINGLE_JSON,
) -> dict[str, Any]:
    return {
        "manifestVersion": PROJECT_FILE_MANIFEST_VERSION,
        "projectFileKind": project_file_kind,
        "containerVersion": PROJECT_FILE_CONTAINER_VERSION,
        "entries": [
            {
                "path": "project.json",
                "role": "projectDocument",
                "mediaType": "application/json",
                "required": True,
            },
            {
                "path": "manifest.json",
                "role": "projectManifest",
                "mediaType": "application/json",
                "required": False,
            },
        ],
        "contract": {
            "projectFileSchemaVersion": project_file_schema_version,
            "asmsJsonSchemaVersion": asms_json_schema_version,
        },
        "containerCapabilities": {
            PROJECT_FILE_KIND_SINGLE_JSON: True,
            PROJECT_FILE_KIND_ZIP_CONTAINER: False,
            PROJECT_FILE_KIND_PROJECT_FOLDER: False,
        },
    }


def normalize_project_file_manifest(
    raw_manifest: object,
    *,
    project_file_schema_version: str,
    asms_json_schema_version: str,
) -> dict[str, Any]:
    if not isinstance(raw_manifest, Mapping):
        return build_project_file_manifest(
            project_file_schema_version=project_file_schema_version,
            asms_json_schema_version=asms_json_schema_version,
        )
    kind = str(raw_manifest.get("projectFileKind") or PROJECT_FILE_KIND_SINGLE_JSON)
    if kind not in {PROJECT_FILE_KIND_SINGLE_JSON, PROJECT_FILE_KIND_ZIP_CONTAINER, PROJECT_FILE_KIND_PROJECT_FOLDER}:
        kind = PROJECT_FILE_KIND_SINGLE_JSON
    manifest = build_project_file_manifest(
        project_file_schema_version=project_file_schema_version,
        asms_json_schema_version=asms_json_schema_version,
        project_file_kind=kind,
    )
    if kind == PROJECT_FILE_KIND_SINGLE_JSON:
        return manifest
    # 预留未来容器格式；当前 v1.6 只承诺识别 manifest，不承诺读写 zip/folder。
    manifest["containerCapabilities"][kind] = False
    return manifest
