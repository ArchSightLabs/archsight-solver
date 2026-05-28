from __future__ import annotations

from collections.abc import Iterable, Mapping
from datetime import datetime, timezone
from typing import Any, Dict

from backend.benchmarks.catalog import load_benchmark_catalog


GROUPS = [
    {
        "id": "beam-public-validation",
        "title": "梁系公开验证工程",
        "description": "由公开验证集中的梁系算例组成，覆盖简支梁、悬臂梁、连续梁、均布荷载和集中荷载。",
        "analysisTypes": {"beam"},
        "caseCategories": {"beam"},
        "projectType": "公开验证 / 梁系",
        "scale": "12 个梁系分析对象",
    },
    {
        "id": "frame-public-validation",
        "title": "二维平面框架公开验证工程",
        "description": "由公开验证集中的二维框架和框架梁退化算例组成，覆盖门式刚架、框架梁、弹簧约束和构件荷载。",
        "analysisTypes": {"frame"},
        "caseCategories": {"frame", "frame-beam-verify"},
        "projectType": "公开验证 / 平面框架",
        "scale": "13 个框架分析对象",
    },
    {
        "id": "truss-public-validation",
        "title": "二维平面桁架公开验证工程",
        "description": "由公开验证集中的桁架算例组成，覆盖 Pratt、Warren、Howe、悬挑桁架和杆件自重等场景。",
        "analysisTypes": {"truss"},
        "caseCategories": {"truss", "truss-verify"},
        "projectType": "公开验证 / 平面桁架",
        "scale": "8 个桁架分析对象",
    },
]

SOURCE_LABELS = {
    "textbook-analytical": "教材解析解",
    "independent-stiffness-baseline": "独立刚度法基准",
    "engineering-software": "工程软件对标",
    "internal-regression": "内部回归算例",
}

METRIC_LABELS = {
    "supportCount": "支座数量",
    "nodeCount": "节点数量",
    "memberCount": "构件数量",
    "statusCode": "状态码",
    "maxDeflectionMm": "最大挠度",
    "maxDeflectionXM": "最大挠度位置",
    "midSpanDisplacementMm": "跨中挠度",
    "maxDisplacementMm": "最大节点位移",
    "maxDisplacementNodeId": "控制节点",
    "maxMomentKnM": "最大构件弯矩",
    "maxAxialForceKn": "最大杆件轴力",
    "maxAxialForceMemberId": "控制杆件",
    "supportReactions": "支座反力",
    "memberAxialForces": "杆件轴力明细",
    "memberAxialForceKn": "杆件轴力容差",
    "reactionKn": "支座反力容差",
    "reactionFyKn": "竖向反力容差",
}

