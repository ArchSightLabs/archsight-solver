import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from backend.api.utils import build_calculation_response
from backend.benchmarks.catalog import load_benchmark_catalog
from backend.benchmarks.runner import evaluate_benchmark_case_by_id
from backend.capabilities.solver_tools import solve_calculate


ROOT = Path(__file__).resolve().parents[2]
FEW_SHOT_PATH = ROOT / "data" / "agent_workflows" / "asms_few_shots.json"


@pytest.fixture(scope="module")
def workflow_catalog():
    return json.loads(FEW_SHOT_PATH.read_text(encoding="utf-8"))


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    return app.test_client()


def test_agent_workflow_catalog_documents_scope_and_boundary(workflow_catalog):
    assert workflow_catalog["schemaVersion"] == 1
    assert "不替代工程签审" in workflow_catalog["boundary"]
    assert "ASMS-JSON" in workflow_catalog["scope"]
    assert "可测试样例库" in workflow_catalog["positioning"]
    assert "REST/CLI/MCP 是同源执行面" in workflow_catalog["contractMessage"]
    assert len(workflow_catalog["examples"]) >= 3
    assert {example["analysisType"] for example in workflow_catalog["examples"]} == {"beam", "frame", "truss"}


@pytest.mark.parametrize("example", json.loads(FEW_SHOT_PATH.read_text(encoding="utf-8"))["examples"], ids=lambda item: item["id"])
def test_agent_few_shot_asms_payloads_are_executable(example):
    response = build_calculation_response(dict(example["asmsJson"]), operation="agent_example")

    assert response["success"] is True
    assert response["analysisType"] == example["analysisType"]
    assert response["summary"]["statusCode"] == "PASS"

    tool_result = solve_calculate({"payload": example["asmsJson"]})
    assert tool_result["status"] == "pass"
    assert tool_result["analysisType"] == example["analysisType"]
    assert example["cli"]["tool"] == "calculate"
    assert example["mcp"]["tool"] == "calculate"


@pytest.mark.parametrize("example", json.loads(FEW_SHOT_PATH.read_text(encoding="utf-8"))["examples"], ids=lambda item: item["id"])
def test_agent_workflow_benchmark_references_pass(example):
    result = evaluate_benchmark_case_by_id(example["benchmark"]["caseId"])

    assert result["status"] == "pass"
    assert result["caseId"] == example["benchmark"]["caseId"]
    assert "schemaVersion" not in result
    assert load_benchmark_catalog()["schemaVersion"] >= 1


def test_agent_cli_calculate_example_runs_over_stdin(workflow_catalog):
    example = workflow_catalog["examples"][0]
    completed = subprocess.run(
        [sys.executable, "-m", "backend.capabilities.solver_cli", "calculate", "--pretty"],
        input=json.dumps({"payload": example["asmsJson"]}, ensure_ascii=False),
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=True,
    )

    result = json.loads(completed.stdout)
    assert result["capabilityId"] == "solver.calculate"
    assert result["status"] == "pass"
    assert result["analysisType"] == example["analysisType"]


def test_agent_cli_calculate_example_runs_from_file(workflow_catalog):
    example = workflow_catalog["examples"][1]
    with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".json", delete=False) as handle:
        json.dump({"payload": example["asmsJson"]}, handle, ensure_ascii=False)
        input_path = handle.name
    try:
        completed = subprocess.run(
            [sys.executable, "-m", "backend.capabilities.solver_cli", "calculate", "--input", input_path, "--pretty"],
            text=True,
            encoding="utf-8",
            capture_output=True,
            check=True,
        )
    finally:
        Path(input_path).unlink(missing_ok=True)

    result = json.loads(completed.stdout)
    assert result["status"] == "pass"
    assert result["analysisType"] == example["analysisType"]


def test_agent_mcp_calculate_example_runs_over_jsonrpc(workflow_catalog):
    example = workflow_catalog["examples"][2]
    messages = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}},
        {
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tools/call",
            "params": {"name": "calculate", "arguments": {"payload": example["asmsJson"]}},
        },
    ]
    completed = subprocess.run(
        [sys.executable, "-m", "backend.capabilities.mcp_server"],
        input="\n".join(json.dumps(message, ensure_ascii=False) for message in messages) + "\n",
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=True,
    )

    responses = [json.loads(line) for line in completed.stdout.splitlines()]
    call_result = responses[1]["result"]
    assert call_result["isError"] is False
    assert call_result["structuredContent"]["capabilityId"] == "solver.calculate"
    assert call_result["structuredContent"]["status"] == "pass"
    assert call_result["structuredContent"]["analysisType"] == example["analysisType"]


def test_agent_workflow_export_payload_produces_word_report(client, workflow_catalog):
    example = workflow_catalog["examples"][0]
    payload = {**example["asmsJson"], **example["export"]["payloadOverlay"]}

    response = client.post(example["export"]["endpoint"], json=payload)

    assert response.status_code == 200
    assert response.mimetype == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
