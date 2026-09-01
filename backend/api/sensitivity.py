from __future__ import annotations

import logging

from flask import Blueprint, jsonify, request

from backend.application.sensitivity import build_sensitivity_response
from backend.common.domain_errors import InternalServiceError
from backend.contracts.diagnostics import ApiError, error_payload


sensitivity_bp = Blueprint("sensitivity", __name__)
logger = logging.getLogger(__name__)


@sensitivity_bp.route("/sensitivity", methods=["POST"])
def sensitivity():
    data = request.json or {}
    try:
        return jsonify(build_sensitivity_response(data))
    except ApiError as exc:
        return jsonify(error_payload(exc, operation="sensitivity", data=data)), exc.status_code
    except ValueError as exc:
        return jsonify(error_payload(exc, operation="sensitivity", data=data)), 400
    except Exception:
        logger.exception("敏感性分析接口发生未处理异常")
        return jsonify(error_payload(InternalServiceError(), operation="sensitivity", data=data)), 500


__all__ = ["build_sensitivity_response", "sensitivity_bp"]
