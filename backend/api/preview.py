from flask import Blueprint, request, jsonify
import traceback
from backend.api.errors import ApiError, error_payload
from .utils import build_calculation_response

preview_bp = Blueprint('preview', __name__)

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
    except Exception as e:
        traceback.print_exc()
        return jsonify(error_payload(f'预览生成失败: {str(e)}', operation='preview', data=data, code='COMMON_INTERNAL_ERROR')), 400
