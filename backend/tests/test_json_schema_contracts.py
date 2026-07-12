import json
import os
import sys

import pytest

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, ROOT_DIR)

from app import app
from backend.common.support_catalog import support_specs
from backend.contracts.openapi import build_openapi_document
from backend.contracts.json_schemas import API_SCHEMA_VERSION, SCHEMA_ID_BASE_URI, schema_by_id, schema_registry
from backend.project_documents import create_default_project_document
from backend.project_workflow import build_export_artifact_metadata, build_host_launch_contract
from backend.template_registry import list_builtin_template_registry


class _FallbackValidationError(AssertionError):
    pass


class _FallbackContractValidator:
    """覆盖 v1.6 发布契约使用的 JSON Schema 关键字，避免测试依赖可选第三方包。"""

    def __init__(self, schema):
        self.schema = schema

    @staticmethod
    def check_schema(schema):
        assert schema.get("$schema") == "https://json-schema.org/draft/2020-12/schema"

    def validate(self, instance):
        self._validate(instance, self.schema, "$")

    def _validate(self, value, schema, path):
        if "const" in schema and value != schema["const"]:
            raise _FallbackValidationError(f"{path} must equal {schema['const']!r}")
        if "enum" in schema and value not in schema["enum"]:
            raise _FallbackValidationError(f"{path} is outside enum")
        expected_type = schema.get("type")
        type_matches = {
            "object": isinstance(value, dict),
            "array": isinstance(value, list),
            "string": isinstance(value, str),
            "integer": isinstance(value, int) and not isinstance(value, bool),
            "number": isinstance(value, (int, float)) and not isinstance(value, bool),
            "boolean": isinstance(value, bool),
            "null": value is None,
        }
        if isinstance(expected_type, str) and not type_matches.get(expected_type, True):
            raise _FallbackValidationError(f"{path} must be {expected_type}")
        if isinstance(value, str) and "minLength" in schema and len(value) < schema["minLength"]:
            raise _FallbackValidationError(f"{path} is shorter than minLength")
        if isinstance(value, (int, float)) and "minimum" in schema and value < schema["minimum"]:
            raise _FallbackValidationError(f"{path} is lower than minimum")
        if isinstance(value, dict):
            for key in schema.get("required", []):
                if key not in value:
                    raise _FallbackValidationError(f"{path}.{key} is required")
            properties = schema.get("properties", {})
            for key, child in value.items():
                if key in properties:
                    self._validate(child, properties[key], f"{path}.{key}")
                elif schema.get("additionalProperties") is False:
                    raise _FallbackValidationError(f"{path}.{key} is not allowed")
        if isinstance(value, list) and isinstance(schema.get("items"), dict):
            for index, item in enumerate(value):
                self._validate(item, schema["items"], f"{path}[{index}]")
        conditional = schema.get("if")
        if isinstance(conditional, dict):
            try:
                self._validate(value, conditional, path)
            except _FallbackValidationError:
                selected_branch = schema.get("else")
            else:
                selected_branch = schema.get("then")
            if isinstance(selected_branch, dict):
                self._validate(value, selected_branch, path)
        for keyword in ("allOf", "anyOf", "oneOf"):
            branches = schema.get(keyword)
            if not branches:
                continue
            successes = 0
            for branch in branches:
                try:
                    self._validate(value, branch, path)
                    successes += 1
                except _FallbackValidationError:
                    pass
            required_successes = 1 if keyword in {"anyOf", "oneOf"} else len(branches)
            if successes < required_successes or (keyword == "oneOf" and successes != 1):
                raise _FallbackValidationError(f"{path} does not satisfy {keyword}")


def _runtime_contract_validator(schema):
    try:
        import jsonschema
    except ImportError:
        return _FallbackContractValidator(schema), _FallbackValidationError
    return jsonschema.Draft202012Validator(schema), jsonschema.ValidationError


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


def _contract_field_matrix():
    with open(os.path.join(ROOT_DIR, "shared/asms-contract-fields.json"), encoding="utf-8") as handle:
        return json.load(handle)


