from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict

from backend.common.support_catalog import AnalysisType, support_specs

API_SCHEMA_VERSION = "2026-05-30"
SCHEMA_ID_BASE_URI = "https://solver.archsight.cn/schemas"


def _schema_id(name: str) -> str:
    return f"{SCHEMA_ID_BASE_URI}/{name}.schema.json"


def _support_type_enum(analysis_type: AnalysisType, preferred_order: tuple[str, ...]) -> list[str]:
    values = [spec.value for spec in support_specs(analysis_type)]
    ordered = [value for value in preferred_order if value in values]
    return [*ordered, *(value for value in values if value not in ordered)]


BEAM_SUPPORT_TYPE_ENUM = _support_type_enum("beam", ("pinned", "roller", "fixed", "free"))
FRAME_SUPPORT_TYPE_ENUM = _support_type_enum("frame", ("free", "pinned", "roller", "fixed"))
TRUSS_SUPPORT_TYPE_ENUM = _support_type_enum("truss", ("free", "pinned", "roller"))


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
        "materialId": {"type": "string", "description": "材料库编号；用于保留材料语义，E_GPa 仍是线弹性刚度计算的权威输入。"},
        "E_GPa": {"type": "number", "description": "弹性模量，单位 GPa。"},
        "E": {"type": "number", "description": "弹性模量兼容字段，单位 GPa。"},
        "A_cm2": {"type": "number", "description": "截面面积，单位 cm^2。"},
        "I_cm4": {"type": "number", "description": "截面惯性矩，单位 cm^4。"},
    },
    "additionalProperties": True,
}

ASMS_SCHEMA_VERSION_PROPERTY: Dict[str, Any] = {
    "type": "string",
    "const": API_SCHEMA_VERSION,
    "description": "ASMS-JSON 契约版本；用于项目文件、API、CLI/MCP 与导出链路判断字段语义。",
}

FRAME_TRANSLATIONAL_SPRING_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["dof", "stiffnessKnPerM"],
    "properties": {
        "dof": {"type": "string", "enum": ["ux", "uy"]},
        "stiffnessKnPerM": {"type": "number", "exclusiveMinimum": 0, "description": "平动弹性约束刚度，单位 kN/m。"},
    },
    "additionalProperties": False,
}

FRAME_ROTATIONAL_SPRING_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["dof", "stiffnessKnMPerRad"],
    "properties": {
        "dof": {"type": "string", "enum": ["rz"]},
        "stiffnessKnMPerRad": {"type": "number", "exclusiveMinimum": 0, "description": "转动弹性约束刚度，单位 kN·m/rad。"},
    },
    "additionalProperties": False,
}

FRAME_TRANSLATIONAL_SUPPORT_DISPLACEMENT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["dof", "displacementMm"],
    "properties": {
        "dof": {"type": "string", "enum": ["ux", "uy", "n"]},
        "displacementMm": {"type": "number", "description": "支座强制平动位移，单位 mm；n 表示带法向角滚动支座的法向位移。"},
    },
    "additionalProperties": False,
}

FRAME_ROTATIONAL_SUPPORT_DISPLACEMENT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["dof", "rotationDeg"],
    "properties": {
        "dof": {"type": "string", "enum": ["rz"]},
        "rotationDeg": {"type": "number", "description": "支座强制转角，单位 °。"},
    },
    "additionalProperties": False,
}

BEAM_TRANSLATIONAL_SPRING_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["dof", "stiffnessKnPerM"],
    "properties": {
        "dof": {"type": "string", "enum": ["v"]},
        "stiffnessKnPerM": {"type": "number", "exclusiveMinimum": 0, "description": "梁系竖向弹性约束刚度，单位 kN/m。"},
    },
    "additionalProperties": False,
}

BEAM_ROTATIONAL_SPRING_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["dof", "stiffnessKnMPerRad"],
    "properties": {
        "dof": {"type": "string", "enum": ["rz"]},
        "stiffnessKnMPerRad": {"type": "number", "exclusiveMinimum": 0, "description": "梁系转角弹性约束刚度，单位 kN·m/rad。"},
    },
    "additionalProperties": False,
}

