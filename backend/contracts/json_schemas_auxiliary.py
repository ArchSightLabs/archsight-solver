from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict

from backend.contracts.json_schema_shared import _schema_id
from backend.contracts.json_schemas_structural import (
    ASMS_BEAM_MODEL_SCHEMA,
    ASMS_FRAME_MODEL_SCHEMA,
    ASMS_MODEL_SCHEMA,
    ASMS_TRUSS_MODEL_SCHEMA,
    BEAM_DEFLECTION_INPUT_SCHEMA,
    BEAM_SERVICEABILITY_INPUT_SCHEMA,
    SOLVER_JOB_REQUEST_SCHEMA,
    SOLVER_PAYLOAD_SCHEMA,
)
from backend.contracts.json_schemas_delivery import DELIVERY_SCHEMA_REGISTRY


DIAGNOSTIC_ISSUE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["code", "category", "severity", "title", "detail", "suggestions", "objectRefs", "actions"],
    "properties": {
        "code": {"type": "string"},
        "category": {"type": "string"},
        "severity": {"type": "string", "enum": ["error", "warning", "info"]},
        "analysisType": {"type": ["string", "null"]},
        "title": {"type": "string"},
        "detail": {"type": "string"},
        "suggestions": {"type": "array", "items": {"type": "string"}},
        "objectRefs": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["kind", "id"],
                "properties": {"kind": {"type": "string"}, "id": {"type": "string"}},
                "additionalProperties": False,
            },
        },
        "actions": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["id", "label"],
                "properties": {"id": {"type": "string"}, "label": {"type": "string"}},
                "additionalProperties": False,
            },
        },
    },
    "additionalProperties": True,
}

CAPABILITY_RESULT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("capability-result"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "确定性求解能力输出",
    "type": "object",
    "required": ["capabilityId", "capabilityVersion", "status", "inputValidated", "warnings"],
    "properties": {
        "capabilityId": {"type": "string"},
        "capabilityVersion": {"type": "string"},
        "status": {"type": "string", "enum": ["pass", "fail", "invalid_input", "error"]},
        "inputValidated": {"type": "boolean"},
        "warnings": {"type": "array", "items": {"type": "string"}},
        "diagnostics": {
            "type": "object",
            "properties": {
                "issues": {"type": "array", "items": DIAGNOSTIC_ISSUE_SCHEMA},
            },
            "additionalProperties": True,
        },
    },
    "additionalProperties": True,
}

FRAME_TOOL_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("frame-tool-input"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "平面框架能力输入",
    "type": "object",
    "anyOf": [{"required": ["payload"]}, {"required": ["structure"]}],
    "properties": {
        "payload": {"type": "object", "description": "完整 frame API payload。"},
        "structure": {"type": "object", "description": "frame payload 中的 structure 对象。"},
        "targetNodeId": {"type": "string", "description": "可选，返回指定节点位移结果。"},
        "materialId": {"type": "string"},
        "materialName": {"type": "string"},
        "projectName": {"type": "string"},
    },
    "additionalProperties": False,
}

TRUSS_TOOL_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("truss-tool-input"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "平面桁架能力输入",
    "type": "object",
    "anyOf": [{"required": ["payload"]}, {"required": ["structure"]}],
    "properties": {
        "payload": {"type": "object", "description": "完整 truss API payload。"},
        "structure": {"type": "object", "description": "truss payload 中的 structure 对象。"},
        "targetMemberId": {"type": "string", "description": "可选，返回指定杆件轴力结果。"},
        "materialId": {"type": "string"},
        "materialName": {"type": "string"},
        "projectName": {"type": "string"},
    },
    "additionalProperties": False,
}

CALCULATE_TOOL_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("calculate-tool-input"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "通用求解工具输入",
    "type": "object",
    "required": ["payload"],
    "properties": {
        "payload": SOLVER_PAYLOAD_SCHEMA,
    },
    "additionalProperties": False,
}

SENSITIVITY_TOOL_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("sensitivity-tool-input"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "敏感性分析工具输入",
    "type": "object",
    "required": ["payload"],
    "properties": {
        "payload": SOLVER_PAYLOAD_SCHEMA,
    },
    "additionalProperties": False,
}

EMPTY_TOOL_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("empty-tool-input"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "空工具输入",
    "type": "object",
    "properties": {},
    "additionalProperties": False,
}