def _support_values(analysis_type):
    return [spec.value for spec in support_specs(analysis_type)]


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
    assert "empty-tool-input" in registry
    assert "benchmark-case-run-input" in registry
    assert "benchmark-submission-input" in registry
    assert "benchmark-submission-response" in registry
    assert "project-document-tool-input" in registry
    assert "project-file-manifest" in registry
    assert "solver-host-message" in registry
    assert "solver-artifact-manifest" in registry
    assert "solver-template-registry" in registry
    for schema_id in ("asms-beam-model", "asms-frame-model", "asms-truss-model"):
        assert registry[schema_id]["properties"]["schemaVersion"]["const"] == API_SCHEMA_VERSION
    assert registry["project-file-manifest"]["properties"]["projectFileKind"]["enum"] == ["single-json", "zip-container", "project-folder"]
    assert registry["solver-host-message"]["properties"]["protocolVersion"]["const"] == "1.0.0"
    assert registry["solver-artifact-manifest"]["properties"]["artifactType"]["const"] == "solver.export"
    assert registry["solver-template-registry"]["properties"]["templates"]["items"]["properties"]["source"]["const"] == "builtin"
    assert "primaryResultMetrics" in registry["solver-template-registry"]["properties"]["templates"]["items"]["required"]
    assert "entryPoints" in registry["solver-template-registry"]["properties"]["templates"]["items"]["properties"]
    assert registry["empty-tool-input"]["additionalProperties"] is False
    assert registry["project-document-tool-input"]["anyOf"] == [{"required": ["projectDocument"]}, {"required": ["projectDocumentText"]}]
    assert registry["asms-frame-model"]["properties"]["structure"]["required"] == ["nodes", "members"]
    assert "滚动支座法向角" in registry["asms-frame-model"]["properties"]["structure"]["properties"]["nodes"]["items"]["properties"]["supportAngleDeg"]["description"]
    truss_load_schema = registry["asms-truss-model"]["properties"]["structure"]["properties"]["loads"]["items"]
    assert _one_of_branch_by_type(truss_load_schema, "nodal")["required"] == ["type", "node"]
    assert _one_of_branch_by_type(truss_load_schema, "distributed")["properties"]["direction"]["enum"] == ["global_x", "global_y"]
    assert _one_of_branch_by_type(truss_load_schema, "temperature")["required"] == ["type", "member", "deltaTempC"]
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


def test_v1_6_runtime_contract_objects_validate_against_declared_schemas():
    registry = schema_registry()
    project_document = create_default_project_document("v1.6 schema runtime")
    launch = build_host_launch_contract(
        project_document,
        {"sessionId": "session-1", "nonce": "nonce-1", "mode": "readonly"},
    )
    runtime_objects = {
        "project-file-manifest": project_document["manifest"],
        "solver-host-message": launch["hostMessage"],
        "solver-artifact-manifest": build_export_artifact_metadata(project_document, "docx", {}),
        "solver-template-registry": list_builtin_template_registry(),
    }

    for schema_id, instance in runtime_objects.items():
        validator, _ = _runtime_contract_validator(registry[schema_id])
        validator.check_schema(registry[schema_id])
        validator.validate(instance)


@pytest.mark.parametrize(
    "invalid_message",
    [
        {
            "type": "archsight.solver.host.launch",
            "protocolVersion": "1.0.0",
            "sessionId": "session-1",
            "payload": {"projectDocument": {}, "mode": "editable"},
        },
        {
            "type": "archsight.solver.host.launch",
            "protocolVersion": "0.9.0",
            "sessionId": "session-1",
            "nonce": "nonce-1",
            "payload": {"projectDocument": {}, "mode": "editable"},
        },
        {
            "type": "archsight.solver.host.launch",
            "protocolVersion": "1.0.0",
            "sessionId": "session-1",
            "nonce": "nonce-1",
            "payload": {"projectDocument": {}},
        },
    ],
)
def test_host_message_schema_rejects_missing_or_mismatched_session_contract(invalid_message):
    validator, validation_error = _runtime_contract_validator(schema_registry()["solver-host-message"])

    with pytest.raises(validation_error):
        validator.validate(invalid_message)


