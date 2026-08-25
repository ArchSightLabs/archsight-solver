from copy import deepcopy
from importlib import metadata

import pytest

from backend.tests.test_frame_workbench import frame_payload
from backend.tests.test_truss_workbench import _base_payload
from backend.verification_package import (
    VERIFICATION_PACKAGE_FORMAT,
    VERIFICATION_PACKAGE_FORMAT_VERSION,
    _package_hash,
    _solver_version,
    create_verification_package,
    verify_verification_package,
)


def _beam_payload():
    return {
        "analysisType": "beam",
        "projectName": "Verification Beam",
        "beamType": "simply_supported",
        "loadType": "uniform",
        "spans": [6.0],
        "spanProperties": [{"E": 206.0, "I": 85000.0}],
        "q": 12.0,
    }


def test_solver_version_falls_back_to_source_project_metadata(monkeypatch):
    def missing_distribution(_distribution_name: str):
        raise metadata.PackageNotFoundError

    from backend import verification_package

    monkeypatch.setattr(verification_package.metadata, "version", missing_distribution)

    assert _solver_version() == "1.8.3"


def test_verification_package_replays_and_validates_integrity():
    package = create_verification_package(
        _beam_payload(),
        evidence={"resultSource": {"source": "web-workbench"}},
        solver_version="1.7.0",
        created_at="2026-08-09T00:00:00+00:00",
    )

    assert package["format"] == VERIFICATION_PACKAGE_FORMAT
    assert package["formatVersion"] == VERIFICATION_PACKAGE_FORMAT_VERSION
    assert package["solver"]["version"] == "1.7.0"
    assert package["analysis"]["input"] == _beam_payload()
    assert package["analysis"]["request"]["analysisType"] == "beam"
    assert "generatedAt" not in package["analysis"]["recordedResult"]
    assert package["integrity"]["algorithm"] == "sha256"
    assert len(package["integrity"]["packageHash"]) == 64

    report = verify_verification_package(package, current_solver_version="1.7.0")

    assert report["status"] == "pass"
    assert report["formatValid"] is True
    assert report["integrityValid"] is True
    assert report["replayMatched"] is True
    assert report["versionMatch"] is True
    assert report["mismatches"] == []


def test_verification_package_validates_semantic_result_source_on_create_and_verify():
    payload = _beam_payload()
    payload["loadCases"] = [
        {"id": "DL", "title": "恒载", "loads": [{"type": "uniform", "qKnPerM": 8.0}]},
    ]
    with pytest.raises(ValueError, match="所选结果来源不存在"):
        create_verification_package(
            payload,
            evidence={"resultSource": {"source": "case", "id": "MISSING"}},
            solver_version="1.8.1",
        )

    package = create_verification_package(
        payload,
        evidence={"resultSource": {"source": "case", "id": "DL", "label": "恒载"}},
        solver_version="1.8.1",
    )
    assert len(package["evidence"]["resultSource"]["resultHash"]) == 64
    assert verify_verification_package(package, current_solver_version="1.8.1")["status"] == "pass"

    tampered = deepcopy(package)
    tampered["evidence"]["resultSource"]["id"] = "MISSING"
    tampered["integrity"]["packageHash"] = _package_hash(tampered)
    report = verify_verification_package(tampered, current_solver_version="1.8.1")
    assert report["status"] == "fail"
    assert report["integrityValid"] is True
    assert report["replayMatched"] is None
    assert report["mismatches"][0]["path"] == "$.evidence.resultSource"


def test_verification_package_detects_recorded_result_tampering_before_replay():
    package = create_verification_package(
        _beam_payload(),
        solver_version="1.7.0",
        created_at="2026-08-09T00:00:00+00:00",
    )
    tampered = deepcopy(package)
    tampered["analysis"]["recordedResult"]["summary"]["status"] = "tampered"

    report = verify_verification_package(tampered, current_solver_version="1.7.0")

    assert report["status"] == "fail"
    assert report["integrityValid"] is False
    assert report["replayMatched"] is None
    assert {item["path"] for item in report["mismatches"]} >= {
        "$.integrity.recordedResultHash",
        "$.integrity.packageHash",
    }


def test_verification_package_marks_matching_cross_version_replay_for_review():
    package = create_verification_package(
        _beam_payload(),
        solver_version="1.7.0",
        created_at="2026-08-09T00:00:00+00:00",
    )

    report = verify_verification_package(package, current_solver_version="1.8.1")

    assert report["status"] == "review"
    assert report["integrityValid"] is True
    assert report["replayMatched"] is True
    assert report["versionMatch"] is False
    assert report["warnings"]


def test_verification_package_rejects_unsupported_format_without_solving():
    package = create_verification_package(
        _beam_payload(),
        solver_version="1.7.0",
        created_at="2026-08-09T00:00:00+00:00",
    )
    package["formatVersion"] = "2.0.0"

    report = verify_verification_package(package, current_solver_version="1.7.0")

    assert report["status"] == "fail"
    assert report["formatValid"] is False
    assert report["integrityValid"] is False
    assert report["replayMatched"] is None
    assert report["mismatches"][0]["path"] == "$.formatVersion"


