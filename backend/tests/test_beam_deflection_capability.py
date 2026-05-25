import json
import os
import subprocess
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from backend.capabilities.beam_deflection import solve_beam_deflection_capability


def _payload():
    return {
        "span": {"value": 6.0, "unit": "m"},
        "elasticModulus": {"value": 210.0, "unit": "GPa"},
        "secondMomentOfArea": {"value": 4500.0, "unit": "cm4"},
        "load": {"value": 10.0, "unit": "kN/m", "case": "uniform"},
        "boundaryCondition": "simply_supported",
    }


def test_beam_deflection_capability_returns_tool_result():
    result = solve_beam_deflection_capability(_payload())

    assert result["capabilityId"] == "solver.beam_deflection"
    assert result["status"] == "pass"
    assert result["inputValidated"] is True
    assert result["deflection"]["unit"] == "mm"
    assert result["deflection"]["value"] == pytest.approx(17.857, rel=0.02)
    assert "v_max = 5qL^4 / (384EI)" in result["formulaRef"]
    assert result["normalizedInput"]["load"] == {"value": 10.0, "unit": "kN/m", "case": "uniform"}


def test_beam_deflection_capability_rejects_missing_units():
    payload = _payload()
    payload["span"] = {"value": 6.0}

    result = solve_beam_deflection_capability(payload)

    assert result["status"] == "invalid_input"
    assert result["inputValidated"] is False
    assert "span.unit" in result["warnings"][0]


def test_beam_deflection_cli_reads_stdin_and_writes_json():
    completed = subprocess.run(
        [sys.executable, "-m", "backend.capabilities.beam_deflection"],
        input=json.dumps(_payload(), ensure_ascii=False),
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=True,
    )

    result = json.loads(completed.stdout)

    assert result["status"] == "pass"
    assert result["deflection"]["unit"] == "mm"


def test_beam_deflection_cli_returns_json_for_invalid_json():
    completed = subprocess.run(
        [sys.executable, "-m", "backend.capabilities.beam_deflection"],
        input="{not json",
        text=True,
        encoding="utf-8",
        capture_output=True,
        check=True,
    )

    result = json.loads(completed.stdout)

    assert result["status"] == "invalid_input"
    assert result["inputValidated"] is False
