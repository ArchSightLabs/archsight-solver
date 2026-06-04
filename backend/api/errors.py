from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Mapping, Optional


class ApiError(ValueError):
    def __init__(self, message: str, *, code: str = "COMMON_INVALID_REQUEST", status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


def analysis_type_for_error(data: Mapping[str, Any] | None) -> Optional[str]:
    if not data:
        return None
    value = str(data.get("analysisType", "") or "").strip().lower()
    if value in {"beam", ""}:
        return "beam" if value == "beam" else None
    if value in {"frame", "frame2d", "portal_frame"}:
        return "frame"
    if value in {"truss", "truss2d"}:
        return "truss"
    return None


def error_code_for_exception(exc: Exception, data: Mapping[str, Any] | None = None) -> str:
    if isinstance(exc, ApiError):
        return exc.code
    analysis_type = analysis_type_for_error(data)
    if analysis_type == "beam":
        return "BEAM_INVALID_REQUEST"
    if analysis_type == "frame":
        return "FRAME_INVALID_REQUEST"
    if analysis_type == "truss":
        return "TRUSS_INVALID_REQUEST"
    return "COMMON_INVALID_REQUEST"


def _issue(
    code: str,
    title: str,
    detail: str,
    suggestions: List[str],
    *,
    severity: str = "error",
) -> Dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "title": title,
        "detail": detail,
        "suggestions": suggestions,
    }


def diagnostic_issues_for_message(message: str, analysis_type: Optional[str]) -> List[Dict[str, Any]]:
    issues: List[Dict[str, Any]] = []
    normalized = message.strip()

    if "约束条件不足" in normalized or "无稳定自由度" in normalized:
        issues.append(_issue(
            "STRUCTURE_UNSTABLE_CONSTRAINTS",
            "结构约束不足",
            "当前支座或约束不足以消除刚体位移/转角，整体刚度矩阵无法形成稳定可解体系。",
            [
                "检查支座是否约束了必要的平动自由度。",
                "框架模型应至少形成可抵抗整体平移和转动的约束体系。",
                "桁架模型应保证 ux / uy 平动自由度有足够约束。",
            ],
        ))

    if "约束条件过多" in normalized or "无自由度可求解" in normalized:
        issues.append(_issue(
            "STRUCTURE_OVERCONSTRAINED",
            "结构自由度被全部约束",
            "当前模型没有可求解的自由自由度，通常表示所有节点或梁端自由度都被固定。",
            [
                "保留至少一个结构响应自由度用于求解。",
                "检查支座类型是否误把自由节点设置为固结或铰支。",
            ],
        ))

    if "刚度矩阵奇异" in normalized:
        issues.append(_issue(
            "STRUCTURE_SINGULAR_STIFFNESS",
            "刚度矩阵奇异",
            "整体刚度矩阵秩不足，常见原因包括机构、孤立节点、零长度构件、无效连接或构件刚度异常。",
            [
                "检查节点是否被构件可靠连接，避免孤立节点或悬空子结构。",
                "检查构件起止节点是否重合，避免零长度构件。",
                "检查 E、A、I 等刚度输入及单位是否合理。",
            ],
        ))

    if "ID 重复" in normalized:
        issues.append(_issue(
            "STRUCTURE_DUPLICATE_ID",
            "结构对象编号重复",
            "节点、构件或杆件编号重复会导致引用关系无法唯一解析。",
            ["为每个节点、构件/杆件使用唯一编号。"],
        ))

    if "引用了不存在" in normalized or "起止节点无效" in normalized:
        issues.append(_issue(
            "STRUCTURE_INVALID_REFERENCE",
            "结构对象引用无效",
            "构件、杆件或荷载引用了不存在的节点/构件，模型拓扑无法完成装配。",
            [
                "检查构件/杆件 start、end 是否对应已有节点 ID。",
                "检查节点荷载、构件荷载或杆件荷载的引用对象是否存在。",
            ],
        ))

    if "截面面积必须大于 0" in normalized or "截面惯性矩必须大于 0" in normalized or "弹性模量" in normalized:
        issues.append(_issue(
            "STRUCTURE_INVALID_STIFFNESS_INPUT",
            "刚度输入异常",
            "构件刚度输入不满足线弹性求解要求，可能是数值为零、为负或单位口径错误。",
            [
                "确认弹性模量 E 使用 GPa。",
                "确认截面面积 A 使用 cm^2。",
                "确认截面惯性矩 I 使用 cm^4。",
            ],
        ))

    if "跨度必须大于 0" in normalized or "跨度数量超出系统限制" in normalized:
        issues.append(_issue(
            "BEAM_INVALID_SPAN_LAYOUT",
            "梁系跨段布置异常",
            "梁系跨段长度或跨段数量不满足当前求解器边界。",
            ["检查 spans 数组是否为空、是否包含非正长度，或是否超过当前公开核心支持规模。"],
        ))

    if "荷载位置必须位于梁长范围内" in normalized or "荷载作用范围必须位于梁长范围内" in normalized:
        issues.append(_issue(
            "LOAD_OUT_OF_MODEL_RANGE",
            "荷载位置超出模型范围",
            "荷载位置或作用范围不在当前结构几何范围内。",
            ["检查集中荷载位置、分布荷载起止位置是否落在总梁长或目标构件范围内。"],
        ))

    if "荷载类型必须" in normalized:
        issues.append(_issue(
            "LOAD_UNSUPPORTED_TYPE",
            "荷载类型不受支持",
            "当前结构对象只接受公开契约中定义的荷载类型。",
            ["按结构体系改用 nodal、distributed、member_point 或对应文本模型支持的荷载类型。"],
        ))

    if not issues:
        suggestions = ["检查输入 payload 是否符合 ASMS-JSON、结构对象和单位口径要求。"]
        if analysis_type == "beam":
            suggestions.append("梁系优先检查 spans、supports、loads、E 和 I。")
        elif analysis_type == "frame":
            suggestions.append("框架优先检查 nodes、members、supports、loads、E/A/I 和端部释放。")
        elif analysis_type == "truss":
            suggestions.append("桁架优先检查 nodes、members、supports、loads、E/A 和杆件连接。")
        issues.append(_issue(
            "STRUCTURE_INPUT_REVIEW_REQUIRED",
            "结构输入需要复核",
            "错误信息未匹配到专用诊断规则，但仍属于结构输入或求解前置条件问题。",
            suggestions,
            severity="warning",
        ))

    return issues


def error_payload(
    exc: Exception | str,
    *,
    operation: str,
    data: Mapping[str, Any] | None = None,
    code: str | None = None,
) -> Dict[str, Any]:
    message = str(exc)
    resolved_code = code or (error_code_for_exception(exc, data) if isinstance(exc, Exception) else "COMMON_INVALID_REQUEST")
    analysis_type = analysis_type_for_error(data)
    issues = diagnostic_issues_for_message(message, analysis_type)
    payload: Dict[str, Any] = {
        "success": False,
        "operation": operation,
        "version": "v1",
        "error": {
            "code": resolved_code,
            "message": message,
        },
        "legacyError": message,
        "diagnostics": {
            "warnings": [],
            "infos": [],
            "issues": issues,
        },
        "meta": {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
        },
    }
    if analysis_type is not None:
        payload["analysisType"] = analysis_type
    return payload
