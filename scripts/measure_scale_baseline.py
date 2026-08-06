from __future__ import annotations

import argparse
import json
import statistics
import sys
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Mapping

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.benchmarks.catalog import load_benchmark_catalog
from backend.services.beam_workbench import build_solution as build_beam_solution
from backend.services.frame_workbench import build_solution as build_frame_solution
from backend.services.truss_workbench import build_solution as build_truss_solution


def beam_continuous_payload(span_count: int) -> Dict[str, Any]:
    spans = [1.0] * span_count
    return {
        "analysisType": "beam",
        "projectName": f"Scale Baseline - Beam {span_count} Spans",
        "materialId": "q345",
        "beamType": "continuous",
        "loadType": "uniform",
        "spans": spans,
        "spanProperties": [{"E": 206.0, "I": 85000.0, "materialId": "q345"} for _ in spans],
        "supports": [{"id": f"S{index + 1}", "x": float(index), "type": "pinned" if index == 0 else "roller"} for index in range(len(spans) + 1)],
        "q": 12.0,
        "loadValue": 12.0,
        "loadPosition": 0.5,
        "loadEnd": 1.0,
        "uniformLoadStartRatio": 0.0,
        "uniformLoadEndRatio": 1.0,
        "E": 206.0,
        "I": 85000.0,
        "freq": 1.0,
        "duration": 1.0,
    }


