from __future__ import annotations

from backend.benchmarks.catalog import find_benchmark_case
from backend.examples.public_validation_projects import build_public_validation_projects
from backend.exporters.common.evidence import build_evidence_tables
from backend.services.export_service import build_report_model


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
