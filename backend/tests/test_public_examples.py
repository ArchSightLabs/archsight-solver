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


def test_public_validation_project_objects_use_continuous_number_prefixes():
    examples = build_public_validation_projects()

    for example_project in examples["projects"]:
        objects = example_project["project"]["objects"]
        assert [obj["name"].split(" ", 1)[0] for obj in objects] == [
            f"{index:02d}" for index in range(1, len(objects) + 1)
        ]


def test_public_validation_project_metric_summaries_use_trimmed_four_decimal_precision():
    examples = build_public_validation_projects()
    objects = {
        obj["benchmark"]["caseId"]: obj
        for project in examples["projects"]
        for obj in project["project"]["objects"]
    }

    assert objects["frame-portal-benchmark"]["benchmark"]["metricSummary"] == "最大位移 3.8141 mm"
    assert objects["truss-warren-roof"]["benchmark"]["metricSummary"] == "最大位移 1.6771 mm"
    assert objects["beam-simply-supported-center-point"]["benchmark"]["metricSummary"] == "最大挠度 11.25 mm"
    assert "最大挠度 11.25 mm" in objects["beam-simply-supported-center-point"]["benchmark"]["expectedSummary"]


def test_public_examples_api_returns_importable_projects(client):
    response = client.get("/api/examples/projects")
    assert response.status_code == 200
    data = response.get_json()

    assert data["schemaVersion"] == 1
    assert data["caseCount"] == 33
    assert len(data["projects"]) == 3
    benchmark = data["projects"][0]["project"]["objects"][0]["benchmark"]
    assert benchmark["caseId"]
    assert benchmark["expectedSummary"].startswith("标准值：")
    assert benchmark["toleranceSummary"].startswith("容许误差：")


def test_public_examples_endpoint_is_published_in_openapi():
    document = build_openapi_document()

    assert "/api/examples/projects" in document["paths"]
    assert "public-example-projects-response" in document["components"]["schemas"]
    benchmark_schema = document["components"]["schemas"]["public-example-projects-response"]["properties"]["projects"]["items"]["properties"]["project"]["properties"]["objects"]["items"]["properties"]["benchmark"]
    assert "expectedSummary" in benchmark_schema["properties"]
    assert "toleranceSummary" in benchmark_schema["properties"]
