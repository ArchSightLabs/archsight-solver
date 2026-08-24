from __future__ import annotations

from collections.abc import Mapping
from copy import deepcopy
from typing import Any, List


SOURCE_LABELS = {
    "primary": "主结果",
    "case": "荷载工况",
    "combination": "荷载组合",
}


# Fields whose meaning changes with the selected load case or combination.
# The source collections themselves deliberately stay on the root object so a
# report can still prove that the selected id belongs to this calculation.
_RESULT_FIELDS = (
    "summary",
    "diagnostics",
    "nodeResults",
    "memberResults",
    "memberDiagrams",
    "secondOrder",
    "buckling",
    "x_data",
    "v_data",
    "element_end_moments",
    "element_end_shears",
    "reactions",
    "queryResults",
    "ux_data",
    "uy_data",
    "rz_data",
    "member_axial_data",
    "member_shear_data",
    "member_moment_data",
    "moment_data",
    "shear_data",
    "beam",
    "truss",
    "preview",
    "diagram",
)

_INPUT_SNAPSHOT_FIELDS = ("request", "structure", "payload")


def result_source_text(solution: Mapping[str, Any]) -> str:
    source = solution.get("resultSource")
    if not isinstance(source, Mapping):
        return "主结果（基本荷载）"

    source_type = str(source.get("source") or "primary")
    source_id = str(source.get("id") or "__primary__")
    label = str(source.get("label") or SOURCE_LABELS.get(source_type, "主结果"))
    description = str(source.get("description") or "").strip()
    prefix = SOURCE_LABELS.get(source_type, "主结果")
    if source_type == "primary":
        return f"{prefix}（{description or '基本荷载'}）"
    suffix = f" / {description}" if description else ""
    return f"{prefix}: {label} [{source_id}]{suffix}"


def result_source_rows(solution: Mapping[str, Any]) -> List[List[str]]:
    return [["结果来源", result_source_text(solution)]]


def validate_result_source(solution: Mapping[str, Any]) -> None:
    source = solution.get("resultSource")
    if source is None:
        return
    if not isinstance(source, Mapping):
        raise ValueError("结果来源必须是结构化对象")
    source_type = str(source.get("source") or "primary")
    source_id = str(source.get("id") or "__primary__")
    if source_type == "primary":
        if source_id != "__primary__":
            raise ValueError(f"主结果来源 ID 无效: {source_id}")
        return
    result_key = "loadCaseResults" if source_type == "case" else "loadCombinationResults" if source_type == "combination" else None
    if result_key is None:
        raise ValueError(f"不支持的结果来源类型: {source_type}")
    available_ids = {
        str(item.get("id") or "")
        for item in solution.get(result_key, [])
        if isinstance(item, Mapping)
    }
    if source_id not in available_ids:
        raise ValueError(f"所选结果来源不存在于当前计算结果: {source_type} {source_id}")


def project_result_source(solution: Mapping[str, Any]) -> dict[str, Any]:
    """Project report facts onto the selected result source exactly once.

    Exporters historically attached the selected-source label while leaving
    the body on the primary solution.  That could produce a report whose
    title, plot and numerical tables described different load cases.  This
    projection is the single backend boundary used before any report model is
    created; consumers must not independently re-select result arrays.
    """

    validate_result_source(solution)
    projected = deepcopy(dict(solution))
    source = solution.get("resultSource")
    if not isinstance(source, Mapping) or str(source.get("source") or "primary") == "primary":
        return projected

    source_type = str(source.get("source"))
    source_id = str(source.get("id"))
    result_key = "loadCaseResults" if source_type == "case" else "loadCombinationResults"
    selected = next(
        dict(item)
        for item in solution.get(result_key, [])
        if isinstance(item, Mapping) and str(item.get("id") or "") == source_id
    )

    input_snapshot = selected.get("inputSnapshot")
    if not isinstance(input_snapshot, Mapping):
        raise ValueError(f"所选结果来源缺少输入快照，无法生成一致的计算书: {source_type} {source_id}")

    for field in _RESULT_FIELDS:
        if field in selected:
            projected[field] = deepcopy(selected[field])
        else:
            # A selected-source report must never silently retain a primary
            # presentation/result field that the producer did not resolve.
            projected.pop(field, None)

    for field in _INPUT_SNAPSHOT_FIELDS:
        if field in input_snapshot:
            projected[field] = deepcopy(input_snapshot[field])
        else:
            projected.pop(field, None)

    # Beam reports retain these legacy scalar aliases.  Derive them only from
    # the selected canonical summary, never from the primary result.
    projected.pop("max_deflection_mm", None)
    projected.pop("max_deflection_position_m", None)
    projected.pop("status", None)
    summary = selected.get("summary")
    if isinstance(summary, Mapping):
        if "maxDeflectionMm" in summary:
            projected["max_deflection_mm"] = deepcopy(summary["maxDeflectionMm"])
        if "maxDeflectionPositionM" in summary:
            projected["max_deflection_position_m"] = deepcopy(summary["maxDeflectionPositionM"])
        if "status" in summary:
            projected["status"] = deepcopy(summary["status"])

    # Some report helpers read the compatibility ``results`` envelope.  Keep
    # it aligned with the root projection without removing the source lists.
    nested_results = projected.get("results")
    if isinstance(nested_results, Mapping):
        nested_projection = deepcopy(dict(nested_results))
        for field in _RESULT_FIELDS:
            if field in selected:
                nested_projection[field] = deepcopy(selected[field])
            else:
                nested_projection.pop(field, None)
        projected["results"] = nested_projection

    projected["selectedResult"] = {
        key: deepcopy(selected[key])
        for key in ("id", "title", "description", "tags", "factors")
        if key in selected
    }
    projected["selectedResult"]["inputSnapshot"] = deepcopy(dict(input_snapshot))
    return projected


def project_last_converged_nonlinear_result(solution: Mapping[str, Any]) -> dict[str, Any]:
    """Use the solver-owned last converged state for a partial GNA report."""

    projected = deepcopy(dict(solution))
    second_order = projected.get("secondOrder")
    if not isinstance(second_order, Mapping) or str(second_order.get("status")) != "not_converged":
        return projected
    recovered = second_order.get("lastConvergedSolution")
    if not isinstance(recovered, Mapping):
        return projected
    for field in ("summary", "diagnostics", "nodeResults", "memberResults", "memberDiagrams"):
        if field in recovered:
            projected[field] = deepcopy(recovered[field])
    nested_results = projected.get("results")
    if isinstance(nested_results, Mapping):
        nested_projection = deepcopy(dict(nested_results))
        for field in ("summary", "diagnostics", "nodeResults", "memberResults", "memberDiagrams"):
            if field in recovered:
                nested_projection[field] = deepcopy(recovered[field])
        projected["results"] = nested_projection
    projected["partialResultSource"] = {
        "type": "last_converged_nonlinear_state",
        "failureCode": second_order.get("failureCode"),
        "terminationReason": second_order.get("terminationReason"),
        "lastConverged": deepcopy(second_order.get("lastConverged")),
    }
    return projected
