from __future__ import annotations

from copy import deepcopy
from math import isfinite
from typing import Any, Dict, Iterable, List, Mapping, Sequence

from backend.contracts.response_envelope import _stable_hash


CALCULATION_TRACE_SCHEMA = "CalculationTrace@1"
CRITICAL_POINT_SCHEMA = "CriticalPointSet@1"
REVIEW_POINT_SCHEMA = "ReviewPointSet@1"
GOVERNING_ENVELOPE_SCHEMA = "GoverningEnvelope@1"
CALCULATION_SNAPSHOT_SCHEMA = "CalculationSnapshot@1"
CALCULATION_SNAPSHOT_DIFF_SCHEMA = "CalculationSnapshotDiff@1"

EVIDENCE_FIELDS = (
    "resultHash",
    "calculationTrace",
    "criticalPoints",
    "reviewPoints",
    "governingEnvelope",
    "calculationSnapshot",
)

MAX_CRITICAL_POINTS = 96
MAX_REVIEW_POINTS = 128
MAX_ENVELOPE_ENTRIES = 96
VALUE_DECIMALS = 6


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def _list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _limit_points(points: Sequence[Mapping[str, Any]], limit: int) -> Dict[str, Any]:
    limited_points = [deepcopy(dict(point)) for point in points if isinstance(point, Mapping)]
    visible_points = limited_points[: max(0, limit)]
    truncated = len(limited_points) > len(visible_points)
    return {
        "bounded": truncated,
        "truncated": truncated,
        "pointCount": len(limited_points),
        "displayPointCount": len(visible_points),
        "points": visible_points,
    }


def _float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _stable_result_view(result: Mapping[str, Any]) -> Dict[str, Any]:
    stable = deepcopy(dict(result))

    def strip(value: Any) -> Any:
        if isinstance(value, Mapping):
            return {
                key: strip(item)
                for key, item in value.items()
                if key not in EVIDENCE_FIELDS and key not in {"generatedAt"}
            }
        if isinstance(value, list):
            return [strip(item) for item in value]
        return value

    return strip(stable)


def _result_hash(result: Mapping[str, Any]) -> str:
    return _stable_hash(_stable_result_view(result))


def _analysis_type(result: Mapping[str, Any]) -> str:
    solution = _mapping(result.get("solution"))
    return str(result.get("analysisType") or solution.get("analysisType") or "beam")


def _solution(result: Mapping[str, Any]) -> Mapping[str, Any]:
    solution = result.get("solution")
    return solution if isinstance(solution, Mapping) else result


def _unit_precision(symbol: str, decimals: int = VALUE_DECIMALS) -> Dict[str, Any]:
    return {
        "symbol": symbol,
        "decimals": decimals,
        "notation": "engineering",
    }


def _point_id(source_type: str, source_id: str, object_type: str, object_id: str, metric: str, kind: str, index: int) -> str:
    return f"{source_type}:{source_id}:{object_type}:{object_id}:{metric}:{kind}:{index}"


def _point(
    *,
    source_type: str,
    source_id: str,
    object_type: str,
    object_id: str,
    metric: str,
    kind: str,
    value: float,
    unit: str,
    station: float | None = None,
    station_ratio: float | None = None,
    side: str = "exact",
    stage: str = "completed",
    source_path: str = "",
    request_hash: str = "",
    model_hash: str = "",
    result_hash: str = "",
    read_only: bool = False,
    index: int = 0,
) -> Dict[str, Any]:
    point = {
        "id": _point_id(source_type, source_id, object_type, object_id, metric, kind, index),
        "stage": stage,
        "sourceType": source_type,
        "sourceId": source_id,
        "object": object_type,
        "objectId": object_id,
        "metric": metric,
        "kind": kind,
        "side": side,
        "value": round(float(value), VALUE_DECIMALS),
        "unit": unit,
        "precision": _unit_precision(unit),
        "bounded": True,
        "truncated": False,
        "readOnly": read_only,
        "requestHash": request_hash,
        "modelHash": model_hash,
        "resultHash": result_hash,
        "sourcePath": source_path,
    }
    if station is not None:
        point["station"] = round(float(station), VALUE_DECIMALS)
    if station_ratio is not None:
        point["stationRatio"] = round(float(station_ratio), VALUE_DECIMALS)
    return point


