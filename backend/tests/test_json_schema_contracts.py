import os
import sys

import pytest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from app import app
from backend.contracts.openapi import build_openapi_document
from backend.contracts.json_schemas import SCHEMA_ID_BASE_URI, schema_by_id, schema_registry


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
    assert "benchmark-submission-input" in registry
    assert "benchmark-submission-response" in registry
    assert registry["asms-frame-model"]["properties"]["structure"]["required"] == ["nodes", "members"]
    assert registry["asms-truss-model"]["properties"]["structure"]["properties"]["loads"]["items"]["required"] == ["type", "node"]
    assert registry["asms-beam-model"]["properties"]["loadType"]["enum"] == [
        "none",
        "uniform",
        "point",
        "linear",
        "distributed",
        "combined",
    ]
    assert registry["job-request"]["required"] == ["payload"]
    assert registry["beam-deflection-input"]["properties"]["span"]["required"] == ["value", "unit"]


def test_schema_id_uri_uses_solver_public_domain():
    registry = schema_registry()

    assert registry["benchmark-submission-package"]["$id"] == f"{SCHEMA_ID_BASE_URI}/benchmark-submission-package.schema.json"
    assert all(schema.get("$id", "").startswith(f"{SCHEMA_ID_BASE_URI}/") for schema in registry.values())


def test_schema_endpoint_exposes_registry(client):
    response = client.get("/api/contracts/schemas")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["success"] is True
    assert "asms-model" in payload["schemaIds"]
    assert "job-request" in payload["schemaIds"]
    assert payload["schemas"]["job-request"]["properties"]["operation"]["enum"] == ["calculate", "preview", "sensitivity"]


def test_openapi_document_reuses_schema_registry():
    document = build_openapi_document()

    assert document["openapi"] == "3.1.0"
    assert document["info"]["title"] == "ArchSight Solver API"
    assert "/api/calculate" in document["paths"]
    assert "/api/contracts/openapi" in document["paths"]
    assert "calculate-payload" in document["components"]["schemas"]
    assert document["paths"]["/api/calculate"]["post"]["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/calculate-payload"
    }
    assert document["components"]["schemas"]["api-error"]["properties"]["legacyError"]["type"] == "string"
    assert document["paths"]["/api/sensitivity"]["post"]["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/sensitivity-payload"
    }
    assert document["components"]["schemas"]["sensitivity-payload"]["properties"]["config"]["properties"]["steps"]["maximum"] == 50
    assert document["paths"]["/api/export"]["post"]["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/export-payload"
    }
    assert document["components"]["schemas"]["export-payload"]["properties"]["format"]["enum"] == ["xlsx", "docx"]
    assert "500" in document["paths"]["/api/export"]["post"]["responses"]
    assert document["paths"]["/api/benchmark-submissions"]["post"]["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/benchmark-submission-input"
    }
    assert document["paths"]["/api/contracts/schemas"]["get"]["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/schema-registry-response"
    }


def test_openapi_endpoint_exposes_document(client):
    response = client.get("/api/contracts/openapi")

    assert response.status_code == 200
    payload = response.get_json()
    assert payload["openapi"] == "3.1.0"
    assert "/api/sensitivity" in payload["paths"]
    assert "/api/benchmark-submissions" in payload["paths"]


def test_schema_endpoint_returns_single_schema(client):
    response = client.get("/api/contracts/schemas/beam-deflection-input")

    assert response.status_code == 200
    assert response.get_json()["title"] == "梁挠度能力输入"


def test_unknown_schema_returns_404(client):
    response = client.get("/api/contracts/schemas/missing")

    assert response.status_code == 404
    assert response.get_json()["error"]["code"] == "COMMON_SCHEMA_NOT_FOUND"
    assert schema_by_id("missing") is None