@pytest.mark.parametrize(
    ("schema_id", "mutate"),
    [
        ("project-file-manifest", lambda value: value.pop("manifestVersion")),
        ("solver-artifact-manifest", lambda value: value.update({"format": "pdf"})),
        ("solver-template-registry", lambda value: value.update({"templateCount": -1})),
    ],
)
def test_v1_6_runtime_schemas_reject_invalid_contract_objects(schema_id, mutate):
    project_document = create_default_project_document("v1.6 invalid schema runtime")
    runtime_objects = {
        "project-file-manifest": dict(project_document["manifest"]),
        "solver-artifact-manifest": build_export_artifact_metadata(project_document, "docx", {}),
        "solver-template-registry": list_builtin_template_registry(),
    }
    instance = runtime_objects[schema_id]
    mutate(instance)

    validator, validation_error = _runtime_contract_validator(schema_registry()[schema_id])
    with pytest.raises(validation_error):
        validator.validate(instance)


def test_frame_and_truss_member_schemas_expose_material_id():
    registry = schema_registry()

    for schema_id in ("asms-frame-model", "asms-truss-model"):
        member_properties = _structure_member_properties(registry[schema_id])

        assert member_properties["materialId"]["type"] == "string"
        assert "材料库编号" in member_properties["materialId"]["description"]
        assert "E_GPa" in member_properties["materialId"]["description"]


def test_beam_span_material_schema_exposes_description():
    beam_contract = _contract_field_matrix()["beam"]["spanProperties"]
    registry = schema_registry()
    openapi = build_openapi_document()

    for schema in (registry["asms-beam-model"], openapi["components"]["schemas"]["asms-beam-model"]):
        span_properties = schema["properties"]["spanProperties"]["items"]["properties"]

        assert set(beam_contract["fields"]).issubset(span_properties)
        assert span_properties["materialId"]["type"] == "string"
        assert "跨段材料库编号" in span_properties["materialId"]["description"]
        assert "E / I" in span_properties["materialId"]["description"]


def test_support_type_schema_enums_use_shared_catalog():
    registry = schema_registry()

    beam_support_properties = registry["asms-beam-model"]["properties"]["supports"]["items"]["properties"]
    assert beam_support_properties["type"]["enum"] == _support_values("beam")
    assert beam_support_properties["supportType"]["enum"] == _support_values("beam")
    assert beam_support_properties["constraints"]["items"]["enum"] == ["v", "rz"]

    frame_node_properties = registry["asms-frame-model"]["properties"]["structure"]["properties"]["nodes"]["items"]["properties"]
    truss_node_properties = registry["asms-truss-model"]["properties"]["structure"]["properties"]["nodes"]["items"]["properties"]
    assert set(frame_node_properties["supportType"]["enum"]) == set(_support_values("frame"))
    assert set(truss_node_properties["supportType"]["enum"]) == set(_support_values("truss"))
    assert "fixed" not in truss_node_properties["supportType"]["enum"]