def _dedupe_points(points: Sequence[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    unique: List[Dict[str, Any]] = []
    for point in points:
        key = (
            point.get("scope"),
            point.get("sourceType"),
            point.get("sourceId"),
            point.get("object"),
            point.get("objectId"),
            point.get("metric"),
            point.get("kind"),
            point.get("side"),
            round(_float(point.get("station"), 0.0), 6) if point.get("station") is not None else None,
            round(_float(point.get("value"), 0.0), 6),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(dict(point))
    return unique


def _point_collection(points: Sequence[Mapping[str, Any]], limit: int) -> Dict[str, Any]:
    point_list = _dedupe_points(points)
    display_points = point_list[:limit]
    return {
        "points": point_list,
        "displayPoints": display_points,
        "bounded": True,
        "truncated": len(point_list) > limit,
        "pointCount": len(point_list),
        "displayPointCount": len(display_points),
    }


def _entry_collection(entries: Sequence[Mapping[str, Any]], limit: int) -> Dict[str, Any]:
    entry_list = _dedupe_points(entries)
    display_entries = entry_list[:limit]
    return {
        "entries": entry_list,
        "displayEntries": display_entries,
        "bounded": True,
        "truncated": len(entry_list) > limit,
        "entryCount": len(entry_list),
        "displayEntryCount": len(display_entries),
    }


def _numeric_candidates(stations: Sequence[float], values: Sequence[float]) -> List[tuple[float, float]]:
    limit = min(len(stations), len(values))
    return [(float(stations[index]), float(values[index])) for index in range(limit) if isfinite(_float(values[index], float("nan")))]


def _series_points(
    *,
    source_type: str,
    source_id: str,
    object_type: str,
    object_id: str,
    metric: str,
    unit: str,
    stations: Sequence[float],
    values: Sequence[float],
    request_hash: str,
    model_hash: str,
    result_hash: str,
    source_path: str,
    station_ratio_scale: float | None = None,
) -> List[Dict[str, Any]]:
    candidates = _numeric_candidates(stations, values)
    if not candidates:
        return []

    points: List[Dict[str, Any]] = []
    index = 0

    def add(kind: str, station: float, value: float, *, station_ratio: float | None = None, side: str = "exact", path_suffix: str = "") -> None:
        nonlocal index
        points.append(
            _point(
                source_type=source_type,
                source_id=source_id,
                object_type=object_type,
                object_id=object_id,
                metric=metric,
                kind=kind,
                value=value,
                unit=unit,
                station=station,
                station_ratio=station_ratio,
                side=side,
                source_path=f"{source_path}{path_suffix}",
                request_hash=request_hash,
                model_hash=model_hash,
                result_hash=result_hash,
                index=index,
            )
        )
        index += 1

    def station_ratio_value(station: float) -> float | None:
        return (station / station_ratio_scale) if station_ratio_scale else None

    first_station, first_value = candidates[0]
    last_station, last_value = candidates[-1]
    add("endpoint", first_station, first_value, station_ratio=station_ratio_value(first_station), side="left", path_suffix="[0]")
    if len(candidates) > 1:
        add("endpoint", last_station, last_value, station_ratio=station_ratio_value(last_station), side="right", path_suffix=f"[{len(candidates) - 1}]")
    max_station, max_value = max(candidates, key=lambda item: item[1])
    min_station, min_value = min(candidates, key=lambda item: item[1])
    abs_station, abs_value = max(candidates, key=lambda item: abs(item[1]))
    add("local_max", max_station, max_value, station_ratio=station_ratio_value(max_station), path_suffix=".max")
    add("local_min", min_station, min_value, station_ratio=station_ratio_value(min_station), path_suffix=".min")
    add("absolute", abs_station, abs_value, station_ratio=station_ratio_value(abs_station), path_suffix=".abs")

    for sample_index, (station, value) in enumerate(candidates):
        if abs(value) <= 1e-12:
            add("zero", station, 0.0, station_ratio=station_ratio_value(station), path_suffix=f"[{sample_index}].zero")

    for sample_index in range(len(candidates) - 1):
        left_station, left_value = candidates[sample_index]
        right_station, right_value = candidates[sample_index + 1]
        if abs(right_station - left_station) <= 1e-12:
            value_tolerance = max(1e-12, max(abs(left_value), abs(right_value), 1.0) * 1e-9)
            if abs(right_value - left_value) <= value_tolerance:
                continue
            add(
                "jump",
                left_station,
                left_value,
                station_ratio=station_ratio_value(left_station),
                side="jump_left",
                path_suffix=f"[{sample_index}].jump_left",
            )
            add(
                "jump",
                right_station,
                right_value,
                station_ratio=station_ratio_value(right_station),
                side="jump_right",
                path_suffix=f"[{sample_index + 1}].jump_right",
            )
            continue
        if right_station < left_station:
            continue
        if left_value * right_value < 0.0:
            ratio_value = abs(left_value) / (abs(left_value) + abs(right_value))
            zero_station = left_station + (right_station - left_station) * ratio_value
            add(
                "zero",
                zero_station,
                0.0,
                station_ratio=station_ratio_value(zero_station),
                path_suffix=f"[{sample_index}:{sample_index + 1}].zero",
            )

    for sample_index in range(1, len(candidates) - 1):
        left_station, left_value = candidates[sample_index - 1]
        station, value = candidates[sample_index]
        right_station, right_value = candidates[sample_index + 1]
        if not (left_station < station < right_station):
            continue
        if value >= left_value and value >= right_value:
            add("local_max", station, value, station_ratio=station_ratio_value(station), path_suffix=f"[{sample_index}].local_max")
        if value <= left_value and value <= right_value:
            add("local_min", station, value, station_ratio=station_ratio_value(station), path_suffix=f"[{sample_index}].local_min")

    return points


def _selector_text(selector: Mapping[str, Any], *keys: str) -> str:
    for key in keys:
        value = selector.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return ""


def _selector_station(selector: Mapping[str, Any]) -> float | None:
    for key in ("station", "stationM", "positionM", "x"):
        if selector.get(key) is None:
            continue
        value = _float(selector.get(key), float("nan"))
        if not isfinite(value):
            raise ValueError(f"reviewPoints.{key} 必须是有限数值")
        return value
    return None


def _build_point_from_selector(
    *,
    selector: Mapping[str, Any],
    analysis_type: str,
    source_id: str,
    object_type: str,
    object_id: str,
    metric: str,
    value: float,
    unit: str,
    station: float | None,
    station_ratio: float | None,
    source_path: str,
    request_hash: str,
    model_hash: str,
    result_hash: str,
    index: int,
    side: str = "exact",
) -> Dict[str, Any]:
    point = _point(
        source_type="request",
        source_id=source_id,
        object_type=object_type,
        object_id=object_id,
        metric=metric,
        kind="review",
        value=value,
        unit=unit,
        station=station,
        station_ratio=station_ratio,
        side=side,
        source_path=source_path,
        request_hash=request_hash,
        model_hash=model_hash,
        result_hash=result_hash,
        read_only=False,
        index=index,
    )
    point.update(
        {
            "analysisType": analysis_type,
            "targetType": str(selector.get("targetType") or object_type),
            "targetId": str(selector.get("targetId") or object_id),
            "label": str(selector.get("label") or "用户复核点"),
            "selector": {key: deepcopy(value) for key, value in selector.items() if value is not None},
        }
    )
    if selector.get("note") is not None:
        point["note"] = str(selector.get("note"))
    return point


def _interpolate_series_point(
    *,
    selector: Mapping[str, Any],
    analysis_type: str,
    object_type: str,
    object_id: str,
    metric: str,
    stations: Sequence[float],
    values: Sequence[float],
    unit: str,
    station_ratio_scale: float | None,
    request_hash: str,
    model_hash: str,
    result_hash: str,
    source_path: str,
) -> Dict[str, Any]:
    candidates = _numeric_candidates(stations, values)
    if not candidates:
        raise ValueError(f"reviewPoints 未找到 {object_id}.{metric} 可用结果序列")
    if any(candidates[index + 1][0] < candidates[index][0] for index in range(len(candidates) - 1)):
        raise ValueError(f"reviewPoints 无法解析非单调结果序列 {object_id}.{metric}")

    station = _selector_station(selector)
    if station is None and selector.get("stationRatio") is not None:
        ratio = _float(selector.get("stationRatio"), float("nan"))
        if not isfinite(ratio) or ratio < 0.0 or ratio > 1.0:
            raise ValueError("reviewPoints.stationRatio 必须是 0 到 1 的有限数值")
        if station_ratio_scale is None or station_ratio_scale <= 0.0:
            raise ValueError("reviewPoints.stationRatio 缺少可用的构件长度")
        station = ratio * station_ratio_scale
    if station is None:
        raise ValueError("reviewPoints 截面复核点需要 station 或 stationRatio")

    lower = candidates[0][0]
    upper = candidates[-1][0]
    tolerance = max(1e-9, max(abs(lower), abs(upper), 1.0) * 1e-9)
    if station < lower - tolerance or station > upper + tolerance:
        raise ValueError(f"reviewPoints.station={station:g} 超出 {object_id} 范围 [{lower:g}, {upper:g}]")
    station = min(max(station, lower), upper)

    exact = [(index, value) for index, (candidate_station, value) in enumerate(candidates) if abs(candidate_station - station) <= tolerance]
    requested_side = _selector_text(selector, "side") or "exact"
    if exact:
        distinct_values = {round(value, VALUE_DECIMALS) for _, value in exact}
        if len(distinct_values) > 1 and requested_side == "exact":
            raise ValueError(f"reviewPoints.station={station:g} 位于跳跃点，必须指定 side=left 或 right")
        if requested_side in {"left", "jump_left"}:
            sample_index, value = exact[0]
            resolved_side = "jump_left" if len(distinct_values) > 1 else "left"
        elif requested_side in {"right", "jump_right"}:
            sample_index, value = exact[-1]
            resolved_side = "jump_right" if len(distinct_values) > 1 else "right"
        elif requested_side == "exact":
            sample_index, value = exact[0]
            resolved_side = "exact"
        else:
            raise ValueError("reviewPoints.side 仅支持 exact、left、right、jump_left、jump_right")
        ratio = station / station_ratio_scale if station_ratio_scale and station_ratio_scale > 0.0 else None
        return _build_point_from_selector(
            selector=selector,
            analysis_type=analysis_type,
            source_id=_selector_text(selector, "id", "sourceId") or "request",
            object_type=object_type,
            object_id=object_id,
            metric=metric,
            value=value,
            unit=unit,
            station=station,
            station_ratio=ratio,
            side=resolved_side,
            source_path=f"{source_path}[{sample_index}]",
            request_hash=request_hash,
            model_hash=model_hash,
            result_hash=result_hash,
            index=sample_index,
        )

    groups: List[List[tuple[int, float, float]]] = []
    for candidate_index, (candidate_station, candidate_value) in enumerate(candidates):
        if not groups or abs(groups[-1][0][1] - candidate_station) > tolerance:
            groups.append([])
        groups[-1].append((candidate_index, candidate_station, candidate_value))
    for group_index in range(1, len(groups)):
        right_group = groups[group_index]
        right_index, right_station, right_value = right_group[0]
        if right_station <= station:
            continue
        left_group = groups[group_index - 1]
        left_index, left_station, left_value = left_group[-1]
        if right_station - left_station <= tolerance:
            continue
        fraction = (station - left_station) / (right_station - left_station)
        value = left_value + (right_value - left_value) * fraction
        ratio = station / station_ratio_scale if station_ratio_scale and station_ratio_scale > 0.0 else None
        return _build_point_from_selector(
            selector=selector,
            analysis_type=analysis_type,
            source_id=_selector_text(selector, "id", "sourceId") or "request",
            object_type=object_type,
            object_id=object_id,
            metric=metric,
            value=value,
            unit=unit,
            station=station,
            station_ratio=ratio,
            side="exact",
            source_path=f"{source_path}[{left_index}:{right_index}]",
            request_hash=request_hash,
            model_hash=model_hash,
            result_hash=result_hash,
            index=left_index,
        )
    raise ValueError(f"reviewPoints.station={station:g} 无法映射到 {object_id}.{metric} 结果序列")


def _node_points(
    *,
    source_type: str,
    source_id: str,
    object_type: str,
    nodes: Sequence[Mapping[str, Any]],
    request_hash: str,
    model_hash: str,
    result_hash: str,
    source_path: str,
) -> List[Dict[str, Any]]:
    points: List[Dict[str, Any]] = []
    for index, node in enumerate(nodes):
        object_id = str(node.get("nodeId") or node.get("id") or f"node-{index + 1}")
        x = _float(node.get("x"), float(index))
        entries = (
            ("uxMm", "ux", "mm"),
            ("uyMm", "uy", "mm"),
            ("resultantMm", "resultant", "mm"),
            ("displacementMm", "resultant", "mm"),
        )
        for entry_index, (value_key, metric, unit) in enumerate(entries):
            if value_key not in node:
                continue
            points.append(
                _point(
                    source_type=source_type,
                    source_id=source_id,
                    object_type=object_type,
                    object_id=object_id,
                    metric=metric,
                    kind="node",
                    value=_float(node.get(value_key), 0.0),
                    unit=unit,
                    station=x,
                    station_ratio=None,
                    source_path=f"{source_path}[{index}].{value_key}",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=entry_index,
                )
            )
        if "reactionFxKn" in node:
            points.append(
                _point(
                    source_type=source_type,
                    source_id=source_id,
                    object_type=object_type,
                    object_id=object_id,
                    metric="reactionFx",
                    kind="node",
                    value=_float(node.get("reactionFxKn"), 0.0),
                    unit="kN",
                    station=x,
                    source_path=f"{source_path}[{index}].reactionFxKn",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=10,
                )
            )
        if "reactionFyKn" in node:
            points.append(
                _point(
                    source_type=source_type,
                    source_id=source_id,
                    object_type=object_type,
                    object_id=object_id,
                    metric="reactionFy",
                    kind="node",
                    value=_float(node.get("reactionFyKn"), 0.0),
                    unit="kN",
                    station=x,
                    source_path=f"{source_path}[{index}].reactionFyKn",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=11,
                )
            )
        if "reactionMzKnM" in node:
            points.append(
                _point(
                    source_type=source_type,
                    source_id=source_id,
                    object_type=object_type,
                    object_id=object_id,
                    metric="reactionMz",
                    kind="node",
                    value=_float(node.get("reactionMzKnM"), 0.0),
                    unit="kN.m",
                    station=x,
                    source_path=f"{source_path}[{index}].reactionMzKnM",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=12,
                )
            )
        for value_key, metric, entry_index in (("rxKn", "reactionFx", 13), ("ryKn", "reactionFy", 14)):
            if value_key not in node:
                continue
            points.append(
                _point(
                    source_type=source_type,
                    source_id=source_id,
                    object_type=object_type,
                    object_id=object_id,
                    metric=metric,
                    kind="node",
                    value=_float(node.get(value_key), 0.0),
                    unit="kN",
                    station=x,
                    source_path=f"{source_path}[{index}].{value_key}",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=entry_index,
                )
            )
    return points


def _beam_points(
    result: Mapping[str, Any],
    *,
    source_type: str,
    source_id: str,
    request_hash: str,
    model_hash: str,
    result_hash: str,
) -> List[Dict[str, Any]]:
    x_values = [float(value) for value in _list(result.get("x_data"))]
    deflection_mm = [float(value) * 1000.0 for value in _list(result.get("v_data"))]
    moments_knm = [float(value) / 1000.0 for value in _list(result.get("element_end_moments"))]
    shears_kn = [float(value) / 1000.0 for value in _list(result.get("element_end_shears"))]
    total_length = max(x_values) if x_values else None
    points = []
    points.extend(
        _series_points(
            source_type=source_type,
            source_id=source_id,
            object_type="beam",
            object_id="beam",
            metric="deflection",
            unit="mm",
            stations=x_values,
            values=deflection_mm,
            request_hash=request_hash,
            model_hash=model_hash,
            result_hash=result_hash,
            source_path="$.solution.v_data",
            station_ratio_scale=total_length,
        )
    )
    points.extend(
        _series_points(
            source_type=source_type,
            source_id=source_id,
            object_type="beam",
            object_id="beam",
            metric="moment",
            unit="kN.m",
            stations=x_values,
            values=moments_knm,
            request_hash=request_hash,
            model_hash=model_hash,
            result_hash=result_hash,
            source_path="$.solution.element_end_moments",
            station_ratio_scale=total_length,
        )
    )
    points.extend(
        _series_points(
            source_type=source_type,
            source_id=source_id,
            object_type="beam",
            object_id="beam",
            metric="shear",
            unit="kN",
            stations=x_values,
            values=shears_kn,
            request_hash=request_hash,
            model_hash=model_hash,
            result_hash=result_hash,
            source_path="$.solution.element_end_shears",
            station_ratio_scale=total_length,
        )
    )
    query_results = _list(result.get("queryResults"))
    for index, query in enumerate(query_results):
        if not isinstance(query, Mapping):
            continue
        x = _float(query.get("xM"), 0.0)
        ratio = x / total_length if total_length and total_length > 0.0 else None
        if "deflectionMm" in query:
            points.append(
                _point(
                    source_type=source_type,
                    source_id=source_id,
                    object_type="beam",
                    object_id="beam",
                    metric="deflection",
                    kind="query",
                    value=_float(query.get("deflectionMm"), 0.0),
                    unit="mm",
                    station=x,
                    station_ratio=ratio,
                    source_path=f"$.solution.queryResults[{index}].deflectionMm",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=index,
                )
            )
        if "momentKnM" in query:
            points.append(
                _point(
                    source_type=source_type,
                    source_id=source_id,
                    object_type="beam",
                    object_id="beam",
                    metric="moment",
                    kind="query",
                    value=_float(query.get("momentKnM"), 0.0),
                    unit="kN.m",
                    station=x,
                    station_ratio=ratio,
                    source_path=f"$.solution.queryResults[{index}].momentKnM",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=index,
                )
            )
        if "shearKn" in query:
            points.append(
                _point(
                    source_type=source_type,
                    source_id=source_id,
                    object_type="beam",
                    object_id="beam",
                    metric="shear",
                    kind="query",
                    value=_float(query.get("shearKn"), 0.0),
                    unit="kN",
                    station=x,
                    station_ratio=ratio,
                    source_path=f"$.solution.queryResults[{index}].shearKn",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=index,
                )
            )
    supports = _list(result.get("beam", {}).get("supports"))
    for index, support in enumerate(supports):
        x = _float(support.get("x"), 0.0)
        ratio = x / total_length if total_length and total_length > 0.0 else None
        points.append(
            _point(
                source_type=source_type,
                source_id=source_id,
                object_type="beam",
                object_id=str(support.get("label") or support.get("id") or f"support-{index + 1}"),
                metric="support",
                kind="support",
                value=x,
                unit="m",
                station=x,
                station_ratio=ratio,
                side="exact",
                source_path=f"$.solution.beam.supports[{index}]",
                request_hash=request_hash,
                model_hash=model_hash,
                result_hash=result_hash,
                index=index,
            )
        )
    return points


def _frame_points(
    result: Mapping[str, Any],
    *,
    source_type: str,
    source_id: str,
    request_hash: str,
    model_hash: str,
    result_hash: str,
) -> List[Dict[str, Any]]:
    points: List[Dict[str, Any]] = []
    node_results = _list(result.get("nodeResults"))
    points.extend(
        _node_points(
            source_type=source_type,
            source_id=source_id,
            object_type="node",
            nodes=node_results,
            request_hash=request_hash,
            model_hash=model_hash,
            result_hash=result_hash,
            source_path="$.solution.nodeResults",
        )
    )
    member_diagrams = _list(result.get("memberDiagrams"))
    for member_index, diagram in enumerate(member_diagrams):
        if not isinstance(diagram, Mapping):
            continue
        member_id = str(diagram.get("memberId") or f"member-{member_index + 1}")
        stations = [float(value) for value in _list(diagram.get("stationsM"))]
        station_scale = max(stations) if stations else None
        for metric, unit, key in (
            ("axial", "kN", "axialKn"),
            ("shear", "kN", "shearKn"),
            ("moment", "kN.m", "momentKnM"),
            ("deflection", "mm", "deflectionMm"),
        ):
            values = [float(value) for value in _list(diagram.get(key))]
            points.extend(
                _series_points(
                    source_type=source_type,
                    source_id=source_id,
                    object_type="member",
                    object_id=member_id,
                    metric=metric,
                    unit=unit,
                    stations=stations,
                    values=values,
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    source_path=f"$.solution.memberDiagrams[{member_index}].{key}",
                    station_ratio_scale=station_scale,
                )
            )
    member_results = _list(result.get("memberResults"))
    for index, member in enumerate(member_results):
        if not isinstance(member, Mapping):
            continue
        member_id = str(member.get("memberId") or f"member-{index + 1}")
        start_station = _float(member.get("lengthM"), 0.0)
        if "maxAbsMomentKnM" in member:
            points.append(
                _point(
                    source_type=source_type,
                    source_id=source_id,
                    object_type="member",
                    object_id=member_id,
                    metric="moment",
                    kind="control",
                    value=_float(member.get("maxAbsMomentKnM"), 0.0),
                    unit="kN.m",
                    station=start_station,
                    station_ratio=1.0 if start_station else None,
                    source_path=f"$.solution.memberResults[{index}].maxAbsMomentKnM",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=index,
                )
            )
        if "maxAbsAxialKn" in member:
            points.append(
                _point(
                    source_type=source_type,
                    source_id=source_id,
                    object_type="member",
                    object_id=member_id,
                    metric="axial",
                    kind="control",
                    value=_float(member.get("maxAbsAxialKn"), 0.0),
                    unit="kN",
                    station=start_station,
                    station_ratio=1.0 if start_station else None,
                    source_path=f"$.solution.memberResults[{index}].maxAbsAxialKn",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=index,
                )
            )
    return points


def _truss_points(
    result: Mapping[str, Any],
    *,
    source_type: str,
    source_id: str,
    request_hash: str,
    model_hash: str,
    result_hash: str,
) -> List[Dict[str, Any]]:
    points: List[Dict[str, Any]] = []
    node_results = _list(result.get("nodeResults"))
    points.extend(
        _node_points(
            source_type=source_type,
            source_id=source_id,
            object_type="node",
            nodes=node_results,
            request_hash=request_hash,
            model_hash=model_hash,
            result_hash=result_hash,
            source_path="$.solution.nodeResults",
        )
    )
    member_results = _list(result.get("memberResults"))
    for index, member in enumerate(member_results):
        if not isinstance(member, Mapping):
            continue
        member_id = str(member.get("memberId") or f"member-{index + 1}")
        if "axialForceKn" in member:
            points.append(
                _point(
                    source_type=source_type,
                    source_id=source_id,
                    object_type="member",
                    object_id=member_id,
                    metric="axial",
                    kind="control",
                    value=_float(member.get("axialForceKn"), 0.0),
                    unit="kN",
                    station=_float(member.get("lengthM"), float(index)),
                    station_ratio=1.0 if member.get("lengthM") else None,
                    source_path=f"$.solution.memberResults[{index}].axialForceKn",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=index,
                )
            )
    return points


def _collect_points(
    result: Mapping[str, Any],
    *,
    source_type: str,
    source_id: str,
    analysis_type: str,
    request_hash: str,
    model_hash: str,
    result_hash: str,
) -> List[Dict[str, Any]]:
    if analysis_type == "frame":
        return _frame_points(
            result,
            source_type=source_type,
            source_id=source_id,
            request_hash=request_hash,
            model_hash=model_hash,
            result_hash=result_hash,
        )
    if analysis_type == "truss":
        return _truss_points(
            result,
            source_type=source_type,
            source_id=source_id,
            request_hash=request_hash,
            model_hash=model_hash,
            result_hash=result_hash,
        )
    return _beam_points(
        result,
        source_type=source_type,
        source_id=source_id,
        request_hash=request_hash,
        model_hash=model_hash,
        result_hash=result_hash,
    )


def _build_critical_point_set(
    result: Mapping[str, Any],
    *,
    analysis_type: str,
    request_hash: str,
    model_hash: str,
    result_hash: str,
) -> Dict[str, Any]:
    points = _collect_points(
        _solution(result),
        source_type="main",
        source_id="__primary__",
        analysis_type=analysis_type,
        request_hash=request_hash,
        model_hash=model_hash,
        result_hash=result_hash,
    )
    limited = _point_collection(points, MAX_CRITICAL_POINTS)
    return {
        "schema": CRITICAL_POINT_SCHEMA,
        "analysisType": analysis_type,
        "stage": "completed",
        "requestHash": request_hash,
        "modelHash": model_hash,
        "resultHash": result_hash,
        "unitPrecision": _unit_precision("mixed"),
        "bounded": limited["bounded"],
        "truncated": limited["truncated"],
        "pointCount": limited["pointCount"],
        "displayPointCount": limited["displayPointCount"],
        "points": limited["points"],
        "displayPoints": limited["displayPoints"],
    }


def _resolve_requested_point(
    selector: Mapping[str, Any],
    critical_points: Sequence[Mapping[str, Any]],
    result: Mapping[str, Any],
    *,
    analysis_type: str,
    request_hash: str,
    model_hash: str,
    result_hash: str,
) -> Dict[str, Any]:
    if not isinstance(selector, Mapping):
        raise ValueError("reviewPoints 必须是对象数组")

    selector_source_id = _selector_text(selector, "sourceId")
    source_id = _selector_text(selector, "id", "sourceId")
    object_type = _selector_text(selector, "targetType", "objectType", "object")
    object_id = _selector_text(selector, "targetId", "objectId", "memberId", "nodeId")
    metric = _selector_text(selector, "metric", "metricKey")
    if not any((source_id, object_type, object_id, metric, selector.get("station") is not None, selector.get("stationRatio") is not None)):
        raise ValueError("reviewPoints 需要 sourceId 或 objectId/metric/station 选择器")

    for point in critical_points:
        if selector_source_id and str(point.get("id")) == selector_source_id:
            resolved = deepcopy(dict(point))
            resolved.update(
                {
                    "sourceType": "request",
                    "sourceId": source_id or selector_source_id,
                    "readOnly": False,
                    "selector": {key: value for key, value in selector.items() if value is not None},
                }
            )
            return resolved

    solution = _solution(result)
    if analysis_type == "beam":
        beam_metric = metric or "deflection"
        x_values = [float(value) for value in _list(solution.get("x_data"))]
        resolved_selector = dict(selector)
        if _selector_station(selector) is None and selector.get("stationRatio") is None and object_type == "node" and object_id:
            for node in _list(_mapping(solution.get("beam")).get("nodes")):
                if str(_mapping(node).get("id") or _mapping(node).get("index")) == object_id:
                    resolved_selector["station"] = _float(_mapping(node).get("x"), float("nan"))
                    break
        if beam_metric == "deflection":
            values = [float(value) * 1000.0 for value in _list(solution.get("v_data"))]
            unit = "mm"
        elif beam_metric == "moment":
            values = [float(value) / 1000.0 for value in _list(solution.get("element_end_moments"))]
            unit = "kN.m"
        elif beam_metric == "shear":
            values = [float(value) / 1000.0 for value in _list(solution.get("element_end_shears"))]
            unit = "kN"
        else:
            raise ValueError("beam reviewPoints 需要 metric=deflection|moment|shear")
        return _interpolate_series_point(
            selector=resolved_selector,
            analysis_type=analysis_type,
            object_type="beam",
            object_id=object_id or "beam",
            metric=beam_metric,
            stations=x_values,
            values=values,
            unit=unit,
            station_ratio_scale=max(x_values) if x_values else None,
            request_hash=request_hash,
            model_hash=model_hash,
            result_hash=result_hash,
            source_path="$.solution",
        )

    if analysis_type == "frame":
        node_results = _list(solution.get("nodeResults"))
        member_diagrams = _list(solution.get("memberDiagrams"))
        metric_map = {
            "node": {
                "ux": ("uxMm", "mm"),
                "uy": ("uyMm", "mm"),
                "resultant": ("resultantMm", "mm"),
                "reactionFx": ("reactionFxKn", "kN"),
                "reactionFy": ("reactionFyKn", "kN"),
                "reactionMz": ("reactionMzKnM", "kN.m"),
            },
            "member": {
                "axial": ("axialKn", "kN"),
                "shear": ("shearKn", "kN"),
                "moment": ("momentKnM", "kN.m"),
                "deflection": ("deflectionMm", "mm"),
            },
        }
        target_type = "member" if object_type == "station" else object_type
        target_type = target_type or ("node" if _selector_text(selector, "nodeId") else "member" if _selector_text(selector, "memberId") else "")
        if target_type == "node":
            metric = metric or "resultant"
            node_id = object_id or _selector_text(selector, "nodeId")
            if not node_id:
                raise ValueError("frame reviewPoints 需要 nodeId")
            if metric not in metric_map["node"]:
                raise ValueError(f"frame reviewPoints 不支持 node metric={metric}")
            value_key, unit = metric_map["node"][metric]
            for index, node in enumerate(node_results):
                current_id = str(node.get("nodeId") or node.get("id") or "")
                if current_id != node_id:
                    continue
                if value_key not in node:
                    raise ValueError(f"frame reviewPoints 节点 {node_id} 缺少 {metric}")
                return _build_point_from_selector(
                    selector=selector,
                    analysis_type=analysis_type,
                    source_id=source_id or f"request-{index + 1}",
                    object_type="node",
                    object_id=node_id,
                    metric=metric,
                    value=_float(node.get(value_key), 0.0),
                    unit=unit,
                    station=_float(node.get("x"), float(index)),
                    station_ratio=None,
                    source_path=f"$.solution.nodeResults[{index}].{value_key}",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=index,
                )
            raise ValueError(f"frame reviewPoints 未找到节点 {node_id}")
        if target_type == "member":
            metric = metric or "moment"
            member_id = object_id or _selector_text(selector, "memberId")
            if not member_id:
                raise ValueError("frame reviewPoints 需要 memberId")
            if metric not in metric_map["member"]:
                raise ValueError(f"frame reviewPoints 不支持 member metric={metric}")
            if _selector_station(selector) is None and selector.get("stationRatio") is None:
                candidates = [
                    point
                    for point in critical_points
                    if str(point.get("object")) == "member"
                    and str(point.get("objectId")) == member_id
                    and str(point.get("metric")) == metric
                ]
                if candidates:
                    candidate = deepcopy(dict(max(candidates, key=lambda point: abs(_float(point.get("value"), 0.0)))))
                    candidate.update(
                        {
                            "sourceType": "request",
                            "sourceId": source_id or f"request-{member_id}",
                            "readOnly": False,
                            "targetType": object_type or "member",
                            "targetId": member_id,
                            "label": str(selector.get("label") or "用户复核点"),
                            "selector": {key: deepcopy(value) for key, value in selector.items() if value is not None},
                        }
                    )
                    return candidate
            value_key, unit = metric_map["member"][metric]
            for index, diagram in enumerate(member_diagrams):
                current_id = str(diagram.get("memberId") or "")
                if current_id != member_id:
                    continue
                stations = [float(value) for value in _list(diagram.get("stationsM"))]
                values = [float(value) for value in _list(diagram.get(value_key))]
                return _interpolate_series_point(
                    selector=selector,
                    analysis_type=analysis_type,
                    object_type="member",
                    object_id=member_id,
                    metric=metric,
                    stations=stations,
                    values=values,
                    unit=unit,
                    station_ratio_scale=stations[-1] if stations else None,
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    source_path=f"$.solution.memberDiagrams[{index}].{value_key}",
                )
            raise ValueError(f"frame reviewPoints 未找到构件 {member_id}")
        raise ValueError("frame reviewPoints 需要 nodeId 或 memberId")

    if analysis_type == "truss":
        node_results = _list(solution.get("nodeResults"))
        member_results = _list(solution.get("memberResults"))
        metric_map = {
            "node": {
                "ux": ("uxMm", "mm"),
                "uy": ("uyMm", "mm"),
                "resultant": ("displacementMm", "mm"),
                "reactionFx": ("rxKn", "kN"),
                "reactionFy": ("ryKn", "kN"),
            },
            "member": {
                "axial": ("axialForceKn", "kN"),
            },
        }
        target_type = "member" if object_type == "station" else object_type
        target_type = target_type or ("node" if _selector_text(selector, "nodeId") else "member" if _selector_text(selector, "memberId") else "")
        if target_type == "node":
            metric = metric or "resultant"
            node_id = object_id or _selector_text(selector, "nodeId")
            if not node_id:
                raise ValueError("truss reviewPoints 需要 nodeId")
            if metric not in metric_map["node"]:
                raise ValueError(f"truss reviewPoints 不支持 node metric={metric}")
            value_key, unit = metric_map["node"][metric]
            for index, node in enumerate(node_results):
                current_id = str(node.get("nodeId") or node.get("id") or "")
                if current_id != node_id:
                    continue
                if value_key not in node:
                    raise ValueError(f"truss reviewPoints 节点 {node_id} 缺少 {metric}")
                return _build_point_from_selector(
                    selector=selector,
                    analysis_type=analysis_type,
                    source_id=source_id or f"request-{index + 1}",
                    object_type="node",
                    object_id=node_id,
                    metric=metric,
                    value=_float(node.get(value_key), 0.0),
                    unit=unit,
                    station=_float(node.get("x"), float(index)),
                    station_ratio=None,
                    source_path=f"$.solution.nodeResults[{index}].{value_key}",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=index,
                )
            raise ValueError(f"truss reviewPoints 未找到节点 {node_id}")
        if target_type == "member":
            metric = metric or "axial"
            member_id = object_id or _selector_text(selector, "memberId")
            if not member_id:
                raise ValueError("truss reviewPoints 需要 memberId")
            if metric and metric != "axial":
                raise ValueError("truss reviewPoints 仅支持 axial")
            for index, member in enumerate(member_results):
                current_id = str(member.get("memberId") or "")
                if current_id != member_id:
                    continue
                if "axialForceKn" not in member:
                    raise ValueError(f"truss reviewPoints 杆件 {member_id} 缺少 axialForceKn")
                length = _float(member.get("lengthM"), float(index))
                return _build_point_from_selector(
                    selector=selector,
                    analysis_type=analysis_type,
                    source_id=source_id or f"request-{index + 1}",
                    object_type="member",
                    object_id=member_id,
                    metric="axial",
                    value=_float(member.get("axialForceKn"), 0.0),
                    unit="kN",
                    station=length,
                    station_ratio=1.0 if length else None,
                    source_path=f"$.solution.memberResults[{index}].axialForceKn",
                    request_hash=request_hash,
                    model_hash=model_hash,
                    result_hash=result_hash,
                    index=index,
                )
            raise ValueError(f"truss reviewPoints 未找到构件 {member_id}")
        raise ValueError("truss reviewPoints 需要 nodeId 或 memberId")

    raise ValueError(f"reviewPoints 不支持 analysisType={analysis_type}")


def _build_review_point_set(
    result: Mapping[str, Any],
    *,
    analysis_type: str,
    request_hash: str,
    model_hash: str,
    result_hash: str,
    critical_points: Mapping[str, Any],
) -> Dict[str, Any]:
    system_points = []
    for index, point in enumerate(_list(critical_points.get("points"))):
        system_point = deepcopy(dict(point))
        system_point.update(
            {
                "sourceType": "system",
                "sourceId": system_point.get("id", f"system-{index + 1}"),
                "readOnly": True,
                "selector": {
                    "sourceId": point.get("id"),
                    "objectType": point.get("object"),
                    "objectId": point.get("objectId"),
                    "metric": point.get("metric"),
                    "station": point.get("station"),
                    "stationRatio": point.get("stationRatio"),
                },
            }
        )
        system_points.append(system_point)

    requested_points = []
    for index, selector in enumerate(_list(_mapping(result.get("request")).get("reviewPoints"))):
        requested = _resolve_requested_point(
            selector,
            system_points,
            result,
            analysis_type=analysis_type,
            request_hash=request_hash,
            model_hash=model_hash,
            result_hash=result_hash,
        )
        requested["sourceId"] = requested.get("sourceId") or f"request-{index + 1}"
        requested["requestIndex"] = index
        requested_points.append(requested)

    combined = system_points + requested_points
    limited = _point_collection(combined, MAX_REVIEW_POINTS)
    return {
        "schema": REVIEW_POINT_SCHEMA,
        "analysisType": analysis_type,
        "stage": "completed",
        "requestHash": request_hash,
        "modelHash": model_hash,
        "resultHash": result_hash,
        "unitPrecision": _unit_precision("mixed"),
        "bounded": limited["bounded"],
        "truncated": limited["truncated"],
        "requestedCount": len(requested_points),
        "systemCount": len(system_points),
        "pointCount": limited["pointCount"],
        "displayPointCount": limited["displayPointCount"],
        "systemPoints": system_points,
        "requestedPoints": requested_points,
        "points": limited["points"],
        "displayPoints": limited["displayPoints"],
    }


def _select_envelope_candidate(points: Sequence[Mapping[str, Any]], metric: str, kind: str) -> Mapping[str, Any] | None:
    candidates = [point for point in points if str(point.get("metric")) == metric]
    if not candidates:
        return None
    if kind == "positive":
        positive = [point for point in candidates if _float(point.get("value"), 0.0) > 0.0]
        return max(positive, key=lambda point: _float(point.get("value"), 0.0)) if positive else None
    if kind == "negative":
        negative = [point for point in candidates if _float(point.get("value"), 0.0) < 0.0]
        return min(negative, key=lambda point: _float(point.get("value"), 0.0)) if negative else None
    if kind == "absolute":
        return max(candidates, key=lambda point: abs(_float(point.get("value"), 0.0)))
    raise ValueError(f"unsupported envelope kind={kind}")


def _build_governing_envelope(
    result: Mapping[str, Any],
    *,
    analysis_type: str,
    request_hash: str,
    model_hash: str,
    result_hash: str,
) -> Dict[str, Any]:
    solution = _solution(result)
    source_records: List[Dict[str, Any]] = []
    main_source = {
        "sourceType": "main",
        "sourceId": "__primary__",
        "resultHash": result_hash,
        "points": _collect_points(
            solution,
            source_type="main",
            source_id="__primary__",
            analysis_type=analysis_type,
            request_hash=request_hash,
            model_hash=model_hash,
            result_hash=result_hash,
        ),
    }
    source_records.append(main_source)

    for source_type, key in (("case", "loadCaseResults"), ("combination", "loadCombinationResults")):
        for index, source_result in enumerate(_list(solution.get(key))):
            if not isinstance(source_result, Mapping):
                continue
            source_id = str(source_result.get("id") or f"{key}-{index + 1}")
            source_result_hash = _stable_hash(_stable_result_view(source_result))
            source_records.append(
                {
                    "sourceType": source_type,
                    "sourceId": source_id,
                    "resultHash": source_result_hash,
                    "points": _collect_points(
                        source_result,
                        source_type=source_type,
                        source_id=source_id,
                        analysis_type=analysis_type,
                        request_hash=request_hash,
                        model_hash=model_hash,
                        result_hash=source_result_hash,
                    ),
                }
            )

    envelope_entries: List[Dict[str, Any]] = []
    metric_pairs: List[tuple[str, str, str]] = []
    if analysis_type == "beam":
        metric_pairs = [("deflection", "beam", "mm"), ("moment", "beam", "kN.m"), ("shear", "beam", "kN")]
    elif analysis_type == "frame":
        metric_pairs = [
            ("ux", "node", "mm"),
            ("uy", "node", "mm"),
            ("resultant", "node", "mm"),
            ("axial", "member", "kN"),
            ("shear", "member", "kN"),
            ("moment", "member", "kN.m"),
        ]
    else:
        metric_pairs = [("ux", "node", "mm"), ("uy", "node", "mm"), ("resultant", "node", "mm"), ("axial", "member", "kN")]

    index = 0

    def append_entry(
        candidate: Mapping[str, Any],
        *,
        metric: str,
        object_type: str,
        unit: str,
        kind: str,
        scope: str,
    ) -> None:
        nonlocal index
        envelope_entries.append(
            {
                "id": _point_id(
                    str(candidate.get("sourceType")),
                    str(candidate.get("sourceId")),
                    object_type,
                    str(candidate.get("objectId")),
                    metric,
                    f"{scope}-{kind}",
                    index,
                ),
                "stage": "completed",
                "scope": scope,
                "kind": kind,
                "metric": metric,
                "object": object_type,
                "objectId": candidate.get("objectId"),
                "sourceType": candidate.get("sourceType"),
                "sourceId": candidate.get("sourceId"),
                "resultHash": candidate.get("resultHash"),
                "value": round(_float(candidate.get("value"), 0.0), VALUE_DECIMALS),
                "unit": unit,
                "precision": _unit_precision(unit),
                "station": candidate.get("station"),
                "stationRatio": candidate.get("stationRatio"),
                "side": candidate.get("side", "exact"),
                "sourcePointId": candidate.get("id"),
                "requestHash": request_hash,
                "modelHash": model_hash,
                "bounded": True,
                "truncated": False,
            }
        )
        index += 1

    for metric, object_type, unit in metric_pairs:
        group_points: List[Mapping[str, Any]] = []
        for source in source_records:
            for point in source["points"]:
                if str(point.get("metric")) == metric and str(point.get("object")) == object_type:
                    group_points.append(point)
        if not group_points:
            continue
        for kind in ("positive", "negative", "absolute"):
            candidate = _select_envelope_candidate(group_points, metric, kind)
            if candidate is None:
                continue
            append_entry(candidate, metric=metric, object_type=object_type, unit=unit, kind=kind, scope="global")

        location_groups: Dict[tuple[Any, ...], List[Mapping[str, Any]]] = {}
        for point in group_points:
            if point.get("station") is None:
                continue
            location_key = (
                str(point.get("objectId")),
                round(_float(point.get("station"), 0.0), VALUE_DECIMALS),
                str(point.get("side") or "exact"),
            )
            location_groups.setdefault(location_key, []).append(point)
        for location_points in location_groups.values():
            for kind in ("positive", "negative", "absolute"):
                candidate = _select_envelope_candidate(location_points, metric, kind)
                if candidate is None:
                    continue
                append_entry(candidate, metric=metric, object_type=object_type, unit=unit, kind=kind, scope="location")

    # Keep the complete fact set for audit/export and bound only the display
    # projection. A report must never silently lose governing candidates merely
    # because the UI display limit was reached.
    limited = _entry_collection(envelope_entries, MAX_ENVELOPE_ENTRIES)
    return {
        "schema": GOVERNING_ENVELOPE_SCHEMA,
        "analysisType": analysis_type,
        "stage": "completed",
        "requestHash": request_hash,
        "modelHash": model_hash,
        "resultHash": result_hash,
        "unitPrecision": _unit_precision("mixed"),
        "bounded": limited["bounded"],
        "truncated": limited["truncated"],
        "entryCount": limited["entryCount"],
        "displayEntryCount": limited["displayEntryCount"],
        "entries": limited["entries"],
        "displayEntries": limited["displayEntries"],
    }


def _snapshot_summary(result: Mapping[str, Any]) -> Dict[str, Any]:
    summary = _mapping(result.get("summary"))
    keys = (
        "status",
        "statusCode",
        "method",
        "allowableMm",
        "allowableRatio",
        "maxDeflectionMm",
        "maxDeflectionPositionM",
        "maxMomentKnM",
        "maxPositiveMomentKnM",
        "maxNegativeMomentKnM",
        "maxShearKn",
        "maxDisplacementMm",
        "maxDisplacementPositionM",
        "maxDisplacementNodeId",
        "maxAxialForceKn",
        "maxAxialForceMemberId",
        "secondOrderAmplificationFactor",
    )
    snapshot = {key: summary[key] for key in keys if key in summary}
    if "peakInternalForces" in summary and isinstance(summary["peakInternalForces"], Mapping):
        snapshot["peakInternalForces"] = deepcopy(dict(summary["peakInternalForces"]))
    return snapshot


def _build_calculation_trace(
    result: Mapping[str, Any],
    *,
    analysis_type: str,
    request_hash: str,
    model_hash: str,
    result_hash: str,
    critical_points: Mapping[str, Any],
    review_points: Mapping[str, Any],
    governing_envelope: Mapping[str, Any],
) -> Dict[str, Any]:
    solution = _solution(result)
    diagnostics = _mapping(solution.get("diagnostics"))
    root_diagnostics = _mapping(result.get("diagnostics"))
    if not diagnostics:
        diagnostics = root_diagnostics
    summary = _mapping(result.get("summary")) or _mapping(solution.get("summary"))
    solver_diagnostics = _mapping(diagnostics.get("solver"))
    equilibrium = _mapping(diagnostics.get("equilibrium"))
    structure = _mapping(result.get("structure"))
    node_count = len(_list(structure.get("nodes"))) or len(_list(solution.get("nodeResults")))
    member_count = len(_list(structure.get("members"))) or len(_list(solution.get("memberResults")))
    if analysis_type == "beam":
        node_count = len(_list(solution.get("x_data")))
        member_count = max(0, node_count - 1)

    stages: List[Dict[str, Any]] = [
        {
            "stage": "input_normalized",
            "bounded": True,
            "truncated": False,
            "summary": {
                "analysisType": analysis_type,
                "requestHash": request_hash,
                "modelHash": model_hash,
            },
        },
        {
            "stage": "dof_mapping",
            "bounded": True,
            "truncated": False,
            "summary": {
                "availability": "diagnostic_summary" if solver_diagnostics or diagnostics.get("freeDofCount") is not None else "count_summary",
                "nodeCount": node_count,
                "globalDofCount": solver_diagnostics.get("globalDofCount"),
                "freeDofCount": solver_diagnostics.get("freeDofCount", diagnostics.get("freeDofCount")),
            },
        },
        {
            "stage": "element_process",
            "bounded": True,
            "truncated": False,
            "summary": {
                "availability": "count_summary",
                "elementCount": member_count,
                "memberResultCount": len(_list(solution.get("memberResults"))),
                "diagramCount": len(_list(solution.get("memberDiagrams"))),
            },
        },
        {
            "stage": "global_assembly",
            "bounded": True,
            "truncated": False,
            "summary": {
                "availability": "diagnostic_summary" if solver_diagnostics else "unavailable",
                "reason": None if solver_diagnostics else "solver 未公开全局矩阵；计算过程仅记录可验证阶段",
                "solverBackend": solver_diagnostics.get("solverBackend"),
                "globalDofCount": solver_diagnostics.get("globalDofCount"),
            },
        },
        {
            "stage": "boundary_reduction",
            "bounded": True,
            "truncated": False,
            "summary": {
                "availability": "diagnostic_summary",
                "freeDofCount": solver_diagnostics.get("freeDofCount", diagnostics.get("freeDofCount")),
                "fixedDofCount": diagnostics.get("fixedDofCount"),
                "constraintRank": diagnostics.get("constraintRank"),
            },
        },
        {
            "stage": "solver_diagnostics",
            "bounded": True,
            "truncated": False,
            "summary": {
                "availability": "available" if diagnostics else "unavailable",
                "solver": deepcopy(dict(solver_diagnostics)),
                "warnings": _list(diagnostics.get("warnings")),
                "infos": _list(diagnostics.get("infos")),
            },
        },
        {
            "stage": "result_recovery",
            "bounded": True,
            "truncated": False,
            "summary": {
                "status": summary.get("status"),
                "statusCode": summary.get("statusCode"),
                "method": summary.get("method"),
                "nodeResultCount": len(_list(solution.get("nodeResults"))),
                "memberResultCount": len(_list(solution.get("memberResults"))),
            },
        },
        {
            "stage": "equilibrium_check",
            "bounded": True,
            "truncated": False,
            "summary": {
                "availability": "available" if equilibrium else "unavailable",
                "reason": None if equilibrium else "该求解器尚未公开平衡残差摘要",
                **deepcopy(dict(equilibrium)),
            },
        },
        {
            "stage": "evidence_projection",
            "bounded": True,
            "truncated": False,
            "summary": {
                "criticalPointCount": critical_points.get("pointCount", 0),
                "reviewPointCount": review_points.get("pointCount", 0),
                "envelopeEntryCount": governing_envelope.get("entryCount", 0),
            },
        },
    ]

    return {
        "schema": CALCULATION_TRACE_SCHEMA,
        "analysisType": analysis_type,
        "stage": "completed",
        "requestHash": request_hash,
        "modelHash": model_hash,
        "resultHash": result_hash,
        "unitPrecision": _unit_precision("mixed"),
        "bounded": True,
        "truncated": False,
        "stageCount": len(stages),
        "stages": stages,
        "diagnostics": {
            "status": summary.get("status"),
            "statusCode": summary.get("statusCode"),
            "method": summary.get("method"),
            "warnings": _list(_mapping(solution.get("diagnostics")).get("warnings")),
            "infos": _list(_mapping(solution.get("diagnostics")).get("infos")),
        },
    }


def _build_calculation_snapshot(
    result: Mapping[str, Any],
    *,
    analysis_type: str,
    request_hash: str,
    model_hash: str,
    result_hash: str,
    calculation_trace: Mapping[str, Any],
    critical_points: Mapping[str, Any],
    review_points: Mapping[str, Any],
    governing_envelope: Mapping[str, Any],
) -> Dict[str, Any]:
    solution = _solution(result)
    snapshot = {
        "schema": CALCULATION_SNAPSHOT_SCHEMA,
        "analysisType": analysis_type,
        "stage": "completed",
        "requestHash": request_hash,
        "modelHash": model_hash,
        "resultHash": result_hash,
        "operation": str(result.get("operation") or "calculate"),
        "summary": _snapshot_summary(result),
        "diagnostics": {
            "status": _mapping(solution.get("summary")).get("status"),
            "statusCode": _mapping(solution.get("summary")).get("statusCode"),
            "method": _mapping(solution.get("summary")).get("method"),
            "equilibrium": deepcopy(_mapping(solution.get("diagnostics")).get("equilibrium", {})),
        },
        "evidenceHashes": {
            "calculationTrace": _stable_hash(calculation_trace),
            "criticalPoints": _stable_hash(critical_points),
            "reviewPoints": _stable_hash(review_points),
            "governingEnvelope": _stable_hash(governing_envelope),
        },
        "counts": {
            "criticalPoints": critical_points.get("pointCount", 0),
            "reviewPoints": review_points.get("pointCount", 0),
            "governingEnvelope": governing_envelope.get("entryCount", 0),
        },
        "bounded": True,
        "truncated": False,
    }
    if analysis_type == "frame":
        snapshot["summary"]["secondOrderAmplificationFactor"] = _mapping(solution.get("summary")).get("secondOrderAmplificationFactor")
    return snapshot


def build_calculation_evidence(
    result: Mapping[str, Any],
    *,
    result_hash: str | None = None,
) -> Dict[str, Any]:
    analysis_type = _analysis_type(result)
    request_hash = str(result.get("requestHash") or "")
    model_hash = str(result.get("modelHash") or "")
    resolved_result_hash = result_hash or _result_hash(result)
    critical_points = _build_critical_point_set(
        result,
        analysis_type=analysis_type,
        request_hash=request_hash,
        model_hash=model_hash,
        result_hash=resolved_result_hash,
    )
    review_points = _build_review_point_set(
        result,
        analysis_type=analysis_type,
        request_hash=request_hash,
        model_hash=model_hash,
        result_hash=resolved_result_hash,
        critical_points=critical_points,
    )
    governing_envelope = _build_governing_envelope(
        result,
        analysis_type=analysis_type,
        request_hash=request_hash,
        model_hash=model_hash,
        result_hash=resolved_result_hash,
    )
    calculation_trace = _build_calculation_trace(
        result,
        analysis_type=analysis_type,
        request_hash=request_hash,
        model_hash=model_hash,
        result_hash=resolved_result_hash,
        critical_points=critical_points,
        review_points=review_points,
        governing_envelope=governing_envelope,
    )
    calculation_snapshot = _build_calculation_snapshot(
        result,
        analysis_type=analysis_type,
        request_hash=request_hash,
        model_hash=model_hash,
        result_hash=resolved_result_hash,
        calculation_trace=calculation_trace,
        critical_points=critical_points,
        review_points=review_points,
        governing_envelope=governing_envelope,
    )
    return {
        "resultHash": resolved_result_hash,
        "calculationTrace": calculation_trace,
        "criticalPoints": critical_points,
        "reviewPoints": review_points,
        "governingEnvelope": governing_envelope,
        "calculationSnapshot": calculation_snapshot,
    }


def _normalize_snapshot(snapshot: Mapping[str, Any]) -> Dict[str, Any]:
    cleaned = deepcopy(dict(snapshot))
    for key in ("generatedAt", "createdAt", "timestamp"):
        cleaned.pop(key, None)
    return cleaned


def _numeric_delta(left: float, right: float) -> Dict[str, Any]:
    absolute = abs(right - left)
    if abs(left) > 1e-12:
        relative = absolute / abs(left)
    elif abs(right) > 1e-12:
        return {
            "absolute": round(absolute, VALUE_DECIMALS),
            "relative": None,
            "incomparableReason": "zero_baseline",
        }
    else:
        relative = 0.0
    return {"absolute": round(absolute, VALUE_DECIMALS), "relative": round(relative, VALUE_DECIMALS)}


def diff_calculation_snapshots(left: Mapping[str, Any], right: Mapping[str, Any]) -> Dict[str, Any]:
    left_snapshot = _normalize_snapshot(left)
    right_snapshot = _normalize_snapshot(right)
    changes: List[Dict[str, Any]] = []

    def compare(path: str, left_value: Any, right_value: Any) -> None:
        if isinstance(left_value, Mapping) and isinstance(right_value, Mapping):
            left_keys = set(left_value)
            right_keys = set(right_value)
            for key in sorted(left_keys - right_keys):
                changes.append(
                    {
                        "path": f"{path}.{key}",
                        "kind": "missing_right",
                        "left": left_value[key],
                        "incomparableReason": "right missing key",
                    }
                )
            for key in sorted(right_keys - left_keys):
                changes.append(
                    {
                        "path": f"{path}.{key}",
                        "kind": "missing_left",
                        "right": right_value[key],
                        "incomparableReason": "left missing key",
                    }
                )
            for key in sorted(left_keys & right_keys):
                compare(f"{path}.{key}", left_value[key], right_value[key])
            return
        if isinstance(left_value, list) and isinstance(right_value, list):
            if len(left_value) != len(right_value):
                changes.append(
                    {
                        "path": path,
                        "kind": "length",
                        "left": len(left_value),
                        "right": len(right_value),
                        "incomparableReason": "array length differs",
                    }
                )
                return
            for index, (left_item, right_item) in enumerate(zip(left_value, right_value)):
                compare(f"{path}[{index}]", left_item, right_item)
            return
        left_is_number = isinstance(left_value, (int, float)) and not isinstance(left_value, bool)
        right_is_number = isinstance(right_value, (int, float)) and not isinstance(right_value, bool)
        if left_is_number and right_is_number:
            if float(left_value) != float(right_value):
                delta = _numeric_delta(float(left_value), float(right_value))
                changes.append(
                    {
                        "path": path,
                        "kind": "numeric",
                        "left": left_value,
                        "right": right_value,
                        **delta,
                    }
                )
            return
        if left_value != right_value:
            changes.append(
                {
                    "path": path,
                    "kind": "value",
                    "left": left_value,
                    "right": right_value,
                    "incomparableReason": "value differs",
                }
            )

    compare("$", left_snapshot, right_snapshot)
    return {
        "schema": CALCULATION_SNAPSHOT_DIFF_SCHEMA,
        "leftHash": _stable_hash(left_snapshot),
        "rightHash": _stable_hash(right_snapshot),
        "changeCount": len(changes),
        "changes": changes,
    }


def strip_legacy_evidence_fields(result: Mapping[str, Any], recorded_result: Mapping[str, Any]) -> Dict[str, Any]:
    """将新证据字段从回放结果中剔除，以兼容旧 recordedResult。"""
    if not isinstance(recorded_result, Mapping):
        return dict(result)

    missing_fields = {
        field
        for field in EVIDENCE_FIELDS
        if field not in recorded_result
    }
    if not missing_fields:
        return dict(result)

    trimmed = deepcopy(dict(result))
    for field in missing_fields:
        trimmed.pop(field, None)
    nested_solution = trimmed.get("solution")
    if isinstance(nested_solution, Mapping):
        nested = deepcopy(dict(nested_solution))
        for field in missing_fields:
            nested.pop(field, None)
        trimmed["solution"] = nested
    return trimmed
