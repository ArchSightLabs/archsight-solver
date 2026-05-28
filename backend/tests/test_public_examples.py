import pytest

from app import app
from backend.benchmarks.catalog import load_benchmark_catalog
from backend.contracts.openapi import build_openapi_document
from backend.examples.public_validation_projects import build_public_validation_projects


@pytest.fixture
def client():
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


def test_public_validation_projects_expose_all_benchmark_cases_once():
    catalog = load_benchmark_catalog()
    examples = build_public_validation_projects()
    object_case_ids = [
        obj["benchmark"]["caseId"]
        for project in examples["projects"]
        for obj in project["project"]["objects"]
    ]

    assert examples["caseCount"] == 33
    assert len(object_case_ids) == len(catalog["cases"])
    assert sorted(object_case_ids) == sorted(case["id"] for case in catalog["cases"])


def test_public_validation_projects_group_by_analysis_object():
    examples = build_public_validation_projects()
    projects = {project["id"]: project for project in examples["projects"]}

    assert projects["beam-public-validation"]["caseCount"] == 12
    assert projects["frame-public-validation"]["caseCount"] == 13
    assert projects["truss-public-validation"]["caseCount"] == 8
    assert {obj["type"] for obj in projects["beam-public-validation"]["project"]["objects"]} == {"beam"}
    assert {obj["type"] for obj in projects["frame-public-validation"]["project"]["objects"]} == {"frame"}
    assert {obj["type"] for obj in projects["truss-public-validation"]["project"]["objects"]} == {"truss"}


def test_public_examples_api_returns_importable_projects(client):
    response = client.get("/api/examples/projects")
    assert response.status_code == 200
    data = response.get_json()

    assert data["schemaVersion"] == 1
    assert data["caseCount"] == 33
    assert len(data["projects"]) == 3
    assert data["projects"][0]["project"]["objects"][0]["benchmark"]["caseId"]


def test_public_examples_endpoint_is_published_in_openapi():
    document = build_openapi_document()

    assert "/api/examples/projects" in document["paths"]
    assert "public-example-projects-response" in document["components"]["schemas"]
