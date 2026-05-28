from __future__ import annotations

from copy import deepcopy

import pytest

from app import app
from backend.benchmarks.catalog import find_benchmark_case
from backend.contracts.openapi import build_openapi_document
from backend.contracts.json_schemas import schema_registry


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_benchmark_submission_endpoint_validates_complete_case(client):
    case = deepcopy(find_benchmark_case("beam-simply-supported-uniform"))

    response = client.post("/api/benchmark-submissions", json={"case": case, "contributor": {"name": "测试贡献者"}})

    assert response.status_code == 200
    data = response.get_json()
    assert data["success"] is True
    assert data["operation"] == "submit_benchmark_case"
    assert data["persisted"] is False
    assert data["reviewStatus"] == "ready_for_review"
    assert data["evaluation"]["passed"] is True
    assert data["caseDraft"]["expected"]
    assert data["caseDraft"]["tolerances"]


def test_benchmark_submission_rejects_truss_moment_primary_metric(client):
    case = deepcopy(find_benchmark_case("truss-simple-roof"))
    case["expected"]["maxMomentKnM"] = 12.3
    case["tolerances"]["maxMomentKnM"] = 0.01
    case["verification"]["checkedMetrics"].append("构件弯矩")

    response = client.post("/api/benchmark-submissions", json={"case": case})

    assert response.status_code == 400
    data = response.get_json()
    assert data["error"]["code"] == "BENCHMARK_SUBMISSION_INVALID"
    assert "桁架 benchmark 的主校核指标不得使用弯矩或剪力" in data["error"]["message"]


def test_benchmark_submission_contract_is_published():
    registry = schema_registry()
    document = build_openapi_document()

    assert "benchmark-submission-input" in registry
    assert "benchmark-submission-response" in registry
    assert "/api/benchmark-submissions" in document["paths"]
    assert document["paths"]["/api/benchmark-submissions"]["post"]["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/benchmark-submission-input"
    }
