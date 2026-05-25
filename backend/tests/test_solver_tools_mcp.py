import json
import os
import subprocess
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.capabilities.solver_tools import (
    solve_beam_deflection_serviceability_check,
    solve_frame_displacement,
    solve_truss_member_force,
)
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
    } <= tool_names
    call_result = responses[2]["result"]
    assert call_result["isError"] is False
    assert call_result["structuredContent"]["capabilityId"] == "solver.beam_deflection_serviceability_check"
    assert call_result["structuredContent"]["status"] == "pass"


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
