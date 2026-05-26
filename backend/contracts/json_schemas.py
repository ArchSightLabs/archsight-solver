from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict

API_SCHEMA_VERSION = "2026-05-26"


QUANTITY_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["value", "unit"],
    "properties": {
        "value": {"type": "number"},
        "unit": {"type": "string"},
    },
    "additionalProperties": False,
}

LOAD_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["value", "unit", "case"],
    "properties": {
        "value": {"type": "number"},
        "unit": {"type": "string"},
        "case": {"type": "string", "enum": ["uniform", "udl"]},
    },
    "additionalProperties": False,
}

MATERIAL_PROPERTY_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "E_GPa": {"type": "number", "description": "弹性模量，单位 GPa。"},
        "E": {"type": "number", "description": "弹性模量兼容字段，单位 GPa。"},
        "A_cm2": {"type": "number", "description": "截面面积，单位 cm^2。"},
        "I_cm4": {"type": "number", "description": "截面惯性矩，单位 cm^4。"},
    },
    "additionalProperties": True,
}

NODE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["id", "x", "y"],
    "properties": {
        "id": {"type": "string"},
        "x": {"type": "number", "description": "节点 X 坐标，单位 m。"},
        "y": {"type": "number", "description": "节点 Y 坐标，单位 m。"},
        "supportType": {
            "type": "string",
            "enum": ["free", "pinned", "roller", "fixed"],
            "default": "free",
        },
        "springs": {
            "type": "array",
            "items": {
                "type": "object",
                "required": ["dof", "stiffnessKnMPerRad"],
                "properties": {
                    "dof": {"type": "string", "enum": ["ux", "uy", "rz"]},
                    "stiffnessKnMPerRad": {"type": "number"},
                },
                "additionalProperties": False,
            },
        },
    },
    "additionalProperties": True,
}

FRAME_MEMBER_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["id", "start", "end"],
    "properties": {
        "id": {"type": "string"},
        "start": {"type": "string"},
        "end": {"type": "string"},
        "kind": {"type": "string"},
        "elementType": {"type": "string", "enum": ["frame", "beam", "column"]},
        **MATERIAL_PROPERTY_SCHEMA["properties"],
    },
    "additionalProperties": True,
}

TRUSS_MEMBER_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["id", "start", "end"],
    "properties": {
        "id": {"type": "string"},
        "start": {"type": "string"},
        "end": {"type": "string"},
        "kind": {"type": "string"},
        "elementType": {"type": "string", "enum": ["truss"]},
        **MATERIAL_PROPERTY_SCHEMA["properties"],
    },
    "additionalProperties": True,
}

NODAL_LOAD_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["type", "node"],
    "properties": {
        "type": {"type": "string", "enum": ["nodal"]},
        "node": {"type": "string"},
        "fxKn": {"type": "number", "description": "节点水平力，单位 kN，右为正。"},
        "fyKn": {"type": "number", "description": "节点竖向力，单位 kN，上为正。"},
        "mzKnM": {"type": "number", "description": "节点弯矩，单位 kN·m，逆时针为正。"},
    },
    "additionalProperties": True,
}

MEMBER_DISTRIBUTED_LOAD_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["type", "member"],
    "properties": {
        "type": {"type": "string", "enum": ["distributed"]},
        "member": {"type": "string"},
        "direction": {"type": "string", "enum": ["global_y", "local_y"], "default": "global_y"},
        "wyKnPerM": {"type": "number", "description": "构件均布荷载，单位 kN/m。"},
        "qStartKnPerM": {"type": "number", "description": "线性荷载起点强度，单位 kN/m。"},
        "qEndKnPerM": {"type": "number", "description": "线性荷载终点强度，单位 kN/m。"},
    },
    "additionalProperties": True,
}

MEMBER_POINT_LOAD_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["type", "member", "forceKn"],
    "properties": {
        "type": {"type": "string", "enum": ["member_point"]},
        "member": {"type": "string"},
        "forceKn": {"type": "number", "description": "构件集中力，单位 kN。"},
        "positionRatio": {"type": "number", "minimum": 0, "maximum": 1},
    },
    "additionalProperties": True,
}

STRUCTURAL_LOAD_SCHEMA: Dict[str, Any] = {
    "oneOf": [NODAL_LOAD_SCHEMA, MEMBER_DISTRIBUTED_LOAD_SCHEMA, MEMBER_POINT_LOAD_SCHEMA]
}

