from __future__ import annotations

from backend.exporters.common.analysis_assumptions import AnalysisType, analysis_assumption_rows
from backend.exporters.common.evidence import build_evidence_tables


def test_shared_assumptions_cover_three_analysis_types() -> None:
    assert "竖向位移 v 与转角 θz" in _assumption_text("beam")
    assert "节点自由度为 ux、uy、rz" in _assumption_text("frame")
    assert "仅传递轴力" in _assumption_text("truss")
    assert "不引入弯矩主指标" in _assumption_text("truss")


def test_evidence_tables_use_shared_assumption_rows() -> None:
    beam_solution = {
        "request": {
            "beam_type_label": "梁系",
            "load_type_label": "均布荷载",
            "spans": [6.0],
            "E_gpa": 206.0,
            "I_cm4": 12000.0,
            "A_cm2": 120.0,
            "q_kn": 8.0,
            "load_type": "uniform",
            "total_length": 6.0,
        },
        "span_boundaries": [0.0, 6.0],
        "support_positions": [0.0, 6.0],
        "reactions": [],
        "element_end_moments": [],
        "element_end_shears": [],
        "x_data": [],
    }

    assumptions = build_evidence_tables(beam_solution, "beam", "Q345")["模型假定与适用范围"]
    rows = dict(zip(assumptions["项目"], assumptions["说明"]))

    assert rows["计算模型"] == analysis_assumption_rows("beam")[0].value
    assert "I: cm4 -> m4" in rows["单位换算"]
    assert "不替代规范设计" in rows["适用边界"]


def _assumption_text(analysis_type: AnalysisType) -> str:
    return "\n".join(row.value for row in analysis_assumption_rows(analysis_type))
