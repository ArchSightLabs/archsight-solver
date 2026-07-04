import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.capabilities import mcp_server
from backend.capabilities.solver_tools import (
    list_benchmark_cases,
    run_benchmark_case,
    solve_calculate,
    solve_beam_deflection_serviceability_check,
    solve_frame_displacement,
    solve_sensitivity_analysis,
    solve_truss_member_force,
)
from backend.project_documents import create_default_project_document
from backend.tests.test_frame_workbench import frame_payload
from backend.tests.test_truss_workbench import _base_payload


def _beam_arguments():
    return {
        "span": {"value": 6.0, "unit": "m"},
        "elasticModulus": {"value": 210.0, "unit": "GPa"},
        "secondMomentOfArea": {"value": 4500.0, "unit": "cm4"},
        "load": {"value": 10.0, "unit": "kN/m", "case": "uniform"},
        "boundaryCondition": "simply_supported",
        "deflectionLimitRatio": 250,
    }


def test_beam_deflection_serviceability_check_returns_serviceability_result():
    result = solve_beam_deflection_serviceability_check(_beam_arguments())

    assert result["capabilityId"] == "solver.beam_deflection_serviceability_check"
    assert result["status"] == "pass"
    assert result["checkType"] == "serviceability_deflection_check"
    assert result["deflection"]["value"] < result["allowable"]["value"]
    assert "不执行材料强度" in result["warnings"][0]


def test_frame_displacement_returns_control_node_and_target_node():
    result = solve_frame_displacement({"payload": frame_payload(), "targetNodeId": "N3"})

    assert result["capabilityId"] == "solver.frame_displacement"
    assert result["status"] == "pass"
    assert result["maxDisplacement"]["nodeId"] == "N3"
    assert result["targetNode"]["nodeId"] == "N3"
    assert result["targetNode"]["resultantMm"] > 0


def test_truss_member_force_returns_control_and_target_member():
    result = solve_truss_member_force({"payload": _base_payload(), "targetMemberId": "M2"})

    assert result["capabilityId"] == "solver.truss_member_force"
    assert result["status"] == "pass"
    assert result["maxAxialForce"]["memberId"] == "M2"
    assert result["targetMember"]["memberId"] == "M2"
    assert abs(result["targetMember"]["axialForceKn"]) > 0


def test_calculate_tool_returns_unified_summary():
    result = solve_calculate({"payload": {"beamType": "simply_supported", "loadType": "uniform", "q": 12, "E": 206, "I": 85000, "spans": [6]}})

    assert result["capabilityId"] == "solver.calculate"
    assert result["status"] == "pass"
    assert result["analysisType"] == "beam"
    assert result["summary"]["statusCode"] == "PASS"


def test_sensitivity_tool_returns_response_metric():
    payload = {"beamType": "simply_supported", "loadType": "uniform", "q": 12, "E": 206, "I": 85000, "spans": [6], "config": {"steps": 2}}
    result = solve_sensitivity_analysis({"payload": payload})

    assert result["capabilityId"] == "solver.sensitivity_analysis"
    assert result["status"] == "pass"
    assert result["responseLabel"] == "最大挠度"
    assert len(result["variations"]) == 3


def test_benchmark_tools_list_and_run_cases():
    listed = list_benchmark_cases({"category": "frame-beam-verify"})
    assert listed["status"] == "pass"
    assert any(case["id"] == "BM-001" for case in listed["cases"])
    assert all(case["verificationLevel"] in {"A", "B", "C", "D"} for case in listed["cases"])

    result = run_benchmark_case({"caseId": "BM-001"})
    assert result["capabilityId"] == "solver.benchmark_case_run"
    assert result["status"] == "pass"
    assert result["verification"]["verificationLevel"] in {"A", "B", "C", "D"}
    assert any(check["metric"] == "跨中挠度(mm)" for check in result["checks"])


def test_mcp_server_lists_and_calls_tools_over_stdio():
    messages = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tools/call",
            "params": {"name": "beam_deflection_serviceability_check", "arguments": _beam_arguments()},
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

    assert responses[0]["result"]["serverInfo"]["name"] == "archsight-solver-mcp"
    tool_names = {tool["name"] for tool in responses[1]["result"]["tools"]}
    assert {
        "beam_deflection",
        "beam_deflection_serviceability_check",
        "frame_displacement",
        "truss_member_force",
        "calculate",
        "sensitivity_analysis",
        "benchmark_case_list",
        "benchmark_case_run",
        "project_document_health",
        "project_template_registry",
    } <= tool_names
    tool_defs = {tool["name"]: tool for tool in responses[1]["result"]["tools"]}
    assert tool_defs["calculate"]["annotations"]["readOnlyHint"] is True
    assert tool_defs["benchmark_case_run"]["outputSchema"]["title"] == "确定性求解能力输出"
    assert tool_defs["project_document_health"]["inputSchema"]["title"] == "项目文档工具输入"
    assert tool_defs["project_template_registry"]["inputSchema"]["title"] == "空工具输入"
    call_result = responses[2]["result"]
    assert call_result["isError"] is False
    assert call_result["structuredContent"]["capabilityId"] == "solver.beam_deflection_serviceability_check"
    assert call_result["structuredContent"]["status"] == "pass"


