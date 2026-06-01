from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict

from backend.common.report_options_catalog import default_report_options, report_option_values
from backend.contracts.json_schemas import API_SCHEMA_VERSION, schema_registry


def build_openapi_document() -> Dict[str, Any]:
    """Build a compact OpenAPI document from the published JSON Schema registry."""
    schemas = schema_registry()
    components = {
        "schemas": {
            **schemas,
            "api-error": {
                "type": "object",
                "required": ["success", "operation", "version", "error"],
                "properties": {
                    "success": {"type": "boolean", "const": False},
                    "operation": {"type": "string"},
                    "version": {"type": "string"},
                    "analysisType": {"type": "string", "enum": ["beam", "truss", "frame"]},
                    "error": {
                        "type": "object",
                        "required": ["code", "message"],
                        "properties": {
                            "code": {"type": "string"},
                            "message": {"type": "string"},
                        },
                    },
                    "legacyError": {"type": "string"},
                    "diagnostics": {
                        "type": "object",
                        "properties": {
                            "warnings": {"type": "array", "items": {"type": "string"}},
                            "infos": {"type": "array", "items": {"type": "string"}},
                        },
                        "additionalProperties": True,
                    },
                    "meta": {"type": "object", "additionalProperties": True},
                },
                "additionalProperties": True,
            },
            "api-envelope": {
                "type": "object",
                "required": ["success", "operation", "version", "analysisType", "results", "diagnostics", "meta"],
                "properties": {
                    "success": {"type": "boolean", "const": True},
                    "operation": {"type": "string"},
                    "version": {"type": "string"},
                    "analysisType": {"type": "string", "enum": ["beam", "truss", "frame"]},
                    "request": {"type": "object"},
                    "model": {"type": "object"},
                    "results": {"type": "object"},
                    "diagnostics": {"type": "object"},
                    "errors": {"type": "array", "items": {"type": "object"}},
                    "meta": {"type": "object"},
                },
                "additionalProperties": True,
            },
            "sensitivity-payload": _sensitivity_payload_schema(),
            "sensitivity-response": _sensitivity_response_schema(),
            "export-payload": _export_payload_schema(),
            "schema-registry-response": _schema_registry_response_schema(),
            "public-example-projects-response": _public_example_projects_response_schema(),
        }
    }

    return {
        "openapi": "3.1.0",
        "info": {
            "title": "ArchSight Solver API",
            "version": API_SCHEMA_VERSION,
            "description": (
                "梁系、二维平面桁架和二维平面框架的线弹性静力分析 API。"
                "结构安全结论仍需工程师复核。"
            ),
        },
        "servers": [{"url": "http://127.0.0.1:6240"}],
        "paths": _paths(),
        "components": components,
        "tags": [
            {"name": "analysis", "description": "结构求解、预览和敏感性分析"},
            {"name": "jobs", "description": "异步作业"},
            {"name": "contracts", "description": "Schema 与 OpenAPI 契约"},
            {"name": "export", "description": "计算书导出"},
            {"name": "examples", "description": "公开工程案例与验证集工程入口"},
            {"name": "benchmark-submissions", "description": "公开验证算例投稿前自动校验"},
        ],
    }


def _ref(schema_id: str) -> Dict[str, str]:
    return {"$ref": f"#/components/schemas/{schema_id}"}


def _json_request(schema_id: str) -> Dict[str, Any]:
    return {
        "required": True,
        "content": {
            "application/json": {
                "schema": _ref(schema_id),
            }
        },
    }


def _json_response(schema: Dict[str, Any] | str, *, description: str = "OK", status: str = "200") -> Dict[str, Any]:
    schema_value = _ref(schema) if isinstance(schema, str) else deepcopy(schema)
    return {
        status: {
            "description": description,
            "content": {
                "application/json": {
                    "schema": schema_value,
                }
            },
        }
    }


def _error_response(status: str = "400", description: str = "请求错误") -> Dict[str, Any]:
    return _json_response("api-error", description=description, status=status)


