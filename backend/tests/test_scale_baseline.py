from scripts.measure_scale_baseline import compare_baseline, run_baseline, truss_parallel_chord_payload


def _baseline(seconds: float = 1.0, *, member_count: int = 10, status: str = "PASS"):
    return {
        "cases": [
            {
                "name": "frame-grid",
                "seconds": {"median": seconds},
                "shape": {"analysisType": "frame", "memberCount": member_count},
                "status": status,
            }
        ]
    }


def test_scale_baseline_comparison_accepts_bounded_runner_variance():
    assert compare_baseline(_baseline(2.9), _baseline(1.0), 3.0) == []


def test_scale_baseline_comparison_rejects_timing_shape_and_status_regressions():
    timing = compare_baseline(_baseline(3.1), _baseline(1.0), 3.0)
    shape = compare_baseline(_baseline(member_count=11), _baseline(), 3.0)
    status = compare_baseline(_baseline(status="REVIEW"), _baseline(), 3.0)

    assert "中位耗时回退" in timing[0]
    assert shape == ["frame-grid 模型规模漂移"]
    assert status == ["frame-grid 状态漂移: REVIEW != PASS"]


def test_scale_baseline_comparison_rejects_scenario_drift():
    current = _baseline()
    current["cases"][0]["name"] = "renamed"

    assert compare_baseline(current, _baseline(), 3.0)[0].startswith("性能场景集合漂移")


def test_parallel_chord_scale_model_grows_with_stable_topology():
    payload = truss_parallel_chord_payload(20)
    structure = payload["structure"]

    assert len(structure["nodes"]) == 42
    assert len(structure["members"]) == 81
    assert len(structure["loads"]) == 21
    assert structure["nodes"][0]["supportType"] == "pinned"
    assert next(node for node in structure["nodes"] if node["id"] == "B20")["supportType"] == "roller"


def test_scale_baseline_covers_three_analysis_types_at_multiple_scales():
    result = run_baseline(1)
    cases = {case["name"]: case for case in result["cases"]}

    assert cases["beam-300-spans"]["shape"]["spanCount"] == 300
    assert cases["frame-8x6-grid"]["shape"] == {
        "analysisType": "frame",
        "spanCount": 0,
        "nodeCount": 63,
        "memberCount": 102,
        "sampleCount": 0,
    }
    assert cases["truss-20-panel-parallel-chord"]["shape"]["nodeCount"] == 42
    assert cases["truss-50-panel-parallel-chord"]["shape"]["memberCount"] == 201
    assert cases["beam-300-spans"]["status"] == "SOLVED"
    assert cases["frame-8x6-grid"]["status"] == "PASS"
    assert cases["truss-50-panel-parallel-chord"]["status"] == "REVIEW"
