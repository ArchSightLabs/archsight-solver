from __future__ import annotations

from copy import deepcopy
from typing import Any, Dict

from backend.common.support_catalog import AnalysisType, support_specs
from backend.contracts.json_schema_shared import API_SCHEMA_VERSION, SCHEMA_ID_BASE_URI, _schema_id
from backend.contracts.json_schemas_delivery import (
    ARTIFACT_MANIFEST_SCHEMA,
    DELIVERY_SCHEMA_REGISTRY,
    HOST_MESSAGE_SCHEMA,
    PROJECT_FILE_MANIFEST_SCHEMA,
    TEMPLATE_REGISTRY_SCHEMA,
)


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
            "description": "调用方自定义追踪 ID；在同一租户内参与幂等去重。",
        },
    },
    "additionalProperties": False,
}