def _paths() -> Dict[str, Any]:
    return {
        "/api/calculate": {
            "post": {
                "tags": ["analysis"],
                "summary": "执行结构求解",
                "requestBody": _json_request("calculate-payload"),
                "responses": {**_json_response("api-envelope"), **_error_response()},
            }
        },
        "/api/preview": {
            "post": {
                "tags": ["analysis"],
                "summary": "生成结构预览",
                "requestBody": _json_request("calculate-payload"),
                "responses": {**_json_response("api-envelope"), **_error_response()},
            }
        },
        "/api/sensitivity": {
            "post": {
                "tags": ["analysis"],
                "summary": "执行单因素参数敏感性分析",
                "requestBody": _json_request("sensitivity-payload"),
                "responses": {
                    **_json_response("sensitivity-response"),
                    **_error_response(),
                },
            }
        },
        "/api/export": {
            "post": {
                "tags": ["export"],
                "summary": "导出 WORD 或 XLSX 计算书",
                "requestBody": _json_request("export-payload"),
                "responses": {
                    "200": {
                        "description": "计算书二进制文件",
                        "content": {
                            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
                                "schema": {"type": "string", "format": "binary"}
                            },
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                                "schema": {"type": "string", "format": "binary"}
                            },
                        },
                    },
                    **_error_response(),
                    **_error_response("500", "导出失败"),
                },
            }
        },
        "/api/jobs": {
            "post": {
                "tags": ["jobs"],
                "summary": "提交异步作业",
                "requestBody": _json_request("job-request"),
                "responses": {
                    **_json_response({"type": "object", "additionalProperties": True}, description="Accepted", status="202"),
                    **_error_response(),
                },
            }
        },
        "/api/jobs/{jobId}": {
            "get": {
                "tags": ["jobs"],
                "summary": "查询异步作业状态",
                "parameters": [_path_parameter("jobId")],
                "responses": {
                    **_json_response({"type": "object", "additionalProperties": True}),
                    **_error_response("404", "作业不存在"),
                },
            },
            "delete": {
                "tags": ["jobs"],
                "summary": "取消异步作业",
                "parameters": [_path_parameter("jobId")],
                "responses": {
                    **_json_response({"type": "object", "additionalProperties": True}),
                    **_error_response("404", "作业不存在"),
                },
            },
        },
        "/api/jobs/{jobId}/result": {
            "get": {
                "tags": ["jobs"],
                "summary": "获取异步作业结果",
                "parameters": [_path_parameter("jobId")],
                "responses": {
                    **_json_response({"type": "object", "additionalProperties": True}),
                    **_error_response("404", "作业不存在"),
                },
            }
        },
        "/api/contracts/schemas": {
            "get": {
                "tags": ["contracts"],
                "summary": "列出 JSON Schema Registry",
                "responses": _json_response("schema-registry-response"),
            }
        },
        "/api/contracts/schemas/{schemaId}": {
            "get": {
                "tags": ["contracts"],
                "summary": "获取单个 JSON Schema",
                "parameters": [_path_parameter("schemaId")],
                "responses": {
                    **_json_response({"type": "object", "additionalProperties": True}),
                    **_error_response("404", "Schema 不存在"),
                },
            }
        },
        "/api/contracts/openapi": {
            "get": {
                "tags": ["contracts"],
                "summary": "获取 OpenAPI 3.1 契约",
                "responses": _json_response({"type": "object", "additionalProperties": True}),
            }
        },
        "/api/examples/projects": {
            "get": {
                "tags": ["examples"],
                "summary": "列出可直接导入工作台的公开验证工程",
                "responses": _json_response("public-example-projects-response"),
            }
        },
        "/api/benchmark-submissions": {
            "post": {
                "tags": ["benchmark-submissions"],
                "summary": "提交公开验证算例草案并执行自动校验",
                "description": "接收完整模型、标准值、容许误差和验证来源；当前接口只做投稿前校验，响应中 persisted 固定为 false。",
                "requestBody": _json_request("benchmark-submission-input"),
                "responses": {
                    **_json_response("benchmark-submission-response"),
                    **_error_response(),
                },
            }
        },
        "/api/benchmark-submission-packages": {
            "post": {
                "tags": ["benchmark-submissions"],
                "summary": "生成离线 benchmark 投稿包 JSON",
                "description": "接收完整算例草案并执行自动校验，返回可下载并发送给维护者的单文件 JSON 投稿包；不做服务端持久化。",
                "requestBody": _json_request("benchmark-submission-input"),
                "responses": {
                    **_json_response("benchmark-submission-package-response"),
                    **_error_response(),
                },
            }
        },
    }


