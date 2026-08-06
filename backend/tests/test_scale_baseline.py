from scripts.measure_scale_baseline import compare_baseline


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