@pytest.mark.parametrize("payload", [frame_payload(), _base_payload()])
def test_verification_package_replays_all_supported_two_dimensional_systems(payload):
    package = create_verification_package(
        payload,
        solver_version="1.7.0",
        created_at="2026-08-09T00:00:00+00:00",
    )

    report = verify_verification_package(package, current_solver_version="1.7.0")

    assert package["analysis"]["analysisType"] in {"frame", "truss"}
    assert report["status"] == "pass"
    assert report["replayMatched"] is True


def test_verification_package_replays_frame_stability_evidence_from_the_same_result_source():
    payload = {
        "analysisType": "frame",
        "projectName": "Verification Frame Stability",
        "materialId": "q345",
        "analysisOptions": {
            "pDelta": True,
            "buckling": True,
            "pDeltaOptions": {"loadSteps": 4, "maxIterations": 12, "tolerance": 1e-8},
            "bucklingOptions": {"modeCount": 2},
        },
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
                {"id": "N2", "x": 0.0, "y": 4.0, "supportType": "free"},
            ],
            "members": [
                {
                    "id": "C1",
                    "start": "N1",
                    "end": "N2",
                    "E_GPa": 210.0,
                    "A_cm2": 220.0,
                    "I_cm4": 1500.0,
                    "kind": "column",
                }
            ],
            "loads": [
                {"type": "nodal", "node": "N2", "fxKn": 8.0, "fyKn": -80.0, "mzKnM": 0.0},
            ],
        },
    }

    package = create_verification_package(
        payload,
        solver_version="1.7.0",
        created_at="2026-08-13T00:00:00+00:00",
    )
    recorded = package["analysis"]["recordedResult"]["solution"]

    assert recorded["secondOrder"]["status"] == "converged"
    assert recorded["buckling"]["status"] == "converged"
    assert recorded["secondOrder"]["referenceSource"]["id"] == "__primary__"
    assert recorded["buckling"]["referenceSource"]["id"] == "__primary__"
    assert recorded["buckling"]["modes"][0]["eigenResidualNorm"] <= 1e-8

    report = verify_verification_package(package, current_solver_version="1.7.0")

    assert report["status"] == "pass"
    assert report["integrityValid"] is True
    assert report["replayMatched"] is True


def test_verification_package_keeps_nonlinear_path_evidence_in_recorded_result():
    payload = {
        "analysisType": "frame",
        "projectName": "Verification Frame Nonlinear Path",
        "materialId": "q345",
        "analysisOptions": {
            "pDelta": True,
            "pDeltaOptions": {
                "algorithm": "corotational_newton_v1",
                "initialStep": 0.25,
                "maxStep": 0.5,
                "includeMethodComparison": True,
                "initialImperfection": {
                    "type": "explicit",
                    "nodeOffsets": [{"nodeId": "N2", "uxMm": 6.0, "uyMm": 0.0}],
                },
            },
        },
        "structure": {
            "template": "explicit",
            "nodes": [
                {"id": "N1", "x": 0.0, "y": 0.0, "supportType": "fixed"},
                {"id": "N2", "x": 0.0, "y": 4.0, "supportType": "free"},
            ],
            "members": [
                {
                    "id": "C1",
                    "start": "N1",
                    "end": "N2",
                    "E_GPa": 210.0,
                    "A_cm2": 220.0,
                    "I_cm4": 1500.0,
                    "kind": "column",
                }
            ],
            "loads": [
                {"type": "nodal", "node": "N2", "fxKn": 8.0, "fyKn": -80.0, "mzKnM": 0.0},
            ],
        },
    }

    package = create_verification_package(
        payload,
        solver_version="1.7.0",
        created_at="2026-08-13T00:00:00+00:00",
    )
    recorded = package["analysis"]["recordedResult"]["solution"]

    assert recorded["secondOrder"]["nonlinearPathTrace"]["schema"] == "NonlinearPathTrace@1"
    assert recorded["secondOrder"]["nonlinearPathTrace"]["lastConverged"]["loadFactor"] >= 0.0
    assert recorded["secondOrder"]["nonlinearPathTrace"]["steps"]
    assert recorded["secondOrder"]["methodComparison"]["schema"] == "MethodComparison@1"
    assert all(
        len(str(method["sourceHash"])) == 64
        for method in recorded["secondOrder"]["methodComparison"]["methods"]
    )
    assert recorded["secondOrder"]["initialImperfection"]["type"] == "explicit"

    report = verify_verification_package(package, current_solver_version="1.7.0")

    assert report["status"] == "pass"
    assert report["integrityValid"] is True
    assert report["replayMatched"] is True