ASMS_BEAM_MODEL_SCHEMA: Dict[str, Any] = {
    "$id": "https://archsight.cn/schemas/solver/asms-beam-model.schema.json",
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ASMS-JSON 梁系模型",
    "type": "object",
    "required": ["beamType", "loadType", "spans"],
    "properties": {
        "analysisType": {"type": "string", "const": "beam"},
        "projectName": {"type": "string"},
        "materialId": {"type": "string"},
        "beamType": {"type": "string", "enum": ["continuous", "simply_supported", "cantilever"]},
        "loadType": {"type": "string", "enum": ["uniform", "point", "linear"]},
        "spans": {"type": "array", "items": {"type": "number"}, "minItems": 1},
        "spanProperties": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "E": {"type": "number", "description": "弹性模量，单位 GPa。"},
                    "I": {"type": "number", "description": "截面惯性矩，单位 cm^4。"},
                },
                "additionalProperties": True,
            },
        },
        "E": {"type": "number", "description": "默认弹性模量，单位 GPa。"},
        "I": {"type": "number", "description": "默认截面惯性矩，单位 cm^4。"},
        "q": {"type": "number", "description": "均布荷载，单位 kN/m，向下通常取正。"},
        "pointLoadKn": {"type": "number", "description": "集中荷载，单位 kN。"},
        "pointLoadPositionM": {"type": "number", "description": "集中荷载位置，单位 m。"},
        "uniformLoadStartM": {"type": "number", "description": "局部均布荷载起点，单位 m。"},
        "uniformLoadEndM": {"type": "number", "description": "局部均布荷载终点，单位 m。"},
        "supports": {"type": "array", "items": {"type": "object"}},
        "loads": {"type": "array", "items": {"type": "object"}},
    },
    "additionalProperties": True,
}

ASMS_FRAME_MODEL_SCHEMA: Dict[str, Any] = {
    "$id": "https://archsight.cn/schemas/solver/asms-frame-model.schema.json",
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ASMS-JSON 二维平面框架模型",
    "type": "object",
    "required": ["analysisType", "structure"],
    "properties": {
        "analysisType": {"type": "string", "enum": ["frame", "frame2d", "portal_frame"]},
        "projectName": {"type": "string"},
        "materialId": {"type": "string"},
        "structure": {
            "type": "object",
            "required": ["nodes", "members"],
            "properties": {
                "template": {"type": "string"},
                "nodes": {"type": "array", "items": NODE_SCHEMA},
                "members": {"type": "array", "items": FRAME_MEMBER_SCHEMA},
                "loads": {"type": "array", "items": STRUCTURAL_LOAD_SCHEMA},
                "loadCases": {"type": "array", "items": {"type": "object"}},
                "loadCombinations": {"type": "array", "items": {"type": "object"}},
            },
            "additionalProperties": True,
        },
    },
    "additionalProperties": True,
}

ASMS_TRUSS_MODEL_SCHEMA: Dict[str, Any] = {
    "$id": "https://archsight.cn/schemas/solver/asms-truss-model.schema.json",
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ASMS-JSON 二维平面桁架模型",
    "type": "object",
    "required": ["analysisType", "structure"],
    "properties": {
        "analysisType": {"type": "string", "enum": ["truss", "truss2d"]},
        "projectName": {"type": "string"},
        "materialId": {"type": "string"},
        "structure": {
            "type": "object",
            "required": ["nodes", "members"],
            "properties": {
                "template": {"type": "string"},
                "nodes": {"type": "array", "items": NODE_SCHEMA},
                "members": {"type": "array", "items": TRUSS_MEMBER_SCHEMA},
                "loads": {"type": "array", "items": NODAL_LOAD_SCHEMA},
                "loadCases": {"type": "array", "items": {"type": "object"}},
                "loadCombinations": {"type": "array", "items": {"type": "object"}},
            },
            "additionalProperties": True,
        },
    },
    "additionalProperties": True,
}

ASMS_MODEL_SCHEMA: Dict[str, Any] = {
    "$id": "https://archsight.cn/schemas/solver/asms-model.schema.json",
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ArchSight Structural Model Schema (ASMS-JSON)",
    "description": "用于描述梁系、二维平面框架和二维平面桁架的开放 JSON 力学数据协议。",
    "oneOf": [ASMS_BEAM_MODEL_SCHEMA, ASMS_FRAME_MODEL_SCHEMA, ASMS_TRUSS_MODEL_SCHEMA],
}

