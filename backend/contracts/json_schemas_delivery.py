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
                "archsight.solver.portal.actionRequested",
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
                            "hostUiActions": {
                                "type": "array",
                                "items": {"type": "string", "enum": ["project", "new", "open", "save", "saveAs", "versions", "share"]},
                                "uniqueItems": True,
                            },
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
                                    "requestPortalAction": {"const": True},
                                },
                                "additionalProperties": {"type": "boolean"},
                            }
                        },
                    }
                }
            },
        },
        {
            "if": {"properties": {"type": {"const": "archsight.solver.portal.actionRequested"}}, "required": ["type"]},
            "then": {
                "properties": {
                    "payload": {
                        "type": "object",
                        "required": ["action", "requestId"],
                        "properties": {
                            "action": {"type": "string", "enum": ["project", "new", "open", "save", "saveAs", "versions", "share"]},
                            "requestId": {"type": "string", "minLength": 1},
                        },
                        "additionalProperties": False,
                    },
                },
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

VERIFICATION_HASH_SCHEMA: Dict[str, Any] = {
    "type": "string",
    "pattern": "^[0-9a-f]{64}$",
}

VERIFICATION_PACKAGE_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("solver-verification-package"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ArchSight Solver 可信计算包",
    "description": "保存单次结构求解输入、结果、来源证据和 SHA-256 完整性摘要，支持当前求解器复算。摘要不是数字签名或工程签审。",
    "type": "object",
    "required": ["format", "formatVersion", "createdAt", "solver", "analysis", "evidence", "replayPolicy", "integrity"],
    "properties": {
        "format": {"type": "string", "const": "archsight-solver-verification-package"},
        "formatVersion": {"type": "string", "const": "1.0.0"},
        "createdAt": {"type": "string", "format": "date-time"},
        "solver": {
            "type": "object",
            "required": ["name", "version", "responseEnvelopeVersion", "calculationStorageSchema"],
            "properties": {
                "name": {"type": "string", "const": "archsight-solver"},
                "version": {"type": "string", "minLength": 1},
                "responseEnvelopeVersion": {"type": "string", "const": "v1"},
                "calculationStorageSchema": {"type": "string", "const": "solver-calculation-result@1"},
            },
            "additionalProperties": False,
        },
        "analysis": {
            "type": "object",
            "required": ["analysisType", "input", "request", "model", "recordedResult", "diagnostics"],
            "properties": {
                "analysisType": {"type": "string", "enum": ["beam", "frame", "truss"]},
                "input": {"type": "object", "additionalProperties": True},
                "request": {"type": "object", "additionalProperties": True},
                "normalizedRequest": {"type": "object", "additionalProperties": True},
                "model": {"type": "object", "additionalProperties": True},
                "recordedResult": {"type": "object", "additionalProperties": True},
                "diagnostics": {"type": "object", "additionalProperties": True},
            },
            "additionalProperties": False,
        },
        "evidence": {"type": "object", "additionalProperties": True},
        "replayPolicy": {
            "type": "object",
            "required": ["absoluteTolerance", "relativeTolerance", "ignoredPaths"],
            "properties": {
                "absoluteTolerance": {"type": "number", "const": 1e-8},
                "relativeTolerance": {"type": "number", "const": 1e-6},
                "ignoredPaths": {"type": "array", "maxItems": 0},
            },
            "additionalProperties": False,
        },
        "integrity": {
            "type": "object",
            "required": ["algorithm", "inputHash", "requestHash", "modelHash", "recordedResultHash", "packageHash"],
            "properties": {
                "algorithm": {"type": "string", "const": "sha256"},
                "inputHash": VERIFICATION_HASH_SCHEMA,
                "requestHash": VERIFICATION_HASH_SCHEMA,
                "modelHash": VERIFICATION_HASH_SCHEMA,
                "recordedResultHash": VERIFICATION_HASH_SCHEMA,
                "packageHash": VERIFICATION_HASH_SCHEMA,
            },
            "additionalProperties": False,
        },
    },
    "additionalProperties": False,
}

VERIFICATION_PACKAGE_CREATE_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("verification-package-create-input"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "可信计算包生成输入",
    "type": "object",
    "required": ["payload"],
    "properties": {
        "payload": {"type": "object", "additionalProperties": True},
        "evidence": {"type": "object", "additionalProperties": True},
    },
    "additionalProperties": False,
}

VERIFICATION_PACKAGE_VERIFY_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("verification-package-verify-input"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "可信计算包复算输入",
    "type": "object",
    "required": ["package"],
    "properties": {"package": VERIFICATION_PACKAGE_SCHEMA},
    "additionalProperties": False,
}

VERIFICATION_PACKAGE_REPORT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("verification-package-report"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "可信计算包复算报告",
    "type": "object",
    "required": ["status", "formatValid", "integrityValid", "replayMatched", "versionMatch", "recordedSolverVersion", "currentSolverVersion", "mismatches", "warnings", "disclaimer"],
    "properties": {
        "status": {"type": "string", "enum": ["pass", "review", "fail"]},
        "formatValid": {"type": "boolean"},
        "integrityValid": {"type": "boolean"},
        "replayMatched": {"type": ["boolean", "null"]},
        "versionMatch": {"type": "boolean"},
        "recordedSolverVersion": {"type": ["string", "null"]},
        "currentSolverVersion": {"type": "string"},
        "mismatches": {
            "type": "array",
            "maxItems": 100,
            "items": {
                "type": "object",
                "required": ["path", "detail"],
                "properties": {
                    "path": {"type": "string"},
                    "detail": {"type": "string"},
                    "expected": {},
                    "actual": {},
                },
                "additionalProperties": False,
            },
        },
        "warnings": {"type": "array", "items": {"type": "string"}},
        "disclaimer": {"type": "string"},
    },
    "additionalProperties": False,
}

VERIFICATION_PACKAGE_CREATE_RESPONSE_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("verification-package-create-response"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "可信计算包生成响应",
    "type": "object",
    "required": ["success", "operation", "version", "package", "verification"],
    "properties": {
        "success": {"type": "boolean", "const": True},
        "operation": {"type": "string", "const": "verification_package_create"},
        "version": {"type": "string", "const": "v1"},
        "package": VERIFICATION_PACKAGE_SCHEMA,
        "verification": VERIFICATION_PACKAGE_REPORT_SCHEMA,
    },
    "additionalProperties": False,
}

VERIFICATION_PACKAGE_VERIFY_RESPONSE_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("verification-package-verify-response"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "可信计算包复算响应",
    "type": "object",
    "required": ["success", "operation", "version", "verification"],
    "properties": {
        "success": {"type": "boolean", "const": True},
        "operation": {"type": "string", "const": "verification_package_verify"},
        "version": {"type": "string", "const": "v1"},
        "verification": VERIFICATION_PACKAGE_REPORT_SCHEMA,
    },
    "additionalProperties": False,
}

DELIVERY_SCHEMA_REGISTRY: Dict[str, Dict[str, Any]] = {
    "project-file-manifest": PROJECT_FILE_MANIFEST_SCHEMA,
    "solver-host-message": HOST_MESSAGE_SCHEMA,
    "solver-artifact-manifest": ARTIFACT_MANIFEST_SCHEMA,
    "solver-template-registry": TEMPLATE_REGISTRY_SCHEMA,
    "solver-verification-package": VERIFICATION_PACKAGE_SCHEMA,
    "verification-package-create-input": VERIFICATION_PACKAGE_CREATE_INPUT_SCHEMA,
    "verification-package-verify-input": VERIFICATION_PACKAGE_VERIFY_INPUT_SCHEMA,
    "verification-package-report": VERIFICATION_PACKAGE_REPORT_SCHEMA,
    "verification-package-create-response": VERIFICATION_PACKAGE_CREATE_RESPONSE_SCHEMA,
    "verification-package-verify-response": VERIFICATION_PACKAGE_VERIFY_RESPONSE_SCHEMA,
}
