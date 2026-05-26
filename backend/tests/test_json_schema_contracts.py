import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from backend.contracts.json_schemas import schema_by_id, schema_registry


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def test_schema_registry_contains_api_and_tool_contracts():
    registry = schema_registry()

    assert "asms-model" in registry
    assert "asms-beam-model" in registry
    assert "asms-frame-model" in registry
    assert "asms-truss-model" in registry
    assert "job-request" in registry
    assert "calculate-tool-input" in registry
    assert "benchmark-case-run-input" in registry
    assert registry["asms-frame-model"]["properties"]["structure"]["required"] == ["nodes", "members"]
    assert registry["asms-truss-model"]["properties"]["structure"]["properties"]["loads"]["items"]["required"] == ["type", "node"]
    assert registry["job-request"]["required"] == ["payload"]
    assert registry["beam-deflection-input"]["properties"]["span"]["required"] == ["value", "unit"]


def test_schema_endpoint_exposes_registry(client):
    response = client.get("/api/contracts/schemas")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert "asms-model" in payload["schemaIds"]
    assert "job-request" in payload["schemaIds"]
    assert payload["schemas"]["job-request"]["properties"]["operation"]["enum"] == ["calculate", "preview", "sensitivity"]


def test_schema_endpoint_returns_single_schema(client):
    response = client.get("/api/contracts/schemas/beam-deflection-input")

    assert response.status_code == 200
    assert response.get_json()["title"] == "梁挠度能力输入"


def test_unknown_schema_returns_404(client):
    response = client.get("/api/contracts/schemas/missing")

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "COMMON_SCHEMA_NOT_FOUND"
    assert schema_by_id("missing") is None
