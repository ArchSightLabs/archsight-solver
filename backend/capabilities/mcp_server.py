from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any, Dict, Mapping

from backend.benchmarks.catalog import load_benchmark_catalog
from backend.capabilities.solver_tools import TOOL_HANDLERS, tool_result_text
from backend.contracts.json_schemas import (
    BEAM_DEFLECTION_INPUT_SCHEMA,
    BEAM_SERVICEABILITY_INPUT_SCHEMA,
    BENCHMARK_CASE_LIST_INPUT_SCHEMA,
    BENCHMARK_CASE_RUN_INPUT_SCHEMA,
    CALCULATE_TOOL_INPUT_SCHEMA,
    CAPABILITY_RESULT_SCHEMA,
    FRAME_TOOL_INPUT_SCHEMA,
    SENSITIVITY_TOOL_INPUT_SCHEMA,
    TRUSS_TOOL_INPUT_SCHEMA,
    schema_registry,
)

PROTOCOL_VERSION = "2025-06-18"
SERVER_NAME = "archsight-solver-mcp"
SERVER_VERSION = "0.1.0"

ROOT = Path(__file__).resolve().parents[2]
ASMS_PROTOCOL_DOC_PATH = ROOT / "docs" / "asms-json-schema.md"
AGENT_FEW_SHOT_PATH = ROOT / "data" / "agent_workflows" / "asms_few_shots.json"
BENCHMARK_DOC_PATH = ROOT / "docs" / "verification" / "benchmark-validation-report.md"
MCP_RESOURCES_DOC_PATH = ROOT / "docs" / "mcp-resources.md"

FILE_RESOURCE_PATHS = {
    "archsight://docs/asms-json": ASMS_PROTOCOL_DOC_PATH,
    "archsight://examples/asms-few-shots": AGENT_FEW_SHOT_PATH,
    "archsight://docs/benchmark-validation": BENCHMARK_DOC_PATH,
    "archsight://docs/mcp-resources": MCP_RESOURCES_DOC_PATH,
}

READ_ONLY_ANNOTATIONS = {
    "readOnlyHint": True,
    "destructiveHint": False,
    "idempotentHint": True,
    "openWorldHint": False,
}


TOOL_DEFINITIONS = [
    {
        "name": "beam_deflection",
        "title": "梁挠度计算",
        "description": "计算单跨梁在均布荷载下的最大绝对挠度，返回本地工具结果。",
        "inputSchema": BEAM_DEFLECTION_INPUT_SCHEMA,
        "outputSchema": CAPABILITY_RESULT_SCHEMA,
        "annotations": {**READ_ONLY_ANNOTATIONS, "title": "梁挠度计算"},
    },
    {
        "name": "beam_deflection_serviceability_check",
        "title": "梁挠度限值校核",
        "description": "按挠度限值比执行梁正常使用校核，当前不执行强度或稳定设计。",
        "inputSchema": BEAM_SERVICEABILITY_INPUT_SCHEMA,
        "outputSchema": CAPABILITY_RESULT_SCHEMA,
        "annotations": {**READ_ONLY_ANNOTATIONS, "title": "梁挠度限值校核"},
    },
    {
        "name": "frame_displacement",
        "title": "平面框架位移求解",
        "description": "调用现有二维平面框架刚度法求解，返回最大位移、控制节点和内力控制摘要。",
        "inputSchema": FRAME_TOOL_INPUT_SCHEMA,
        "outputSchema": CAPABILITY_RESULT_SCHEMA,
        "annotations": {**READ_ONLY_ANNOTATIONS, "title": "平面框架位移求解"},
    },
    {
        "name": "truss_member_force",
        "title": "平面桁架杆件轴力求解",
        "description": "调用现有二维平面桁架杆单元法求解，返回最大轴力、控制杆件和指定杆件结果。",
        "inputSchema": TRUSS_TOOL_INPUT_SCHEMA,
        "outputSchema": CAPABILITY_RESULT_SCHEMA,
        "annotations": {**READ_ONLY_ANNOTATIONS, "title": "平面桁架杆件轴力求解"},
    },
    {
        "name": "calculate",
        "title": "通用结构求解",
        "description": "调用 /api/calculate 同源计算链路，支持梁系、平面框架和平面桁架 payload。",
        "inputSchema": CALCULATE_TOOL_INPUT_SCHEMA,
        "outputSchema": CAPABILITY_RESULT_SCHEMA,
        "annotations": {**READ_ONLY_ANNOTATIONS, "title": "通用结构求解"},
    },
    {
        "name": "sensitivity_analysis",
        "title": "参数敏感性分析",
        "description": "调用敏感性分析链路，返回扰动参数、响应指标和曲线数据。",
        "inputSchema": SENSITIVITY_TOOL_INPUT_SCHEMA,
        "outputSchema": CAPABILITY_RESULT_SCHEMA,
        "annotations": {**READ_ONLY_ANNOTATIONS, "title": "参数敏感性分析"},
    },
    {
        "name": "benchmark_case_list",
        "title": "基准算例列表",
        "description": "列出公开验证集中的基准算例及其来源类型、校核指标。",
        "inputSchema": BENCHMARK_CASE_LIST_INPUT_SCHEMA,
        "outputSchema": CAPABILITY_RESULT_SCHEMA,
        "annotations": {**READ_ONLY_ANNOTATIONS, "title": "基准算例列表"},
    },
    {
        "name": "benchmark_case_run",
        "title": "执行基准算例",
        "description": "按 caseId 执行公开验证集算例，并返回实际值、标准值、容许误差和通过状态。",
        "inputSchema": BENCHMARK_CASE_RUN_INPUT_SCHEMA,
        "outputSchema": CAPABILITY_RESULT_SCHEMA,
        "annotations": {**READ_ONLY_ANNOTATIONS, "title": "执行基准算例"},
    },
]

