from __future__ import annotations

from typing import Any, Mapping

from flask import Blueprint, jsonify, request

from backend.api.errors import error_payload
from backend.verification_package import create_verification_package, verify_verification_package


verification_packages_bp = Blueprint("verification_packages", __name__)


def _request_object() -> Mapping[str, Any]:
    data = request.get_json(silent=True)
    if not isinstance(data, Mapping):
        raise ValueError("请求体必须是 JSON 对象")
    return data


def _invalid_input(exc: Exception | str, operation: str, data: Mapping[str, Any] | None = None):
    return (
        jsonify(
            error_payload(
                exc,
                operation=operation,
                data=data,
                code="VERIFICATION_PACKAGE_INVALID_INPUT",
            )
        ),
        400,
    )


@verification_packages_bp.route("/verification-packages", methods=["POST"])
def create_package():
    operation = "verification_package_create"
    data: Mapping[str, Any] | None = None
    try:
        data = _request_object()
        payload = data.get("payload")
        if not isinstance(payload, Mapping):
            raise ValueError("payload 必须是结构求解输入对象")
        evidence = data.get("evidence")
        if evidence is not None and not isinstance(evidence, Mapping):
            raise ValueError("evidence 必须是对象")
        package = create_verification_package(payload, evidence=evidence)
        verification = verify_verification_package(package)
        return jsonify(
            {
                "success": True,
                "operation": operation,
                "version": "v1",
                "package": package,
                "verification": verification,
            }
        )
    except ValueError as exc:
        return _invalid_input(exc, operation, data)
    except Exception as exc:
        return (
            jsonify(
                error_payload(
                    f"生成可信计算包失败: {exc}",
                    operation=operation,
                    data=data,
                    code="VERIFICATION_PACKAGE_CREATE_FAILED",
                )
            ),
            400,
        )


@verification_packages_bp.route("/verification-packages/verify", methods=["POST"])
def verify_package():
    operation = "verification_package_verify"
    data: Mapping[str, Any] | None = None
    try:
        data = _request_object()
        package = data.get("package")
        if not isinstance(package, Mapping):
            raise ValueError("package 必须是验证包对象")
        return jsonify(
            {
                "success": True,
                "operation": operation,
                "version": "v1",
                "verification": verify_verification_package(package),
            }
        )
    except ValueError as exc:
        return _invalid_input(exc, operation, data)
    except Exception as exc:
        return (
            jsonify(
                error_payload(
                    f"校验可信计算包失败: {exc}",
                    operation=operation,
                    data=data,
                    code="VERIFICATION_PACKAGE_VERIFY_FAILED",
                )
            ),
            400,
        )
