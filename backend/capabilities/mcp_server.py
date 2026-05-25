from __future__ import annotations

import json
import sys
from typing import Any, Dict, Mapping

from backend.capabilities.solver_tools import TOOL_HANDLERS, tool_result_text

PROTOCOL_VERSION = "2025-06-18"
SERVER_NAME = "archsight-solver-mcp"
SERVER_VERSION = "0.1.0"

QUANTITY_SCHEMA = {
    "type": "object",
    "required": ["value", "unit"],
    "properties": {
        "value": {"type": "number"},
        "unit": {"type": "string"},
    },
}

LOAD_SCHEMA = {
    "type": "object",
    "required": ["value", "unit", "case"],
    "properties": {
        "value": {"type": "number"},
        "unit": {"type": "string"},
        "case": {"type": "string", "enum": ["uniform", "udl"]},
    },
}

BEAM_DEFLECTION_SCHEMA = {
    "type": "object",
    "required": ["span", "elasticModulus", "secondMomentOfArea", "load"],
    "properties": {
        "span": {**QUANTITY_SCHEMA, "description": "跨度，例如 {value: 6, unit: 'm'}"},
        "elasticModulus": {**QUANTITY_SCHEMA, "description": "弹性模量，例如 {value: 210, unit: 'GPa'}"},
        "secondMomentOfArea": {**QUANTITY_SCHEMA, "description": "截面惯性矩，例如 {value: 4500, unit: 'cm4'}"},
        "load": {**LOAD_SCHEMA, "description": "均布荷载，例如 {value: 10, unit: 'kN/m', case: 'uniform'}"},
        "boundaryCondition": {"type": "string", "enum": ["simply_supported", "cantilever", "continuous"]},
    },
}

BEAM_SERVICEABILITY_SCHEMA = {
    **BEAM_DEFLECTION_SCHEMA,
    "properties": {
        **BEAM_DEFLECTION_SCHEMA["properties"],
        "deflectionLimitRatio": {"type": "number", "default": 250},
    },
}

FRAME_TOOL_SCHEMA = {
    "type": "object",
    "anyOf": [{"required": ["payload"]}, {"required": ["structure"]}],
    "properties": {
        "payload": {"type": "object", "description": "完整 frame API payload。"},
        "structure": {"type": "object", "description": "frame payload 中的 structure 对象。"},
        "targetNodeId": {"type": "string", "description": "可选，返回指定节点位移结果。"},
        "materialId": {"type": "string"},
        "projectName": {"type": "string"},
    },
}

TRUSS_TOOL_SCHEMA = {
    "type": "object",
    "anyOf": [{"required": ["payload"]}, {"required": ["structure"]}],
    "properties": {
        "payload": {"type": "object", "description": "完整 truss API payload。"},
        "structure": {"type": "object", "description": "truss payload 中的 structure 对象。"},
        "targetMemberId": {"type": "string", "description": "可选，返回指定杆件轴力结果。"},
        "materialId": {"type": "string"},
        "projectName": {"type": "string"},
    },
}


TOOL_DEFINITIONS = [
    {
        "name": "beam_deflection",
        "title": "梁挠度计算",
        "description": "计算单跨梁在均布荷载下的最大绝对挠度，返回本地工具结果。",
        "inputSchema": BEAM_DEFLECTION_SCHEMA,
    },
    {
        "name": "beam_deflection_serviceability_check",
        "title": "梁挠度限值校核",
        "description": "按挠度限值比执行梁正常使用校核，当前不执行强度或稳定设计。",
        "inputSchema": BEAM_SERVICEABILITY_SCHEMA,
    },
    {
        "name": "frame_displacement",
        "title": "平面框架位移求解",
        "description": "调用现有二维平面框架刚度法求解，返回最大位移、控制节点和内力控制摘要。",
        "inputSchema": FRAME_TOOL_SCHEMA,
    },
    {
        "name": "truss_member_force",
        "title": "平面桁架杆件轴力求解",
        "description": "调用现有二维平面桁架杆单元法求解，返回最大轴力、控制杆件和指定杆件结果。",
        "inputSchema": TRUSS_TOOL_SCHEMA,
    },
]

TOOL_SCHEMAS = {tool["name"]: tool["inputSchema"] for tool in TOOL_DEFINITIONS}


class SchemaValidationError(ValueError):
    """MCP tools/call arguments 不满足本服务发布的 inputSchema 子集。"""


def _response(request_id: Any, result: Any) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "result": result}


def _error(request_id: Any, code: int, message: str) -> Dict[str, Any]:
    return {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}


