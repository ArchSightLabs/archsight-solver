from copy import deepcopy

import pytest

from app import app


def _beam_payload():
    return {
        "analysisType": "beam",
        "projectName": "Verification API Beam",
        "beamType": "simply_supported",
        "loadType": "uniform",
        "spans": [6.0],
        "spanProperties": [{"E": 206.0, "I": 85000.0}],
        "q": 12.0,
    }


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def test_create_verification_package_api_returns_immediately_verified_package(client):
    response = client.post(
        "/api/verification-packages",
        json={
            "payload": _beam_payload(),
            "evidence": {"resultSource": {"source": "web-workbench"}},
        },
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert data["operation"] == "verification_package_create"
    assert data["package"]["analysis"]["analysisType"] == "beam"
    assert data["verification"]["status"] == "pass"
    assert data["verification"]["integrityValid"] is True
    assert data["verification"]["replayMatched"] is True


def test_create_verification_package_api_rejects_missing_payload(client):
    response = client.post("/api/verification-packages", json={})

    assert response.status_code == 400
    data = response.get_json()
    assert data["success"] is False
    assert data["operation"] == "verification_package_create"
    assert data["error"]["code"] == "VERIFICATION_PACKAGE_INVALID_INPUT"


def test_verify_verification_package_api_reports_tampering_as_result(client):
    created = client.post(
        "/api/verification-packages",
        json={"payload": _beam_payload()},
    ).get_json()
    tampered = deepcopy(created["package"])
    tampered["analysis"]["recordedResult"]["summary"]["status"] = "tampered"

    response = client.post(
        "/api/verification-packages/verify",
        json={"package": tampered},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert data["operation"] == "verification_package_verify"
    assert data["verification"]["status"] == "fail"
    assert data["verification"]["integrityValid"] is False
    assert data["verification"]["replayMatched"] is None


def test_verify_verification_package_api_rejects_missing_package(client):
    response = client.post("/api/verification-packages/verify", json={})

    assert response.status_code == 400
    data = response.get_json()
    assert data["error"]["code"] == "VERIFICATION_PACKAGE_INVALID_INPUT"