BEAM_SUPPORT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["x"],
    "properties": {
        "id": {"type": "string", "description": "梁系支座编号。"},
        "x": {"type": "number", "description": "支座在梁轴线上的位置，单位 m。"},
        "type": {
            "type": "string",
            "enum": BEAM_SUPPORT_TYPE_ENUM,
            "description": "梁系支座类型；枚举来自共享支座目录。",
        },
        "supportType": {
            "type": "string",
            "enum": BEAM_SUPPORT_TYPE_ENUM,
            "description": "梁系支座类型兼容字段；新模型优先使用 type。",
        },
        "constraints": {
            "type": "array",
            "description": "显式支座自由度约束；未提供时按支座类型默认约束。",
            "items": {"type": "string", "enum": ["v", "rz"]},
            "uniqueItems": True,
        },
        "springs": {
            "type": "array",
            "description": "梁系支座自由度弹性约束。",
            "items": {"oneOf": [BEAM_TRANSLATIONAL_SPRING_SCHEMA, BEAM_ROTATIONAL_SPRING_SCHEMA]},
        },
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
            "enum": FRAME_SUPPORT_TYPE_ENUM,
            "default": "free",
        },
        "supportAngleDeg": {
            "type": "number",
            "description": "滚动支座法向角，单位度；仅对平面框架 roller 支座生效，90 表示竖向法向约束。",
        },
        "springs": {
            "type": "array",
            "description": "节点弹性约束；ux/uy 使用 stiffnessKnPerM，rz 使用 stiffnessKnMPerRad。",
            "items": {"oneOf": [FRAME_TRANSLATIONAL_SPRING_SCHEMA, FRAME_ROTATIONAL_SPRING_SCHEMA]},
        },
        "supportDisplacements": {
            "type": "array",
            "description": "框架节点支座位移；ux/uy/n 使用 displacementMm，rz 使用 rotationDeg，仅对相应刚性约束自由度生效。",
            "items": {"oneOf": [FRAME_TRANSLATIONAL_SUPPORT_DISPLACEMENT_SCHEMA, FRAME_ROTATIONAL_SUPPORT_DISPLACEMENT_SCHEMA]},
        },
        "condensedDofs": {
            "type": "array",
            "description": "内部铰等高级建模产生的节点凝聚自由度。",
            "items": {"type": "string", "enum": ["ux", "uy", "rz"]},
        },
    },
    "additionalProperties": True,
}

TRUSS_NODE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["id", "x", "y"],
    "properties": {
        "id": {"type": "string"},
        "x": {"type": "number", "description": "节点 X 坐标，单位 m。"},
        "y": {"type": "number", "description": "节点 Y 坐标，单位 m。"},
        "supportType": {
            "type": "string",
            "enum": TRUSS_SUPPORT_TYPE_ENUM,
            "default": "free",
            "description": "桁架节点仅含 ux/uy 平动自由度；fixed 会在旧版兼容层归并为 pinned，但新模型应使用 pinned、roller 或 free。",
        },
    },
    "not": {
        "anyOf": [
            {"required": ["supportAngleDeg"]},
            {"required": ["rollerAngleDeg"]},
            {"required": ["springs"]},
            {"required": ["supportDisplacements"]},
            {"required": ["condensedDofs"]},
        ],
    },
    "additionalProperties": True,
}

FRAME_END_RELEASES_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "description": "框架构件端部释放；当前仅支持 rz 转角释放。",
    "properties": {
        "start": {"type": "array", "items": {"type": "string", "enum": ["rz"]}},
        "end": {"type": "array", "items": {"type": "string", "enum": ["rz"]}},
    },
    "additionalProperties": False,
}

FRAME_INTERNAL_HINGE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["ratio"],
    "properties": {
        "ratio": {"type": "number", "exclusiveMinimum": 0, "exclusiveMaximum": 1, "description": "内部铰相对构件起点的位置比例。"},
    },
    "additionalProperties": False,
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
        "endReleases": FRAME_END_RELEASES_SCHEMA,
        "internalHinges": {"type": "array", "items": FRAME_INTERNAL_HINGE_SCHEMA},
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
        "startRatio": {"type": "number", "minimum": 0, "maximum": 1, "description": "荷载起点相对构件起点的位置比例。"},
        "endRatio": {"type": "number", "minimum": 0, "maximum": 1, "description": "荷载终点相对构件起点的位置比例。"},
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

MEMBER_TEMPERATURE_LOAD_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["type", "member", "deltaTempC"],
    "properties": {
        "type": {"type": "string", "enum": ["temperature"]},
        "member": {"type": "string"},
        "deltaTempC": {"type": "number", "description": "构件均匀温差，单位 °C；正值表示升温自由伸长。"},
        "alphaPerC": {"type": "number", "minimum": 0, "description": "线膨胀系数，单位 1/°C；省略时优先使用构件材料库 thermalExpansionPerC，未知材料回退 1.2e-5。"},
    },
    "additionalProperties": True,
}