def test_shared_contract_field_matrix_covers_cross_stack_fields():
    matrix = _contract_field_matrix()
    registry = schema_registry()
    openapi = build_openapi_document()

    common_contract = matrix["common"]
    for schema_id in ("asms-beam-model", "asms-frame-model", "asms-truss-model"):
        for schema in (registry[schema_id], openapi["components"]["schemas"][schema_id]):
            assert set(common_contract["modelFields"]).issubset(schema["properties"])
            assert schema["properties"]["schemaVersion"]["const"] == API_SCHEMA_VERSION
    for type_path in common_contract["frontendTypePaths"]:
        _assert_source_contains(type_path, common_contract["frontendTypeTokens"])
    _assert_source_contains(common_contract["payloadPath"], common_contract["payloadTokens"])
    for doc_path in ("docs/api-reference.md", "docs/asms-json-schema.md"):
        _assert_source_contains(doc_path, common_contract["docTokens"])

    beam_fields = set(matrix["beam"]["spanProperties"]["fields"])
    for schema in (registry["asms-beam-model"], openapi["components"]["schemas"]["asms-beam-model"]):
        span_properties = schema["properties"]["spanProperties"]["items"]["properties"]
        assert beam_fields.issubset(span_properties)

    beam_contract = matrix["beam"]["spanProperties"]
    _assert_source_contains(beam_contract["frontendTypePath"], beam_contract["frontendTypeTokens"])
    _assert_source_contains(beam_contract["payloadPath"], beam_contract["payloadTokens"])
    for doc_path in ("docs/api-reference.md", "docs/asms-json-schema.md"):
        _assert_source_contains(doc_path, beam_contract["docTokens"])

    frame_contract = matrix["frame"]
    for schema in (registry["asms-frame-model"], openapi["components"]["schemas"]["asms-frame-model"]):
        node_properties = _structure_collection_properties(schema, "nodes")["items"]["properties"]
        assert set(frame_contract["nodeFields"]).issubset(node_properties)
        spring_fields = {field for branch in node_properties["springs"]["items"]["oneOf"] for field in branch["properties"]}
        assert set(frame_contract["springFields"]).issubset(spring_fields)

        member_properties = _structure_member_properties(schema)
        assert set(frame_contract["memberFields"]).issubset(member_properties)

        load_schema = _structure_collection_properties(schema, "loads")["items"]
        distributed = _one_of_branch_by_type(load_schema, "distributed")["properties"]
        assert set(frame_contract["distributedLoadFields"]).issubset(distributed)
        member_point = _one_of_branch_by_type(load_schema, "member_point")["properties"]
        assert set(frame_contract["memberPointLoadFields"]).issubset(member_point)
        temperature = _one_of_branch_by_type(load_schema, "temperature")["properties"]
        assert set(frame_contract["temperatureLoadFields"]).issubset(temperature)

        structure_properties = schema["properties"]["structure"]["properties"]
        assert set(frame_contract["structureFields"]).issubset(structure_properties)

    _assert_source_contains(frame_contract["frontendTypePath"], frame_contract["frontendTypeTokens"])
    _assert_source_contains(frame_contract["payloadPath"], frame_contract["payloadTokens"])
    for doc_path in ("docs/api-reference.md", "docs/asms-json-schema.md"):
        _assert_source_contains(doc_path, frame_contract["docTokens"])

    truss_contract = matrix["truss"]
    for schema in (registry["asms-truss-model"], openapi["components"]["schemas"]["asms-truss-model"]):
        node_schema = _structure_collection_properties(schema, "nodes")["items"]
        node_properties = node_schema["properties"]
        assert set(truss_contract["forbiddenNodeFields"]).isdisjoint(node_properties)

        member_properties = _structure_member_properties(schema)
        assert set(truss_contract["memberFields"]).issubset(member_properties)

        load_schema = _structure_collection_properties(schema, "loads")["items"]
        nodal = _one_of_branch_by_type(load_schema, "nodal")["properties"]
        assert set(truss_contract["nodalLoadFields"]).issubset(nodal)
        member_load = _one_of_branch_by_type(load_schema, "member_load")["properties"]
        assert set(truss_contract["memberLoadFields"]).issubset(member_load)

        structure_properties = schema["properties"]["structure"]["properties"]
        assert set(truss_contract["structureFields"]).issubset(structure_properties)

    _assert_source_contains(truss_contract["frontendTypePath"], truss_contract["frontendTypeTokens"])
    _assert_source_contains(truss_contract["payloadPath"], truss_contract["payloadTokens"])
    for doc_path in ("docs/api-reference.md", "docs/asms-json-schema.md"):
        _assert_source_contains(doc_path, truss_contract["docTokens"])


def test_cross_stack_domain_constraints_are_in_sync():
    registry = schema_registry()
    openapi = build_openapi_document()
    frame_schema = registry["asms-frame-model"]
    truss_schema = registry["asms-truss-model"]

    for schema in (frame_schema, openapi["components"]["schemas"]["asms-frame-model"]):
        node_properties = _structure_collection_properties(schema, "nodes")["items"]["properties"]
        assert node_properties["springs"]["description"].startswith("节点弹性约束")

        structure_properties = schema["properties"]["structure"]["properties"]
        assert {"id", "loads"}.issubset(structure_properties["loadCases"]["items"]["properties"])
        assert {"id", "factors", "tags"}.issubset(structure_properties["loadCombinations"]["items"]["properties"])

    for schema in (truss_schema, openapi["components"]["schemas"]["asms-truss-model"]):
        node_schema = _structure_collection_properties(schema, "nodes")["items"]
        node_properties = node_schema["properties"]
        assert node_properties["supportType"]["enum"] == ["free", "pinned", "roller"]
        assert {"supportAngleDeg", "springs", "supportDisplacements", "condensedDofs"}.isdisjoint(node_properties)
        forbidden_node_fields = {tuple(branch["required"]) for branch in node_schema["not"]["anyOf"]}
        assert {("supportAngleDeg",), ("rollerAngleDeg",), ("springs",), ("supportDisplacements",), ("condensedDofs",)}.issubset(forbidden_node_fields)


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