def _path_parameter(name: str) -> Dict[str, Any]:
    return {
        "name": name,
        "in": "path",
        "required": True,
        "schema": {"type": "string"},
    }


def _sensitivity_payload_schema() -> Dict[str, Any]:
    return {
        "allOf": [_ref("calculate-payload")],
        "properties": {
            "config": {
                "type": "object",
                "properties": {
                    "range": {
                        "type": "number",
                        "minimum": 0,
                        "maximum": 80,
                        "default": 20,
                        "description": "单因素扰动范围，单位 %。",
                    },
                    "steps": {
                        "type": "integer",
                        "minimum": 1,
                        "maximum": 50,
                        "default": 10,
                        "description": "正负扰动区间内的采样步数。",
                    },
                    "responseMetric": {
                        "type": "string",
                        "enum": [
                            "max_deflection",
                            "max_moment",
                            "max_shear",
                            "max_ux",
                            "max_uy",
                            "max_member_moment",
                            "max_node_displacement",
                            "max_member_axial",
                            "max_member_stress",
                        ],
                        "description": "响应指标；不支持的值会回退到当前分析类型默认指标。",
                    },
                },
                "additionalProperties": True,
            },
            "targetSpanIndex": {
                "type": "integer",
                "minimum": 0,
                "default": 0,
                "description": "梁系敏感性分析提取跨段挠度时使用的目标跨索引。",
            },
        },
        "additionalProperties": True,
    }


def _sensitivity_response_schema() -> Dict[str, Any]:
    series_item = {
        "type": "object",
        "required": ["key", "label", "values", "color"],
        "properties": {
            "key": {"type": "string"},
            "label": {"type": "string"},
            "values": {"type": "array", "items": {"type": "number"}},
            "color": {"type": "string"},
        },
        "additionalProperties": True,
    }
    return {
        "type": "object",
        "required": ["variations", "responseMetric", "responseLabel", "responseUnit", "series"],
        "properties": {
            "variations": {"type": "array", "items": {"type": "number"}},
            "responseMetric": {"type": "string"},
            "responseLabel": {"type": "string"},
            "responseUnit": {"type": "string"},
            "series": {"type": "array", "items": series_item},
            "q": {"type": "array", "items": {"type": "number"}},
            "E": {"type": "array", "items": {"type": "number"}},
            "I": {"type": "array", "items": {"type": "number"}},
            "freq": {"type": "array", "items": {"type": "number"}},
            "beamLoad": {"type": "array", "items": {"type": "number"}},
            "lateralLoad": {"type": "array", "items": {"type": "number"}},
            "fx": {"type": "array", "items": {"type": "number"}},
            "fy": {"type": "array", "items": {"type": "number"}},
            "A": {"type": "array", "items": {"type": "number"}},
        },
        "additionalProperties": True,
    }


