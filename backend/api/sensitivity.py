from __future__ import annotations

import traceback

from flask import Blueprint, jsonify, request

from backend.application.sensitivity import build_sensitivity_response
from backend.contracts.diagnostics import ApiError, error_payload


sensitivity_bp = Blueprint("sensitivity", __name__)


@sensitivity_bp.route("/sensitivity", methods=["POST"])
def sensitivity():
    data = request.json or {}
    try:
        return jsonify(build_sensitivity_response(data))
    except ApiError as exc:
        return jsonify(error_payload(exc, operation="sensitivity", data=data)), exc.status_code
    except Exception as exc:
        traceback.print_exc()
        return jsonify(error_payload(f"敏感性分析失败: {str(exc)}", operation="sensitivity", data=data)), 400


__all__ = ["build_sensitivity_response", "sensitivity_bp"]
