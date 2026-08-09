from collections import Counter

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

    assert examples["caseCount"] == len(catalog["cases"])
    assert len(object_case_ids) == len(catalog["cases"])
    assert sorted(object_case_ids) == sorted(case["id"] for case in catalog["cases"])


def test_public_validation_projects_group_by_analysis_object():
    catalog = load_benchmark_catalog()
    category_counts = Counter(case["category"] for case in catalog["cases"])
    examples = build_public_validation_projects()
    projects = {project["id"]: project for project in examples["projects"]}

    assert [project["id"] for project in examples["projects"]] == [
        "beam-public-validation",
        "truss-public-validation",
        "frame-public-validation",
    ]
    assert projects["beam-public-validation"]["caseCount"] == category_counts["beam"]
    assert projects["truss-public-validation"]["caseCount"] == category_counts["truss"] + category_counts["truss-verify"]
    assert projects["frame-public-validation"]["caseCount"] == category_counts["frame"] + category_counts["frame-beam-verify"]
    assert {obj["type"] for obj in projects["beam-public-validation"]["project"]["objects"]} == {"beam"}
    assert {obj["type"] for obj in projects["truss-public-validation"]["project"]["objects"]} == {"truss"}
    assert {obj["type"] for obj in projects["frame-public-validation"]["project"]["objects"]} == {"frame"}


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

    assert objects["frame-portal-benchmark"]["benchmark"]["metricSummary"] == "最大节点位移 3.8141 mm"
    assert objects["truss-warren-roof"]["benchmark"]["metricSummary"] == "最大节点位移 1.6771 mm"
    assert objects["beam-simply-supported-center-point"]["benchmark"]["metricSummary"] == "最大挠度 11.25 mm"
    assert "最大挠度 11.25 mm" in objects["beam-simply-supported-center-point"]["benchmark"]["expectedSummary"]


def test_public_examples_api_returns_importable_projects(client):
    catalog = load_benchmark_catalog()
    response = client.get("/api/examples/projects")
    assert response.status_code == 200
    data = response.get_json()

    assert data["schemaVersion"] == 1
    assert data["caseCount"] == len(catalog["cases"])
    assert len(data["projects"]) == 3
    benchmark = data["projects"][0]["project"]["objects"][0]["benchmark"]
    assert benchmark["caseId"]
    assert benchmark["verificationLevel"] in {"A", "B", "C", "D"}
    assert benchmark["verificationLevelLabel"].endswith("级验证")
    assert benchmark["expectedSummary"].startswith("标准值：")
    assert benchmark["toleranceSummary"].startswith("容许误差：")


def test_public_examples_endpoint_is_published_in_openapi():
    document = build_openapi_document()

    assert "/api/examples/projects" in document["paths"]
    assert "public-example-projects-response" in document["components"]["schemas"]
    benchmark_schema = document["components"]["schemas"]["public-example-projects-response"]["properties"]["projects"]["items"]["properties"]["project"]["properties"]["objects"]["items"]["properties"]["benchmark"]
    assert "verificationLevels" in document["components"]["schemas"]["public-example-projects-response"]["properties"]["projects"]["items"]["properties"]
    assert "verificationLevel" in benchmark_schema["properties"]
    assert "verificationLevelLabel" in benchmark_schema["properties"]
    assert "expectedSummary" in benchmark_schema["properties"]
    assert "toleranceSummary" in benchmark_schema["properties"]
    assert "learning" in benchmark_schema["properties"]


def test_public_examples_expose_three_featured_a_level_learning_paths():
    examples = build_public_validation_projects()
    featured = [
        (obj["type"], obj["benchmark"])
        for project in examples["projects"]
        for obj in project["project"]["objects"]
        if obj["benchmark"].get("learning", {}).get("featured") is True
    ]

    assert [(analysis_type, benchmark["caseId"]) for analysis_type, benchmark in featured] == [
        ("beam", "beam-simply-supported-center-point"),
        ("truss", "BM-009"),
        ("frame", "BM-010"),
    ]
    assert {benchmark["verificationLevel"] for _, benchmark in featured} == {"A"}
    assert len({benchmark["learning"]["pathId"] for _, benchmark in featured}) == 3

    for _, benchmark in featured:
        learning = benchmark["learning"]
        assert learning["durationMinutes"] == 5
        assert len(learning["predictions"]) == 3
        assert learning["modelFocus"]
        assert learning["graphicalChecks"]
        assert learning["proves"]
        assert learning["doesNotProve"]
        for prediction in learning["predictions"]:
            option_ids = {option["id"] for option in prediction["options"]}
            assert len(option_ids) >= 2
            assert prediction["expectedOptionId"] in option_ids
            assert "freeText" not in prediction
