from flask import Blueprint, request, jsonify
import traceback
from backend.api.errors import ApiError, error_payload
from backend.api.calculation_response import build_calculation_response
import uuid
from datetime import datetime, timezone
from backend.services.job_store import store_job, prune_completed_jobs

calculate_bp = Blueprint('calculate', __name__)

@calculate_bp.route('/calculate', methods=['POST'])
def calculate():
    data = request.json or {}
    try:
        response = build_calculation_response(data, operation='calculate')
        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()

        try:
            from backend.api.jobs import MAX_JOBS
            prune_completed_jobs(MAX_JOBS)

            store_job({
                "jobId": job_id,
                "operation": "calculate",
                "payload": data,
                "status": "succeeded",
                "result": response,
                "createdAt": now,
                "updatedAt": now,
                "startedAt": now,
                "completedAt": now,
            })

            response["jobId"] = job_id
            if "meta" in response:
                response["meta"]["jobId"] = job_id
                response["meta"]["jobCacheStatus"] = "succeeded"
        except Exception as cache_err:
            import logging
            logger = logging.getLogger(__name__)
            logger.warning("计算结果缓存落盘失败 (jobId=%s): %s", job_id, str(cache_err))
            if "diagnostics" not in response:
                response["diagnostics"] = {"warnings": [], "infos": []}
            if "warnings" not in response["diagnostics"]:
                response["diagnostics"]["warnings"] = []
            response["diagnostics"]["warnings"].append(f"计算结果缓存失败，后续导出将无法加速: {str(cache_err)}")
            if "meta" in response:
                response["meta"]["jobCacheStatus"] = "failed"

        return jsonify(response)
    except ApiError as e:
        return jsonify(error_payload(e, operation='calculate', data=data)), e.status_code
    except ValueError as e:
        return jsonify(error_payload(e, operation='calculate', data=data)), 400
    except Exception as e:
        traceback.print_exc()
        return jsonify(error_payload(f'计算过程异常: {str(e)}', operation='calculate', data=data, code='COMMON_INTERNAL_ERROR')), 400