STRUCTURAL_LOAD_SCHEMA: Dict[str, Any] = {
    "oneOf": [NODAL_LOAD_SCHEMA, MEMBER_DISTRIBUTED_LOAD_SCHEMA, MEMBER_POINT_LOAD_SCHEMA, MEMBER_TEMPERATURE_LOAD_SCHEMA]
}

TRUSS_MEMBER_LOAD_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["type", "member"],
    "properties": {
        "type": {"type": "string", "enum": ["distributed", "member_load", "member"]},
        "member": {"type": "string"},
        "direction": {"type": "string", "enum": ["global_x", "global_y"], "default": "global_y"},
        "wyKnPerM": {"type": "number", "description": "可等效为节点荷载的杆件均布荷载，单位 kN/m。"},
        "qStartKnPerM": {"type": "number", "description": "杆件线性荷载起点强度，单位 kN/m。"},
        "qEndKnPerM": {"type": "number", "description": "杆件线性荷载终点强度，单位 kN/m。"},
        "selfWeightKnPerM": {"type": "number", "description": "杆件自重线荷载，单位 kN/m，按全局 Y 向下等效。"},
    },
    "additionalProperties": True,
}

TRUSS_LOAD_SCHEMA: Dict[str, Any] = {
    "oneOf": [NODAL_LOAD_SCHEMA, TRUSS_MEMBER_LOAD_SCHEMA, MEMBER_TEMPERATURE_LOAD_SCHEMA]
}

FRAME_LOAD_CASE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["id", "loads"],
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "loads": {"type": "array", "items": STRUCTURAL_LOAD_SCHEMA},
    },
    "additionalProperties": True,
}

TRUSS_LOAD_CASE_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["id", "loads"],
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "loads": {"type": "array", "items": TRUSS_LOAD_SCHEMA},
    },
    "additionalProperties": True,
}

LOAD_COMBINATION_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "required": ["id", "factors"],
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "factors": {"type": "object", "additionalProperties": {"type": "number"}},
        "tags": {"type": "array", "items": {"type": "string"}},
    },
    "additionalProperties": True,
}

ASMS_BEAM_MODEL_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("asms-beam-model"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ASMS-JSON 梁系模型",
    "type": "object",
    "required": ["beamType", "loadType", "spans"],
    "properties": {
        "analysisType": {"type": "string", "const": "beam"},
        "schemaVersion": ASMS_SCHEMA_VERSION_PROPERTY,
        "projectName": {"type": "string"},
        "materialId": {"type": "string"},
        "beamType": {"type": "string", "enum": ["continuous", "simply_supported", "cantilever"]},
        "loadType": {"type": "string", "enum": ["none", "uniform", "point", "linear", "distributed", "combined"]},
        "spans": {"type": "array", "items": {"type": "number"}, "minItems": 1},
        "spanProperties": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "梁杆件编号。"},
                    "memberId": {"type": "string", "description": "梁杆件编号兼容字段。"},
                    "materialId": {
                        "type": "string",
                        "description": "跨段材料库编号；用于保留材料语义，E / I 仍是梁单元刚度计算输入。",
                    },
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
        "supports": {"type": "array", "items": BEAM_SUPPORT_SCHEMA},
        "loads": {"type": "array", "items": {"type": "object"}},
    },
    "additionalProperties": True,
}

ASMS_FRAME_MODEL_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("asms-frame-model"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ASMS-JSON 二维平面框架模型",
    "type": "object",
    "required": ["analysisType", "structure"],
    "properties": {
        "analysisType": {"type": "string", "enum": ["frame", "frame2d", "portal_frame"]},
        "schemaVersion": ASMS_SCHEMA_VERSION_PROPERTY,
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
                "loadCases": {"type": "array", "items": FRAME_LOAD_CASE_SCHEMA},
                "loadCombinations": {"type": "array", "items": LOAD_COMBINATION_SCHEMA},
            },
            "additionalProperties": True,
        },
    },
    "additionalProperties": True,
}

