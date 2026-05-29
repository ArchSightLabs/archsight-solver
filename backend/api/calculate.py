from flask import Blueprint, request, jsonify
import traceback
from backend.api.errors import ApiError, error_payload
from backend.api.calculation_response import build_calculation_response

calculate_bp = Blueprint('calculate', __name__)

@calculate_bp.route('/calculate', methods=['POST'])
def calculate():
    data = request.json or {}
    try:
        response = build_calculation_response(data, operation='calculate')
        return jsonify(response)
    except ApiError as e:
        return jsonify(error_payload(e, operation='calculate', data=data)), e.status_code
    except ValueError as e:
        return jsonify(error_payload(e, operation='calculate', data=data)), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify(error_payload(f'计算过程异常: {str(e)}', operation='calculate', data=data, code='COMMON_INTERNAL_ERROR')), 400
