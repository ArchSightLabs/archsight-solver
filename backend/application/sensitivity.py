import copy

import numpy as np

from backend.application.calculation import build_calculation_response
from backend.common.analysis_types import get_analysis_type
from backend.common.result_metric_catalog import default_sensitivity_metric, sensitivity_response_meta
from backend.contracts.diagnostics import ApiError

MAX_VARIATION_RANGE_PERCENT = 80.0
MAX_VARIATION_STEPS = 50

BEAM_SERIES_META = (
    ("q", "荷载幅值", "#38bdf8"),
    ("E", "弹性模量 E", "#f59e0b"),
    ("I", "截面惯性矩 I", "#a78bfa"),
    ("freq", "动力主频 f", "#ef4444"),
)

BEAM_RESPONSE_META = sensitivity_response_meta("beam")

FRAME_SERIES_META = (
    ("beamLoad", "梁面荷载", "#38bdf8"),
    ("lateralLoad", "水平荷载", "#f59e0b"),
    ("E", "弹性模量 E", "#a78bfa"),
    ("I", "截面惯性矩 I", "#ef4444"),
)

FRAME_RESPONSE_META = sensitivity_response_meta("frame")

TRUSS_SERIES_META = (
    ("fx", "节点水平荷载 Fx", "#38bdf8"),
    ("fy", "节点竖向荷载 Fy", "#f59e0b"),
    ("E", "弹性模量 E", "#a78bfa"),
    ("A", "截面面积 A", "#ef4444"),
)

TRUSS_RESPONSE_META = sensitivity_response_meta("truss")


def _safe_float(value, default=0.0):
    try:
        if value is None or value == "":
            return float(default)
        return float(value)
    except (TypeError, ValueError):
        return float(default)


def _build_series(key, label, values, color):
    return {
        "key": key,
        "label": label,
        "values": values,
        "color": color,
    }


def _build_response(variations, response_metric, response_label, response_unit, meta, values_by_key):
    return {
        "variations": variations,
        "responseMetric": response_metric,
        "responseLabel": response_label,
        "responseUnit": response_unit,
        "series": [
            _build_series(key=key, label=label, values=values_by_key[key], color=color)
            for key, label, color in meta
        ],
        **values_by_key,
    }


def _resolve_response_meta(metric, mapping, default_metric):
    resolved_metric = metric if metric in mapping else default_metric
    response_label, response_unit = mapping[resolved_metric]
    return resolved_metric, response_label, response_unit


def _scale_beam_payload(data, target, factor):
    payload = copy.deepcopy(data)

    if target == "q":
        for field in ("q", "loadValue", "pointLoad", "pointLoadKn", "distributedLoadStart", "distributedLoadEnd"):
            if field in payload:
                payload[field] = _safe_float(payload.get(field), 0.0) * factor
    elif target == "E":
        base_value = _safe_float(payload.get("E"), 1.0)
        payload["E"] = base_value * factor
        for item in payload.get("spanProperties", []):
            if isinstance(item, dict):
                item["E"] = _safe_float(item.get("E"), base_value) * factor
    elif target == "I":
        base_value = _safe_float(payload.get("I"), 1.0)
        payload["I"] = base_value * factor
        for item in payload.get("spanProperties", []):
            if isinstance(item, dict):
                item["I"] = _safe_float(item.get("I"), base_value) * factor
    elif target == "freq":
        payload["freq"] = _safe_float(payload.get("freq"), 1.0) * factor

    return payload


def _scale_frame_payload(data, target, factor):
    payload = copy.deepcopy(data)
    structure = payload.setdefault("structure", {})
    loads = structure.get("loads", [])
    members = structure.get("members", [])

    if target == "beamLoad":
        structure["beam_load_kn_per_m"] = _safe_float(structure.get("beam_load_kn_per_m"), 0.0) * factor
        for load in loads:
            if load.get("type") == "distributed":
                wy = _safe_float(load.get("wyKnPerM"), 0.0)
                q_start = _safe_float(load.get("qStartKnPerM", wy), wy)
                q_end = _safe_float(load.get("qEndKnPerM", wy), q_start)
                load["wyKnPerM"] = wy * factor
                load["qStartKnPerM"] = q_start * factor
                load["qEndKnPerM"] = q_end * factor
            elif load.get("type") == "member_point":
                load["forceKn"] = _safe_float(load.get("forceKn"), 0.0) * factor
    elif target == "lateralLoad":
        structure["lateral_load_kn"] = _safe_float(structure.get("lateral_load_kn"), 0.0) * factor
        for load in loads:
            if load.get("type") == "nodal":
                load["fxKn"] = _safe_float(load.get("fxKn"), 0.0) * factor
    elif target == "E":
        for member in members:
            member["E_GPa"] = _safe_float(member.get("E_GPa", member.get("E")), 210.0) * factor
    elif target == "I":
        for member in members:
            member["I_cm4"] = _safe_float(member.get("I_cm4", member.get("I")), 8000.0) * factor

    return payload


def _scale_truss_payload(data, target, factor):
    payload = copy.deepcopy(data)
    structure = payload.setdefault("structure", {})
    loads = structure.get("loads", [])
    members = structure.get("members", [])

    if target == "fx":
        for load in loads:
            if load.get("type") == "nodal":
                load["fxKn"] = _safe_float(load.get("fxKn"), 0.0) * factor
    elif target == "fy":
        for load in loads:
            if load.get("type") == "nodal":
                load["fyKn"] = _safe_float(load.get("fyKn"), 0.0) * factor
    elif target == "E":
        for member in members:
            member["E_GPa"] = _safe_float(member.get("E_GPa", member.get("E")), 210.0) * factor
    elif target == "A":
        for member in members:
            member["A_cm2"] = _safe_float(member.get("A_cm2", member.get("A")), 24.0) * factor

    return payload