BEAM_DEFLECTION_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": "https://archsight.cn/schemas/solver/beam-deflection-input.schema.json",
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "梁挠度能力输入",
    "type": "object",
    "required": ["span", "elasticModulus", "secondMomentOfArea", "load"],
    "properties": {
        "projectName": {"type": "string"},
        "span": {**QUANTITY_SCHEMA, "description": "跨度，例如 {value: 6, unit: 'm'}"},
        "elasticModulus": {**QUANTITY_SCHEMA, "description": "弹性模量，例如 {value: 210, unit: 'GPa'}"},
        "secondMomentOfArea": {**QUANTITY_SCHEMA, "description": "截面惯性矩，例如 {value: 4500, unit: 'cm4'}"},
        "load": {**LOAD_SCHEMA, "description": "均布荷载，例如 {value: 10, unit: 'kN/m', case: 'uniform'}"},
        "boundaryCondition": {
            "type": "string",
            "enum": ["simply_supported", "cantilever", "continuous"],
            "default": "simply_supported",
        },
    },
    "additionalProperties": False,
}

BEAM_SERVICEABILITY_INPUT_SCHEMA: Dict[str, Any] = {
    **BEAM_DEFLECTION_INPUT_SCHEMA,
    "$id": "https://archsight.cn/schemas/solver/beam-serviceability-input.schema.json",
    "title": "梁挠度正常使用校核输入",
    "properties": {
        **BEAM_DEFLECTION_INPUT_SCHEMA["properties"],
        "deflectionLimitRatio": {"type": "number", "default": 250},
    },
}

SOLVER_PAYLOAD_SCHEMA: Dict[str, Any] = {
    "$id": "https://archsight.cn/schemas/solver/calculate-payload.schema.json",
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "结构求解 API 输入",
    "type": "object",
    "properties": {
        "analysisType": {
            "type": "string",
            "enum": ["beam", "frame", "frame2d", "portal_frame", "truss", "truss2d"],
            "default": "beam",
        },
        "projectName": {"type": "string"},
        "materialId": {"type": "string"},
        "beamType": {"type": "string"},
        "loadType": {"type": "string"},
        "spans": {"type": "array", "items": {"type": "number"}},
        "structure": {"type": "object"},
    },
    "oneOf": [ASMS_BEAM_MODEL_SCHEMA, ASMS_FRAME_MODEL_SCHEMA, ASMS_TRUSS_MODEL_SCHEMA],
    "additionalProperties": True,
}

SOLVER_JOB_REQUEST_SCHEMA: Dict[str, Any] = {
    "$id": "https://archsight.cn/schemas/solver/job-request.schema.json",
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "异步求解作业提交输入",
    "type": "object",
    "required": ["payload"],
    "properties": {
        "operation": {
            "type": "string",
            "enum": ["calculate", "preview", "sensitivity"],
            "default": "calculate",
            "description": "异步执行的求解操作。",
        },
        "payload": SOLVER_PAYLOAD_SCHEMA,
        "clientJobId": {
            "type": "string",
            "description": "调用方自定义追踪 ID；不参与幂等去重。",
        },
    },
    "additionalProperties": False,
}

CAPABILITY_RESULT_SCHEMA: Dict[str, Any] = {
    "$id": "https://archsight.cn/schemas/solver/capability-result.schema.json",
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
    },
    "additionalProperties": True,
}

FRAME_TOOL_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": "https://archsight.cn/schemas/solver/frame-tool-input.schema.json",
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
    "$id": "https://archsight.cn/schemas/solver/truss-tool-input.schema.json",
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
    "$id": "https://archsight.cn/schemas/solver/calculate-tool-input.schema.json",
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
    "$id": "https://archsight.cn/schemas/solver/sensitivity-tool-input.schema.json",
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "敏感性分析工具输入",
    "type": "object",
    "required": ["payload"],
    "properties": {
        "payload": SOLVER_PAYLOAD_SCHEMA,
    },
    "additionalProperties": False,
}

BENCHMARK_CASE_LIST_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": "https://archsight.cn/schemas/solver/benchmark-case-list-input.schema.json",
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "基准算例列表工具输入",
    "type": "object",
    "properties": {
        "category": {
            "type": "string",
            "enum": ["beam", "frame", "truss", "frame-beam-verify", "truss-verify"],
        }
    },
    "additionalProperties": False,
}

BENCHMARK_CASE_RUN_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": "https://archsight.cn/schemas/solver/benchmark-case-run-input.schema.json",
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "基准算例执行工具输入",
    "type": "object",
    "required": ["caseId"],
    "properties": {
        "caseId": {"type": "string"},
    },
    "additionalProperties": False,
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
    "benchmark-case-list-input": BENCHMARK_CASE_LIST_INPUT_SCHEMA,
    "benchmark-case-run-input": BENCHMARK_CASE_RUN_INPUT_SCHEMA,
}


def schema_registry() -> Dict[str, Dict[str, Any]]:
    return deepcopy(SCHEMA_REGISTRY)


def schema_by_id(schema_id: str) -> Dict[str, Any] | None:
    schema = SCHEMA_REGISTRY.get(schema_id)
    return deepcopy(schema) if schema else None