def _export_payload_schema() -> Dict[str, Any]:
    return {
        "allOf": [_ref("calculate-payload")],
        "properties": {
            "format": {
                "type": "string",
                "enum": ["xlsx", "docx"],
                "default": "xlsx",
                "description": "导出文件格式。",
            },
            "sensitivityResults": {
                "type": "object",
                "description": "可选敏感性分析结果；仅作为计算书附录资料写入。",
                "additionalProperties": True,
            },
            "reportImages": {
                "type": "object",
                "description": "可选计算书图片资源，例如结构预览、变形图、内力图。平面桁架和平面框架 DOCX 仅使用前端同源结构预览和模型叠加工程图；缺失时跳过对应插图，不插入后端简化兜底图。",
                "additionalProperties": True,
            },
            "reportOptions": {
                "type": "object",
                "description": "可选计算书模板与数据曲线设置；结构预览和核心工程图固定导出。",
                "properties": {
                    "template": {
                        "type": "string",
                        "enum": list(report_option_values("templates")),
                        "default": default_report_options()["template"],
                        "description": "计算书内容模板。",
                    },
                    "figureMode": {
                        "type": "string",
                        "enum": list(report_option_values("figureModes")),
                        "default": default_report_options()["figureMode"],
                        "description": "是否在核心工程图之外附加数据曲线。",
                    },
                    "figureScope": {
                        "type": "string",
                        "enum": list(report_option_values("figureScopes")),
                        "default": default_report_options()["figureScope"],
                        "description": "兼容字段；当前固定为结构预览与全部核心工程图。",
                    },
                },
                "additionalProperties": True,
            },
        },
        "additionalProperties": True,
    }


def _schema_registry_response_schema() -> Dict[str, Any]:
    return {
        "type": "object",
        "required": ["success", "operation", "version", "schemaVersion", "schemas", "schemaIds"],
        "properties": {
            "success": {"type": "boolean", "const": True},
            "operation": {"type": "string", "const": "list_schemas"},
            "version": {"type": "string"},
            "schemaVersion": {"type": "string"},
            "schemas": {"type": "object", "additionalProperties": {"type": "object"}},
            "schemaIds": {"type": "array", "items": {"type": "string"}},
        },
        "additionalProperties": True,
    }


def _public_example_projects_response_schema() -> Dict[str, Any]:
    benchmark_meta = {
        "type": "object",
        "required": ["caseId", "sourceType", "sourceLabel"],
        "properties": {
            "caseId": {"type": "string"},
            "category": {"type": "string"},
            "title": {"type": "string"},
            "purpose": {"type": "string"},
            "sourceType": {"type": "string"},
            "sourceLabel": {"type": "string"},
            "reference": {"type": "string"},
            "method": {"type": "string"},
            "sourceLinks": {"type": "array", "items": {"type": "string", "format": "uri"}},
            "checkedMetrics": {"type": "array", "items": {"type": "string"}},
            "metricSummary": {"type": "string"},
            "expectedSummary": {"type": "string"},
            "toleranceSummary": {"type": "string"},
            "expected": {"type": "object", "additionalProperties": True},
            "tolerances": {"type": "object", "additionalProperties": True},
        },
        "additionalProperties": True,
    }
    analysis_object = {
        "type": "object",
        "required": ["id", "name", "type", "state", "benchmark"],
        "properties": {
            "id": {"type": "string"},
            "name": {"type": "string"},
            "type": {"type": "string", "enum": ["beam", "truss", "frame"]},
            "state": {"type": "object", "additionalProperties": True},
            "benchmark": benchmark_meta,
        },
        "additionalProperties": True,
    }
    solver_project = {
        "type": "object",
        "required": ["id", "name", "activeObjectId", "objects", "settings"],
        "properties": {
            "id": {"type": "string"},
            "name": {"type": "string"},
            "activeObjectId": {"type": "string"},
            "objects": {"type": "array", "items": analysis_object},
            "settings": {"type": "object", "additionalProperties": True},
        },
        "additionalProperties": True,
    }
    return {
        "type": "object",
        "required": ["schemaVersion", "catalogUpdatedAt", "caseCount", "projects"],
        "properties": {
            "schemaVersion": {"type": "integer", "const": 1},
            "catalogUpdatedAt": {"type": "string"},
            "caseCount": {"type": "integer"},
            "projects": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": ["id", "title", "caseCount", "project"],
                    "properties": {
                        "id": {"type": "string"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "analysisTypes": {"type": "array", "items": {"type": "string"}},
                        "caseCategories": {"type": "array", "items": {"type": "string"}},
                        "caseCount": {"type": "integer"},
                        "sourceTypes": {"type": "array", "items": {"type": "string"}},
                        "project": solver_project,
                    },
                    "additionalProperties": True,
                },
            },
        },
        "additionalProperties": True,
    }
