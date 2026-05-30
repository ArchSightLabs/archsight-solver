from __future__ import annotations

import os
import sys

import pytest
from werkzeug.http import parse_options_header

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from backend.exporters.common.filenames import export_filename, safe_filename_segment


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def _download_name(response) -> str:
    _, options = parse_options_header(response.headers.get("Content-Disposition", ""))
    return options.get("filename", "")


def _beam_payload(format_type: str = "docx") -> dict:
    return {
        "analysisType": "beam",
        "projectName": "Export Beam",
        "format": format_type,
        "beamType": "continuous",
        "loadType": "uniform",
        "spans": [4.0, 4.0],
        "q": 8.0,
        "E": 210.0,
        "I": 4500.0,
        "freq": 1.0,
        "duration": 5.0,
        "materialId": "q345",
    }


def _frame_payload(format_type: str = "xlsx") -> dict:
    return {
        "analysisType": "frame",
        "projectName": "Export Frame",
        "format": format_type,
        "materialId": "q345",
        "structure": {
            "template": "portal_frame",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
                {"id": "N2", "x": 6.0, "y": 0.0, "supportType": "fixed"},
                {"id": "N3", "x": 0.0, "y": 4.0, "supportType": "free"},
                {"id": "N4", "x": 6.0, "y": 4.0, "supportType": "free"},
            ],
            "members": [
                {"id": "C1", "start": "N1", "end": "N3", "E_GPa": 210, "A_cm2": 240, "I_cm4": 12000, "kind": "column"},
                {"id": "B1", "start": "N3", "end": "N4", "E_GPa": 210, "A_cm2": 220, "I_cm4": 15000, "kind": "beam"},
                {"id": "C2", "start": "N2", "end": "N4", "E_GPa": 210, "A_cm2": 240, "I_cm4": 12000, "kind": "column"},
            ],
            "loads": [{"type": "distributed", "member": "B1", "wyKnPerM": -18.0}],
        },
    }


def _truss_payload(format_type: str = "xlsx") -> dict:
    return {
        "analysisType": "truss",
        "projectName": "Export Truss",
        "format": format_type,
        "materialId": "q345",
        "structure": {
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "pinned"},
                {"id": "N2", "x": 6.0, "y": 0.0, "supportType": "roller"},
                {"id": "N3", "x": 3.0, "y": 3.0, "supportType": "free"},
            ],
            "members": [
                {"id": "M1", "start": "N1", "end": "N3", "E_GPa": 210, "A_cm2": 24},
                {"id": "M2", "start": "N2", "end": "N3", "E_GPa": 210, "A_cm2": 24},
                {"id": "M3", "start": "N1", "end": "N2", "E_GPa": 210, "A_cm2": 24},
            ],
            "loads": [{"type": "nodal", "node": "N3", "fxKn": 0.0, "fyKn": -20.0}],
        },
    }


def test_export_filename_uses_professional_analysis_and_artifact_labels():
    assert safe_filename_segment("../../test\n") == "test"
    assert export_filename("../../test\n", "beam", "docx") == "test_梁系_计算书.docx"
    assert export_filename("项目 A", "frame", "xlsx") == "项目_A_平面框架_参数表.xlsx"
    assert export_filename("桁架验证", "truss", ".docx") == "桁架验证_平面桁架_计算书.docx"


@pytest.mark.parametrize(
    ("payload", "expected"),
    [
        (_beam_payload("docx"), "Export_Beam_梁系_计算书.docx"),
        (_frame_payload("xlsx"), "Export_Frame_平面框架_参数表.xlsx"),
        (_truss_payload("xlsx"), "Export_Truss_平面桁架_参数表.xlsx"),
    ],
)
def test_export_download_names_match_analysis_object_and_artifact(client, payload, expected):
    response = client.post("/api/export", json=payload)

    assert response.status_code == 200
    assert _download_name(response) == expected