def frame_grid_payload(bays: int = 4, stories: int = 3) -> Dict[str, Any]:
    nodes = []
    members = []
    bay_width = 6.0
    story_height = 3.6
    for level in range(stories + 1):
        for bay in range(bays + 1):
            support_type = "fixed" if level == 0 else "free"
            nodes.append({"id": f"N{level}_{bay}", "x": bay * bay_width, "y": level * story_height, "supportType": support_type})
    for bay in range(bays + 1):
        for level in range(stories):
            members.append({"id": f"C{level + 1}_{bay}", "start": f"N{level}_{bay}", "end": f"N{level + 1}_{bay}", "E_GPa": 210, "A_cm2": 260, "I_cm4": 14000, "kind": "column"})
    for level in range(1, stories + 1):
        for bay in range(bays):
            members.append({"id": f"B{level}_{bay + 1}", "start": f"N{level}_{bay}", "end": f"N{level}_{bay + 1}", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"})
    top_level = stories
    loads = [
        {"type": "distributed", "member": member["id"], "wyKnPerM": -12.0}
        for member in members
        if str(member["id"]).startswith(f"B{top_level}_")
    ]
    loads.append({"type": "nodal", "node": f"N{top_level}_{bays}", "fxKn": 18.0, "fyKn": 0.0, "mzKnM": 0.0})
    return {
        "analysisType": "frame",
        "projectName": f"Scale Baseline - Frame {bays}x{stories}",
        "materialId": "q345",
        "structure": {"template": "explicit", "nodes": nodes, "members": members, "loads": loads},
    }


def truss_benchmark_payload() -> Dict[str, Any]:
    case = next(item for item in load_benchmark_catalog()["cases"] if str(item["category"]).startswith("truss"))
    payload = json.loads(json.dumps(case["payload"]))
    payload["projectName"] = f"Scale Baseline - {case['id']}"
    return payload


def truss_parallel_chord_payload(panels: int) -> Dict[str, Any]:
    panel_length = 2.0
    height = 2.0
    nodes = []
    members = []
    loads = []
    for index in range(panels + 1):
        bottom_support = "pinned" if index == 0 else "roller" if index == panels else "free"
        nodes.append({"id": f"B{index}", "x": index * panel_length, "y": 0.0, "supportType": bottom_support})
        nodes.append({"id": f"T{index}", "x": index * panel_length, "y": height, "supportType": "free"})
        members.append({"id": f"V{index}", "start": f"B{index}", "end": f"T{index}", "E_GPa": 210, "A_cm2": 80, "kind": "truss"})
        loads.append({"type": "nodal", "node": f"T{index}", "fxKn": 0.0, "fyKn": -10.0})
        if index == panels:
            continue
        members.extend(
            [
                {"id": f"B{index}_{index + 1}", "start": f"B{index}", "end": f"B{index + 1}", "E_GPa": 210, "A_cm2": 80, "kind": "truss"},
                {"id": f"T{index}_{index + 1}", "start": f"T{index}", "end": f"T{index + 1}", "E_GPa": 210, "A_cm2": 80, "kind": "truss"},
                {"id": f"D{index}", "start": f"B{index}", "end": f"T{index + 1}", "E_GPa": 210, "A_cm2": 80, "kind": "truss"},
            ]
        )
    return {
        "analysisType": "truss",
        "projectName": f"Scale Baseline - Parallel Chord Truss {panels} Panels",
        "materialId": "q345",
        "structure": {"template": "explicit", "nodes": nodes, "members": members, "loads": loads},
    }


def measure(name: str, runner: Callable[[], Dict[str, Any]], repeat: int) -> Dict[str, Any]:
    durations: List[float] = []
    last_result: Dict[str, Any] = {}
    for _ in range(repeat):
        started = time.perf_counter()
        last_result = runner()
        durations.append(time.perf_counter() - started)
    request = last_result.get("request", {}) if isinstance(last_result.get("request"), dict) else {}
    structure = last_result.get("structure", {}) if isinstance(last_result.get("structure"), dict) else {}
    analysis_type = last_result.get("analysisType") or ("beam" if name.startswith("beam-") else None)
    node_count = len(last_result.get("nodeIds", [])) or len(structure.get("nodes", [])) or len(last_result.get("span_boundaries", []))
    member_count = len(last_result.get("memberIds", [])) or len(structure.get("members", [])) or len(request.get("spans", []))
    return {
        "name": name,
        "repeat": repeat,
        "seconds": {
            "min": round(min(durations), 6),
            "median": round(statistics.median(durations), 6),
            "max": round(max(durations), 6),
        },
        "shape": {
            "analysisType": analysis_type,
            "spanCount": len(request.get("spans", [])),
            "nodeCount": node_count,
            "memberCount": member_count,
            "sampleCount": len(last_result.get("x_data", [])),
        },
        # Beam uses a translated status label, while frame/truss expose a stable
        # statusCode. Keep the baseline locale-neutral without hiding REVIEW.
        "status": last_result.get("summary", {}).get("statusCode") or "SOLVED",
    }


def run_baseline(repeat: int) -> Dict[str, Any]:
    return {
        "schemaVersion": 1,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "repeat": repeat,
        "cases": [
            measure("beam-100-spans", lambda: build_beam_solution(beam_continuous_payload(100), "Q345"), repeat),
            measure("beam-300-spans", lambda: build_beam_solution(beam_continuous_payload(300), "Q345"), repeat),
            measure("frame-4x3-grid", lambda: build_frame_solution(frame_grid_payload(), "Q345"), repeat),
            measure("frame-8x6-grid", lambda: build_frame_solution(frame_grid_payload(8, 6), "Q345"), repeat),
            measure("truss-public-benchmark", lambda: build_truss_solution(truss_benchmark_payload(), "Q345"), repeat),
            measure(
                "truss-20-panel-parallel-chord",
                lambda: build_truss_solution(truss_parallel_chord_payload(20), "Q345"),
                repeat,
            ),
            measure(
                "truss-50-panel-parallel-chord",
                lambda: build_truss_solution(truss_parallel_chord_payload(50), "Q345"),
                repeat,
            ),
        ],
    }


def compare_baseline(
    current: Mapping[str, Any],
    reference: Mapping[str, Any],
    max_regression_factor: float,
) -> List[str]:
    issues: List[str] = []
    reference_cases = {str(case["name"]): case for case in reference.get("cases", [])}
    current_cases = {str(case["name"]): case for case in current.get("cases", [])}
    if set(current_cases) != set(reference_cases):
        issues.append(
            f"性能场景集合漂移: current={sorted(current_cases)}, reference={sorted(reference_cases)}"
        )
        return issues

    for name, current_case in current_cases.items():
        reference_case = reference_cases[name]
        if current_case.get("shape") != reference_case.get("shape"):
            issues.append(f"{name} 模型规模漂移")
        if current_case.get("status") != reference_case.get("status"):
            issues.append(
                f"{name} 状态漂移: {current_case.get('status')} != {reference_case.get('status')}"
            )
        current_median = float(current_case["seconds"]["median"])
        reference_median = float(reference_case["seconds"]["median"])
        if current_median > reference_median * max_regression_factor:
            issues.append(
                f"{name} 中位耗时回退: {current_median:.6f}s > "
                f"{reference_median:.6f}s × {max_regression_factor:g}"
            )
    return issues


def main() -> None:
    parser = argparse.ArgumentParser(description="Measure ArchSight Solver scale baseline for release validation.")
    parser.add_argument("--repeat", type=int, default=3, help="Number of runs per case.")
    parser.add_argument("--output", type=Path, help="Optional JSON output path.")
    parser.add_argument("--reference", type=Path, help="Optional reference JSON used for regression checks.")
    parser.add_argument(
        "--max-regression-factor",
        type=float,
        default=3.0,
        help="Maximum median-time multiplier versus --reference (default: 3.0).",
    )
    args = parser.parse_args()
    result = run_baseline(max(1, args.repeat))
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
    print(text)
    if args.reference:
        reference = json.loads(args.reference.read_text(encoding="utf-8"))
        issues = compare_baseline(result, reference, max(1.0, args.max_regression_factor))
        if issues:
            raise SystemExit("性能基线门禁失败:\n- " + "\n- ".join(issues))
        print(
            f"性能基线门禁通过: 模型规模与状态一致，中位耗时未超过参考值的 "
            f"{max(1.0, args.max_regression_factor):g} 倍"
        )


if __name__ == "__main__":
    main()