TOOL_SCHEMAS = {tool["name"]: tool["inputSchema"] for tool in TOOL_DEFINITIONS}

RESOURCE_DEFINITIONS = [
    {
        "uri": "archsight://schemas",
        "name": "json-schemas",
        "title": "ArchSight Solver JSON Schema Registry",
        "description": "结构求解 API、异步作业和 MCP 能力输入输出契约。",
        "mimeType": "application/json",
    },
    {
        "uri": "archsight://docs/asms-json",
        "name": "asms-json-protocol",
        "title": "ASMS-JSON 结构力学数据协议",
        "description": "梁系、二维平面框架和二维平面桁架的公开结构模型协议说明。",
        "mimeType": "text/markdown",
    },
    {
        "uri": "archsight://examples/asms-few-shots",
        "name": "asms-few-shot-examples",
        "title": "ASMS-JSON Agent few-shot 样例库",
        "description": "自然语言工况、ASMS-JSON、CLI/MCP 调用、benchmark 复核和计算书导出的可测试样例。",
        "mimeType": "application/json",
    },
    {
        "uri": "archsight://benchmark/catalog",
        "name": "benchmark-catalog",
        "title": "公开验证集算例目录",
        "description": "梁系、平面框架、平面桁架基准算例及验证元数据。",
        "mimeType": "application/json",
    },
    {
        "uri": "archsight://docs/benchmark-validation",
        "name": "benchmark-validation-doc",
        "title": "公开验证集报告",
        "description": "公开验证集算例、通过状态、关键校核和专业边界。",
        "mimeType": "text/markdown",
    },
    {
        "uri": "archsight://docs/mcp-resources",
        "name": "mcp-resource-index",
        "title": "MCP 资源清单与生成口径",
        "description": "MCP Resources 的 URI、仓库路径、更新责任和验收检查。",
        "mimeType": "text/markdown",
    },
]

PROMPT_DEFINITIONS = [
    {
        "name": "solver-capability-call",
        "title": "结构求解 Capability 调用",
        "description": "把自然语言工况整理成确定性求解器输入，并保留缺失条件。",
        "arguments": [{"name": "task", "description": "结构计算任务或工况描述。", "required": True}],
    },
    {
        "name": "benchmark-validation-review",
        "title": "验证集复核报告",
        "description": "基于 benchmark_case_run 结果生成专业复核摘要。",
        "arguments": [{"name": "caseId", "description": "基准算例 ID。", "required": True}],
    },
]


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
    if schema.get("additionalProperties") is False and isinstance(properties, Mapping):
        extra_keys = sorted(set(value) - set(properties))
        if extra_keys:
            raise SchemaValidationError(f"{path} 包含未声明字段: {', '.join(extra_keys)}")


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