def _beam_metric_value(payload, target_span_index, response_metric):
    response = build_calculation_response(payload)

    if response_metric == "max_moment":
        moment_values = response.get("solution", {}).get("element_end_moments", [])
        return float(max((abs(value) / 1000.0 for value in moment_values), default=0.0))

    if response_metric == "max_shear":
        shear_values = response.get("solution", {}).get("element_end_shears", [])
        return float(max((abs(value) / 1000.0 for value in shear_values), default=0.0))

    beam = response.get("beam", {})
    span_summaries = beam.get("spanSummaries", [])
    if span_summaries:
        safe_index = max(0, min(int(target_span_index), len(span_summaries) - 1))
        return float(abs(span_summaries[safe_index]["maxDeflectionMm"]))
    return float(abs(beam.get("maxDeflection", {}).get("valueMm", response["summary"]["maxDeflectionMm"])))


def _frame_metric_value(payload, response_metric):
    response = build_calculation_response(payload)
    if response_metric == "max_ux":
        return float(max((abs(item["uxMm"]) for item in response.get("nodeResults", [])), default=0.0))
    if response_metric == "max_uy":
        return float(max((abs(item["uyMm"]) for item in response.get("nodeResults", [])), default=0.0))
    return float(
        max(
            (
                max(abs(item["momentStartKnM"]), abs(item["momentEndKnM"]))
                for item in response.get("memberResults", [])
            ),
            default=0.0,
        )
    )


def _truss_metric_value(payload, response_metric):
    response = build_calculation_response(payload)
    if response_metric == "max_member_axial":
        return float(max((abs(item["axialForceKn"]) for item in response.get("memberResults", [])), default=0.0))
    if response_metric == "max_member_stress":
        return float(max((abs(item["axialStressMpa"]) for item in response.get("memberResults", [])), default=0.0))
    return float(max((abs(item["displacementMm"]) for item in response.get("nodeResults", [])), default=0.0))


def build_sensitivity_response(data):
    analysis_type = get_analysis_type(data)
    config = data.get("config", {})
    range_percent = float(config.get("range", 20))
    steps = int(config.get("steps", 10))
    if range_percent < 0 or range_percent > MAX_VARIATION_RANGE_PERCENT:
        raise ApiError(
            f"敏感性分析扰动范围必须位于 0 到 {int(MAX_VARIATION_RANGE_PERCENT)}% 之间",
            code="COMMON_INVALID_SENSITIVITY_CONFIG",
        )
    if steps < 1 or steps > MAX_VARIATION_STEPS:
        raise ApiError(
            f"敏感性分析步数必须位于 1 到 {MAX_VARIATION_STEPS} 之间",
            code="COMMON_INVALID_SENSITIVITY_CONFIG",
        )
    range_val = range_percent / 100.0
    requested_metric = str(config.get("responseMetric") or "").strip().lower()
    variations = np.linspace(-range_val, range_val, steps + 1).tolist()

    if analysis_type == "frame":
        response_metric, response_label, response_unit = _resolve_response_meta(
            metric=requested_metric,
            mapping=FRAME_RESPONSE_META,
            default_metric=default_sensitivity_metric("frame"),
        )
        values_by_key = {key: [] for key, _, _ in FRAME_SERIES_META}
        for v in variations:
            factor = 1 + v
            for key, _, _ in FRAME_SERIES_META:
                values_by_key[key].append(_frame_metric_value(_scale_frame_payload(data, key, factor), response_metric))

        return _build_response(
            variations=variations,
            response_metric=response_metric,
            response_label=response_label,
            response_unit=response_unit,
            meta=FRAME_SERIES_META,
            values_by_key=values_by_key,
        )

    if analysis_type == "truss":
        response_metric, response_label, response_unit = _resolve_response_meta(
            metric=requested_metric,
            mapping=TRUSS_RESPONSE_META,
            default_metric=default_sensitivity_metric("truss"),
        )
        values_by_key = {key: [] for key, _, _ in TRUSS_SERIES_META}
        for v in variations:
            factor = 1 + v
            for key, _, _ in TRUSS_SERIES_META:
                values_by_key[key].append(_truss_metric_value(_scale_truss_payload(data, key, factor), response_metric))

        return _build_response(
            variations=variations,
            response_metric=response_metric,
            response_label=response_label,
            response_unit=response_unit,
            meta=TRUSS_SERIES_META,
            values_by_key=values_by_key,
        )

    target_span_index = int(data.get("targetSpanIndex", 0))
    response_metric, response_label, response_unit = _resolve_response_meta(
        metric=requested_metric,
        mapping=BEAM_RESPONSE_META,
        default_metric=default_sensitivity_metric("beam"),
    )
    values_by_key = {key: [] for key, _, _ in BEAM_SERIES_META}
    for v in variations:
        factor = 1 + v
        for key, _, _ in BEAM_SERIES_META:
            values_by_key[key].append(_beam_metric_value(_scale_beam_payload(data, key, factor), target_span_index, response_metric))

    return _build_response(
        variations=variations,
        response_metric=response_metric,
        response_label=response_label,
        response_unit=response_unit,
        meta=BEAM_SERIES_META,
        values_by_key=values_by_key,
    )
