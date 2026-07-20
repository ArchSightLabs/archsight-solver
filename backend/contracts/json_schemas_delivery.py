from __future__ import annotations

from typing import Any, Dict

from backend.contracts.json_schema_shared import _schema_id

PROJECT_FILE_MANIFEST_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("project-file-manifest"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ArchSight Solver 本地项目文件 Manifest",
    "type": "object",
    "required": ["manifestVersion", "projectFileKind", "containerVersion", "entries", "contract", "containerCapabilities"],
    "properties": {
        "manifestVersion": {"type": "string", "const": "1.0.0"},
        "projectFileKind": {"type": "string", "enum": ["single-json", "zip-container", "project-folder"]},
        "containerVersion": {"type": "string"},
        "entries": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["path", "role", "mediaType", "required"],
                "properties": {
                    "path": {"type": "string"},
                    "role": {"type": "string"},
                    "mediaType": {"type": "string"},
                    "required": {"type": "boolean"},
                },
                "additionalProperties": True,
            },
        },
        "contract": {
            "type": "object",
            "required": ["projectFileSchemaVersion", "asmsJsonSchemaVersion"],
            "properties": {
                "projectFileSchemaVersion": {"type": "string"},
                "asmsJsonSchemaVersion": {"type": "string"},
            },
            "additionalProperties": False,
        },
        "containerCapabilities": {"type": "object", "additionalProperties": {"type": "boolean"}},
    },
    "additionalProperties": True,
}

HOST_MESSAGE_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("solver-host-message"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ArchSight Solver 外部宿主消息",
    "type": "object",
    "required": ["type", "protocolVersion", "payload"],
    "properties": {
        "type": {
            "type": "string",
            "enum": [
                "archsight.solver.host.launch",
                "archsight.solver.host.requestSave",
                "archsight.solver.host.saveResult",
                "archsight.solver.ready",
                "archsight.solver.project.changed",
                "archsight.solver.project.saveRequest",
                "archsight.solver.error",
            ],
        },
        "protocolVersion": {"type": "string", "const": "1.0.0"},
        "sessionId": {"type": "string", "minLength": 1},
        "nonce": {"type": "string", "minLength": 1},
        "payload": {"type": "object", "additionalProperties": True},
    },
    "allOf": [
        {
            "if": {"properties": {"type": {"const": "archsight.solver.ready"}}, "required": ["type"]},
            "then": {
                "oneOf": [
                    {
                        "not": {"anyOf": [{"required": ["sessionId"]}, {"required": ["nonce"]}]},
                    },
                    {"required": ["sessionId", "nonce"]},
                ],
            },
            "else": {"required": ["sessionId", "nonce"]},
        },
        {
            "if": {"properties": {"type": {"const": "archsight.solver.host.launch"}}, "required": ["type"]},
            "then": {
                "properties": {
                    "payload": {
                        "type": "object",
                        "required": ["projectDocument", "mode"],
                        "properties": {
                            "projectDocument": {"type": ["object", "string"]},
                            "mode": {"type": "string", "enum": ["editable", "readonly"]},
                        },
                        "additionalProperties": True,
                    },
                },
            },
        },
        {
            "if": {"properties": {"type": {"const": "archsight.solver.host.requestSave"}}, "required": ["type"]},
            "then": {
                "properties": {
                    "payload": {
                        "type": "object",
                        "required": ["requestId"],
                        "properties": {"requestId": {"type": "string", "minLength": 1}},
                        "additionalProperties": True,
                    },
                },
            },
        },
        {
            "if": {"properties": {"type": {"const": "archsight.solver.host.saveResult"}}, "required": ["type"]},
            "then": {
                "properties": {
                    "payload": {
                        "type": "object",
                        "required": ["status", "requestId"],
                        "properties": {
                            "status": {"type": "string", "enum": ["saved", "failed", "conflict"]},
                            "requestId": {"type": "string", "minLength": 1},
                        },
                        "additionalProperties": True,
                    },
                },
            },
        },
        {
            "if": {"properties": {"type": {"enum": ["archsight.solver.project.changed", "archsight.solver.project.saveRequest"]}}, "required": ["type"]},
            "then": {"properties": {"payload": {"type": "object", "required": ["projectDocument"]}}},
        },
        {
            "if": {"properties": {"type": {"const": "archsight.solver.project.saveRequest"}}, "required": ["type"]},
            "then": {
                "properties": {
                    "payload": {
                        "type": "object",
                        "required": ["projectDocument", "requestId"],
                        "properties": {"requestId": {"type": "string", "minLength": 1}},
                    }
                }
            },
        },
        {
            "if": {"properties": {"type": {"const": "archsight.solver.ready"}}, "required": ["type"]},
            "then": {
                "properties": {
                    "payload": {
                        "type": "object",
                        "required": ["capabilities"],
                        "properties": {
                            "capabilities": {
                                "type": "object",
                                "required": [
                                    "loadProjectDocument",
                                    "emitProjectChanged",
                                    "acceptHostSaveRequest",
                                    "emitSaveRequest",
                                    "acceptSaveResult",
                                ],
                                "properties": {
                                    "loadProjectDocument": {"const": True},
                                    "emitProjectChanged": {"const": True},
                                    "acceptHostSaveRequest": {"const": True},
                                    "emitSaveRequest": {"const": True},
                                    "acceptSaveResult": {"const": True},
                                },
                                "additionalProperties": {"type": "boolean"},
                            }
                        },
                    }
                }
            },
        },
        {
            "if": {"properties": {"type": {"const": "archsight.solver.error"}}, "required": ["type"]},
            "then": {"properties": {"payload": {"type": "object", "required": ["message"]}}},
        },
    ],
    "additionalProperties": False,
}