def _read_required_resource_text(uri: str, path: Path) -> str:
    if not path.exists():
        relative_path = path.relative_to(ROOT)
        raise SchemaValidationError(f"资源 {uri} 指向的文件不存在: {relative_path}")
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        relative_path = path.relative_to(ROOT)
        raise SchemaValidationError(f"资源 {uri} 指向的文件为空: {relative_path}")
    return text


def _read_resource(uri: str) -> Dict[str, Any]:
    if uri == "archsight://schemas":
        text = json.dumps(schema_registry(), ensure_ascii=False, indent=2, sort_keys=True)
        mime_type = "application/json"
    elif uri == "archsight://docs/asms-json":
        text = _read_required_resource_text(uri, FILE_RESOURCE_PATHS[uri])
        mime_type = "text/markdown"
    elif uri == "archsight://examples/asms-few-shots":
        text = _read_required_resource_text(uri, FILE_RESOURCE_PATHS[uri])
        mime_type = "application/json"
    elif uri == "archsight://benchmark/catalog":
        text = json.dumps(load_benchmark_catalog(), ensure_ascii=False, indent=2, sort_keys=True)
        mime_type = "application/json"
    elif uri == "archsight://docs/benchmark-validation":
        text = _read_required_resource_text(uri, FILE_RESOURCE_PATHS[uri])
        mime_type = "text/markdown"
    elif uri == "archsight://docs/mcp-resources":
        text = _read_required_resource_text(uri, FILE_RESOURCE_PATHS[uri])
        mime_type = "text/markdown"
    else:
        raise SchemaValidationError(f"未知资源: {uri}")
    return {"contents": [{"uri": uri, "mimeType": mime_type, "text": text}]}


def _get_prompt(params: Mapping[str, Any]) -> Dict[str, Any]:
    name = str(params.get("name") or "")
    arguments = params.get("arguments") or {}
    if not isinstance(arguments, Mapping):
        arguments = {}
    if name == "solver-capability-call":
        task = str(arguments.get("task") or "").strip() or "请整理结构计算任务。"
        return {
            "description": "结构求解 Capability 调用提示词",
            "messages": [
                {
                    "role": "user",
                    "content": {
                        "type": "text",
                        "text": (
                            "请将以下结构计算任务转换为 ArchSight Solver 的确定性工具调用输入。"
                            "必须保留单位、荷载、边界条件和缺失项，不得由大模型自行口算关键数值。\n\n"
                            f"任务：{task}"
                        ),
                    },
                }
            ],
        }
    if name == "benchmark-validation-review":
        case_id = str(arguments.get("caseId") or "").strip() or "<caseId>"
        return {
            "description": "验证集复核报告提示词",
            "messages": [
                {
                    "role": "user",
                    "content": {
                        "type": "text",
                        "text": (
                            f"请调用 benchmark_case_run，caseId={case_id}，并用专业简体中文输出："
                            "算例来源、校核指标、误差结论、风险边界和是否可作为公开背书材料。"
                        ),
                    },
                }
            ],
        }
    raise SchemaValidationError(f"未知 prompt: {name}")


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
                "capabilities": {
                    "tools": {"listChanged": False},
                    "resources": {"listChanged": False},
                    "prompts": {"listChanged": False},
                },
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
    if method == "resources/list":
        return _response(request_id, {"resources": RESOURCE_DEFINITIONS})
    if method == "resources/read":
        if not isinstance(params, Mapping):
            return _error(request_id, -32602, "resources/read params 必须是 object")
        try:
            return _response(request_id, _read_resource(str(params.get("uri") or "")))
        except SchemaValidationError as exc:
            return _error(request_id, -32602, str(exc))
    if method == "prompts/list":
        return _response(request_id, {"prompts": PROMPT_DEFINITIONS})
    if method == "prompts/get":
        if not isinstance(params, Mapping):
            return _error(request_id, -32602, "prompts/get params 必须是 object")
        try:
            return _response(request_id, _get_prompt(params))
        except SchemaValidationError as exc:
            return _error(request_id, -32602, str(exc))
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
