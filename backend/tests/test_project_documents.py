from backend.capabilities.solver_tools import TOOL_HANDLERS
from backend.project_documents import (
    ASMS_JSON_SCHEMA_VERSION,
    PROJECT_FILE_SCHEMA,
    PROJECT_FILE_SCHEMA_VERSION,
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
    assert result["summary"]["projectName"] == "结构复核"


def test_validate_project_document_migrates_legacy_contract():
    document = create_default_project_document("旧工程")
    document["schemaVersion"] = "1.0.0"
    document.pop("contract")

    result = validate_project_document(document)

    assert result["ok"] is True
    assert result["projectDocument"]["schemaVersion"] == PROJECT_FILE_SCHEMA_VERSION
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