ARTIFACT_MANIFEST_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("solver-artifact-manifest"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ArchSight Solver 导出物 Manifest",
    "type": "object",
    "required": ["artifactId", "manifestVersion", "artifactType", "format", "fileName", "mimeType", "createdAt"],
    "properties": {
        "artifactId": {"type": "string"},
        "manifestVersion": {"type": "string", "const": "1.0.0"},
        "artifactType": {"type": "string", "const": "solver.export"},
        "format": {"type": "string", "enum": ["docx", "xlsx"]},
        "fileName": {"type": "string"},
        "mimeType": {"type": "string"},
        "byteSize": {"type": "integer", "minimum": 0},
        "createdAt": {"type": "string"},
        "projectFileSchemaVersion": {"type": "string"},
        "asmsJsonSchemaVersion": {"type": "string"},
        "contract": {"type": "object", "additionalProperties": True},
        "projectManifest": PROJECT_FILE_MANIFEST_SCHEMA,
        "resultSource": {"type": "object", "additionalProperties": True},
        "resultProvenance": {"type": "object", "additionalProperties": True},
        "diagnosticsSummary": {"type": "object", "additionalProperties": True},
        "snapshot": {"type": "object", "additionalProperties": True},
    },
    "additionalProperties": True,
}

TEMPLATE_REGISTRY_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("solver-template-registry"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ArchSight Solver 内置模板 Registry",
    "type": "object",
    "required": ["registryVersion", "templateCount", "templates"],
    "properties": {
        "registryVersion": {"type": "string", "const": "1.0.0"},
        "templateCount": {"type": "integer", "minimum": 0},
        "templates": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["templateId", "structureType", "structureLabel", "title", "entryPoints", "supportedActions", "primaryResultMetrics", "benchmarkMapping", "benchmarkRefCount", "hasDirectBenchmark", "source"],
                "properties": {
                    "templateId": {"type": "string"},
                    "structureType": {"type": "string", "enum": ["beam", "frame", "truss"]},
                    "structureLabel": {"type": "string"},
                    "title": {"type": "string"},
                    "entryPoints": {"type": "array", "items": {"type": "string"}},
                    "supportedActions": {"type": "array", "items": {"type": "string"}},
                    "primaryResultMetrics": {"type": "array", "items": {"type": "string"}},
                    "benchmarkMapping": {"type": "array", "items": {"type": "object", "additionalProperties": True}},
                    "benchmarkRefCount": {"type": "integer", "minimum": 0},
                    "hasDirectBenchmark": {"type": "boolean"},
                    "source": {"type": "string", "const": "builtin"},
                },
                "additionalProperties": True,
            },
        },
    },
    "additionalProperties": True,
}

DELIVERY_SCHEMA_REGISTRY: Dict[str, Dict[str, Any]] = {
    "project-file-manifest": PROJECT_FILE_MANIFEST_SCHEMA,
    "solver-host-message": HOST_MESSAGE_SCHEMA,
    "solver-artifact-manifest": ARTIFACT_MANIFEST_SCHEMA,
    "solver-template-registry": TEMPLATE_REGISTRY_SCHEMA,
}
