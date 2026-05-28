from __future__ import annotations

from flask import Blueprint, jsonify

from backend.contracts.openapi import build_openapi_document
from backend.contracts.json_schemas import API_SCHEMA_VERSION, schema_by_id, schema_registry

contracts_bp = Blueprint("contracts", __name__)


@contracts_bp.route("/contracts/schemas", methods=["GET"])
def list_schemas():
    registry = schema_registry()
    return jsonify(
        {
            "success": True,
            "operation": "list_schemas",
            "version": "v1",
            "schemaVersion": API_SCHEMA_VERSION,
            "schemas": registry,
            "schemaIds": sorted(registry),
        }
    )


@contracts_bp.route("/contracts/schemas/<schema_id>", methods=["GET"])
def get_schema(schema_id: str):
    schema = schema_by_id(schema_id)
    if schema is None:
        return (
            jsonify(
                {
                    "success": False,
                    "operation": "get_schema",
                    "version": "v1",
                    "error": {
                        "code": "COMMON_SCHEMA_NOT_FOUND",
                        "message": f"未找到 JSON Schema: {schema_id}",
                    },
                }
            ),
            404,
        )
    return jsonify(schema)


@contracts_bp.route("/contracts/openapi", methods=["GET"])
def get_openapi_document():
    return jsonify(build_openapi_document())