ASMS_TRUSS_MODEL_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("asms-truss-model"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ASMS-JSON 二维平面桁架模型",
    "type": "object",
    "required": ["analysisType", "structure"],
    "properties": {
        "analysisType": {"type": "string", "enum": ["truss", "truss2d"]},
        "schemaVersion": ASMS_SCHEMA_VERSION_PROPERTY,
        "projectName": {"type": "string"},
        "materialId": {"type": "string"},
        "structure": {
            "type": "object",
            "required": ["nodes", "members"],
            "properties": {
                "template": {"type": "string"},
                "nodes": {"type": "array", "items": TRUSS_NODE_SCHEMA},
                "members": {"type": "array", "items": TRUSS_MEMBER_SCHEMA},
                "loads": {"type": "array", "items": TRUSS_LOAD_SCHEMA},
                "loadCases": {"type": "array", "items": TRUSS_LOAD_CASE_SCHEMA},
                "loadCombinations": {"type": "array", "items": LOAD_COMBINATION_SCHEMA},
            },
            "additionalProperties": True,
        },
    },
    "additionalProperties": True,
}

ASMS_MODEL_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("asms-model"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "ArchSight Structural Model Schema (ASMS-JSON)",
    "description": "用于描述梁系、二维平面桁架和二维平面框架的开放 JSON 力学数据协议。",
    "oneOf": [ASMS_BEAM_MODEL_SCHEMA, ASMS_FRAME_MODEL_SCHEMA, ASMS_TRUSS_MODEL_SCHEMA],
}

BEAM_DEFLECTION_INPUT_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("beam-deflection-input"),
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
    "$id": _schema_id("beam-serviceability-input"),
    "title": "梁挠度正常使用校核输入",
    "properties": {
        **BEAM_DEFLECTION_INPUT_SCHEMA["properties"],
        "deflectionLimitRatio": {"type": "number", "default": 250},
    },
}

SOLVER_PAYLOAD_SCHEMA: Dict[str, Any] = {
    "$id": _schema_id("calculate-payload"),
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "title": "结构求解 API 输入",
    "type": "object",
    "properties": {
        "analysisType": {
            "type": "string",
            "enum": ["beam", "frame", "frame2d", "portal_frame", "truss", "truss2d"],
            "default": "beam",
        },
        "schemaVersion": ASMS_SCHEMA_VERSION_PROPERTY,
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
    "$id": _schema_id("job-request"),
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
    "required": ["type"],
    "properties": {
        "type": {
            "type": "string",
            "enum": [
                "archsight.solver.host.launch",
                "archsight.solver.host.saveResult",
                "archsight.solver.ready",
                "archsight.solver.project.changed",
                "archsight.solver.project.saveRequest",
                "archsight.solver.error",
            ],
        },
        "protocolVersion": {"type": "string", "const": "1.0.0"},
        "sessionId": {"type": "string"},
        "nonce": {"type": "string"},
        "payload": {"type": "object", "additionalProperties": True},
    },
    "additionalProperties": True,
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
                "required": ["templateId", "structureType", "title", "supportedActions", "benchmarkMapping", "source"],
                "properties": {
                    "templateId": {"type": "string"},
                    "structureType": {"type": "string", "enum": ["beam", "frame", "truss"]},
                    "title": {"type": "string"},
                    "supportedActions": {"type": "array", "items": {"type": "string"}},
                    "benchmarkMapping": {"type": "array", "items": {"type": "object", "additionalProperties": True}},
                    "source": {"type": "string", "const": "builtin"},
                },
                "additionalProperties": True,
            },
        },
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
    "project-document-tool-input": PROJECT_DOCUMENT_TOOL_INPUT_SCHEMA,
    "benchmark-case-list-input": BENCHMARK_CASE_LIST_INPUT_SCHEMA,
    "benchmark-case-run-input": BENCHMARK_CASE_RUN_INPUT_SCHEMA,
    "benchmark-submission-input": BENCHMARK_SUBMISSION_INPUT_SCHEMA,
    "benchmark-submission-response": BENCHMARK_SUBMISSION_RESPONSE_SCHEMA,
    "benchmark-submission-package": BENCHMARK_SUBMISSION_PACKAGE_SCHEMA,
    "benchmark-submission-package-response": BENCHMARK_SUBMISSION_PACKAGE_RESPONSE_SCHEMA,
    "project-file-manifest": PROJECT_FILE_MANIFEST_SCHEMA,
    "solver-host-message": HOST_MESSAGE_SCHEMA,
    "solver-artifact-manifest": ARTIFACT_MANIFEST_SCHEMA,
    "solver-template-registry": TEMPLATE_REGISTRY_SCHEMA,
}


def schema_registry() -> Dict[str, Dict[str, Any]]:
    return deepcopy(SCHEMA_REGISTRY)


def schema_by_id(schema_id: str) -> Dict[str, Any] | None:
    schema = SCHEMA_REGISTRY.get(schema_id)
    return deepcopy(schema) if schema else None
