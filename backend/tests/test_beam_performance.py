import os
import time

import pytest

from backend.solver.beam.solver import finite_element_solution


pytestmark = pytest.mark.skipif(
    os.environ.get("ARCHSIGHT_RUN_PERF_TESTS") != "1",
    reason="性能测试默认跳过；设置 ARCHSIGHT_RUN_PERF_TESTS=1 后在本机或压测环境执行",
)


def test_continuous_beam_100_spans_solver_performance():
    spans = [1.0] * 100
    total_length = sum(spans)
    started_at = time.perf_counter()

    result = finite_element_solution(
        spans=spans,
        span_E_gpa=[206.0] * len(spans),
        span_I_cm4=[85000.0] * len(spans),
        beam_type="continuous",
        load_type="uniform",
        load_spec={
            "loads": [
                {
                    "type": "uniform",
                    "q_kn": 12.0,
                    "uniform_q_npm": 12000.0,
                    "uniform_start": 0.0,
                    "uniform_end": total_length,
                }
            ]
        },
        E=206e9,
        I=85000.0e-8,
    )

    elapsed_seconds = time.perf_counter() - started_at
    max_seconds = float(os.environ.get("ARCHSIGHT_PERF_MAX_SECONDS", "30"))

    print(
        "100跨连续梁性能基线: "
        f"{elapsed_seconds:.3f}s, "
        f"采样点 {len(result['x_data'])}, "
        f"支座 {len(result['reactions'])}, "
        f"最大挠度 {result['max_deflection_mm']} mm"
    )

    assert len(result["reactions"]) == 101
    assert len(result["x_data"]) >= 100
    assert result["max_deflection_mm"] >= 0
    assert result["diagnostics"]["solver"]["solverBackend"] == "sparse"
    assert elapsed_seconds < max_seconds
