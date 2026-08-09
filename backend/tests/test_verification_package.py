from copy import deepcopy
from importlib import metadata

import pytest

from backend.tests.test_frame_workbench import frame_payload
from backend.tests.test_truss_workbench import _base_payload
from backend.verification_package import (
    VERIFICATION_PACKAGE_FORMAT,
    VERIFICATION_PACKAGE_FORMAT_VERSION,
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

    assert _solver_version() == "1.8.0"


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

    report = verify_verification_package(package, current_solver_version="1.8.0")

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