def _matches_type(value: Any, expected_type: str) -> bool:
    if expected_type == "object":
        return isinstance(value, Mapping)
    if expected_type == "string":
        return isinstance(value, str)
    if expected_type == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    if expected_type == "boolean":
        return isinstance(value, bool)
    if expected_type == "array":
        return isinstance(value, list)
    return True


def _type_label(value: Any) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, Mapping):
        return "object"
    if isinstance(value, list):
        return "array"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if value is None:
        return "null"
    return type(value).__name__


def _validate_schema(value: Any, schema: Mapping[str, Any], path: str = "arguments") -> None:
    expected_type = schema.get("type")
    if isinstance(expected_type, str) and not _matches_type(value, expected_type):
        raise SchemaValidationError(f"{path} 必须是 {expected_type}，当前为 {_type_label(value)}")

    enum_values = schema.get("enum")
    if isinstance(enum_values, list) and value not in enum_values:
        allowed = "、".join(str(item) for item in enum_values)
        raise SchemaValidationError(f"{path} 必须为以下值之一: {allowed}")

    any_of = schema.get("anyOf")
    if isinstance(any_of, list) and any_of:
        errors = []
        for branch in any_of:
            try:
                _validate_schema(value, branch, path)
                break
            except SchemaValidationError as exc:
                errors.append(str(exc))
        else:
            raise SchemaValidationError(f"{path} 不满足任一可选输入形态: {'; '.join(errors)}")

    if not isinstance(value, Mapping):
        return

    required = schema.get("required") or []
    for key in required:
        if key not in value:
            raise SchemaValidationError(f"{path}.{key} 为必填字段")

    properties = schema.get("properties") or {}
    if isinstance(properties, Mapping):
        for key, property_schema in properties.items():
            if key in value and isinstance(property_schema, Mapping):
                _validate_schema(value[key], property_schema, f"{path}.{key}")


def _invalid_tool_call(name: str, message: str) -> Dict[str, Any]:
    return {
        "content": [{"type": "text", "text": message}],
        "structuredContent": {
            "capabilityId": f"solver.{name}",
            "capabilityVersion": SERVER_VERSION,
            "status": "invalid_input",
            "inputValidated": False,
            "warnings": [message],
        },
        "isError": True,
    }


def _call_tool(params: Mapping[str, Any]) -> Dict[str, Any]:
    name = str(params.get("name") or "")
    arguments = params.get("arguments") or {}
    if not isinstance(arguments, Mapping):
        return {
            "content": [{"type": "text", "text": "工具 arguments 必须是 object"}],
            "isError": True,
        }
    handler = TOOL_HANDLERS.get(name)
    if handler is None:
        return {
            "content": [{"type": "text", "text": f"未知工具: {name}"}],
            "isError": True,
        }
    try:
        _validate_schema(arguments, TOOL_SCHEMAS[name])
    except SchemaValidationError as exc:
        return _invalid_tool_call(name, str(exc))
    result = handler(arguments)
    is_error = result.get("status") in {"invalid_input", "error"}
    return {
        "content": [{"type": "text", "text": tool_result_text(result)}],
        "structuredContent": result,
        "isError": bool(is_error),
    }


def handle_message(message: Mapping[str, Any]) -> Dict[str, Any] | None:
    request_id = message.get("id")
    method = message.get("method")
    params = message.get("params") or {}
    if method == "notifications/initialized":
        return None
    if method == "initialize":
        return _response(
            request_id,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": SERVER_NAME, "version": SERVER_VERSION},
            },
        )
    if method == "ping":
        return _response(request_id, {})
    if method == "tools/list":
        return _response(request_id, {"tools": TOOL_DEFINITIONS})
    if method == "tools/call":
        if not isinstance(params, Mapping):
            return _error(request_id, -32602, "tools/call params 必须是 object")
        return _response(request_id, _call_tool(params))
    return _error(request_id, -32601, f"Method not found: {method}")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")

    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            message = json.loads(line)
            if not isinstance(message, dict):
                response = _error(None, -32600, "JSON-RPC message must be object")
            else:
                response = handle_message(message)
        except json.JSONDecodeError as exc:
            response = _error(None, -32700, f"Parse error: {exc.msg}")
        except Exception as exc:  # pragma: no cover - process boundary safety
            response = _error(None, -32603, f"Internal error: {exc}")
        if response is not None:
            sys.stdout.write(json.dumps(response, ensure_ascii=False, separators=(",", ":")) + "\n")
            sys.stdout.flush()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
