import logging

from flask import Blueprint, request, jsonify

from backend.api.errors import ApiError, error_payload
from backend.api.calculation_response import build_calculation_response
from backend.common.domain_errors import InternalServiceError

preview_bp = Blueprint('preview', __name__)
logger = logging.getLogger(__name__)

@preview_bp.route('/preview', methods=['POST'])
def preview():
    data = request.json or {}
    try:
        response = build_calculation_response(data, operation='preview')
        return jsonify(response)
    except ApiError as e:
        return jsonify(error_payload(e, operation='preview', data=data)), e.status_code
    except ValueError as e:
        return jsonify(error_payload(e, operation='preview', data=data)), 400
    except Exception:
        logger.exception("预览接口发生未处理异常")
        return jsonify(error_payload(InternalServiceError(), operation='preview', data=data)), 500