PROJECT_DOCUMENT_TOOL_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("project-document-tool-input"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "项目文档工具输入",
    "type": "object",
    "anyOf": [{"required": ["projectDocument"]}, {"required": ["projectDocumentText"]}],
    "properties": {
        "projectDocument": {"type": "object", "description": "archsight-solver.project 项目文档 JSON object。"},
        "projectDocumentText": {"type": "string", "description": "archsight-solver.project 项目文档 JSON 字符串。"},
    },
    "additionalProperties": True,
}

BENCHMARK_CASE_LIST_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("benchmark-case-list-input"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "基准算例列表工具输入",
    "type": "object",
    "properties": {
        "category": {
            "type": "string",
            "enum": ["beam", "truss", "frame", "truss-verify", "frame-beam-verify"],
        }
    },
    "additionalProperties": False,
}

BENCHMARK_CASE_RUN_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("benchmark-case-run-input"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "基准算例执行工具输入",
    "type": "object",
    "required": ["caseId"],
    "properties": {
        "caseId": {"type": "string"},
    },
    "additionalProperties": False,
}

BENCHMARK_SUBMISSION_CASE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["id", "category", "title", "purpose", "payload", "expected", "tolerances", "verification"],
    "properties": {
        "id": {"type": "string", "description": "建议使用稳定短横线 caseId。"},
        "category": {
            "type": "string",
            "enum": ["beam", "truss", "frame", "truss-verify", "frame-beam-verify"],
        },
        "title": {"type": "string"},
        "purpose": {"type": "string", "description": "说明该算例验证的结构体系、边界或荷载特征。"},
        "payload": SOLVER_PAYLOAD_SCHEMA,
        "expected": {
            "type": "object",
            "description": "标准结果值，例如最大挠度、最大节点位移、最大杆件轴力等。",
            "minProperties": 1,
            "additionalProperties": True,
        },
        "tolerances": {
            "type": "object",
            "description": "与 expected 对应的容许误差。",
            "minProperties": 1,
            "additionalProperties": True,
        },
        "verification": {
            "type": "object",
            "required": ["sourceType", "method", "checkedMetrics"],
            "properties": {
                "sourceType": {
                    "type": "string",
                    "enum": [
                        "textbook-analytical",
                        "independent-stiffness-baseline",
                        "engineering-software",
                        "internal-regression",
                    ],
                },
                "reference": {"type": "string"},
                "method": {"type": "string"},
                "sourceLinks": {"type": "array", "items": {"type": "string"}},
                "checkedMetrics": {"type": "array", "items": {"type": "string"}, "minItems": 1},
            },
            "additionalProperties": True,
        },
    },
    "additionalProperties": True,
}

BENCHMARK_SUBMISSION_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("benchmark-submission-input"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "公开验证算例投稿输入",
    "description": "用于云端服务执行投稿前自动校验；请求必须包含完整结构模型、标准值、容许误差和验证来源。",
    "type": "object",
    "required": ["case"],
    "properties": {
        "case": BENCHMARK_SUBMISSION_CASE_SCHEMA,
        "contributor": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "organization": {"type": "string"},
                "contact": {"type": "string"},
            },
            "additionalProperties": True,
        },
        "notes": {"type": "string"},
    },
    "additionalProperties": False,
}

BENCHMARK_SUBMISSION_RESPONSE_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("benchmark-submission-response"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "公开验证算例投稿校验响应",
    "type": "object",
    "required": ["success", "operation", "submissionId", "reviewStatus", "persisted", "caseDraft", "evaluation"],
    "properties": {
        "success": {"type": "boolean", "const": True},
        "operation": {"type": "string", "const": "submit_benchmark_case"},
        "version": {"type": "string"},
        "schemaVersion": {"type": "string"},
        "submissionId": {"type": "string"},
        "reviewStatus": {"type": "string", "enum": ["ready_for_review", "needs_correction"]},
        "persisted": {"type": "boolean", "const": False},
        "caseDraft": BENCHMARK_SUBMISSION_CASE_SCHEMA,
        "evaluation": {"type": "object", "additionalProperties": True},
        "diagnostics": {"type": "object", "additionalProperties": True},
        "nextSteps": {"type": "array", "items": {"type": "string"}},
        "meta": {"type": "object", "additionalProperties": True},
    },
    "additionalProperties": True,
}

