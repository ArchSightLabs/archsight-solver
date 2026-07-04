from backend.capabilities.solver_tools import TOOL_HANDLERS
from backend.integration_api import available_integration_tools, run_integration_tool
from backend.project_documents import create_default_project_document
from backend.project_workflow import (
    apply_host_project_change,
    build_export_artifact_metadata,
    build_host_launch_contract,
    build_host_save_result_event,
    create_host_save_request,
    load_host_project,
    solve_project_document,
)


def test_host_load_returns_neutral_project_loaded_event():
    document = create_default_project_document("外部宿主试跑")

    result = load_host_project(document, session_id="session-1")

    assert result["ok"] is True
    assert result["sessionId"] == "session-1"
    assert result["events"][0]["type"] == "solver.project_loaded"
    assert result["snapshot"]["projectName"] == "外部宿主试跑"


def test_host_launch_contract_declares_neutral_embed_capabilities():
    document = create_default_project_document("外部宿主试跑")

    result = build_host_launch_contract(document, {"sessionId": "session-1", "mode": "readonly"})

    assert result["ok"] is True
    assert result["sessionId"] == "session-1"
    assert result["mode"] == "readonly"
    assert result["capabilities"]["loadProjectDocument"] is True
    assert result["capabilities"]["emitSaveRequest"] is False
    assert result["events"][0]["type"] == "solver.host_launch_created"


def test_apply_builtin_template_returns_saveable_project_document():
    document = create_default_project_document("外部宿主试跑")

    result = apply_host_project_change(document, {"type": "apply_builtin_template", "templateId": "beam.simple_span_uniform"})
    save_request = create_host_save_request(result["projectDocument"])

    assert result["ok"] is True
    assert result["events"][0]["type"] == "solver.project_changed"
    assert result["snapshot"]["activeObjectType"] == "beam"
    assert result["snapshot"]["activeObjectName"] == "简支梁均布荷载"
    assert save_request["events"][0]["type"] == "solver.project_save_requested"
    assert save_request["projectDocument"]["project"]["name"] == "结构力学试跑项目"


def test_host_save_result_event_records_host_revision_without_platform_context():
    document = create_default_project_document("外部宿主试跑")

    result = build_host_save_result_event(document, {"status": "saved", "revision": "rev-1"})

    assert result["ok"] is True
    assert result["status"] == "saved"
    assert result["events"][0]["type"] == "solver.project_save_result"
    assert result["events"][0]["payload"]["revision"] == "rev-1"


def test_apply_builtin_template_recovers_missing_active_object_id():
    document = create_default_project_document("外部宿主试跑")
    document["project"]["activeObjectId"] = "missing-object"

    result = apply_host_project_change(document, {"type": "apply_builtin_template", "templateId": "beam.simple_span_uniform"})

    assert result["snapshot"]["activeObjectId"] != "missing-object"
    assert result["snapshot"]["activeObjectType"] == "beam"
    assert result["projectDocument"]["project"]["activeObjectId"] == result["snapshot"]["activeObjectId"]


def test_solve_project_document_uses_active_object_state():
    document = create_default_project_document("外部宿主试跑")
    changed = apply_host_project_change(document, {"type": "apply_builtin_template", "templateId": "beam.simple_span_uniform"})

    result = solve_project_document(changed["projectDocument"])

    assert result["ok"] is True
    assert result["status"] in {"pass", "review"}
    assert result["analysisType"] == "beam"
    assert result["summary"]["maxDeflectionMm"] > 0
    assert result["payload"]["analysisType"] == "beam"


def test_build_export_artifact_metadata_records_contract_and_result_source():
    document = create_default_project_document("外部宿主试跑")
    changed = apply_host_project_change(document, {"type": "apply_builtin_template", "templateId": "beam.simple_span_uniform"})
    solved = solve_project_document(changed["projectDocument"])

    metadata = build_export_artifact_metadata(changed["projectDocument"], "docx", solved["summary"])

    assert metadata["format"] == "docx"
    assert metadata["fileName"].endswith(".docx")
    assert metadata["projectFileSchemaVersion"] == "2.0.0"
    assert metadata["asmsJsonSchemaVersion"] == "2026-05-30"
    assert metadata["resultSource"]["activeObjectId"] == changed["snapshot"]["activeObjectId"]


def test_project_workflow_tools_are_available_via_cli_handlers():
    document = create_default_project_document("外部宿主试跑")
    launch = TOOL_HANDLERS["project_host_launch_contract"]({
        "projectDocument": document,
        "launch": {"sessionId": "session-1", "mode": "editable"},
    })
    loaded = TOOL_HANDLERS["project_host_load"]({"projectDocument": document, "sessionId": "session-1"})
    changed = TOOL_HANDLERS["project_host_apply_change"]({
        "projectDocument": loaded["projectDocument"],
        "change": {"type": "apply_builtin_template", "templateId": "beam.simple_span_uniform"},
    })
    saved = TOOL_HANDLERS["project_host_save_result"]({
        "projectDocument": changed["projectDocument"],
        "result": {"status": "saved", "revision": "rev-1"},
    })
    solved = TOOL_HANDLERS["project_document_solve"]({"projectDocument": changed["projectDocument"]})
    exported = TOOL_HANDLERS["project_export_metadata"]({
        "projectDocument": changed["projectDocument"],
        "format": "xlsx",
        "resultSummary": solved["summary"],
    })

    assert launch["status"] == "pass"
    assert loaded["status"] == "pass"
    assert changed["status"] == "pass"
    assert saved["status"] == "saved"
    assert solved["inputValidated"] is True
    assert exported["artifactMetadata"]["format"] == "xlsx"


def test_public_integration_api_runs_workflow_tool_without_internal_imports():
    document = create_default_project_document("外部宿主试跑")

    result = run_integration_tool("project_host_launch_contract", {
        "projectDocument": document,
        "launch": {"sessionId": "session-1"},
    })

    assert "project_host_launch_contract" in available_integration_tools()
    assert result["status"] == "pass"
    assert result["sessionId"] == "session-1"