METRIC_UNITS = {
    "maxDeflectionMm": "mm",
    "maxDeflectionXM": "m",
    "midSpanDisplacementMm": "mm",
    "maxDisplacementMm": "mm",
    "maxMomentKnM": "kN.m",
    "maxAxialForceKn": "kN",
    "memberAxialForceKn": "kN",
    "reactionKn": "kN",
    "reactionFyKn": "kN",
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _analysis_type(case: Mapping[str, Any]) -> str:
    category = str(case.get("category", "beam"))
    payload = case.get("payload", {})
    payload_type = str(payload.get("analysisType", "")).strip().lower() if isinstance(payload, Mapping) else ""
    if payload_type in {"beam", "frame", "truss"}:
        return payload_type
    if category.startswith("truss"):
        return "truss"
    if category.startswith("frame"):
        return "frame"
    return "beam"


def _case_metric_summary(case: Mapping[str, Any]) -> str:
    expected = case.get("expected", {})
    if not isinstance(expected, Mapping):
        return ""
    if "maxDeflectionMm" in expected:
        return f"最大挠度 {expected['maxDeflectionMm']} mm"
    if "maxDisplacementMm" in expected:
        return f"最大位移 {expected['maxDisplacementMm']} mm"
    if "maxMomentKnM" in expected:
        return f"最大弯矩 {expected['maxMomentKnM']} kN·m"
    if "maxAxialForceKn" in expected:
        return f"最大轴力 {expected['maxAxialForceKn']} kN"
    return ""


def _format_metric_value(key: str, value: Any) -> str:
    label = METRIC_LABELS.get(key, key)
    if isinstance(value, list):
        return f"{label} {len(value)} 项"
    if isinstance(value, Mapping):
        return f"{label} {len(value)} 项"
    unit = METRIC_UNITS.get(key, "")
    return f"{label} {value}{(' ' + unit) if unit else ''}"


def _case_expected_summary(case: Mapping[str, Any]) -> str:
    expected = case.get("expected", {})
    if not isinstance(expected, Mapping):
        return ""
    parts = [_format_metric_value(key, value) for key, value in expected.items()]
    if len(parts) > 6:
        parts = [*parts[:6], f"另 {len(parts) - 6} 项"]
    return "标准值：" + "；".join(parts) if parts else ""


def _case_tolerance_summary(case: Mapping[str, Any]) -> str:
    tolerances = case.get("tolerances", {})
    if not isinstance(tolerances, Mapping):
        return ""
    parts = [_format_metric_value(key, value) for key, value in tolerances.items()]
    return "容许误差：" + "；".join(parts) if parts else ""


def _support_constraints(support_type: str) -> list[str]:
    if support_type == "fixed":
        return ["v", "rz"]
    if support_type in {"pinned", "roller"}:
        return ["v"]
    return []


def _beam_supports(beam_type: str, spans: list[float]) -> list[Dict[str, Any]]:
    boundaries = [0.0]
    for span in spans:
        boundaries.append(round(boundaries[-1] + span, 9))
    if beam_type == "cantilever":
        return [{"id": "S1", "x": 0, "type": "fixed", "constraints": ["v", "rz"]}]
    if beam_type == "simply_supported":
        return [
            {"id": "S1", "x": 0, "type": "pinned", "constraints": ["v"]},
            {"id": "S2", "x": boundaries[-1], "type": "roller", "constraints": ["v"]},
        ]
    return [
        {
            "id": f"S{index + 1}",
            "x": x,
            "type": "roller" if index == len(boundaries) - 1 else "pinned",
            "constraints": ["v"],
        }
        for index, x in enumerate(boundaries)
    ]


def _beam_state_from_payload(case: Mapping[str, Any]) -> Dict[str, Any]:
    payload = dict(case.get("payload", {}))
    spans = [float(span) for span in payload.get("spans", [6])]
    total_length = max(sum(spans), 1e-9)
    span_properties = payload.get("spanProperties") if isinstance(payload.get("spanProperties"), list) else []
    material_id = str(payload.get("materialId") or "custom")
    beam_type = str(payload.get("beamType") or "continuous")
    load_type = str(payload.get("loadType") or "uniform")
    loads = payload.get("loads") if isinstance(payload.get("loads"), list) else []
    point_loads: list[Dict[str, Any]] = []
    linear_loads: list[Dict[str, Any]] = []
    uniform_enabled = load_type == "uniform"
    uniform_start = float(payload.get("uniformLoadStartRatio", 0))
    uniform_end = float(payload.get("uniformLoadEndRatio", 1))
    q = float(payload.get("q", payload.get("loadValue", 0)))

    for index, load in enumerate(loads):
        if not isinstance(load, Mapping):
            continue
        if load.get("type") == "uniform":
            uniform_enabled = bool(load.get("enabled", True))
            q = float(load.get("qKnPerM", q))
            uniform_start = float(load.get("start", 0)) / total_length
            uniform_end = float(load.get("end", total_length)) / total_length
        elif load.get("type") == "point":
            x = float(load.get("x", 0.5 * total_length))
            point_loads.append({
                "id": f"P{index + 1}",
                "magnitudeKn": float(load.get("pointLoadKn", payload.get("pointLoadKn", payload.get("pointLoad", 0)))),
                "positionRatio": min(max(x / total_length, 0), 1),
            })
        elif load.get("type") == "linear":
            start = float(load.get("start", 0)) / total_length
            end = float(load.get("end", total_length)) / total_length
            linear_loads.append({
                "id": f"L{index + 1}",
                "qStartKnPerM": float(load.get("qStartKnPerM", 0)),
                "qEndKnPerM": float(load.get("qEndKnPerM", load.get("qStartKnPerM", 0))),
                "startRatio": min(max(start, 0), 1),
                "endRatio": min(max(end, 0), 1),
            })

    if not loads and load_type == "point":
        point_loads.append({
            "id": "P1",
            "magnitudeKn": float(payload.get("pointLoadKn", payload.get("pointLoad", payload.get("loadValue", 0)))),
            "positionRatio": float(payload.get("pointLoadPositionRatio", payload.get("pointPositionRatio", payload.get("loadPosition", 0.5)))),
        })
    if not loads and load_type == "linear":
        linear_loads.append({
            "id": "L1",
            "qStartKnPerM": float(payload.get("distributedLoadStart", payload.get("loadValue", 0))),
            "qEndKnPerM": float(payload.get("distributedLoadEnd", payload.get("loadEnd", payload.get("loadValue", 0)))),
            "startRatio": float(payload.get("distributedLoadStartRatio", 0)),
            "endRatio": float(payload.get("distributedLoadEndRatio", 1)),
        })

    spans_state = []
    for index, span in enumerate(spans):
        properties = span_properties[index] if index < len(span_properties) and isinstance(span_properties[index], Mapping) else {}
        spans_state.append({
            "length": span,
            "E": float(properties.get("E", payload.get("E", 210))),
            "I": float(properties.get("I", payload.get("I", 4500))),
            "materialId": str(properties.get("materialId", material_id)),
        })

    return {
        "projectName": str(payload.get("projectName") or case.get("title") or "梁系验证算例"),
        "materialId": material_id,
        "beamType": beam_type,
        "loadType": "combined" if len([item for item in [uniform_enabled, bool(point_loads), bool(linear_loads)] if item]) > 1 else load_type,
        "uniformLoadEnabled": uniform_enabled,
        "linearLoadEnabled": bool(linear_loads),
        "linearLoads": linear_loads,
        "pointLoads": point_loads,
        "q": q,
        "uniformLoadStartRatio": min(max(uniform_start, 0), 1),
        "uniformLoadEndRatio": min(max(uniform_end, 0), 1),
        "pointLoad": point_loads[0]["magnitudeKn"] if point_loads else float(payload.get("pointLoad", 0)),
        "pointLoadPositionRatio": point_loads[0]["positionRatio"] if point_loads else float(payload.get("pointLoadPositionRatio", 0.5)),
        "distributedLoadStart": linear_loads[0]["qStartKnPerM"] if linear_loads else float(payload.get("distributedLoadStart", 10)),
        "distributedLoadEnd": linear_loads[0]["qEndKnPerM"] if linear_loads else float(payload.get("distributedLoadEnd", 10)),
        "distributedLoadStartRatio": linear_loads[0]["startRatio"] if linear_loads else float(payload.get("distributedLoadStartRatio", 0)),
        "distributedLoadEndRatio": linear_loads[0]["endRatio"] if linear_loads else float(payload.get("distributedLoadEndRatio", 1)),
        "freq": float(payload.get("freq", 1)),
        "duration": float(payload.get("duration", 5)),
        "spans": spans_state,
        "supports": payload.get("supports") if isinstance(payload.get("supports"), list) else _beam_supports(beam_type, spans),
        "compareEnabled": False,
        "scenarios": [],
    }


def _frame_state_from_payload(case: Mapping[str, Any]) -> Dict[str, Any]:
    payload = dict(case.get("payload", {}))
    structure = payload.get("structure") if isinstance(payload.get("structure"), Mapping) else {}
    nodes = [dict(node) for node in structure.get("nodes", []) if isinstance(node, Mapping)]
    members = [dict(member) for member in structure.get("members", []) if isinstance(member, Mapping)]
    loads = [dict(load) for load in structure.get("loads", []) if isinstance(load, Mapping)]
    span = float(structure.get("span", 6))
    height = float(structure.get("height", 4))
    return {
        "frameMode": "custom",
        "projectName": str(payload.get("projectName") or case.get("title") or "框架验证算例"),
        "materialId": str(payload.get("materialId") or "custom"),
        "span": span,
        "height": height,
        "leftSupport": str(structure.get("left_support", "fixed")),
        "rightSupport": str(structure.get("right_support", "fixed")),
        "beamLoadKnPerM": abs(float(structure.get("beam_load_kn_per_m", 18))),
        "lateralLoadKn": float(structure.get("lateral_load_kn", 0)),
        "topVerticalLoadKn": abs(float(structure.get("top_vertical_load_kn", 0))),
        "columnE": float(members[0].get("E_GPa", 210)) if members else 210,
        "beamE": float(members[1].get("E_GPa", 210)) if len(members) > 1 else 210,
        "columnA": float(members[0].get("A_cm2", 240)) if members else 240,
        "beamA": float(members[1].get("A_cm2", 220)) if len(members) > 1 else 220,
        "columnI": float(members[0].get("I_cm4", 12000)) if members else 12000,
        "beamI": float(members[1].get("I_cm4", 15000)) if len(members) > 1 else 15000,
        "customNodes": nodes,
        "customMembers": members,
        "customLoads": loads,
        "customLoadCases": [dict(item) for item in structure.get("loadCases", []) if isinstance(item, Mapping)],
        "customLoadCombinations": [dict(item) for item in structure.get("loadCombinations", []) if isinstance(item, Mapping)],
    }


def _truss_state_from_payload(case: Mapping[str, Any]) -> Dict[str, Any]:
    payload = dict(case.get("payload", {}))
    structure = payload.get("structure") if isinstance(payload.get("structure"), Mapping) else {}
    return {
        "projectName": str(payload.get("projectName") or case.get("title") or "桁架验证算例"),
        "materialId": str(payload.get("materialId") or "custom"),
        "customNodes": [dict(node) for node in structure.get("nodes", []) if isinstance(node, Mapping)],
        "customMembers": [dict(member) for member in structure.get("members", []) if isinstance(member, Mapping)],
        "customLoads": [dict(load) for load in structure.get("loads", []) if isinstance(load, Mapping)],
    }


def _state_from_case(case: Mapping[str, Any]) -> Dict[str, Any]:
    analysis_type = _analysis_type(case)
    if analysis_type == "frame":
        return _frame_state_from_payload(case)
    if analysis_type == "truss":
        return _truss_state_from_payload(case)
    return _beam_state_from_payload(case)


def _benchmark_meta(case: Mapping[str, Any]) -> Dict[str, Any]:
    verification = case.get("verification", {})
    source_type = str(verification.get("sourceType", "internal-regression")) if isinstance(verification, Mapping) else "internal-regression"
    return {
        "caseId": case.get("id"),
        "category": case.get("category"),
        "title": case.get("title"),
        "purpose": case.get("purpose", ""),
        "sourceType": source_type,
        "sourceLabel": SOURCE_LABELS.get(source_type, source_type),
        "reference": verification.get("reference", "") if isinstance(verification, Mapping) else "",
        "method": verification.get("method", "") if isinstance(verification, Mapping) else "",
        "sourceLinks": verification.get("sourceLinks", []) if isinstance(verification, Mapping) else [],
        "checkedMetrics": verification.get("checkedMetrics", []) if isinstance(verification, Mapping) else [],
        "metricSummary": _case_metric_summary(case),
        "expectedSummary": _case_expected_summary(case),
        "toleranceSummary": _case_tolerance_summary(case),
        "expected": case.get("expected", {}),
        "tolerances": case.get("tolerances", {}),
    }


def _object_from_case(case: Mapping[str, Any], index: int, timestamp: str) -> Dict[str, Any]:
    analysis_type = _analysis_type(case)
    return {
        "id": f"{analysis_type}-{case['id']}",
        "name": str(case.get("title") or case.get("id")),
        "type": analysis_type,
        "state": _state_from_case(case),
        "results": None,
        "sensitivityResults": None,
        "workbenchView": "model",
        "benchmark": _benchmark_meta(case),
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }


def _project_from_group(group: Mapping[str, Any], cases: Iterable[Mapping[str, Any]], catalog_updated_at: str) -> Dict[str, Any]:
    timestamp = _now()
    objects = [_object_from_case(case, index, timestamp) for index, case in enumerate(cases)]
    return {
        "id": f"project-{group['id']}",
        "name": group["title"],
        "activeObjectId": objects[0]["id"] if objects else "",
        "objects": objects,
        "settings": {
            "activeModuleSection": "",
            "beamPreviewStyle": "color",
            "reportExportOptions": {
                "template": "standard",
                "figureMode": "overlay",
                "figureScope": "control",
            },
            "projectInfo": {
                "name": group["title"],
                "address": "",
                "projectType": group["projectType"],
                "scale": group["scale"],
                "projectManager": "ArchSight Solver 公开验证集",
                "constructionUnit": "",
                "developerUnit": "",
                "supervisionUnit": f"benchmark_cases.json / {catalog_updated_at}",
            },
        },
        "createdAt": timestamp,
        "updatedAt": timestamp,
    }


def build_public_validation_projects() -> Dict[str, Any]:
    catalog = load_benchmark_catalog()
    cases = catalog["cases"]
    projects = []
    for group in GROUPS:
        group_cases = [case for case in cases if case.get("category") in group["caseCategories"]]
        source_types = sorted({
            str(case.get("verification", {}).get("sourceType", "internal-regression"))
            for case in group_cases
            if isinstance(case.get("verification", {}), Mapping)
        })
        project = _project_from_group(group, group_cases, str(catalog.get("updatedAt", "")))
        projects.append({
            "id": group["id"],
            "title": group["title"],
            "description": group["description"],
            "analysisTypes": sorted(group["analysisTypes"]),
            "caseCategories": sorted(group["caseCategories"]),
            "caseCount": len(group_cases),
            "sourceTypes": source_types,
            "project": project,
        })
    return {
        "schemaVersion": 1,
        "catalogUpdatedAt": catalog.get("updatedAt"),
        "caseCount": len(cases),
        "projects": projects,
    }