BENCHMARK_SUBMISSION_PACKAGE_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("benchmark-submission-package"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "公开验证算例离线投稿包",
    "description": "用户下载并发送给维护者的单文件 JSON，包含算例草案、贡献者信息和投稿前预检结果。",
    "type": "object",
    "required": ["format", "formatVersion", "case", "contributor", "precheck"],
    "properties": {
        "format": {"type": "string", "const": "archsight-benchmark-submission"},
        "formatVersion": {"type": "string", "const": "1.0"},
        "case": BENCHMARK_SUBMISSION_CASE_SCHEMA,
        "contributor": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "organization": {"type": "string"},
                "contact": {"type": "string"},
                "note": {"type": "string"},
            },
            "additionalProperties": True,
        },
        "notes": {"type": "string"},
        "precheck": {
            "type": "object",
            "required": ["passed", "reviewStatus", "submissionId", "persisted", "generatedAt", "checks"],
            "properties": {
                "passed": {"type": "boolean"},
                "reviewStatus": {"type": "string", "enum": ["ready_for_review", "needs_correction"]},
                "submissionId": {"type": "string"},
                "schemaVersion": {"type": "string"},
                "persisted": {"type": "boolean", "const": False},
                "generatedAt": {"type": "string"},
                "checks": {"type": "array", "items": {"type": "object", "additionalProperties": True}},
                "diagnostics": {"type": "object", "additionalProperties": True},
            },
            "additionalProperties": True,
        },
    },
    "additionalProperties": True,
}

BENCHMARK_SUBMISSION_PACKAGE_RESPONSE_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("benchmark-submission-package-response"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "公开验证算例投稿包生成响应",
    "type": "object",
    "required": ["success", "operation", "submissionId", "filename", "persisted", "package"],
    "properties": {
        "success": {"type": "boolean", "const": True},
        "operation": {"type": "string", "const": "generate_benchmark_submission_package"},
        "version": {"type": "string"},
        "schemaVersion": {"type": "string"},
        "submissionId": {"type": "string"},
        "filename": {"type": "string"},
        "persisted": {"type": "boolean", "const": False},
        "package": BENCHMARK_SUBMISSION_PACKAGE_SCHEMA,
        "diagnostics": {"type": "object", "additionalProperties": True},
        "nextSteps": {"type": "array", "items": {"type": "string"}},
        "meta": {"type": "object", "additionalProperties": True},
    },
    "additionalProperties": True,
}

SCHEMA_REGISTRY: Dict[str, Dict[str, Any]] = {
    "asms-model": ASMS_MODEL_SCHEMA,
    "asms-beam-model": ASMS_BEAM_MODEL_SCHEMA,
    "asms-frame-model": ASMS_FRAME_MODEL_SCHEMA,
    "asms-truss-model": ASMS_TRUSS_MODEL_SCHEMA,
    "beam-deflection-input": BEAM_DEFLECTION_INPUT_SCHEMA,
    "beam-serviceability-input": BEAM_SERVICEABILITY_INPUT_SCHEMA,
    "calculate-payload": SOLVER_PAYLOAD_SCHEMA,
    "job-request": SOLVER_JOB_REQUEST_SCHEMA,
    "capability-result": CAPABILITY_RESULT_SCHEMA,
    "frame-tool-input": FRAME_TOOL_INPUT_SCHEMA,
    "truss-tool-input": TRUSS_TOOL_INPUT_SCHEMA,
    "calculate-tool-input": CALCULATE_TOOL_INPUT_SCHEMA,
    "sensitivity-tool-input": SENSITIVITY_TOOL_INPUT_SCHEMA,
    "empty-tool-input": EMPTY_TOOL_INPUT_SCHEMA,
    "project-document-tool-input": PROJECT_DOCUMENT_TOOL_INPUT_SCHEMA,
    "benchmark-case-list-input": BENCHMARK_CASE_LIST_INPUT_SCHEMA,
    "benchmark-case-run-input": BENCHMARK_CASE_RUN_INPUT_SCHEMA,
    "benchmark-submission-input": BENCHMARK_SUBMISSION_INPUT_SCHEMA,
    "benchmark-submission-response": BENCHMARK_SUBMISSION_RESPONSE_SCHEMA,
    "benchmark-submission-package": BENCHMARK_SUBMISSION_PACKAGE_SCHEMA,
    "benchmark-submission-package-response": BENCHMARK_SUBMISSION_PACKAGE_RESPONSE_SCHEMA,
    **DELIVERY_SCHEMA_REGISTRY,
}


def schema_registry() -> Dict[str, Dict[str, Any]]:
    return deepcopy(SCHEMA_REGISTRY)


def schema_by_id(schema_id: str) -> Dict[str, Any] | None:
    schema = SCHEMA_REGISTRY.get(schema_id)
    return deepcopy(schema) if schema else None
