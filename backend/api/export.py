import logging

from flask import Blueprint, request, jsonify, send_file
from backend.api.errors import ApiError, error_payload
from backend.exporters.common.artifact import ExportArtifact
from backend.api.analysis_types import get_analysis_type, get_material_name
from backend.contracts.calculation_response import solution_from_stored_result
from backend.contracts.calculation_evidence import EVIDENCE_FIELDS
from backend.services.export_service import build_failure_review_model, build_report_model, export_failure_review, export_report

export_bp = Blueprint('export', __name__)
logger = logging.getLogger(__name__)


def _send_export_artifact(artifact: ExportArtifact):
    artifact.buffer.seek(0)
    return send_file(
        artifact.buffer,
        as_attachment=True,
        download_name=artifact.filename,
        mimetype=artifact.mimetype,
    )

def _export_failure_review(data):
    review = build_failure_review_model(data)
    return _send_export_artifact(export_failure_review(review, str(review.get("format", "docx"))))


def _is_usable_cached_solution(solution, analysis_type):
    if not isinstance(solution, dict):
        return False
    if analysis_type == "beam":
        return isinstance(solution.get("beam"), dict) and isinstance(solution.get("x_data"), list)
    return (
        isinstance(solution.get("structure"), dict)
        and isinstance(solution.get("nodeResults"), list)
        and isinstance(solution.get("memberResults"), list)
    )


def _export_calculation_report(data):
    job_id = data.get('jobId')
    precomputed_solution = None
    if job_id:
        from backend.services.job_store import load_job
        job = load_job(job_id)
        if not job:
            raise ApiError(f"未找到指定的作业: {job_id}", code='COMMON_JOB_NOT_FOUND', status_code=404)
        if job.get('status') != 'succeeded':
            raise ApiError(f"指定作业未成功完成，无法导出，状态：{job.get('status')}", code='COMMON_JOB_NOT_READY', status_code=400)
        if job.get('operation') != 'calculate':
            raise ApiError(f"只支持计算类型的作业导出，当前为：{job.get('operation')}", code='COMMON_INVALID_JOB_OPERATION', status_code=400)
        job_payload = dict(job.get('payload', {}))
        cached_analysis_type = get_analysis_type(job_payload)
        stored_result = job.get('result')
        precomputed_solution = solution_from_stored_result(stored_result)
        if not _is_usable_cached_solution(precomputed_solution, cached_analysis_type):
            raise ApiError(
                f"指定作业结果缺少可复用的求解事实: {job_id}",
                code="COMMON_EXPORT_CACHE_MISS",
                status_code=409,
            )
        if isinstance(stored_result, dict):
            precomputed_solution = dict(precomputed_solution)
            for field in EVIDENCE_FIELDS:
                if field in stored_result:
                    precomputed_solution[field] = stored_result[field]
        job_payload.update({
            'format': data.get('format', 'xlsx'),
            'reportOptions': data.get('reportOptions'),
            'reportImages': data.get('reportImages'),
            'sensitivityResults': data.get('sensitivityResults'),
            'benchmark': data.get('benchmark'),
            'resultSource': data.get('resultSource'),
            'resultProvenance': data.get('resultProvenance'),
            'learningReview': data.get('learningReview'),
        })
        data = job_payload

    material_name = get_material_name(data.get('materialId'))
    analysis_type = get_analysis_type(data)
    format_type = data.get('format', 'xlsx')
    sensitivity_results = data.get('sensitivityResults') if isinstance(data.get('sensitivityResults'), dict) else None
    report_images = data.get('reportImages') if isinstance(data.get('reportImages'), dict) else None
    report_options = data.get('reportOptions') if isinstance(data.get('reportOptions'), dict) else None
    report = build_report_model(
        data,
        analysis_type=analysis_type,
        material_name=material_name,
        sensitivity_results=sensitivity_results,
        report_images=report_images,
        report_options=report_options,
        precomputed_solution=precomputed_solution,
    )
    return _send_export_artifact(export_report(report, str(format_type)))


@export_bp.route('/export', methods=['POST'])
def export():
    data = request.json or {}
    try:
        if str(data.get("materialType") or "").strip() == "failure-review":
            return _export_failure_review(data)
        return _export_calculation_report(data)
    except ApiError as e:
        return jsonify(error_payload(e, operation='export', data=data)), e.status_code
    except ValueError as e:
        code = "FAILURE_REVIEW_INVALID_REQUEST" if str(data.get("materialType") or "").strip() == "failure-review" else None
        return jsonify(error_payload(e, operation='export', data=data, code=code)), 400
    except RuntimeError as e:
        return jsonify(error_payload(e, operation='export', data=data, code='COMMON_EXPORT_FAILED')), 500
    except Exception:
        logger.exception("导出计算书时发生未处理异常")
        return jsonify(error_payload('导出服务内部失败，请稍后重试', operation='export', data=data, code='COMMON_INTERNAL_ERROR')), 500


@export_bp.route('/export/failure', methods=['POST'])
def export_failure():
    data = request.json or {}
    try:
        return _export_failure_review(data)
    except ApiError as e:
        return jsonify(error_payload(e, operation='export', data=data)), e.status_code
    except ValueError as e:
        return jsonify(error_payload(e, operation='export', data=data, code='FAILURE_REVIEW_INVALID_REQUEST')), 400
    except RuntimeError as e:
        return jsonify(error_payload(e, operation='export', data=data, code='COMMON_EXPORT_FAILED')), 500
    except Exception:
        logger.exception("导出失败审查材料时发生未处理异常")
        return jsonify(error_payload('导出服务内部失败，请稍后重试', operation='export', data=data, code='COMMON_INTERNAL_ERROR')), 500
