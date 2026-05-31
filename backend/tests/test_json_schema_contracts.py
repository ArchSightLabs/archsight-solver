import os
import sys

import pytest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, ROOT_DIR)

from app import app
from backend.contracts.openapi import build_openapi_document
from backend.contracts.json_schemas import SCHEMA_ID_BASE_URI, schema_by_id, schema_registry


@pytest.fixture
def client():
    app.config["TESTING"] = True
    return app.test_client()


def _structure_member_properties(schema):
    return schema["properties"]["structure"]["properties"]["members"]["items"]["properties"]


def _structure_collection_properties(schema, collection_name):
    return schema["properties"]["structure"]["properties"][collection_name]


def _one_of_branch_by_type(schema, type_name):
    for branch in schema.get("oneOf", []):
        type_schema = branch.get("properties", {}).get("type", {})
        if type_schema.get("const") == type_name or type_name in type_schema.get("enum", []):
            return branch
    raise AssertionError(f"schema branch for type={type_name} not found")


def _read_repo_text(path):
    with open(os.path.join(ROOT_DIR, path), encoding="utf-8") as handle:
        return handle.read()


def _assert_source_contains(path, tokens):
    text = _read_repo_text(path)
    missing = [token for token in tokens if token not in text]
    assert not missing, f"{path} 缺少契约字段: {missing}"


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
    assert "滚动支座法向角" in registry["asms-frame-model"]["properties"]["structure"]["properties"]["nodes"]["items"]["properties"]["supportAngleDeg"]["description"]
    truss_load_schema = registry["asms-truss-model"]["properties"]["structure"]["properties"]["loads"]["items"]
    assert _one_of_branch_by_type(truss_load_schema, "nodal")["required"] == ["type", "node"]
    assert _one_of_branch_by_type(truss_load_schema, "distributed")["properties"]["direction"]["enum"] == ["global_x", "global_y"]
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


def test_frame_and_truss_member_schemas_expose_material_id():
    registry = schema_registry()

    for schema_id in ("asms-frame-model", "asms-truss-model"):
        member_properties = _structure_member_properties(registry[schema_id])

        assert member_properties["materialId"]["type"] == "string"
        assert "材料库编号" in member_properties["materialId"]["description"]
        assert "E_GPa" in member_properties["materialId"]["description"]


def test_beam_span_properties_expose_material_id_across_stack():
    registry = schema_registry()
    openapi = build_openapi_document()

    for schema in (registry["asms-beam-model"], openapi["components"]["schemas"]["asms-beam-model"]):
        span_properties = schema["properties"]["spanProperties"]["items"]["properties"]

        assert {"id", "memberId", "materialId", "E", "I"}.issubset(span_properties)
        assert span_properties["materialId"]["type"] == "string"
        assert "跨段材料库编号" in span_properties["materialId"]["description"]
        assert "E / I" in span_properties["materialId"]["description"]

    _assert_source_contains(
        "frontend/src/types/beam.ts",
        [
            "spanProperties?: Array<{",
            "materialId?: string",
        ],
    )
    _assert_source_contains(
        "frontend/src/solver-payload.ts",
        [
            "spanProperties:",
            "materialId: span.materialId",
        ],
    )
    for doc_path in ("docs/api-reference.md", "docs/asms-json-schema.md"):
        _assert_source_contains(
            doc_path,
            [
                "spanProperties[].materialId",
                "梁单元刚度计算输入",
            ],
        )


