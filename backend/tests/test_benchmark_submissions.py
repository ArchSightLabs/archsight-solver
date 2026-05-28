from __future__ import annotations

import json
import re
from copy import deepcopy

import pytest

from app import app
from backend.benchmarks.catalog import find_benchmark_case
from backend.benchmarks.review_submission import review_submission_file
from backend.benchmarks.submissions import build_benchmark_submission_package_response
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


def test_benchmark_submission_package_endpoint_generates_single_json_package(client):
    case = deepcopy(find_benchmark_case("beam-simply-supported-uniform"))
    case["id"] = "beam-contributor-package"

    response = client.post(
        "/api/benchmark-submission-packages",
        json={"case": case, "contributor": {"name": "测试贡献者", "organization": "结构教研室"}},
    )

    assert response.status_code == 200
    data = response.get_json()
    package = data["package"]
    assert data["operation"] == "generate_benchmark_submission_package"
    assert data["persisted"] is False
    assert re.fullmatch(r"beam-\d{8}-[0-9a-f]{8}\.json", data["filename"])
    assert package["format"] == "archsight-benchmark-submission"
    assert package["case"]["id"] == "beam-contributor-package"
    assert package["contributor"]["name"] == "测试贡献者"
    assert package["precheck"]["passed"] is True
    assert package["precheck"]["persisted"] is False


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


def test_review_submission_file_appends_valid_package_to_catalog(tmp_path):
    case = deepcopy(find_benchmark_case("beam-simply-supported-uniform"))
    case["id"] = "beam-review-tool-append"
    package = build_benchmark_submission_package_response({"case": case, "contributor": {"name": "维护端测试"}})["package"]
    submission_path = tmp_path / "benchmark-submission.json"
    submission_path.write_text(json.dumps(package, ensure_ascii=False), encoding="utf-8")

    catalog_path = tmp_path / "benchmark_cases.json"
    catalog_path.write_text(
        json.dumps({"schemaVersion": 1, "updatedAt": "2026-05-28", "cases": []}, ensure_ascii=False),
        encoding="utf-8",
    )

    result = review_submission_file(submission_path, append=True, catalog_path=catalog_path)

    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    assert result["appended"] is True
    assert catalog["cases"][0]["id"] == "beam-review-tool-append"


def test_benchmark_submission_contract_is_published():
    registry = schema_registry()
    document = build_openapi_document()

    assert "benchmark-submission-input" in registry
    assert "benchmark-submission-response" in registry
    assert "benchmark-submission-package" in registry
    assert "benchmark-submission-package-response" in registry
    assert "/api/benchmark-submissions" in document["paths"]
    assert "/api/benchmark-submission-packages" in document["paths"]
    assert document["paths"]["/api/benchmark-submissions"]["post"]["requestBody"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/benchmark-submission-input"
    }
    assert document["paths"]["/api/benchmark-submission-packages"]["post"]["responses"]["200"]["content"]["application/json"]["schema"] == {
        "$ref": "#/components/schemas/benchmark-submission-package-response"
    }
