import json
from pathlib import Path

from backend.capabilities.solver_tools import TOOL_HANDLERS
from backend.project_documents import (
    ASMS_JSON_SCHEMA_VERSION,
    PROJECT_FILE_SCHEMA,
    PROJECT_FILE_SCHEMA_VERSION,
    build_project_health_report,
    create_default_project_document,
    validate_project_document,
)


def test_create_default_project_document_can_be_validated():
    document = create_default_project_document("结构复核")

    result = validate_project_document(document)

    assert result["ok"] is True
    assert result["projectDocument"]["schema"] == PROJECT_FILE_SCHEMA
    assert result["projectDocument"]["schemaVersion"] == PROJECT_FILE_SCHEMA_VERSION
    assert result["projectDocument"]["contract"]["asmsJsonSchemaVersion"] == ASMS_JSON_SCHEMA_VERSION
    assert result["projectDocument"]["manifest"]["manifestVersion"] == "1.0.0"
    assert result["projectDocument"]["manifest"]["projectFileKind"] == "single-json"
    assert result["projectDocument"]["manifest"]["containerCapabilities"]["single-json"] is True
    assert result["summary"]["projectName"] == "结构复核"


def test_validate_project_document_migrates_legacy_contract():
    document = create_default_project_document("旧工程")
    document["schemaVersion"] = "1.0.0"
    document.pop("contract")

    result = validate_project_document(document)

    assert result["ok"] is True
    assert result["projectDocument"]["schemaVersion"] == PROJECT_FILE_SCHEMA_VERSION
    assert result["projectDocument"]["manifest"]["contract"]["projectFileSchemaVersion"] == PROJECT_FILE_SCHEMA_VERSION
    assert "diagnostics" not in result["projectDocument"]
    assert {item["code"] for item in result["diagnostics"]} >= {
        "PROJECT_FILE_SCHEMA_MIGRATED",
        "ASMS_SCHEMA_VERSION_RECORDED",
    }


def test_validate_project_document_rejects_other_product_schema():
    result = validate_project_document({
        "schema": "other.project",
        "schemaVersion": "1.0.0",
        "product": "other",
    })

    assert result["ok"] is False
    assert result["error"] == "文件 schema 不是 archsight-solver.project。"


def test_project_document_validate_tool_returns_normalized_document():
    document = create_default_project_document("外部托管项目")
    result = TOOL_HANDLERS["project_document_validate"]({"projectDocument": document})

    assert result["status"] == "pass"
    assert result["inputValidated"] is True
    assert result["summary"]["projectName"] == "外部托管项目"
    assert result["projectDocument"]["product"] == "archsight-solver"
    assert result["projectDocument"]["manifest"]["projectFileKind"] == "single-json"


def test_project_health_report_summarizes_contract_manifest_and_objects():
    document = create_default_project_document("项目健康检查")
    document["project"]["objects"] = [
        {"id": "beam-1", "name": "连续梁", "type": "beam", "updatedAt": "2026-07-04T00:00:00Z"},
        {"id": "truss-1", "name": "桁架", "type": "truss"},
    ]
    document["project"]["activeObjectId"] = "beam-1"

    report = build_project_health_report(document)

    assert report["ok"] is True
    assert report["healthStatus"] == "ready"
    assert report["contract"]["projectFileSchemaVersion"] == PROJECT_FILE_SCHEMA_VERSION
    assert report["manifest"]["projectFileKind"] == "single-json"
    assert report["project"]["objectCount"] == 2
    assert report["project"]["objectTypeCounts"] == {"beam": 1, "truss": 1}
    assert report["project"]["activeObject"]["name"] == "连续梁"
    assert report["hostReadiness"]["canHostPersist"] is True
    assert report["hostReadiness"]["canUseSingleJson"] is True
    assert report["hostReadiness"]["requiresMigration"] is False


def test_project_document_health_tool_flags_migration_review_status():
    document = create_default_project_document("旧项目健康检查")
    document["schemaVersion"] = "1.0.0"
    document.pop("contract")

    result = TOOL_HANDLERS["project_document_health"]({"projectDocument": document})

    assert result["capabilityId"] == "solver.project_document_health"
    assert result["status"] == "pass"
    assert result["inputValidated"] is True
    assert result["healthStatus"] == "review"
    assert result["diagnosticSeverityCounts"]["warning"] >= 1
    assert result["hostReadiness"]["requiresMigration"] is True


def test_host_reference_sample_project_is_healthy():
    sample_path = Path(__file__).resolve().parents[2] / "examples" / "host-iframe-demo" / "sample-project.slv"
    document = json.loads(sample_path.read_text(encoding="utf-8"))

    report = build_project_health_report(document)

    assert report["ok"] is True
    assert report["healthStatus"] == "ready"
    assert report["project"]["name"] == "Host Reference 梁系项目"
    assert report["manifest"]["projectFileKind"] == "single-json"