def test_cross_stack_critical_field_matrix_is_in_sync():
    registry = schema_registry()
    openapi = build_openapi_document()
    frame_schema = registry["asms-frame-model"]
    truss_schema = registry["asms-truss-model"]

    for schema in (frame_schema, openapi["components"]["schemas"]["asms-frame-model"]):
        node_properties = _structure_collection_properties(schema, "nodes")["items"]["properties"]
        assert {"supportAngleDeg", "springs"}.issubset(node_properties)
        spring_branches = node_properties["springs"]["items"]["oneOf"]
        spring_fields = {field for branch in spring_branches for field in branch["properties"]}
        assert {"stiffnessKnPerM", "stiffnessKnMPerRad"}.issubset(spring_fields)

        member_properties = _structure_member_properties(schema)
        assert {"materialId", "E_GPa", "A_cm2", "I_cm4", "endReleases", "internalHinges"}.issubset(member_properties)

        load_schema = _structure_collection_properties(schema, "loads")["items"]
        distributed = _one_of_branch_by_type(load_schema, "distributed")["properties"]
        assert {"qStartKnPerM", "qEndKnPerM", "startRatio", "endRatio"}.issubset(distributed)
        member_point = _one_of_branch_by_type(load_schema, "member_point")["properties"]
        assert {"forceKn", "positionRatio"}.issubset(member_point)

        structure_properties = schema["properties"]["structure"]["properties"]
        assert {"loadCases", "loadCombinations"}.issubset(structure_properties)
        assert {"id", "loads"}.issubset(structure_properties["loadCases"]["items"]["properties"])
        assert {"id", "factors", "tags"}.issubset(structure_properties["loadCombinations"]["items"]["properties"])

    for schema in (truss_schema, openapi["components"]["schemas"]["asms-truss-model"]):
        node_schema = _structure_collection_properties(schema, "nodes")["items"]
        node_properties = node_schema["properties"]
        assert node_properties["supportType"]["enum"] == ["free", "pinned", "roller"]
        assert {"supportAngleDeg", "springs", "condensedDofs"}.isdisjoint(node_properties)
        forbidden_node_fields = {tuple(branch["required"]) for branch in node_schema["not"]["anyOf"]}
        assert {("supportAngleDeg",), ("rollerAngleDeg",), ("springs",), ("condensedDofs",)}.issubset(forbidden_node_fields)

        member_properties = _structure_member_properties(schema)
        assert {"materialId", "E_GPa", "A_cm2"}.issubset(member_properties)

        load_schema = _structure_collection_properties(schema, "loads")["items"]
        nodal = _one_of_branch_by_type(load_schema, "nodal")["properties"]
        assert {"fxKn", "fyKn"}.issubset(nodal)
        member_load = _one_of_branch_by_type(load_schema, "member_load")["properties"]
        assert {"direction", "wyKnPerM", "qStartKnPerM", "qEndKnPerM", "selfWeightKnPerM"}.issubset(member_load)

        structure_properties = schema["properties"]["structure"]["properties"]
        assert {"loadCases", "loadCombinations"}.issubset(structure_properties)

    _assert_source_contains(
        "frontend/src/types/structure.ts",
        [
            "supportAngleDeg?: number",
            "springs?: FrameSpring[]",
            "materialId?: string",
            "endReleases?:",
            "internalHinges?: FrameInternalHinge[]",
            "type: \"member_point\"",
            "startRatio?: number",
            "endRatio?: number",
            "loadCases?: FrameLoadCase[]",
            "loadCombinations?: FrameLoadCombination[]",
            "selfWeightKnPerM?: number",
        ],
    )
    _assert_source_contains(
        "frontend/src/solver-payload.ts",
        [
            "supportAngleDeg:",
            "springs:",
            "materialId:",
            "endReleases:",
            "internalHinges:",
            "startRatio,",
            "endRatio,",
            "type: \"member_point\"",
            "loadCases:",
            "loadCombinations:",
            "selfWeightKnPerM:",
        ],
    )
    for doc_path in ("docs/api-reference.md", "docs/asms-json-schema.md"):
        _assert_source_contains(
            doc_path,
            [
                "supportAngleDeg",
                "springs",
                "materialId",
                "endReleases",
                "internalHinges",
                "startRatio",
                "endRatio",
                "member_point",
                "loadCases",
                "loadCombinations",
                "selfWeightKnPerM",
            ],
        )


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
    for schema_id in ("asms-frame-model", "asms-truss-model"):
        member_properties = _structure_member_properties(document["components"]["schemas"][schema_id])

        assert member_properties["materialId"]["type"] == "string"
        assert "材料库编号" in member_properties["materialId"]["description"]


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
