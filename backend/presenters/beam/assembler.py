from __future__ import annotations

from typing import Any, Dict, List

from backend.common.numbers import cumulative, round_list


def build_preview_beam(solution: Dict[str, Any]) -> Dict[str, Any]:
    request = solution["request"]
    spans = request["spans"]
    span_ids = request.get("span_ids") or [f"({idx + 1})" for idx in range(len(spans))]
    total_length = float(request["total_length"])
    support_positions = solution["support_positions"]
    support_specs = solution.get("support_specs", [])
    labels = [
        str(support_specs[idx].get("id") or f"S{idx + 1}") if idx < len(support_specs) else f"S{idx + 1}"
        for idx in range(len(support_positions))
    ]

    supports = []
    for idx, position in enumerate(support_positions):
        support_type = support_specs[idx].get("type", "pinned") if idx < len(support_specs) else "pinned"
        supports.append({
            "label": labels[idx],
            "x": float(position),
            "type": support_type,
            "constraints": support_specs[idx].get("constraints", []) if idx < len(support_specs) else [],
            "springs": support_specs[idx].get("springs", []) if idx < len(support_specs) else [],
        })

    nodes = []
    for idx, position in enumerate(round_list(cumulative(spans), 6)):
        nodes.append({"index": idx, "id": str(idx + 1), "x": float(position), "support": True})

    if request["beam_type"] == "cantilever":
        nodes = [{"index": 0, "id": "1", "x": 0.0, "support": True}]
        if total_length > 0:
            nodes.append({"index": 1, "id": "2", "x": float(total_length), "support": False})

    loads: List[Dict[str, Any]] = []
    for load in solution.get("load_items", []):
        if load.get("type") == "uniform":
            start_x = float(load.get("start", 0.0))
            end_x = float(load.get("end", total_length))
            loads.append(
                {
                    "type": "uniform",
                    "x": float((start_x + end_x) / 2.0),
                    "intensityKnPerM": float(load.get("magnitudeKnPerM", 0.0)),
                    "startX": start_x,
                    "endX": end_x,
                    "length": float(max(0.0, end_x - start_x)),
                }
            )
        elif load.get("type") == "point":
            loads.append({"type": "point", "x": float(load.get("position", 0.0)), "intensityKn": float(load.get("magnitudeKn", 0.0))})
        elif load.get("type") == "linear":
            start_x = float(load.get("start", 0.0))
            end_x = float(load.get("end", 0.0))
            region_length = max(0.0, end_x - start_x)
            marker_count = max(2, min(6, int(region_length / max(total_length, 1e-9) * 8) + 1))
            for idx in range(marker_count):
                progress = idx / max(1, marker_count - 1)
                x = start_x + region_length * progress
                intensity = float(load.get("startMagnitudeKnPerM", 0.0)) + (float(load.get("endMagnitudeKnPerM", 0.0)) - float(load.get("startMagnitudeKnPerM", 0.0))) * progress
                loads.append({"type": "linear", "x": float(x), "intensityKnPerM": float(intensity), "startX": start_x, "endX": end_x})

    curve = [{"x": float(x), "v": float(v), "vMm": float(v * 1000.0)} for x, v in zip(solution["x_data"], solution["v_data"])]

    span_summaries: List[Dict[str, Any]] = []
    boundaries = solution["span_boundaries"]
    for span_index, (start, end) in enumerate(zip(boundaries[:-1], boundaries[1:])):
        span_points = [(pt["x"], pt["vMm"]) for pt in curve if start - 1e-8 <= pt["x"] <= end + 1e-8]
        if not span_points:
            continue
        local_x, local_v = min(span_points, key=lambda item: item[1])
        span_summaries.append(
            {
                "spanIndex": span_index,
                "startX": float(start),
                "endX": float(end),
                "length": float(end - start),
                "maxDeflectionMm": float(abs(local_v)),
                "maxDeflectionPositionM": float(local_x),
            }
        )

    max_deflection_mm = float(solution["max_deflection_mm"])
    max_deflection_position_m = float(solution["max_deflection_position_m"])
    max_span_index = 0
    for summary in span_summaries:
        if summary["startX"] - 1e-8 <= max_deflection_position_m <= summary["endX"] + 1e-8:
            max_span_index = int(summary["spanIndex"])
            break

    return {
        "beamType": request["beam_type"],
        "beamTypeLabel": request["beam_type_label"],
        "loadType": request["load_type"],
        "loadTypeLabel": request["load_type_label"],
        "spans": [float(span) for span in spans],
        "spanIds": [str(span_id) for span_id in span_ids],
        "totalLength": total_length,
        "supports": supports,
        "nodes": nodes,
        "loads": loads,
        "curve": curve,
        "spanSummaries": span_summaries,
        "maxDeflection": {
            "valueM": max_deflection_mm / 1000.0,
            "valueMm": max_deflection_mm,
            "xM": max_deflection_position_m,
            "spanIndex": max_span_index,
        },
        "reactions": [
            {
                "dof": index,
                "supportId": labels[index] if index < len(labels) else f"S{index + 1}",
                "valueN": float(item.get("vertical", 0.0) * 1000.0),
                "valueKn": float(item.get("vertical", 0.0)),
            }
            for index, item in enumerate(solution.get("reactions", []))
        ],
        "queryResults": solution.get("queryResults", []),
        "beamTheory": solution.get("beamTheory", "euler_bernoulli"),
        "beamTheoryLabel": solution.get("beamTheoryLabel", "Euler-Bernoulli 梁理论"),
        "warnings": solution.get("warnings", []),
        "teachingNotes": solution.get("teachingNotes", {}),
        "symbolicCheck": solution.get("symbolicCheck", {}),
    }


def build_beam_solution_response(solution: Dict[str, Any]) -> Dict[str, Any]:
    request_data = solution["request"]
    solution["beam"] = build_preview_beam(solution)
    solution["diagram"] = {
        "beamType": request_data["beam_type"],
        "beamTypeLabel": request_data["beam_type_label"],
        "loadType": request_data["load_type"],
        "loadTypeLabel": request_data["load_type_label"],
        "totalLength": round(request_data["total_length"], 6),
        "supportPositions": solution["support_positions"],
        "spanBoundaries": solution["span_boundaries"],
        "loadItems": solution["load_items"],
        "samplePoints": solution["x_data"],
        "deflection": solution["v_data"],
        "reactions": solution.get("reactions", []),
        "queryResults": solution.get("queryResults", []),
        "beamTheory": solution.get("beamTheory", "euler_bernoulli"),
        "beamTheoryLabel": solution.get("beamTheoryLabel", "Euler-Bernoulli 梁理论"),
        "teachingNotes": solution.get("teachingNotes", {}),
        "symbolicCheck": solution.get("symbolicCheck", {}),
    }
    return solution