def test_mcp_server_calls_project_document_health_tool():
    message = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": "project_document_health",
            "arguments": {"projectDocument": create_default_project_document("MCP 项目健康检查")},
        },
    }
    completed = subprocess.run(
        [sys.executable, "-m", "backend.capabilities.mcp_server"],
        input=json.dumps(message, ensure_ascii=False) + "\n",
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=True,
    )

    response = json.loads(completed.stdout)
    call_result = response["result"]

    assert call_result["isError"] is False
    assert call_result["structuredContent"]["capabilityId"] == "solver.project_document_health"
    assert call_result["structuredContent"]["status"] == "pass"
    assert call_result["structuredContent"]["healthStatus"] == "ready"
    assert call_result["structuredContent"]["project"]["name"] == "MCP 项目健康检查"


def test_mcp_server_calls_project_template_registry_tool():
    message = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": "project_template_registry", "arguments": {}},
    }
    completed = subprocess.run(
        [sys.executable, "-m", "backend.capabilities.mcp_server"],
        input=json.dumps(message, ensure_ascii=False) + "\n",
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=True,
    )

    response = json.loads(completed.stdout)
    call_result = response["result"]

    assert call_result["isError"] is False
    assert call_result["structuredContent"]["capabilityId"] == "solver.project_template_registry"
    assert call_result["structuredContent"]["status"] == "pass"
    assert call_result["structuredContent"]["templateCount"] >= 1
    assert call_result["structuredContent"]["templates"][0]["primaryResultMetrics"]
    assert call_result["structuredContent"]["templates"][0]["entryPoints"]


def test_mcp_server_rejects_arguments_before_tool_call_when_schema_fails():
    invalid_arguments = _beam_arguments()
    invalid_arguments["deflectionLimitRatio"] = "250"
    message = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": "beam_deflection_serviceability_check", "arguments": invalid_arguments},
    }
    completed = subprocess.run(
        [sys.executable, "-m", "backend.capabilities.mcp_server"],
        input=json.dumps(message, ensure_ascii=False) + "\n",
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=True,
    )

    response = json.loads(completed.stdout)
    call_result = response["result"]

    assert call_result["isError"] is True
    assert call_result["structuredContent"]["status"] == "invalid_input"
    assert "arguments.deflectionLimitRatio 必须是 number" in call_result["content"][0]["text"]


def test_mcp_server_exposes_resources_and_prompts_over_stdio():
    messages = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-06-18"}},
        {"jsonrpc": "2.0", "id": 2, "method": "resources/list"},
        {"jsonrpc": "2.0", "id": 3, "method": "resources/read", "params": {"uri": "archsight://docs/asms-json"}},
        {"jsonrpc": "2.0", "id": 4, "method": "resources/read", "params": {"uri": "archsight://examples/asms-few-shots"}},
        {"jsonrpc": "2.0", "id": 5, "method": "resources/read", "params": {"uri": "archsight://benchmark/catalog"}},
        {"jsonrpc": "2.0", "id": 6, "method": "prompts/list"},
        {"jsonrpc": "2.0", "id": 7, "method": "prompts/get", "params": {"name": "benchmark-validation-review", "arguments": {"caseId": "BM-001"}}},
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

    assert responses[0]["result"]["capabilities"]["resources"]["listChanged"] is False
    resource_uris = {resource["uri"] for resource in responses[1]["result"]["resources"]}
    assert "archsight://docs/asms-json" in resource_uris
    assert "archsight://examples/asms-few-shots" in resource_uris
    assert "archsight://benchmark/catalog" in resource_uris
    assert "archsight://docs/mcp-resources" in resource_uris
    assert "ArchSight Structural Model Schema" in responses[2]["result"]["contents"][0]["text"]
    assert "ASMS-JSON" in responses[3]["result"]["contents"][0]["text"]
    assert "BM-001" in responses[4]["result"]["contents"][0]["text"]
    prompt_names = {prompt["name"] for prompt in responses[5]["result"]["prompts"]}
    assert "benchmark-validation-review" in prompt_names
    assert "benchmark_case_run" in responses[6]["result"]["messages"][0]["content"]["text"]


def test_mcp_file_resources_are_generated_and_non_placeholder():
    declared_uris = {resource["uri"] for resource in mcp_server.RESOURCE_DEFINITIONS}
    placeholder_texts = {
        "ASMS-JSON 协议文档尚未生成。",
        "{}",
        "公开验证集说明文档尚未生成。",
        "AIOS 调用层设计文档尚未生成。",
    }

    for uri, path in mcp_server.FILE_RESOURCE_PATHS.items():
        assert uri in declared_uris
        assert path.exists(), f"{uri} 缺少仓库事实源: {path}"
        text = path.read_text(encoding="utf-8")
        assert text.strip(), f"{uri} 指向空文件: {path}"

        resource = mcp_server._read_resource(uri)
        content = resource["contents"][0]
        assert content["uri"] == uri
        assert content["text"].strip()
        assert content["text"].strip() not in placeholder_texts

        if content["mimeType"] == "application/json":
            json.loads(content["text"])
