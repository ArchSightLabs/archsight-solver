from __future__ import annotations

from backend.benchmarks.catalog import find_benchmark_case
from backend.examples.public_validation_projects import build_public_validation_projects
from backend.exporters.common.evidence import build_evidence_tables
from backend.services.export_service import build_report_model


def _table_text(table) -> str:
    return "\n".join(" | ".join(row) for row in table.astype(str).values.tolist())


def test_export_evidence_tables_include_public_benchmark_source_and_expected_values():
    case = find_benchmark_case("truss-simple-roof")
    examples = build_public_validation_projects()
    benchmark = next(
        obj["benchmark"]
        for project in examples["projects"]
        for obj in project["project"]["objects"]
        if obj["benchmark"]["caseId"] == "truss-simple-roof"
    )
    payload = {**case["payload"], "benchmark": benchmark}

    report = build_report_model(
        payload,
        analysis_type="truss",
        material_name="测试材料",
        sensitivity_results=None,
        report_images=None,
    )
    evidence = build_evidence_tables(report, "truss", "测试材料")["校核证据"]
    rows = evidence.astype(str).values.tolist()

    assert any(row[0] == "当前算例来源" and "truss-simple-roof" in row[1] for row in rows)
    assert any(row[0] == "当前算例标准值" and "标准值：" in row[1] for row in rows)
    assert any(row[0] == "当前算例容许误差" and "容许误差：" in row[1] for row in rows)
    assert all("弯矩" not in row[1] and "剪力" not in row[1] for row in rows if row[0].startswith("当前算例"))


def test_frame_truss_evidence_input_summary_preserves_material_and_support_semantics():
    frame_solution = {
        "structure": {
            "nodes": [
                {"id": "N1", "x": 0, "y": 0, "supportType": "fixed"},
                {"id": "N2", "x": 4, "y": 0, "supportType": "roller", "supportAngleDeg": 45},
            ],
            "members": [
                {"id": "C1", "start": "N1", "end": "N2", "materialId": "q235", "E_GPa": 206, "A_cm2": 120, "I_cm4": 8000},
                {"id": "B1", "start": "N1", "end": "N2", "materialId": "custom", "E_GPa": 198.5, "A_cm2": 100, "I_cm4": 6000},
            ],
            "loads": [],
        },
        "summary": {"allowableMm": 20},
        "nodeResults": [],
        "memberResults": [],
    }
    truss_solution = {
        "structure": {
            "nodes": [
                {"id": "N1", "x": 0, "y": 0, "supportType": "pinned"},
                {"id": "N2", "x": 4, "y": 0, "supportType": "roller"},
            ],
            "members": [
                {"id": "M1", "start": "N1", "end": "N2", "materialId": "q345", "E_GPa": 210, "A_cm2": 24},
            ],
            "loads": [],
        },
        "summary": {"allowableMm": 10},
        "nodeResults": [],
        "memberResults": [],
    }

    frame_text = _table_text(build_evidence_tables(frame_solution, "frame", "测试材料")["工程输入摘要"])
    truss_text = _table_text(build_evidence_tables(truss_solution, "truss", "测试材料")["工程输入摘要"])

    assert "材料适用范围 | 材料名称为项目默认材料说明；框架整体刚度按各构件 E_GPa / A_cm2 / I_cm4 输入装配。" in frame_text
    assert "构件弹性模量分布 | " in frame_text
    assert "Q235 · E=206 GPa：1 个构件" in frame_text
    assert "E=198.5 GPa：1 个构件" in frame_text
    assert "支座体系说明 | 平面框架节点自由度为 ux、uy、rz" in frame_text

    assert "材料适用范围 | 材料名称为项目默认材料说明；桁架整体刚度按各杆件 E_GPa / A_cm2 输入装配。" in truss_text
    assert "杆件弹性模量分布 | Q345 · E=210 GPa：1 个杆件" in truss_text
    assert "支座体系说明 | 平面桁架节点仅含 ux、uy 平动自由度" in truss_text
